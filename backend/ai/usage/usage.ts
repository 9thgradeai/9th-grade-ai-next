// AI usage/cost ledger. Records every AI call (no prompt content) and keeps
// the UserProgress.aiQuestionsAsked counter meaningful again.

import "server-only";

import { prisma } from "~backend/db";
import type { AITask, AIUsageRecord } from "../types";

export async function recordUsage(
  record: AIUsageRecord & { userId?: string | null },
): Promise<void> {
  await prisma.aIUsage.create({
    data: {
      userId: record.userId ?? null,
      task: taskToEnum(record.task),
      intent: record.intent ?? "",
      provider: record.provider,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.inputTokens + record.outputTokens,
      latencyMs: record.latencyMs,
      success: record.success,
      errorCode: record.errorCode ?? "",
      estimatedCostUsd: record.estimatedCostUsd ?? 0,
    },
  });
}

function taskToEnum(task: AITask): "TUTOR" | "SOLVER" | "ASSISTANT" {
  switch (task) {
    case "solver":
      return "SOLVER";
    case "assistant":
      return "ASSISTANT";
    default:
      return "TUTOR";
  }
}

/** Increment the user's AI-question counter (revives the previously dead metric). */
export async function bumpAIQuestions(userId: string): Promise<void> {
  await prisma.userProgress.upsert({
    where: { userId },
    update: { aiQuestionsAsked: { increment: 1 } },
    create: { userId, aiQuestionsAsked: 1 },
  });
}

/** Count AI calls for a user within the current UTC day (for daily quotas). */
export async function countUsageToday(
  userId: string,
  task?: AITask,
): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return prisma.aIUsage.count({
    where: {
      userId,
      createdAt: { gte: start },
      ...(task ? { task: taskToEnum(task) } : {}),
    },
  });
}