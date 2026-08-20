// AI application services — the orchestration layer between routes and the
// AI domain. Routes stay thin; business logic lives here.

import "server-only";

import { AppError, InternalServerError } from "~backend/errors";
import { buildContext, questionContextIds } from "../context/context-engine";
import { buildTutorSystem, buildSolverSystem, buildAssistantSystem } from "../prompts";
import { resolveModel } from "../providers";
import { notePreferredLanguage, noteTopicSignal } from "../memory/memory-store";
import {
  addMessage,
  createConversation,
  getConversation,
  listMessages,
} from "../persistence/conversations";
import { bumpAIQuestions, recordUsage } from "../usage/usage";
import { searchForIntent } from "../tools/search";
import { validateSolverOutput, sanitizeReply, parseJsonObject } from "../validation/outputs";
import { validateChatRequest, validateSolverRequest } from "../schemas";
import { DEFAULT_TITLE, summarizeConversationTitle } from "./title";
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

  const lastUser = await persistUserTurn(userId, conversation.id, request.messages, intent);
  await notePreferredLanguage(userId, [lastUser?.content ?? ""]);

  const modelMessages = await buildModelMessages(userId, conversation.id, request.messages);

  const { provider, name } = resolveModel("tutor");
  const query = modelMessages[modelMessages.length - 1]?.content ?? "";
  const web = await searchForIntent(intent, query);
  const system = buildTutorSystem(
    { ...context, retrievedKnowledge: web.block || undefined, webResults: web.results },
    web.block,
  );

  const started = Date.now();
  const { stream, done, getFullText } = await provider.stream({
    system,
    messages: modelMessages,
    maxTokens: 2048,
  });

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

  void (async () => {
    await done;
    const fullText = sanitizeReply(getFullText());
    const success = fullText.length > 0;
    let messageId: string | undefined;
    try {
      const msg = await addMessage(userId, conversation.id, {
        role: "ASSISTANT",
        status: success ? "COMPLETE" : "FAILED",
        content: fullText,
        intent,
        provider: name,
        model: provider.model,
        metadata: { subjectId, topicId, topicPath: topicPath ?? "", intent, webResults: web.results },
        errorCode: success ? undefined : "AI_EMPTY_RESPONSE",
      });
      messageId = msg.id;
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
      model: provider.model,
      started,
      inputText: system + modelMessages.map((m) => m.content).join("\n"),
      outputText: fullText,
      success,
      errorCode: success ? undefined : "AI_EMPTY_RESPONSE",
      intent,
    });
  })();

  return {
    stream: wrapped,
    conversationId: conversation.id,
    intent,
    provider: name,
    model: provider.model,
  };
}

// ── Solver service (structured, non-streaming) ─────────────

export async function solveQuestion(opts: {
  userId: string;
  request: unknown;
}): Promise<{ result: SolverResult; conversationId: string }> {
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
  const { provider, name } = resolveModel("solver", { image: hasImage });
  const system = buildSolverSystem(context);
  const userText = request.text?.trim() || "Solve the question in the attached image.";

  const started = Date.now();
  let rawText = "";
  try {
    const result = await provider.generate({
      system,
      messages: [{ role: "user", content: userText }],
      images: hasImage && provider.supportsVision ? [{ type: "image", dataUrl: toImageDataUrl(request.imageBase64 as string) }] : undefined,
      maxTokens: 1024,
    });
    rawText = result.text;
    await finalizeUsage({
      userId,
      task: "solver",
      provider: name,
      model: provider.model,
      started,
      inputText: system + userText,
      outputText: rawText,
      success: true,
      estimatedCostUsd: result.estimatedCostUsd,
      intent: "solve",
    });
  } catch (err) {
    await finalizeUsage({
      userId,
      task: "solver",
      provider: name,
      model: provider.model,
      started,
      inputText: system + userText,
      outputText: "",
      success: false,
      errorCode: err instanceof AppError ? err.code : "AI_PROVIDER_ERROR",
      intent: "solve",
    });
    if (err instanceof AppError) throw err;
    throw new InternalServerError("The AI solver failed to generate a solution.");
  }

  const fallback = "Unable to produce a solution. Please rephrase your question.";
  const result = validateSolverOutput(rawText, fallback);
  result.source = name;

  // Persist as a SOLVER conversation for history + tutor handoff.
  const conversation = await ensureConversation(
    userId,
    "SOLVER",
    {
      title: userText.slice(0, TITLE_SNIPPET),
      subjectId: context.subject?.id,
      topicId: context.topic?.id,
      topicPath,
    },
    context,
  );
  await addMessage(userId, conversation.id, {
    role: "USER",
    status: "COMPLETE",
    content: hasImage ? `[Image question] ${userText}` : userText,
    intent: "solve",
    metadata: { subjectId, topicId, hasImage },
  });
  await addMessage(userId, conversation.id, {
    role: "ASSISTANT",
    status: "COMPLETE",
    content: JSON.stringify(result),
    intent: "solve",
    provider: name,
    model: provider.model,
    metadata: { subjectId, topicId },
  });
  await bumpAIQuestions(userId);

  if (result.misconception && context.topic) {
    await noteTopicSignal(userId, { topic: context.topic.name, signal: "WEAK_TOPIC", confidence: 75 });
  }

  return { result, conversationId: conversation.id };
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
}): Promise<{ result: AssistantResult; conversationId: string; provider: string; model: string }> {
  const { userId, request: raw } = opts;
  const parsed = validateChatRequest(raw);
  const request = parsed as AssistantRequest;
  const intent = request.intent ?? detectIntent(parsed.messages[parsed.messages.length - 1]?.content ?? "", "general");

  const context = await buildContext({ userId, task: "assistant", intent, questionId: request.questionId });
  const conversation = await ensureConversation(userId, "ASSISTANT", request, context);

  const lastUser = await persistUserTurn(userId, conversation.id, request.messages, intent);
  await notePreferredLanguage(userId, [lastUser?.content ?? ""]);

  const modelMessages = await buildModelMessages(userId, conversation.id, request.messages);
  const query = modelMessages[modelMessages.length - 1]?.content ?? "";
  const web = await searchForIntent(intent, query);
  const system = buildAssistantSystem(
    { ...context, retrievedKnowledge: web.block || undefined, webResults: web.results },
    web.block,
  );

  const instructions =
    "\n\nRespond with JSON only:\n{\n  \"reply\": \"<your guidance, Bengali-first>\",\n  \"actions\": [{\"id\": \"...\", \"labelBn\": \"...\", \"labelEn\": \"...\", \"action\": \"continue|weak-topics|mistakes|what-today|practice|current-affairs|general\"}]\n}\n" +
    "Provide at most 4 actions. Only suggest actions that are useful given the learner's context.";

  const { provider, name } = resolveModel("assistant");
  const started = Date.now();
  let rawText = "";
  let success = false;
  let errorCode: string | undefined;
  try {
    const result = await provider.generate({
      system: system + instructions,
      messages: modelMessages,
      maxTokens: 1024,
    });
    rawText = result.text;
    success = true;
  } catch (err) {
    errorCode = err instanceof AppError ? err.code : "AI_PROVIDER_ERROR";
  }

  await finalizeUsage({
    userId,
    task: "assistant",
    provider: name,
    model: provider.model,
    started,
    inputText: system + modelMessages.map((m) => m.content).join("\n"),
    outputText: rawText,
    success,
    errorCode,
    intent,
  });

  let reply = "";
  let actions: SuggestedAction[] = [];
  if (success) {
    const parsedOut = parseJsonObject(rawText);
    const validated = parsedOut
      ? validateAssistantActions(parsedOut)
      : { reply: sanitizeReply(rawText), actions: [] };
    reply = validated.reply;
    actions = validated.actions.length > 0 ? validated.actions : SUGGESTED_ACTIONS.slice(0, 3);
  } else {
    reply = "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।";
  }

  await addMessage(userId, conversation.id, {
    role: "ASSISTANT",
    status: success ? "COMPLETE" : "FAILED",
    content: reply,
    intent,
    provider: name,
    model: provider.model,
    metadata: { intent, webResults: web.results },
    errorCode,
  });
  if (success) await bumpAIQuestions(userId);
  if (conversation.title === DEFAULT_TITLE) {
    void summarizeConversationTitle(userId, conversation.id);
  }

  return {
    result: { reply, suggestedActions: actions, source: name },
    conversationId: conversation.id,
    provider: name,
    model: provider.model,
  };
}

// Re-export the validated request type helpers for tests.
export { validateChatRequest, validateSolverRequest } from "../schemas";
export { buildContext } from "../context/context-engine";