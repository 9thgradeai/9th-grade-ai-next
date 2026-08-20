// MemoryStore — persistent learning memory about the learner.
// Memory is written deliberately by the AI application layer, never freely by
// the model. Reads are explicit and typed.

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

export async function deleteUserMemories(userId: string): Promise<void> {
  await prisma.aIMemory.deleteMany({ where: { userId } });
}