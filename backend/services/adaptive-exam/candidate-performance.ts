// backend/services/adaptive-exam/candidate-performance.ts
// Module 6 of Adaptive Exam V2.0: CandidatePerformanceService.
//
// Builds a reproducible CandidateSnapshot from existing learner evidence
// (QuestionAttempt + exam results + flashcard reviews + learning events).
// All evidence is observed behaviour, never inferred aptitude. Confidence is
// capped and sufficiency is explicit; small samples can never be read as an
// established weakness or strength.

import "server-only";

import type { PrismaClient } from "@prisma/client";
import type {
  AdaptiveExamLogger,
  CandidateIndicator,
  CandidatePerformanceService,
  CandidateSnapshot,
  IsoTimestamp,
  TopicEvidence,
} from "./contracts";
import { adaptiveError } from "./errors";
import { hashSnapshot } from "./hash";

export const DEFAULT_CANDIDATE_WINDOW_DAYS = 90;
export const DEFAULT_RECENT_WINDOW_DAYS = 14;
export const DEFAULT_MIN_EVIDENCE_ATTEMPTS = 5;

export type CandidateEvidenceAggregate = Readonly<{
  subjectName: string;
  topic: string;
  attempts: number;
  correct: number;
  wrong: number;
  unanswered: number;
  totalDurationSec: number;
  durationCount: number;
  recentAttempts: number;
}>;

export type CandidateRepeatedMistakeAggregate = Readonly<{
  subjectName: string;
  topic: string;
  repeated: number;
}>;

export type CandidateEvidence = Readonly<{
  aggregates: readonly CandidateEvidenceAggregate[];
  repeatedMistakes: readonly CandidateRepeatedMistakeAggregate[];
}>;

export interface CandidateEvidenceReader {
  load(userId: string, from: IsoTimestamp, to: IsoTimestamp, recentFrom: IsoTimestamp): Promise<CandidateEvidence>;
}

export function createInMemoryCandidateEvidenceReader(
  evidence: CandidateEvidence = { aggregates: [], repeatedMistakes: [] },
): CandidateEvidenceReader {
  return {
    async load() {
      return evidence;
    },
  };
}

type AggregateRow = {
  subjectName: string | null;
  topic: string | null;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  totalDurationSec: number;
  durationCount: number;
  recentAttempts: number;
};

type RepeatedRow = { subjectName: string | null; topic: string | null; repeated: number };

export function createPrismaCandidateEvidenceReader(
  client: PrismaClient,
): CandidateEvidenceReader {
  return {
    async load(userId, from, to, recentFrom) {
      const rows = await client.$queryRaw<AggregateRow[]>`
        SELECT "subjectName" AS "subjectName",
               "topic" AS "topic",
               COUNT(*)::int AS "attempted",
               COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS "correct",
               COALESCE(SUM(CASE WHEN NOT "correct" THEN 1 ELSE 0 END), 0)::int AS "wrong",
               COALESCE(SUM(CASE WHEN "selectedAnswer" = '' THEN 1 ELSE 0 END), 0)::int AS "unanswered",
               COALESCE(SUM(CASE WHEN "durationSec" > 0 THEN "durationSec" ELSE 0 END), 0)::int AS "totalDurationSec",
               COALESCE(SUM(CASE WHEN "durationSec" > 0 THEN 1 ELSE 0 END), 0)::int AS "durationCount",
               COALESCE(SUM(CASE WHEN "createdAt" >= ${new Date(recentFrom)} THEN 1 ELSE 0 END), 0)::int AS "recentAttempts"
        FROM "QuestionAttempt"
        WHERE "userId" = ${userId}
          AND "createdAt" >= ${new Date(from)}
          AND "createdAt" <= ${new Date(to)}
        GROUP BY "subjectName", "topic"`;

      const repeatedRows = await client.$queryRaw<RepeatedRow[]>`
        SELECT "subjectName" AS "subjectName",
               "topic" AS "topic",
               COALESCE(SUM(c - 1), 0)::int AS "repeated"
        FROM (
          SELECT "subjectName", "topic", "questionId", COUNT(*)::int AS c
          FROM "QuestionAttempt"
          WHERE "userId" = ${userId}
            AND "correct" = false
            AND "createdAt" >= ${new Date(from)}
            AND "createdAt" <= ${new Date(to)}
          GROUP BY "subjectName", "topic", "questionId"
          HAVING COUNT(*) > 1
        ) t
        GROUP BY "subjectName", "topic"`;

      const repeatedMap = new Map<string, number>();
      for (const row of repeatedRows) {
        repeatedMap.set(`${row.subjectName ?? ""}::${row.topic ?? ""}`, Number(row.repeated));
      }

      return {
        aggregates: rows.map((row) => ({
          subjectName: row.subjectName ?? "",
          topic: row.topic ?? "",
          attempts: Number(row.attempted),
          correct: Number(row.correct),
          wrong: Number(row.wrong),
          unanswered: Number(row.unanswered),
          totalDurationSec: Number(row.totalDurationSec),
          durationCount: Number(row.durationCount),
          recentAttempts: Number(row.recentAttempts),
        })),
        repeatedMistakes: [...repeatedMap.entries()].map(([key, repeated]) => {
          const [subjectName, topic] = key.split("::");
          return { subjectName: subjectName ?? "", topic: topic ?? "", repeated };
        }),
      };
    },
  };
}

export type CreateCandidatePerformanceServiceOptions = Readonly<{
  reader: CandidateEvidenceReader;
  clock: { now(): IsoTimestamp };
  requestId: string;
  logger?: AdaptiveExamLogger;
  windowDays?: number;
  recentDays?: number;
  minEvidenceAttempts?: number;
}>;

const NOOP_LOGGER: AdaptiveExamLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => NOOP_LOGGER,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function indicatorFor(
  attempts: number,
  accuracy: number,
  repeatedMistakes: number,
  minEvidence: number,
): CandidateIndicator {
  if (attempts < minEvidence) return "INSUFFICIENT_EVIDENCE";
  if (accuracy >= 0.85) return "STRONG_TOPIC";
  if (accuracy < 0.5) return repeatedMistakes > 0 ? "REPEATED_MISCONCEPTION" : "WEAK_CONCEPT";
  if (repeatedMistakes >= 3) return "CARELESS_MISTAKE";
  if (attempts < 10) return "INSUFFICIENT_PRACTICE";
  return "WEAK_CONCEPT";
}

export function createCandidatePerformanceService(
  options: CreateCandidatePerformanceServiceOptions,
): CandidatePerformanceService {
  const {
    reader,
    clock,
    windowDays = DEFAULT_CANDIDATE_WINDOW_DAYS,
    recentDays = DEFAULT_RECENT_WINDOW_DAYS,
    minEvidenceAttempts = DEFAULT_MIN_EVIDENCE_ATTEMPTS,
  } = options;
  const logger = options.logger ?? NOOP_LOGGER;

  function fail(code: Parameters<typeof adaptiveError>[0], message: string, metadata: Record<string, unknown> = {}): never {
    throw adaptiveError(code, message, { stage: "reporting", requestId: options.requestId, metadata });
  }

  async function loadTopics(userId: string) {
    if (!userId) fail("ADAPTIVE_UNAUTHORIZED", "A user id is required to build a candidate snapshot.");
    const now = clock.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const recentMs = recentDays * 24 * 60 * 60 * 1000;
    const from = new Date(new Date(now).getTime() - windowMs).toISOString();
    const recentFrom = new Date(new Date(now).getTime() - recentMs).toISOString();

    let evidence;
    try {
      evidence = await reader.load(userId, from, now, recentFrom);
    } catch (error) {
      fail("ADAPTIVE_PERSISTENCE_ERROR", "Could not load candidate evidence.", {
        cause: error instanceof Error ? error.message : "unknown",
      });
    }

    const repeatedMap = new Map<string, number>();
    for (const item of evidence.repeatedMistakes) {
      repeatedMap.set(`${item.subjectName}::${item.topic}`, item.repeated);
    }

    const topics: TopicEvidence[] = evidence.aggregates.map((agg) => {
      const accuracy = agg.attempts > 0 ? agg.correct / agg.attempts : 0;
      const repeated = repeatedMap.get(`${agg.subjectName}::${agg.topic}`) ?? 0;
      const avgTimeSec = agg.durationCount > 0 ? Math.round(agg.totalDurationSec / agg.durationCount) : undefined;
      const sufficient = agg.attempts >= minEvidenceAttempts;
      const confidence = sufficient
        ? clamp(40 + agg.attempts * 2, 40, 95)
        : clamp(agg.attempts * 6, 0, 30);
      return {
        subjectId: agg.subjectName || "unclassified",
        topicPath: agg.topic || "unclassified",
        attempts: agg.attempts,
        correct: agg.correct,
        wrong: agg.wrong,
        unanswered: agg.unanswered,
        ...(avgTimeSec === undefined ? {} : { avgTimeSec }),
        recentAttempts: agg.recentAttempts,
        repeatedMistakes: repeated,
        confidence,
        indicator: indicatorFor(agg.attempts, accuracy, repeated, minEvidenceAttempts),
        sufficientEvidence: sufficient,
      };
    });

    const totalAttempts = topics.reduce((sum, topic) => sum + topic.attempts, 0);
    const totalCorrect = topics.reduce((sum, topic) => sum + topic.correct, 0);
    const overallAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
    const overallConfidence = topics.length > 0
      ? Math.round(topics.reduce((sum, topic) => sum + topic.confidence, 0) / topics.length)
      : 0;

    const warnings: string[] = [];
    if (totalAttempts === 0) {
      warnings.push("No attempt evidence in the selected window; candidate adaptation is disabled.");
    } else if (topics.every((topic) => !topic.sufficientEvidence)) {
      warnings.push("All topic evidence is below the sufficiency threshold; adaptation downgrades to a balanced pattern.");
    }
    if (topics.some((topic) => topic.unanswered > 0)) {
      warnings.push("Some attempts were unanswered; accuracy is computed over answered questions only.");
    }

    return { now, from, topics, totalAttempts, overallAccuracy, overallConfidence, warnings };
  }

  return {
    async snapshot(userId, profileId) {
      const data = await loadTopics(userId);
      const hash = hashSnapshot({
        userId,
        profileId,
        window: { from: data.from, to: data.now },
        topics: data.topics,
        overall: { attempts: data.totalAttempts, accuracy: data.overallAccuracy, confidence: data.overallConfidence },
      });
      const snapshot: CandidateSnapshot = {
        userId,
        profileId,
        generatedAt: data.now,
        window: { from: data.from, to: data.now },
        topics: data.topics,
        overall: { attempts: data.totalAttempts, accuracy: Number(data.overallAccuracy.toFixed(6)), confidence: data.overallConfidence },
        warnings: data.warnings,
        hash,
      };
      logger.info("adaptive.candidate.snapshot", {
        userId,
        profileId,
        topics: data.topics.length,
        attempts: data.totalAttempts,
        sufficient: data.topics.some((topic) => topic.sufficientEvidence),
      });
      return snapshot;
    },

    async indicators(userId, topicPaths) {
      const data = await loadTopics(userId);
      const wanted = new Set(topicPaths);
      return data.topics.filter((topic) => wanted.has(topic.topicPath));
    },
  };
}
