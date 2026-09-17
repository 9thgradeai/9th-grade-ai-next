// backend/services/ecosystem.ts — Exam ecosystem resolution and validation.
// Server-only. Provides ecosystem lookup, relationship validation, and
// ecosystem-scoped query helpers. Delegate to this from API route handlers.

import "server-only";

import { prisma } from "~backend/db";
import { NotFoundError, ValidationError } from "~backend/errors";
import type { ExamEcosystemCode } from "@prisma/client";

// Valid ecosystem codes (mirrors the Prisma enum at compile time)
const VALID_CODES: ReadonlySet<string> = new Set(["BCS", "BANGLADESH_BANK"]);

/**
 * Resolve an ecosystem code string to its database row.
 * Throws NotFoundError if the code is invalid or inactive.
 */
export async function getEcosystemByCode(code: string) {
  if (!VALID_CODES.has(code)) {
    throw new NotFoundError(`Unknown exam ecosystem: ${code}`);
  }
  const ecosystem = await prisma.examEcosystem.findUnique({
    where: { code: code as ExamEcosystemCode },
  });
  if (!ecosystem || !ecosystem.isActive) {
    throw new NotFoundError(`Exam ecosystem not found or inactive: ${code}`);
  }
  return ecosystem;
}

/**
 * Return all active ecosystems, ordered by sortOrder.
 */
export async function getAllEcosystems() {
  return prisma.examEcosystem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Return ecosystem-scoped subject count + question count.
 */
export async function getEcosystemSummary(ecosystemId: number) {
  const [subjectCount, questionCount] = await Promise.all([
    prisma.subject.count({ where: { ecosystemId } }),
    prisma.question.count({ where: { ecosystemId } }),
  ]);
  return { subjectCount, questionCount };
}

/**
 * Validate that a subject belongs to the given ecosystem.
 * Throws ValidationError if the subject doesn't exist or belongs to a different ecosystem.
 */
export async function validateSubjectEcosystem(subjectId: number, ecosystemId: number) {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) {
    throw new ValidationError(`Subject not found: ${subjectId}`);
  }
  if (subject.ecosystemId !== ecosystemId) {
    throw new ValidationError(
      `Subject ${subjectId} belongs to ecosystem ${subject.ecosystemId}, expected ${ecosystemId}`
    );
  }
  return subject;
}

/**
 * Validate that a topic belongs to the given ecosystem (via its Subject).
 * Throws ValidationError if the topic doesn't exist or belongs to a different ecosystem.
 */
export async function validateTopicEcosystem(topicId: number, ecosystemId: number) {
  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) {
    throw new ValidationError(`Topic not found: ${topicId}`);
  }
  const subject = await prisma.subject.findUnique({ where: { id: topic.subjectId } });
  if (!subject || subject.ecosystemId !== ecosystemId) {
    throw new ValidationError(
      `Topic ${topicId} does not belong to ecosystem ${ecosystemId}`
    );
  }
  return topic;
}

/**
 * Validate that a question belongs to the given ecosystem.
 * Throws ValidationError if the question doesn't exist or belongs to a different ecosystem.
 */
export async function validateQuestionEcosystem(questionId: number, ecosystemId: number) {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) {
    throw new ValidationError(`Question not found: ${questionId}`);
  }
  if (question.ecosystemId !== ecosystemId) {
    throw new ValidationError(
      `Question ${questionId} belongs to ecosystem ${question.ecosystemId}, expected ${ecosystemId}`
    );
  }
  return question;
}

/**
 * Resolve ecosystem code to ID, with validation.
 * Convenience wrapper used by route handlers.
 */
export async function resolveEcosystemId(code?: string): Promise<number | undefined> {
  if (!code) return undefined;
  const ecosystem = await getEcosystemByCode(code);
  return ecosystem.id;
}
