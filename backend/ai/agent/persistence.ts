// Agent run persistence — creates and finalizes AgentRun / AgentToolCall rows.

import "server-only";

import { prisma } from "~backend/db";
import type { Prisma } from "@prisma/client";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function createRun(opts: {
  userId: string;
  conversationId?: string;
  intent: string;
}): Promise<string> {
  const run = await prisma.agentRun.create({
    data: {
      userId: opts.userId,
      conversationId: opts.conversationId,
      intent: opts.intent,
      status: "IN_PROGRESS",
    },
  });
  return run.id;
}

export async function finalizeRun(opts: {
  runId: string;
  status: "COMPLETED" | "FAILED";
  steps: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  errorCode?: string;
  responseJson?: unknown;
}): Promise<void> {
  await prisma.agentRun.update({
    where: { id: opts.runId },
    data: {
      status: opts.status,
      steps: opts.steps,
      provider: opts.provider,
      model: opts.model,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      latencyMs: opts.latencyMs,
      errorCode: opts.errorCode ?? "",
      responseJson: opts.responseJson === undefined ? undefined : asJson(opts.responseJson),
    },
  });
}

export async function recordToolCall(opts: {
  runId: string;
  name: string;
  arguments: Record<string, unknown>;
  resultJson: unknown;
  durationMs: number;
  success: boolean;
  errorCode?: string;
}): Promise<void> {
  await prisma.agentToolCall.create({
    data: {
      runId: opts.runId,
      name: opts.name,
      argumentsJson: asJson(opts.arguments),
      resultJson: opts.resultJson === undefined ? undefined : asJson(opts.resultJson),
      durationMs: opts.durationMs,
      success: opts.success,
      errorCode: opts.errorCode ?? "",
    },
  });
}