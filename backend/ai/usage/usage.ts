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

export type UsageSummary = {
  totalCalls: number;
  totalCostUsd: number;
  successRate: number;
  avgLatencyMs: number;
  byProvider: { provider: string; calls: number; costUsd: number }[];
  byDay: { date: string; calls: number; costUsd: number }[];
};

/** Aggregate the caller's own AI usage for an observability view. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const since = new Date(Date.now() - 14 * 86400_000);

  const [agg, byProvider, rows] = await Promise.all([
    prisma.aIUsage.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { estimatedCostUsd: true },
      _avg: { latencyMs: true },
    }),
    prisma.aIUsage.groupBy({
      by: ["provider"],
      where: { userId },
      _count: { _all: true },
      _sum: { estimatedCostUsd: true },
    }),
    prisma.aIUsage.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true, estimatedCostUsd: true, success: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const total = agg._count._all;
  const successCount = rows.filter((r) => r.success).length;
  const byDayMap = new Map<string, { calls: number; costUsd: number }>();
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const cur = byDayMap.get(day) ?? { calls: 0, costUsd: 0 };
    cur.calls += 1;
    cur.costUsd += r.estimatedCostUsd;
    byDayMap.set(day, cur);
  }

  return {
    totalCalls: total,
    totalCostUsd: agg._sum.estimatedCostUsd ?? 0,
    successRate: total ? successCount / total : 0,
    avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
    byProvider: byProvider.map((p) => ({
      provider: p.provider,
      calls: p._count._all,
      costUsd: p._sum.estimatedCostUsd ?? 0,
    })),
    byDay: Array.from(byDayMap.entries()).map(([date, v]) => ({
      date,
      calls: v.calls,
      costUsd: v.costUsd,
    })),
  };
}