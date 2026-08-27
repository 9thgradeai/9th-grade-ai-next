// Long-term student model — aggregates persistent learner signals
// (goals, language, weak/strong topics from memory + usage) into a single
// profile the product can surface and the tutor can later personalize on.

import "server-only";

import { prisma } from "~backend/db";

export type StudentModelTopic = { topic: string; detail: string; confidence: number };
export type StudentModel = {
  examGoal?: string;
  preferredLanguage?: string;
  weakTopics: StudentModelTopic[];
  strongTopics: { topic: string; detail: string }[];
  totalAiQuestions: number;
  evaluatedCount: number;
  usageByTask: { task: string; count: number }[];
  lastActive?: string;
};

/** Aggregate the learner's long-term profile from memory + usage. */
export async function getStudentModel(userId: string): Promise<StudentModel> {
  const [memories, usageByTask, totalQ, evalCount, last] = await Promise.all([
    prisma.aIMemory.findMany({ where: { userId } }),
    prisma.aIUsage.groupBy({ by: ["task"], where: { userId }, _count: { _all: true } }),
    prisma.aIUsage.count({ where: { userId } }),
    prisma.aIMessage.count({ where: { intent: "evaluate", conversation: { userId } } }),
    prisma.aIUsage.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const byType = (t: string) => memories.filter((m) => m.type === t);

  const weakTopics: StudentModelTopic[] = byType("WEAK_TOPIC").map((m) => ({
    topic: m.key,
    detail: m.value,
    confidence: m.confidence,
  }));
  const strongTopics = byType("STRONG_TOPIC").map((m) => ({ topic: m.key, detail: m.value }));

  return {
    examGoal: byType("EXAM_GOAL")[0]?.value,
    preferredLanguage: byType("PREFERRED_LANGUAGE")[0]?.value,
    weakTopics,
    strongTopics,
    totalAiQuestions: totalQ,
    evaluatedCount: evalCount,
    usageByTask: usageByTask.map((u) => ({ task: u.task, count: u._count._all })),
    lastActive: last?.createdAt ? last.createdAt.toISOString() : undefined,
  };
}
