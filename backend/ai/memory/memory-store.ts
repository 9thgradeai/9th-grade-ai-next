// MemoryStore — persistent learning memory about the learner.
// Memory is written deliberately by the AI application layer, never freely by
// the model. Reads are explicit and typed.
// Enhanced with learning velocity tracking, session summaries, and
// wrong answer pattern analysis.

import "server-only";

import { prisma } from "~backend/db";
import type {
  AIMemorySource,
  AIMemoryType,
  Prisma,
} from "@prisma/client";

export type MemoryRow = {
  type: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  expiresAt: Date | null;
};

export type MemoryInput = {
  type: AIMemoryType;
  key: string;
  value: string;
  source?: AIMemorySource;
  confidence?: number; // 0-100
  expiresAt?: Date | null;
};

const DEFAULT_EXPIRY_DAYS = 90;

export async function getMemories(userId: string): Promise<MemoryRow[]> {
  const rows = await prisma.aIMemory.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    type: r.type,
    key: r.key,
    value: r.value,
    source: r.source,
    confidence: r.confidence,
    expiresAt: r.expiresAt,
  }));
}

export async function upsertMemory(userId: string, input: MemoryInput): Promise<void> {
  const data: Prisma.AIMemoryUncheckedCreateInput = {
    userId,
    type: input.type,
    key: input.key,
    value: input.value,
    source: input.source ?? "INFERRED",
    confidence: input.confidence ?? 50,
    expiresAt: input.expiresAt ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86400_000),
  };

  await prisma.aIMemory.upsert({
    where: { userId_type_key: { userId, type: input.type, key: input.key } },
    update: { value: data.value, source: data.source, confidence: data.confidence, expiresAt: data.expiresAt },
    create: data,
  });
}

/** Detect the learner's dominant language from recent user messages and record it. */
export async function notePreferredLanguage(userId: string, texts: string[]): Promise<void> {
  const sample = texts.slice(-5).filter((t) => t.length > 0);
  if (sample.length === 0) return;
  const bengaliChars = /[\u0980-\u09FF]/g;
  const bengali = sample.filter((t) => (t.match(bengaliChars)?.length ?? 0) >= 3).length;
  const ratio = bengali / sample.length;
  if (ratio >= 0.6) {
    await upsertMemory(userId, {
      type: "PREFERRED_LANGUAGE",
      key: "lang",
      value: "Bengali (Bangla)",
      source: "INFERRED",
      confidence: 80,
    });
  } else if (ratio <= 0.4) {
    await upsertMemory(userId, {
      type: "PREFERRED_LANGUAGE",
      key: "lang",
      value: "English",
      source: "INFERRED",
      confidence: 80,
    });
  }
}

/** Record a weak/strong topic signal into learning memory. */
export async function noteTopicSignal(
  userId: string,
  opts: { topic?: string; signal: "WEAK_TOPIC" | "STRONG_TOPIC"; confidence?: number },
): Promise<void> {
  if (!opts.topic) return;
  await upsertMemory(userId, {
    type: opts.signal,
    key: `topic:${opts.topic.slice(0, 120)}`,
    value: opts.topic,
    source: "INFERRED",
    confidence: opts.confidence ?? 70,
  });
}

/** Record the learner's exam goal (explicitly stated or from onboarding). */
export async function setExamGoal(userId: string, goal: string): Promise<void> {
  await upsertMemory(userId, {
    type: "EXAM_GOAL",
    key: "goal",
    value: goal.slice(0, 200),
    source: "USER",
    confidence: 100,
  });
}

// ── New memory features ─────────────────────────────────────

/**
 * Record a session summary — captures what was covered in a study session
 * for later recall and progress tracking.
 */
export async function recordSessionSummary(
  userId: string,
  opts: {
    sessionType: string;
    topicsCovered: string[];
    questionsAttempted: number;
    correctAnswers: number;
    durationMinutes: number;
    provider?: string;
    model?: string;
  },
): Promise<void> {
  const accuracy = opts.questionsAttempted > 0
    ? Math.round((opts.correctAnswers / opts.questionsAttempted) * 100)
    : 0;

  await upsertMemory(userId, {
    type: "LEARNING_PREFERENCE",
    key: `session:${Date.now()}`,
    value: JSON.stringify({
      ...opts,
      accuracy,
      timestamp: new Date().toISOString(),
    }),
    source: "SYSTEM",
    confidence: 100,
    expiresAt: new Date(Date.now() + 30 * 86400_000), // 30 days
  });
}

/**
 * Track learning velocity — calculates improvement rate over recent sessions.
 */
export async function getLearningVelocity(userId: string): Promise<{
  improving: boolean;
  accuracyTrend: number[];
  averageAccuracy: number;
  sessionCount: number;
} | null> {
  const memories = await prisma.aIMemory.findMany({
    where: {
      userId,
      type: "LEARNING_PREFERENCE",
      key: { startsWith: "session:" },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (memories.length < 2) return null;

  const sessions = memories
    .map((m) => {
      try {
        return JSON.parse(m.value) as { accuracy: number; timestamp: string };
      } catch {
        return null;
      }
    })
    .filter((s): s is { accuracy: number; timestamp: string } => s !== null);

  if (sessions.length < 2) return null;

  const accuracyTrend = sessions.map((s) => s.accuracy);
  const averageAccuracy = accuracyTrend.reduce((a, b) => a + b, 0) / accuracyTrend.length;

  // Simple velocity: compare first half average to second half average
  const mid = Math.floor(accuracyTrend.length / 2);
  const firstHalfAvg = accuracyTrend.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondHalfAvg = accuracyTrend.slice(mid).reduce((a, b) => a + b, 0) / (accuracyTrend.length - mid);
  const improving = secondHalfAvg > firstHalfAvg;

  return {
    improving,
    accuracyTrend,
    averageAccuracy,
    sessionCount: sessions.length,
  };
}

/**
 * Record a wrong answer pattern — helps identify recurring mistakes.
 */
export async function recordWrongAnswerPattern(
  userId: string,
  opts: {
    topic: string;
    questionType: string;
    mistakePattern: string;
    frequency: number;
  },
): Promise<void> {
  await upsertMemory(userId, {
    type: "RECURRING_MISTAKE",
    key: `pattern:${opts.topic}:${opts.questionType}`,
    value: JSON.stringify({
      ...opts,
      lastOccurrence: new Date().toISOString(),
    }),
    source: "SYSTEM",
    confidence: Math.min(50 + opts.frequency * 10, 100),
  });
}

/**
 * Get all wrong answer patterns for a user.
 */
export async function getWrongAnswerPatterns(userId: string): Promise<Array<{
  topic: string;
  questionType: string;
  mistakePattern: string;
  frequency: number;
}>> {
  const memories = await prisma.aIMemory.findMany({
    where: {
      userId,
      type: "RECURRING_MISTAKE",
      key: { startsWith: "pattern:" },
    },
    orderBy: { confidence: "desc" },
  });

  return memories
    .map((m) => {
      try {
        return JSON.parse(m.value) as {
          topic: string;
          questionType: string;
          mistakePattern: string;
          frequency: number;
        };
      } catch {
        return null;
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

/**
 * Record a study habit observation — helps personalize scheduling.
 */
export async function recordStudyHabit(
  userId: string,
  opts: {
    preferredTime?: string;
    averageSessionMinutes?: number;
    preferredSubjects?: string[];
    studyDaysPerWeek?: number;
  },
): Promise<void> {
  await upsertMemory(userId, {
    type: "LEARNING_PREFERENCE",
    key: "habits",
    value: JSON.stringify(opts),
    source: "INFERRED",
    confidence: 70,
  });
}

/**
 * Get study habits for a user.
 */
export async function getStudyHabits(userId: string): Promise<{
  preferredTime?: string;
  averageSessionMinutes?: number;
  preferredSubjects?: string[];
  studyDaysPerWeek?: number;
} | null> {
  const memory = await prisma.aIMemory.findFirst({
    where: {
      userId,
      type: "LEARNING_PREFERENCE",
      key: "habits",
    },
  });

  if (!memory) return null;

  try {
    return JSON.parse(memory.value);
  } catch {
    return null;
  }
}

export async function deleteUserMemories(userId: string): Promise<void> {
  await prisma.aIMemory.deleteMany({ where: { userId } });
}