// ContextEngine — builds a task-appropriate AIContext from real domain data.
// Only the data a given task needs is fetched (context selection by task).

import "server-only";

import { prisma } from "~backend/db";
import { AppError, NotFoundError } from "~backend/errors";
import {
  aggregateAttemptsByTopic,
  aggregateRecentAccuracy,
} from "~backend/repositories/analytics.repository";
import { getMemories, type MemoryRow } from "../memory/memory-store";
import type { AIContext, AIIntent, AITask } from "../types";

const EXAM_NAMES: Record<string, string> = {
  BCS: "BCS",
  BANK: "Bangladesh Bank",
  TEACHER: "Teacher Recruitment",
};

async function loadSubject(subjectId?: number) {
  if (!subjectId) return null;
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, nameBn: true, nameEn: true },
  });
  return subject;
}

async function loadTopic(topicId?: number) {
  if (!topicId) return null;
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, path: true, subjectId: true },
  });
  return topic;
}

async function loadQuestion(questionId?: number) {
  if (!questionId) return null;
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, question: true, subject: { select: { nameBn: true } }, topic: true },
  });
  if (!q) return null;
  return {
    id: q.id,
    question: q.question,
    subject: q.subject?.nameBn ?? "",
    topic: q.topic,
  };
}

type PerformanceAgg = {
  accuracy: number;
  questionsAnswered: number;
  recentAccuracy: number;
  weakTopics: string[];
  strongTopics: string[];
};

async function loadPerformance(userId: string): Promise<PerformanceAgg> {
  // Both aggregates run as grouped queries IN THE DATABASE (Phase 6) — the
  // previous implementation loaded every attempt row twice per AI turn.
  const [progress, recent, byTopic] = await Promise.all([
    prisma.userProgress.findUnique({
      where: { userId },
      select: { accuracy: true, questionsAnswered: true },
    }),
    aggregateRecentAccuracy(userId, 30),
    aggregateAttemptsByTopic(userId),
  ]);

  const weak: string[] = [];
  const strong: string[] = [];
  for (const agg of byTopic) {
    if (!agg.topic) continue;
    if (agg.attempted < 3) continue;
    const acc = Math.round((agg.correct / agg.attempted) * 100);
    if (acc < 50) weak.push(agg.topic);
    else if (acc >= 80) strong.push(agg.topic);
  }

  return {
    accuracy: progress?.accuracy ?? 0,
    questionsAnswered: progress?.questionsAnswered ?? 0,
    recentAccuracy: recent.total > 0 ? Math.round((recent.correct / recent.total) * 100) : 0,
    weakTopics: weak,
    strongTopics: strong,
  };
}

function deriveLearningProfile(
  memories: MemoryRow[],
  performance: PerformanceAgg | undefined,
) {
  const find = (type: string) => memories.find((m) => m.type === type)?.value;
  return {
    weakTopics: performance?.weakTopics ?? [],
    strongTopics: performance?.strongTopics ?? [],
    preferredLanguage: find("PREFERRED_LANGUAGE"),
    examGoal: find("EXAM_GOAL"),
    difficultyPreference: find("DIFFICULTY_PREFERENCE"),
  };
}

export type ContextParams = {
  userId: string;
  task: AITask;
  intent?: AIIntent;
  subjectId?: number;
  topicId?: number;
  questionId?: number;
};

/** Build the context object used to construct prompts for a task. */
export async function buildContext(params: ContextParams): Promise<AIContext> {
  const topic = await loadTopic(params.topicId);
  const subjectId = params.subjectId ?? topic?.subjectId;

  const [subject, question, performance, memories] = await Promise.all([
    loadSubject(subjectId),
    loadQuestion(params.questionId),
    loadPerformance(params.userId),
    getMemories(params.userId),
  ]);

  return {
    userId: params.userId,
    exam: EXAM_NAMES[process.env.AI_TARGET_EXAM ?? "BCS"] ?? "BCS",
    subject: subject ?? null,
    topic: topic ? { id: topic.id, name: topic.name, path: topic.path } : null,
    question,
    performance: performance
      ? {
          accuracy: performance.accuracy,
          questionsAnswered: performance.questionsAnswered,
          recentAccuracy: performance.recentAccuracy,
        }
      : undefined,
    learningProfile: deriveLearningProfile(memories, performance),
    memories: memories.map((m) => ({ type: m.type, value: m.value, confidence: m.confidence })),
    intent: params.intent,
  };
}

/**
 * Load a question's subject/topic ids from the domain, so a conversation
 * opened from a question gets the right topic-scoped context.
 */
export async function questionContextIds(
  questionId: number,
): Promise<{ subjectId: number | null; topicId: number | null; topicPath: string }> {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { subjectId: true, topicId: true, path: true },
  });
  if (!q) {
    throw new NotFoundError("Question not found");
  }
  return { subjectId: q.subjectId, topicId: q.topicId, topicPath: q.path };
}