// backend/services/adaptive-exam/live-question-bridge.ts
// Read-only bridge from the live Question bank into the historical domain.
//
// SAFETY: `Question.correctAnswer` is mapped to `claimedAnswer` only. Bridge
// rows are never `eligibleForPyq`, never independently verified, and never
// assert a difficulty. Nothing here writes to the live bank.

import "server-only";

import type { PrismaClient } from "@prisma/client";
import type {
  ExamProfile,
  HistoricalQuestionRecord,
  QuestionOptions,
} from "./contracts";
import { hashSnapshot } from "./hash";
import {
  bindSubject,
  claimedAnswerFromText,
  familyForEcosystem,
  languageForSubject,
  liveFingerprint,
  normalizeQuestionText,
  optionsFromJson,
  type LiveQuestionRow,
} from "./live-question-binding";

export type LiveBridgeIssue = {
  questionId: number;
  reason: string;
  preservedRef: string;
};

export type LiveBridgeResult = {
  records: HistoricalQuestionRecord[];
  issues: LiveBridgeIssue[];
};

type LiveRow = {
  id: number;
  path: string;
  topic: string;
  subtopic: string;
  question: string;
  options: unknown;
  correctAnswer: string;
  explanation: string;
  questionType: string;
  year: number | null;
  sourceExam: string;
  sourceKey: string;
  rawMath: boolean;
  ecosystem: { code: string };
  subject: { nameBn: string; nameEn: string };
};

export function rowToLiveQuestionRow(row: LiveRow): LiveQuestionRow {
  return {
    id: row.id,
    ecosystemCode: row.ecosystem.code,
    subjectNameBn: row.subject.nameBn,
    subjectNameEn: row.subject.nameEn,
    path: row.path,
    topic: row.topic,
    subtopic: row.subtopic,
    question: row.question,
    options: row.options,
    correctAnswer: row.correctAnswer,
    explanation: row.explanation,
    questionType: row.questionType,
    year: row.year,
    sourceExam: row.sourceExam,
    sourceKey: row.sourceKey,
    difficulty: "UNCLASSIFIED",
    rawMath: row.rawMath,
  };
}

/** Pure mapper; exported for unit tests that must prove claim-only behaviour. */
export function mapLiveQuestion(
  row: LiveQuestionRow,
  profile: ExamProfile,
  now: string,
): { record?: HistoricalQuestionRecord; issue?: LiveBridgeIssue } {
  const { options, count } = optionsFromJson(row.options);
  if (!options || count !== 4) {
    return {
      issue: {
        questionId: row.id,
        reason: `Expected exactly four options; found ${count}.`,
        preservedRef: `live-question:${row.id}`,
      },
    };
  }
  const subjectId = bindSubject(row, profile);
  if (!subjectId) {
    return {
      issue: {
        questionId: row.id,
        reason: "Live subject does not map to a configured profile subject.",
        preservedRef: `live-question:${row.id}`,
      },
    };
  }
  const family = familyForEcosystem(row.ecosystemCode);
  if (!family) {
    return {
      issue: {
        questionId: row.id,
        reason: `Unsupported ecosystem code: ${row.ecosystemCode}`,
        preservedRef: `live-question:${row.id}`,
      },
    };
  }
  const claimedAnswer = claimedAnswerFromText(row.correctAnswer, options);
  const normalizedText = normalizeQuestionText(row.question);
  const language = languageForSubject(subjectId, row);
  const topicPath = row.path || row.topic || subjectId;
  const record: HistoricalQuestionRecord = {
    id: `live-${row.id}`,
    family,
    organization: profile.organization,
    recruitmentPost: profile.recruitmentPost,
    examinationName: row.sourceExam || "Live question bank",
    ...(row.year === null ? {} : { examYear: row.year }),
    stage: profile.stage,
    ...(row.sourceKey ? { paperSet: row.sourceKey } : {}),
    subjectId,
    subjectName: row.subjectNameEn || row.subjectNameBn,
    topicPath,
    ...(row.subtopic ? { subtopicPath: row.subtopic } : {}),
    originalLanguage: language,
    questionText: row.question,
    options: options as QuestionOptions,
    ...(claimedAnswer ? { claimedAnswer } : {}),
    verification: claimedAnswer ? "SOURCE_CLAIMED" : "UNVERIFIED",
    explanationOrigin: "none",
    provenance: {
      sourceType: "ORIGINAL",
      reference: row.sourceKey || undefined,
      sourceFile: "live-question-bank",
      retrievedAt: now,
      rawMath: row.rawMath,
    },
    classification: { status: "unclassified" },
    originalSourceText: row.question,
    normalizedText,
    eligibleForPyq: false,
    createdAt: now,
    updatedAt: now,
  };
  return { record };
}

export type LiveQuestionBridge = {
  read(profile: ExamProfile, options?: { limit?: number }): Promise<LiveBridgeResult>;
};

export function createLiveQuestionBridge(
  client: PrismaClient,
  clock: { now(): string } = { now: () => new Date().toISOString() },
): LiveQuestionBridge {
  return {
    async read(profile, options) {
      const rows = await client.question.findMany({
        where: { ecosystem: { code: profile.ecosystemCode } },
        include: { ecosystem: true, subject: true },
        ...(options?.limit === undefined ? {} : { take: Math.max(0, options.limit) }),
        orderBy: { id: "asc" },
      });
      const result: LiveBridgeResult = { records: [], issues: [] };
      const seen = new Set<string>();
      for (const row of rows) {
        const mapped = mapLiveQuestion(rowToLiveQuestionRow(row as LiveRow), profile, clock.now());
        if (mapped.issue) {
          result.issues.push(mapped.issue);
          continue;
        }
        if (!mapped.record) continue;
        const signature = liveFingerprint(
          mapped.record.questionText,
          mapped.record.options,
        );
        if (seen.has(signature)) {
          result.issues.push({
            questionId: row.id,
            reason: "Duplicate question within the live-bank read.",
            preservedRef: `live-question:${row.id}`,
          });
          continue;
        }
        seen.add(signature);
        result.records.push(mapped.record);
      }
      return result;
    },
  };
}

/** Content hash helper used by the import path; never used as a verified key. */
export function liveRecordHash(record: HistoricalQuestionRecord): string {
  return hashSnapshot({
    normalizedText: record.normalizedText,
    language: record.originalLanguage,
    claimedAnswer: record.claimedAnswer,
  });
}
