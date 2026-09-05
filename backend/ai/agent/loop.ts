// Bounded agent loop — iteratively calls the model, lets it request tools,
// executes them through the allowlisted registry, and stops with a typed
// AgentResponse. Provider-neutral; never assumes native tool-calling.

import "server-only";

import { resolveCandidatesForModelTask } from "../providers";
import type { LLMProvider } from "../providers/types";
import type { AIMessageInput, AIIntent } from "../types";
import { findTool, executeTool, getTools, type ToolContext } from "../tools/index";
import { validateAgentOutput, augmentActionsWithQuestionIds, type AgentBlock, type AgentResponse } from "./response";
import { buildAgentSystemPrompt, MAX_AGENT_STEPS, MAX_AGENT_OUTPUT_CHARS, parseAgentTurn } from "./prompt";
import { buildContext } from "../context/context-engine";
import { createRun, finalizeRun, recordToolCall } from "./persistence";
import { AppError } from "~backend/errors";

export type AgentStatus = {
  message?: string;
  tool?: { name: string; action: "started" | "completed"; ok?: boolean };
  blocks?: AgentBlock[];
  runId?: string;
};

export type AgentTurnResult = {
  response: AgentResponse;
  runId: string;
  provider: string;
  model: string;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  isMock: boolean;
};

async function runStep(
  provider: LLMProvider,
  messages: AIMessageInput[],
  system: string,
): Promise<string> {
  const result = await provider.generate({
    system,
    messages,
    maxTokens: MAX_AGENT_OUTPUT_CHARS,
  });
  if (!result.text.trim()) {
    throw new AppError(502, "The AI provider returned an empty response.", "AI_EMPTY_RESPONSE");
  }
  return result.text;
}

export async function runAgentTurn(opts: {
  userId: string;
  question: string;
  subjectId?: number;
  topicId?: number;
  topicPath?: string;
  questionId?: number;
  conversationId?: string;
  intent?: AIIntent;
  onStatus?: (status: AgentStatus) => void;
}): Promise<AgentTurnResult> {
  const started = Date.now();
  const { userId, question } = opts;
  const intent = opts.intent ?? "recommend";

  const context = await buildContext({
    userId,
    task: "assistant",
    intent,
    subjectId: opts.subjectId,
    topicId: opts.topicId,
    questionId: opts.questionId,
  });

  const userContextSummary = [
    context.subject?.nameBn && `Context subject: ${context.subject.nameBn}`,
    context.topic?.name && `Context topic: ${context.topic.name}`,
    context.question?.question && `Context question: ${context.question.question.slice(0, 160)}`,
    context.learningProfile?.weakTopics?.length
      ? `Known weak areas: ${context.learningProfile.weakTopics.slice(0, 5).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const today = new Date().toDateString();
  const tools = getTools();
  const toolContext: ToolContext = { userId, conversationId: opts.conversationId };
  const system = buildAgentSystemPrompt(tools, userContextSummary, today);

  const runId = await createRun({
    userId,
    conversationId: opts.conversationId,
    intent: `agent:${intent}`,
  });
  opts.onStatus?.({ message: "Understood — checking your progress first.", runId });

  const history: AIMessageInput[] = [{ role: "user", content: question }];

  let steps = 0;
  let providerUsed = "mock";
  let modelUsed = "mock";
  let isMock = false;
  const inputTokens = 0;
  let outputTokens = 0;
  // Question-set payloads from session-builder tools, injected into the final
  // practice/mock_exam actions so the client drills REAL builder-selected ids.
  const sessionToolResults: Record<string, { questionIds?: unknown }> = {};

  try {
    const candidates = resolveCandidatesForModelTask("agent_reasoning");
    let lastErr: unknown = null;

    for (const cand of candidates) {
      const provider = cand.provider;
      providerUsed = cand.name;
      modelUsed = provider.model;
      isMock = cand.name === "mock";
      try {
        while (steps < MAX_AGENT_STEPS) {
          steps += 1;
          const raw = await runStep(provider, history, system);
          const msg: AIMessageInput = { role: "assistant", content: raw };

          const turn = parseAgentTurn(msg.content);
          if (turn.toolCall) {
            const { name, arguments: args } = turn.toolCall;
            opts.onStatus?.({ message: "Reviewing your data", tool: { name, action: "started" } });
            const def = findTool(name);
            const t0 = Date.now();
            const argObj = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
            let result: { ok?: boolean; summary: string; data?: Record<string, unknown> };
            let success = false;
            if (!def) {
              result = { ok: false, summary: `Unknown tool: ${name}.` };
            } else {
              result = await executeTool(def, toolContext, argObj);
              success = result.ok !== false;
              if ((name === "create_practice_session" || name === "create_mock_exam") && result.data) {
                sessionToolResults[name] = result.data;
              }
            }
            const durationMs = Date.now() - t0;
            await recordToolCall({
              runId,
              name,
              arguments: argObj,
              resultJson: result,
              durationMs,
              success,
              errorCode: success ? "" : "TOOL_ERROR",
            }).catch(() => {});
            opts.onStatus?.({ tool: { name, action: "completed", ok: success } });
            history.push(msg);
            history.push({
              role: "user",
              content: `Tool result for ${name} (success=${success}):\n${JSON.stringify(result).slice(0, 1500)}`,
            });
            continue;
          }

          // No tool call → final structured output.
          const finalBlocksText = (turn.blocksText || msg.content).trim();
          const response = augmentActionsWithQuestionIds(
            validateAgentOutput(parseMaybeJson(finalBlocksText), finalBlocksText),
            sessionToolResults,
          );
          opts.onStatus?.({ blocks: response.blocks });
          outputTokens = Math.max(1, Math.ceil(finalBlocksText.length / 4));
          await finalizeRun({
            runId,
            status: "COMPLETED",
            steps,
            provider: providerUsed,
            model: modelUsed,
            inputTokens,
            outputTokens,
            latencyMs: Date.now() - started,
            responseJson: response,
          }).catch(() => {});
          return {
            response,
            runId,
            provider: providerUsed,
            model: modelUsed,
            steps,
            inputTokens,
            outputTokens,
            latencyMs: Date.now() - started,
            isMock,
          };
        }
        // Exhausted steps without a final response.
        throw new AppError(502, "Agent reached the step limit.", "AGENT_STEP_LIMIT");
      } catch (err) {
        if (cand.name !== "mock") {
          opts.onStatus?.({ message: "Provider unavailable, retrying…" });
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new AppError(502, "Agent could not produce a response.", "AI_PROVIDER_ERROR");
  } catch (err) {
    const code = err instanceof AppError ? err.code : "AI_PROVIDER_ERROR";
    await finalizeRun({
      runId,
      status: "FAILED",
      steps,
      provider: providerUsed,
      model: modelUsed,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - started,
      errorCode: code,
    }).catch(() => {});
    throw err;
  }
}

/** Try to parse raw text as JSON; fall back to the raw text otherwise. */
function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    return parsed;
  } catch {
    return text;
  }
}