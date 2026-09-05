// AI application services — the orchestration layer between routes and the
// AI domain. Routes stay thin; business logic lives here.

import "server-only";

import { AppError, InternalServerError, ValidationError } from "~backend/errors";
import { prisma } from "~backend/db";
import { buildContext, questionContextIds } from "../context/context-engine";
import { buildTutorSystem, buildSolverSystem, buildAssistantSystem, buildEvaluatorSystem, buildMockTestSystem, buildAdvisorSystem } from "../prompts";
import { resolveModel, resolveModelCandidates, type LLMProvider, type LLMProviderName } from "../providers";
import { notePreferredLanguage, noteTopicSignal, upsertMemory } from "../memory/memory-store";
import {
  addMessage,
  createConversation,
  getConversation,
  listMessages,
} from "../persistence/conversations";
import { bumpAIQuestions, recordUsage } from "../usage/usage";
import { runAfterResponse } from "~backend/schedule";
import { searchForIntent } from "../tools/search";
import { retrieveQuestionBank } from "../retrieval";
import { runAgentTurn, agentResponseText, type AgentStatus } from "../agent";
import { validateAgentRequest } from "../schemas";
import { validateSolverOutput, validateEvaluationOutput, validateMockTestOutput, validateAdvisorOutput, type EvaluationResult, type GeneratedMockTest, type AdvisorPlan, sanitizeReply, parseJsonObject } from "../validation/outputs";
import { validateChatRequest, validateSolverRequest } from "../schemas";
import { DEFAULT_TITLE, summarizeConversationTitle } from "./title";
import { aiCacheGet, aiCacheSet, aiCacheKey } from "../infrastructure/ai-cache";
import { normalizeBanglish } from "../infrastructure/banglish";
import type {
  AIMessageInput,
  AssistantResult,
  AIContext,
  AIIntent,
  SuggestedAction,
  SolverResult,
  TutorRequest,
  SolverRequest,
  AssistantRequest,
} from "../types";

const MAX_CONTEXT_MESSAGES = 30;
const TITLE_SNIPPET = 60;

// Streaming timeout (ms) — serverless functions have limits (Vercel: 60s for Pro, 10s for Hobby)
const STREAM_TIMEOUT_MS = 30_000;

/**
 * Wrap a ReadableStream with a timeout. If the stream doesn't produce data
 * within the timeout, it will be cancelled and an error thrown.
 */
function withStreamTimeout<T>(
  stream: ReadableStream<T>,
  timeoutMs: number,
): ReadableStream<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  return new ReadableStream<T>({
    start(controller) {
      timeoutId = setTimeout(() => {
        controller.error(new Error(`Stream timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const reader = stream.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              clearTimeout(timeoutId);
              controller.close();
              break;
            }
            // Reset timeout on each chunk
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              controller.error(new Error(`Stream timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            controller.enqueue(value);
          }
        } catch (err) {
          clearTimeout(timeoutId);
          controller.error(err);
        }
      };
      void pump();
    },
    cancel() {
      clearTimeout(timeoutId);
      stream.cancel().catch(() => {});
    },
  });
}

// ── Intent routing (deterministic where possible) ──────────
const INTENT_KEYWORDS: [RegExp, AIIntent][] = [
  [/কারেন্ট|current affairs|সমসাময়িক|সাম্প্রতিক/i, "current_affairs"],
  [/solve|সমাধান|calculate|compute|answer this/i, "solve"],
  [/hint|ইঙ্গিত|মনে করাও|clue/i, "hint"],
  [/quiz|প্রশ্নমালা|মডেল টেস্ট|পরীক্ষা|practice/i, "quiz"],
  [/revise|রিভিশন|পুনরালোচনা|recap/i, "revise"],
  [/summarize|সারাংশ|সংক্ষেপে|summary/i, "summarize"],
  [/plan|প্ল্যান|study plan|কী পড়|schedule/i, "plan"],
  [/recommend|পরামর্শ|what should i/i, "recommend"],
  [/analyze|বিশ্লেষণ|performance|কার্যকারিতা/i, "analyze_performance"],
  [/generate|create|উদাহরণ|similar question/i, "question_generation"],
  [/why|কেন|explain|ব্যাখ্যা/i, "explain"],
];

export function detectIntent(text: string, fallback: AIIntent = "tutor"): AIIntent {
  for (const [pattern, intent] of INTENT_KEYWORDS) {
    if (pattern.test(text)) return intent;
  }
  return fallback;
}

// ── Shared helpers ─────────────────────────────────────────

function toImageDataUrl(base64: string): string {
  if (base64.startsWith("data:")) return base64;
  return `data:image/jpeg;base64,${base64}`;
}

async function ensureConversation(
  userId: string,
  kind: "TUTOR" | "ASSISTANT" | "SOLVER",
  request: { conversationId?: string; subjectId?: number; topicId?: number; topicPath?: string; title?: string },
  context: AIContext,
) {
  if (request.conversationId) {
    return getConversation(userId, request.conversationId);
  }
  return createConversation(userId, {
    kind,
    title: request.title ?? "New conversation",
    subjectId: request.subjectId ?? context.subject?.id,
    topicId: request.topicId ?? context.topic?.id,
    topicPath: request.topicPath,
  });
}

/** Build the message history to send the model (persisted + new turn). */
async function buildModelMessages(
  userId: string,
  conversationId: string,
  newMessages: AIMessageInput[],
): Promise<AIMessageInput[]> {
  const persisted = await listMessages(userId, conversationId);
  const history = persisted
    .filter((m) => m.role !== "SYSTEM" && m.status === "COMPLETE")
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const turn = newMessages
    .filter((m) => m.role !== "system")
    .slice(-4)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  return [...history, ...turn].slice(-MAX_CONTEXT_MESSAGES);
}

async function persistUserTurn(
  userId: string,
  conversationId: string,
  messages: AIMessageInput[],
  intent?: AIIntent,
): Promise<AIMessageInput | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return null;
  const existing = await listMessages(userId, conversationId);
  const alreadyStored = existing.some((m) => m.role === "USER" && m.content === lastUser.content);
  if (!alreadyStored) {
    await addMessage(userId, conversationId, {
      role: "USER",
      status: "COMPLETE",
      content: lastUser.content,
      intent,
    });
  }
  return lastUser;
}

async function finalizeUsage(opts: {
  userId: string;
  task: "tutor" | "assistant" | "solver";
  provider: string;
  model: string;
  started: number;
  inputText: string;
  outputText: string;
  success: boolean;
  errorCode?: string;
  estimatedCostUsd?: number;
  intent?: string;
}) {
  const outputTokens = Math.max(1, Math.ceil(opts.outputText.length / 4));
  const inputTokens = Math.max(1, Math.ceil(opts.inputText.length / 4));
  await recordUsage({
    task: opts.task,
    provider: opts.provider,
    model: opts.model,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - opts.started,
    success: opts.success,
    errorCode: opts.errorCode,
    estimatedCostUsd: opts.estimatedCostUsd ?? 0,
    userId: opts.userId,
    intent: opts.intent,
  });
}

// ── Runtime provider failover ──────────────────────────────
//
// Tries each candidate provider in order and only moves to the next on a real
// provider error. The last candidate is always the clearly-labelled mock, so a
// total outage of the real providers degrades gracefully instead of erroring.
async function withFailover<T>(
  task: "tutor" | "assistant" | "solver",
  opts: { image?: boolean },
  fn: (p: LLMProvider, name: LLMProviderName) => Promise<T>,
): Promise<{ value: T; provider: LLMProviderName; model: string; isMock: boolean }> {
  const candidates = resolveModelCandidates(task, opts);
  let lastErr: unknown;
  for (const cand of candidates) {
    try {
      const value = await fn(cand.provider, cand.name);
      return {
        value,
        provider: cand.name,
        model: cand.provider.model,
        isMock: cand.name === "mock",
      };
    } catch (err) {
      console.error(`[ai:${task}] provider ${cand.name} failed`, err);
      lastErr = err;
    }
  }
  throw lastErr ?? new InternalServerError("All AI providers failed.");
}

/** Normalize Romanized-Bengali ("Banglish") user input before it reaches the model. */
function normalizeUserMessages(messages: AIMessageInput[]): AIMessageInput[] {
  return messages.map((m) => (m.role === "user" ? { ...m, content: normalizeBanglish(m.content) } : m));
}

/** Persist a solver turn (user question + assistant solution) for history. */
async function persistSolverResult(
  userId: string,
  conversationId: string,
  userText: string,
  assistantContent: string,
  provider: string,
  model: string,
  subjectId: number | undefined,
  topicId: number | undefined,
  hasImage: boolean,
) {
  await addMessage(userId, conversationId, {
    role: "USER",
    status: "COMPLETE",
    content: hasImage ? `[Image question] ${userText}` : userText,
    intent: "solve",
    metadata: { subjectId, topicId, hasImage },
  });
  await addMessage(userId, conversationId, {
    role: "ASSISTANT",
    status: "COMPLETE",
    content: assistantContent,
    intent: "solve",
    provider,
    model,
    metadata: { subjectId, topicId },
  });
  await bumpAIQuestions(userId);
}

// ── Tutor service (streaming) ──────────────────────────────

/**
 * Streaming tutor turn. Persists the user message, streams the real model
 * output to the client, and persists the assistant message + usage when the
 * stream completes.
 */
export async function createTutorTurn(opts: {
  userId: string;
  request: unknown;
}): Promise<{
  stream: ReadableStream<Uint8Array>;
  conversationId: string;
  intent: AIIntent;
  provider: string;
  model: string;
}> {
  const { userId, request: raw } = opts;
  const parsed = validateChatRequest(raw);
  const request = parsed as TutorRequest;
  const intent = request.intent ?? detectIntent(parsed.messages[parsed.messages.length - 1]?.content ?? "");

  let subjectId = request.subjectId;
  let topicId = request.topicId;
  let topicPath = request.topicPath;
  if (request.questionId && !subjectId) {
    const ids = await questionContextIds(request.questionId);
    subjectId = ids.subjectId ?? undefined;
    topicId = ids.topicId ?? undefined;
    topicPath = ids.topicPath;
  }

  const context = await buildContext({ userId, task: "tutor", intent, subjectId, topicId, questionId: request.questionId });
  const conversation = await ensureConversation(userId, "TUTOR", { ...request, subjectId, topicId, topicPath }, context);

  const normalizedMessages = normalizeUserMessages(request.messages);
  const lastUser = await persistUserTurn(userId, conversation.id, normalizedMessages, intent);
  await notePreferredLanguage(userId, [lastUser?.content ?? ""]);

  const modelMessages = await buildModelMessages(userId, conversation.id, normalizedMessages);

  const query = modelMessages[modelMessages.length - 1]?.content ?? "";
  const web = await searchForIntent(intent, query);
  const domain = await retrieveQuestionBank({
    subjectId: context.subject?.id,
    topicId: context.topic?.id,
    query,
  });
  const retrievedKnowledge = [web.block, domain.block].filter(Boolean).join("\n\n") || undefined;
  const system = buildTutorSystem(
    { ...context, retrievedKnowledge, webResults: web.results },
    web.block,
    domain.block,
  );

  const started = Date.now();
  let streamResult;
  let name: LLMProviderName = "mock";
  let modelName = "";
  try {
    const fo = await withFailover("tutor", {}, (p) =>
      p.stream({ system, messages: modelMessages, maxTokens: 2048 }),
    );
    streamResult = fo.value;
    name = fo.provider;
    modelName = fo.model;
  } catch (err) {
    // All providers (incl. mock) failed — return a clear fallback message.
    console.error("[ai:tutor] all providers failed", err);
    const fallback =
      "দুঃখিত, এই মুহূর্তে AI টিউটরে সংযোগ করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।";
    const encoder = new TextEncoder();
    const fbStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(fallback));
        controller.close();
      },
    });
    runAfterResponse(async () => {
      try {
        await addMessage(userId, conversation.id, {
          role: "ASSISTANT",
          status: "FAILED",
          content: fallback,
          intent,
          provider: name,
          model: modelName,
          metadata: { subjectId, topicId, topicPath: topicPath ?? "", intent, webResults: web.results },
          errorCode: "AI_UNAVAILABLE",
        });
      } catch (e) {
        console.error("[ai:tutor] fallback persistence failed", e);
      }
      await finalizeUsage({
        userId,
        task: "tutor",
        provider: name,
        model: modelName,
        started: Date.now(),
        inputText: "",
        outputText: "",
        success: false,
        errorCode: "AI_UNAVAILABLE",
        intent,
      });
    });
    return { stream: fbStream, conversationId: conversation.id, intent, provider: name, model: modelName };
  }
  const { stream, done, getFullText } = streamResult;

  // Apply streaming timeout guard
  const timedStream = withStreamTimeout(stream, STREAM_TIMEOUT_MS);

  const wrapped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const reader = timedStream.getReader();
      try {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      timedStream.cancel().catch(() => {});
    },
  });

  // Persistence + usage must outlive the HTTP response (serverless freezes
  // the invocation when the stream ends) — schedule via waitUntil.
  runAfterResponse(async () => {
    await done;
    const fullText = sanitizeReply(getFullText());
    const success = fullText.length > 0;
    try {
      await addMessage(userId, conversation.id, {
        role: "ASSISTANT",
        status: success ? "COMPLETE" : "FAILED",
        content: fullText,
        intent,
        provider: name,
        model: modelName,
        metadata: { subjectId, topicId, topicPath: topicPath ?? "", intent, webResults: web.results },
        errorCode: success ? undefined : "AI_EMPTY_RESPONSE",
      });
      if (success) await bumpAIQuestions(userId);
    } catch (err) {
      console.error("[ai:tutor] persistence failed", err);
    }
    if (conversation.title === DEFAULT_TITLE) {
      void summarizeConversationTitle(userId, conversation.id);
    }
    await finalizeUsage({
      userId,
      task: "tutor",
      provider: name,
      model: modelName,
      started,
      inputText: system + modelMessages.map((m) => m.content).join("\n"),
      outputText: fullText,
      success,
      errorCode: success ? undefined : "AI_EMPTY_RESPONSE",
      intent,
    });
  });

  return {
    stream: wrapped,
    conversationId: conversation.id,
    intent,
    provider: name,
    model: modelName,
  };
}

// ── Solver service (structured, non-streaming) ─────────────

export async function solveQuestion(opts: {
  userId: string;
  request: unknown;
}): Promise<{ stream: ReadableStream<Uint8Array>; conversationId: string; provider: string; model: string }> {
  const { userId, request: raw } = opts;
  const parsed = validateSolverRequest(raw);
  const request = parsed as SolverRequest;

  const hasImage = Boolean(request.imageBase64);
  let subjectId = request.subjectId;
  let topicId: number | undefined;
  let topicPath = "";
  if (request.questionId) {
    const ids = await questionContextIds(request.questionId);
    subjectId = ids.subjectId ?? subjectId;
    topicId = ids.topicId ?? undefined;
    topicPath = ids.topicPath;
  }

  const context = await buildContext({ userId, task: "solver", subjectId, topicId, questionId: request.questionId });
  const domain = await retrieveQuestionBank({
    subjectId: context.subject?.id,
    topicId: context.topic?.id,
    query: request.text ?? "",
  });
  const system = buildSolverSystem(context, domain.block);
  const userText = normalizeBanglish(request.text?.trim() || "Solve the question in the attached image.");

  // Create the conversation up-front so its id can be returned for the header.
  const conversation = await ensureConversation(
    userId,
    "SOLVER",
    { title: userText.slice(0, TITLE_SNIPPET), subjectId: context.subject?.id, topicId: context.topic?.id, topicPath },
    context,
  );

  const started = Date.now();
  let name: LLMProviderName = "mock";
  let modelName = "";

  // Cache-first: replay a previously computed solution as a stream (no LLM call).
  if (!hasImage) {
    const cacheKey = aiCacheKey(["solver", userId, userText, context.subject?.id ?? "", request.questionId ?? ""]);
    const cached = await aiCacheGet(cacheKey);
    if (cached) {
      const enc = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode(cached));
          controller.close();
        },
      });
      runAfterResponse(async () => {
        const fallback = "Unable to produce a solution. Please rephrase your question.";
        const result = validateSolverOutput(cached, fallback);
        result.source = "cache";
        await persistSolverResult(userId, conversation.id, userText, JSON.stringify(result), "cache", "cached", subjectId, topicId, hasImage);
        if (result.misconception && context.topic) {
          await noteTopicSignal(userId, { topic: context.topic.name, signal: "WEAK_TOPIC", confidence: 75 });
        }
        await finalizeUsage({ userId, task: "solver", provider: "cache", model: "cached", started, inputText: system + userText, outputText: cached, success: true, estimatedCostUsd: 0, intent: "solve" });
      });
      return { stream, conversationId: conversation.id, provider: "cache", model: "cached" };
    }
  }

  let streamResult;
  try {
    const fo = await withFailover("solver", { image: hasImage }, (p) =>
      p.stream({
        system,
        messages: [{ role: "user", content: userText }],
        images: hasImage && p.supportsVision ? [{ type: "image", dataUrl: toImageDataUrl(request.imageBase64 as string) }] : undefined,
        maxTokens: 1024,
      }),
    );
    streamResult = fo.value;
    name = fo.provider;
    modelName = fo.model;
  } catch (err) {
    const formatted = JSON.stringify({
      solution: "দুঃখিত, সমাধান তৈরি করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।",
      steps: [],
      explanation: "",
      relatedConcept: "",
      source: name,
    });
    const enc = new TextEncoder();
    const fbStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(formatted));
        controller.close();
      },
    });
    runAfterResponse(async () => {
      await finalizeUsage({ userId, task: "solver", provider: name, model: modelName, started: Date.now(), inputText: system + userText, outputText: "", success: false, errorCode: err instanceof AppError ? err.code : "AI_PROVIDER_ERROR", intent: "solve" });
    });
    return { stream: fbStream, conversationId: conversation.id, provider: name, model: modelName };
  }

  // ── Solver service: apply streaming timeout
  const { stream, done, getFullText } = streamResult;
  const timedStream = withStreamTimeout(stream, STREAM_TIMEOUT_MS);

  const wrapped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const reader = timedStream.getReader();
      try {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      timedStream.cancel().catch(() => {});
    },
  });

  runAfterResponse(async () => {
    await done;
    const rawText = sanitizeReply(getFullText());
    const fallback = "Unable to produce a solution. Please rephrase your question.";
    const result = validateSolverOutput(rawText, fallback);
    result.source = name;
    await persistSolverResult(userId, conversation.id, userText, JSON.stringify(result), name, modelName, subjectId, topicId, hasImage);
    if (result.misconception && context.topic) {
      await noteTopicSignal(userId, { topic: context.topic.name, signal: "WEAK_TOPIC", confidence: 75 });
    }
    if (!hasImage) {
      const cacheKey = aiCacheKey(["solver", userId, userText, context.subject?.id ?? "", request.questionId ?? ""]);
      await aiCacheSet(cacheKey, rawText);
    }
    await finalizeUsage({ userId, task: "solver", provider: name, model: modelName, started, inputText: system + userText, outputText: rawText, success: rawText.length > 0, errorCode: rawText.length > 0 ? undefined : "AI_EMPTY_RESPONSE", intent: "solve" });
  });

  return { stream: wrapped, conversationId: conversation.id, provider: name, model: modelName };
}

// ── Assistant service (structured, non-streaming) ──────────

const SUGGESTED_ACTIONS = [
  { id: "continue", labelBn: "চালিয়ে যাও", labelEn: "Continue learning", action: "continue" },
  { id: "weak-topics", labelBn: "দুর্বল বিষয়গুলো দেখাও", labelEn: "Review my weak topics", action: "weak-topics" },
  { id: "mistakes", labelBn: "ভুলগুলো ব্যাখ্যা করো", labelEn: "Explain my recent mistakes", action: "mistakes" },
  { id: "what-today", labelBn: "আজ কী পড়ব?", labelEn: "What should I study today?", action: "what-today" },
  { id: "practice", labelBn: "প্র্যাকটিস শুরু করো", labelEn: "Start a practice session", action: "practice" },
  { id: "current-affairs", labelBn: "কারেন্ট অ্যাফেয়ার্স", labelEn: "Current affairs", action: "current-affairs" },
];

function validateAssistantActions(value: Record<string, unknown>): {
  reply: string;
  actions: SuggestedAction[];
} {
  const reply = typeof value.reply === "string" && value.reply.trim() ? value.reply.trim() : "Here's your study guidance.";
  const actions = Array.isArray(value.actions)
    ? value.actions
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .map((a) => ({
          id: typeof a.id === "string" ? a.id : "action",
          labelBn: typeof a.labelBn === "string" ? a.labelBn.slice(0, 60) : "Action",
          labelEn: typeof a.labelEn === "string" ? a.labelEn.slice(0, 60) : "Action",
          action: typeof a.action === "string" ? a.action : "general",
        }))
        .slice(0, 4)
    : [];
  return { reply, actions };
}

export async function assistantTurn(opts: {
  userId: string;
  request: unknown;
}): Promise<{ stream: ReadableStream<Uint8Array>; conversationId: string; provider: string; model: string }> {
  const { userId, request: raw } = opts;
  const parsed = validateChatRequest(raw);
  const request = parsed as AssistantRequest;
  const intent = request.intent ?? detectIntent(parsed.messages[parsed.messages.length - 1]?.content ?? "", "general");

  const context = await buildContext({ userId, task: "assistant", intent, questionId: request.questionId });
  const conversation = await ensureConversation(userId, "ASSISTANT", request, context);

  const normalizedMessages = normalizeUserMessages(request.messages);
  const lastUser = await persistUserTurn(userId, conversation.id, normalizedMessages, intent);
  await notePreferredLanguage(userId, [lastUser?.content ?? ""]);

  const modelMessages = await buildModelMessages(userId, conversation.id, normalizedMessages);
  const query = modelMessages[modelMessages.length - 1]?.content ?? "";
  const web = await searchForIntent(intent, query);
  const system = buildAssistantSystem(
    { ...context, retrievedKnowledge: web.block || undefined, webResults: web.results },
    web.block,
  );

  const instructions =
    "\n\nRespond with JSON only:\n{\n  \"reply\": \"<your guidance, Bengali-first>\",\n  \"actions\": [{\"id\": \"...\", \"labelBn\": \"...\", \"labelEn\": \"...\", \"action\": \"continue|weak-topics|mistakes|what-today|practice|current-affairs|general\"}]\n}\n" +
    "Provide at most 4 actions. Only suggest actions that are useful given the learner's context.";

  const started = Date.now();
  let name: LLMProviderName = "mock";
  let modelName = "";

  const cacheKey = aiCacheKey(["assistant", userId, query, intent]);
  const cached = await aiCacheGet(cacheKey);
  if (cached) {
    const parsedOut = parseJsonObject(cached);
    const validated = parsedOut ? validateAssistantActions(parsedOut) : { reply: sanitizeReply(cached), actions: [] };
    const reply = validated.reply;
    const actions = validated.actions.length > 0 ? validated.actions : SUGGESTED_ACTIONS.slice(0, 3);
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(cached));
        controller.close();
      },
    });
    runAfterResponse(async () => {
      await addMessage(userId, conversation.id, {
        role: "ASSISTANT",
        status: "COMPLETE",
        content: reply,
        intent,
        provider: "cache",
        model: "cached",
        metadata: { intent, webResults: web.results },
      });
      await bumpAIQuestions(userId);
      if (conversation.title === DEFAULT_TITLE) void summarizeConversationTitle(userId, conversation.id);
      await finalizeUsage({ userId, task: "assistant", provider: "cache", model: "cached", started, inputText: system + modelMessages.map((m) => m.content).join("\n"), outputText: cached, success: true, estimatedCostUsd: 0, intent });
    });
    return { stream, conversationId: conversation.id, provider: "cache", model: "cached" };
  }

  let streamResult;
  try {
    const fo = await withFailover("assistant", {}, (p) =>
      p.stream({ system: system + instructions, messages: modelMessages, maxTokens: 1024 }),
    );
    streamResult = fo.value;
    name = fo.provider;
    modelName = fo.model;
  } catch (err) {
    const formatted = JSON.stringify({ reply: "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।", suggestedActions: [], source: name });
    const enc = new TextEncoder();
    const fbStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(formatted));
        controller.close();
      },
    });
    runAfterResponse(async () => {
      await finalizeUsage({ userId, task: "assistant", provider: name, model: modelName, started: Date.now(), inputText: system + modelMessages.map((m) => m.content).join("\n"), outputText: "", success: false, errorCode: err instanceof AppError ? err.code : "AI_PROVIDER_ERROR", intent });
    });
    return { stream: fbStream, conversationId: conversation.id, provider: name, model: modelName };
  }

  const { stream, done, getFullText } = streamResult;
  const wrapped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      stream.cancel().catch(() => {});
    },
  });

  runAfterResponse(async () => {
    await done;
    const rawText = sanitizeReply(getFullText());
    const parsedOut = parseJsonObject(rawText);
    const validated = parsedOut ? validateAssistantActions(parsedOut) : { reply: sanitizeReply(rawText), actions: [] };
    const reply = validated.reply;
    const actions = validated.actions.length > 0 ? validated.actions : SUGGESTED_ACTIONS.slice(0, 3);
    await addMessage(userId, conversation.id, {
      role: "ASSISTANT",
      status: "COMPLETE",
      content: reply,
      intent,
      provider: name,
      model: modelName,
      metadata: { intent, webResults: web.results },
    });
    await bumpAIQuestions(userId);
    if (conversation.title === DEFAULT_TITLE) void summarizeConversationTitle(userId, conversation.id);
    await aiCacheSet(cacheKey, rawText);
    await finalizeUsage({ userId, task: "assistant", provider: name, model: modelName, started, inputText: system + modelMessages.map((m) => m.content).join("\n"), outputText: rawText, success: rawText.length > 0, errorCode: rawText.length > 0 ? undefined : "AI_EMPTY_RESPONSE", intent });
  });

  return { stream: wrapped, conversationId: conversation.id, provider: name, model: modelName };
}

// ── AI agent service (bounded tool-using loop) ─────────────
//
// Wraps the agent loop with conversation persistence + usage accounting,
// mirroring the tutor/assistant service contract so the route stays thin.

export type AgentTurnRequest = {
  question: string;
  context?: {
    subjectId?: number;
    topicId?: number;
    topicPath?: string;
    questionId?: number;
  };
  intent?: AIIntent;
  conversationId?: string;
};

/**
 * Run the agent loop, persist the user/assistant messages in a conversation,
 * and record usage. `onStatus` streams live loop events (status labels, tool
 * progress) — the SSE route forwards them to the client.
 */
export async function createAgentTurn(opts: {
  userId: string;
  request: unknown;
  onStatus?: (status: AgentStatus) => void;
}): Promise<{
  conversationId: string;
  runId: string;
  provider: string;
  model: string;
  blocks: import("../agent").AgentBlock[];
  text: string;
  steps: number;
}> {
  const { userId, request: raw } = opts;
  const parsed = validateAgentRequest(raw);
  const intent = parsed.intent ?? (detectIntent(parsed.question, "recommend") as AIIntent);

  const context = await buildContext({
    userId,
    task: "assistant",
    intent,
    subjectId: parsed.context.subjectId,
    topicId: parsed.context.topicId,
    questionId: parsed.context.questionId,
  });

  const conversation = await ensureConversation(
    userId,
    "ASSISTANT",
    {
      conversationId: parsed.conversationId,
      subjectId: parsed.context.subjectId ?? context.subject?.id,
      topicId: parsed.context.topicId ?? context.topic?.id,
      topicPath: parsed.context.topicPath,
      title: DEFAULT_TITLE,
    },
    context,
  );

  await addMessage(userId, conversation.id, {
    role: "USER",
    status: "COMPLETE",
    content: parsed.question,
    intent,
  });
  await notePreferredLanguage(userId, [parsed.question]);

  const started = Date.now();
  const result = await runAgentTurn({
    userId,
    question: parsed.question,
    subjectId: parsed.context.subjectId,
    topicId: parsed.context.topicId,
    topicPath: parsed.context.topicPath,
    questionId: parsed.context.questionId,
    conversationId: conversation.id,
    intent,
    onStatus: opts.onStatus,
  });

  const text = agentResponseText(result.response);
  await addMessage(userId, conversation.id, {
    role: "ASSISTANT",
    status: "COMPLETE",
    content: text,
    intent: `agent:${intent}`,
    provider: result.provider,
    model: result.model,
    metadata: { kind: "agent", runId: result.runId, blocks: result.response.blocks },
  });
  await bumpAIQuestions(userId);
  if (conversation.title === DEFAULT_TITLE) {
    void summarizeConversationTitle(userId, conversation.id);
  }
  await recordUsage({
    task: "agent",
    provider: result.provider,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: Date.now() - started,
    success: true,
    estimatedCostUsd: 0,
    userId,
    intent: `agent:${intent}`,
  });

  return {
    conversationId: conversation.id,
    runId: result.runId,
    provider: result.provider,
    model: result.model,
    blocks: result.response.blocks,
    text,
    steps: result.steps,
  };
}

// Re-export the validated request type helpers for tests.
export { validateChatRequest, validateSolverRequest } from "../schemas";
export { buildContext } from "../context/context-engine";

// ── Answer evaluator service (structured, non-streaming) ───

export type EvaluateAnswerRequest = {
  question: string;
  learnerAnswer: string;
  questionId?: number;
  subjectId?: number;
};

/**
 * Evaluate a learner's written answer against the expected answer/exam rubric.
 * Grades via the analytical (solver) provider chain with runtime failover and
 * a response cache, grounding on the question bank when a questionId is given.
 */
export async function evaluateAnswer(opts: {
  userId: string;
  request: unknown;
}): Promise<{ result: EvaluationResult; conversationId: string; provider: string; model: string }> {
  const { userId, request: raw } = opts;
  const parsed = raw as EvaluateAnswerRequest;
  const questionText = normalizeBanglish((parsed.question ?? "").toString().trim());
  const learnerAnswer = (parsed.learnerAnswer ?? "").toString().trim();
  if (!questionText || !learnerAnswer) {
    throw new ValidationError("Both a question and your answer are required.");
  }

  let subjectId = parsed.subjectId;
  let topicId: number | undefined;
  if (parsed.questionId) {
    const ids = await questionContextIds(parsed.questionId);
    subjectId = ids.subjectId ?? subjectId;
    topicId = ids.topicId ?? undefined;
  }
  const context = await buildContext({ userId, task: "solver", subjectId, topicId, questionId: parsed.questionId });

  // Build a grading key from the question bank when available.
  let gradingKey = "";
  if (parsed.questionId) {
    const q = await prisma.question.findUnique({
      where: { id: parsed.questionId },
      select: { question: true, correctAnswer: true, explanation: true },
    });
    if (q) gradingKey = `Question: ${q.question}\nCorrect answer: ${q.correctAnswer}\nExplanation: ${q.explanation}`;
  }
  if (!gradingKey) {
    const domain = await retrieveQuestionBank({
      subjectId: context.subject?.id,
      topicId: context.topic?.id,
      query: questionText,
    });
    gradingKey = domain.block;
  }

  const system = buildEvaluatorSystem(context, gradingKey);
  const userText = `QUESTION:\n${questionText}\n\nLEARNER'S ANSWER:\n${learnerAnswer}`;

  const started = Date.now();
  let rawText = "";
  let usageProvider = "cache";
  let usageModel = "cached";

  const cacheKey = aiCacheKey(["evaluate", userId, questionText, learnerAnswer]);
  const cached = await aiCacheGet(cacheKey);
  if (cached) {
    rawText = cached;
    await finalizeUsage({
      userId,
      task: "solver",
      provider: "cache",
      model: "cached",
      started,
      inputText: system + userText,
      outputText: rawText,
      success: true,
      estimatedCostUsd: 0,
      intent: "evaluate",
    });
  } else {
    try {
      const fo = await withFailover("solver", {}, (p) =>
        p.generate({ system, messages: [{ role: "user", content: userText }], maxTokens: 1024 }),
      );
      rawText = fo.value.text;
      usageProvider = fo.provider;
      usageModel = fo.model;
      await finalizeUsage({
        userId,
        task: "solver",
        provider: usageProvider,
        model: usageModel,
        started,
        inputText: system + userText,
        outputText: rawText,
        success: true,
        estimatedCostUsd: fo.value.estimatedCostUsd,
        intent: "evaluate",
      });
      await aiCacheSet(cacheKey, rawText);
    } catch (err) {
      await finalizeUsage({
        userId,
        task: "solver",
        provider: usageProvider,
        model: usageModel,
        started,
        inputText: system + userText,
        outputText: "",
        success: false,
        errorCode: err instanceof AppError ? err.code : "AI_PROVIDER_ERROR",
        intent: "evaluate",
      });
      if (err instanceof AppError) throw err;
      throw new InternalServerError("The answer evaluator failed.");
    }
  }

  const fallback = "Could not evaluate this answer. Please try again.";
  const result = validateEvaluationOutput(rawText, fallback);
  result.source = usageProvider;

  // Feed the verdict into the long-term student model.
  const topicKey = questionText.slice(0, 120);
  if (result.verdict === "correct") {
    await upsertMemory(userId, {
      type: "STRONG_TOPIC",
      key: topicKey,
      value: (result.modelAnswer || "answered correctly").slice(0, 200),
      confidence: 60,
    }).catch(() => {});
  } else {
    await upsertMemory(userId, {
      type: "WEAK_TOPIC",
      key: topicKey,
      value: (result.gaps.join("; ") || "needs improvement").slice(0, 200),
      confidence: 75,
    }).catch(() => {});
  }

  const conversation = await ensureConversation(
    userId,
    "SOLVER",
    { title: questionText.slice(0, TITLE_SNIPPET), subjectId: context.subject?.id, topicId: context.topic?.id, topicPath: "" },
    context,
  );
  await addMessage(userId, conversation.id, {
    role: "USER",
    status: "COMPLETE",
    content: userText,
    intent: "evaluate",
    metadata: { subjectId, topicId },
  });
  await addMessage(userId, conversation.id, {
    role: "ASSISTANT",
    status: "COMPLETE",
    content: JSON.stringify(result),
    intent: "evaluate",
    provider: usageProvider,
    model: usageModel,
    metadata: { subjectId, topicId },
  });
  await bumpAIQuestions(userId);

  return { result, conversationId: conversation.id, provider: usageProvider, model: usageModel };
}

// ── AI mock-test generator service (structured, non-streaming) ───

export type GenerateMockTestRequest = {
  subjectId?: number;
  subject?: string;
  exam?: string;
  count?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
};

/**
 * Generate a multiple-choice mock test with the analytical (solver) provider
 * chain, runtime failover, and a response cache. Questions are graded locally
 * by the client (exact option match), so no DB persistence is required.
 */
export async function generateMockTest(opts: {
  userId: string;
  request: unknown;
}): Promise<{ result: GeneratedMockTest; provider: string; model: string }> {
  const { userId, request: raw } = opts;
  const parsed = raw as GenerateMockTestRequest;
  const count = Math.max(1, Math.min(parsed.count ? Number(parsed.count) : 10, 25));
  const difficulty = parsed.difficulty;

  const context = await buildContext({ userId, task: "solver", subjectId: parsed.subjectId });
  const subjectName = parsed.subject ?? context.subject?.nameEn ?? context.subject?.nameBn ?? undefined;

  const system = buildMockTestSystem(context, { subjectName, exam: parsed.exam, count, difficulty });
  const userText = `Generate a ${count}-question mock test${subjectName ? ` for ${subjectName}` : ""}.`;

  const started = Date.now();
  let rawText = "";
  let usageProvider = "cache";
  let usageModel = "cached";
  const cacheKey = aiCacheKey(["mock-test", userId, subjectName ?? "", String(count), difficulty ?? ""]);

  const cached = await aiCacheGet(cacheKey);
  if (cached) {
    rawText = cached;
    await finalizeUsage({
      userId,
      task: "solver",
      provider: "cache",
      model: "cached",
      started,
      inputText: system + userText,
      outputText: rawText,
      success: true,
      estimatedCostUsd: 0,
      intent: "question_generation",
    });
  } else {
    try {
      const fo = await withFailover("solver", {}, (p) =>
        p.generate({ system, messages: [{ role: "user", content: userText }], maxTokens: 4000 }),
      );
      rawText = fo.value.text;
      usageProvider = fo.provider;
      usageModel = fo.model;
      await finalizeUsage({
        userId,
        task: "solver",
        provider: usageProvider,
        model: usageModel,
        started,
        inputText: system + userText,
        outputText: rawText,
        success: true,
        estimatedCostUsd: fo.value.estimatedCostUsd,
        intent: "question_generation",
      });
      await aiCacheSet(cacheKey, rawText);
    } catch (err) {
      await finalizeUsage({
        userId,
        task: "solver",
        provider: usageProvider,
        model: usageModel,
        started,
        inputText: system + userText,
        outputText: "",
        success: false,
        errorCode: err instanceof AppError ? err.code : "AI_PROVIDER_ERROR",
        intent: "question_generation",
      });
      if (err instanceof AppError) throw err;
      throw new InternalServerError("The mock test generator failed.");
    }
  }

  const fallback = "Could not generate a mock test. Please try again.";
  const result = validateMockTestOutput(rawText, fallback, count);
  result.source = usageProvider;
  await bumpAIQuestions(userId);

  return { result, provider: usageProvider, model: usageModel };
}

// ── Career / exam advisor service (structured, non-streaming) ───

export type AdvisorRequest = {
  education?: string;
  interests?: string;
  targetExam?: string;
  weeklyHours?: number;
  examDate?: string;
};

/**
 * Produce a personalized exam-target + study-plan recommendation using the
 * analytical (solver) provider chain with runtime failover and a response cache.
 */
export async function getCareerAdvice(opts: {
  userId: string;
  request: unknown;
}): Promise<{ result: AdvisorPlan; provider: string; model: string }> {
  const { userId, request: raw } = opts;
  const parsed = raw as AdvisorRequest;
  const context = await buildContext({ userId, task: "solver" });

  const system = buildAdvisorSystem(context, {
    education: parsed.education,
    interests: parsed.interests,
    targetExam: parsed.targetExam,
    weeklyHours: parsed.weeklyHours,
    examDate: parsed.examDate,
  });
  const profileText = [
    parsed.education && `Education: ${parsed.education}`,
    parsed.interests && `Interests: ${parsed.interests}`,
    parsed.targetExam && `Target: ${parsed.targetExam}`,
    parsed.weeklyHours && `Hours/week: ${parsed.weeklyHours}`,
    parsed.examDate && `Exam date: ${parsed.examDate}`,
  ]
    .filter(Boolean)
    .join("\n");
  const userText = profileText
    ? `Learner profile:\n${profileText}\n\nGive me a personalized exam target and study plan.`
    : "Give me a general study-plan recommendation for Bangladeshi government job exams.";

  const started = Date.now();
  let rawText = "";
  let usageProvider = "cache";
  let usageModel = "cached";
  const cacheKey = aiCacheKey([
    "advisor",
    userId,
    profileText,
  ]);

  const cached = await aiCacheGet(cacheKey);
  if (cached) {
    rawText = cached;
    await finalizeUsage({
      userId,
      task: "solver",
      provider: "cache",
      model: "cached",
      started,
      inputText: system + userText,
      outputText: rawText,
      success: true,
      estimatedCostUsd: 0,
      intent: "recommend",
    });
  } else {
    try {
      const fo = await withFailover("solver", {}, (p) =>
        p.generate({ system, messages: [{ role: "user", content: userText }], maxTokens: 1500 }),
      );
      rawText = fo.value.text;
      usageProvider = fo.provider;
      usageModel = fo.model;
      await finalizeUsage({
        userId,
        task: "solver",
        provider: usageProvider,
        model: usageModel,
        started,
        inputText: system + userText,
        outputText: rawText,
        success: true,
        estimatedCostUsd: fo.value.estimatedCostUsd,
        intent: "recommend",
      });
      await aiCacheSet(cacheKey, rawText);
    } catch (err) {
      await finalizeUsage({
        userId,
        task: "solver",
        provider: usageProvider,
        model: usageModel,
        started,
        inputText: system + userText,
        outputText: "",
        success: false,
        errorCode: err instanceof AppError ? err.code : "AI_PROVIDER_ERROR",
        intent: "recommend",
      });
      if (err instanceof AppError) throw err;
      throw new InternalServerError("The advisor failed.");
    }
  }

  const fallback = "Could not generate advice. Please try again.";
  const result = validateAdvisorOutput(rawText, fallback);
  result.source = usageProvider;
  await bumpAIQuestions(userId);

  return { result, provider: usageProvider, model: usageModel };
}