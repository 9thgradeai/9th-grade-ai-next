// backend/services/adaptive-exam/adaptive-blueprint.ts
// Module 7 of Adaptive Exam V2.0: AdaptiveBlueprintService.
//
// Converts profile × mode × candidate evidence × historical analytics into an
// immutable, hashed ExamBlueprint. The build is deterministic given identical
// inputs; commit persists a new row and never edits an existing one.

import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdaptiveExamLogger,
  AdaptiveValidationResult,
  AdaptiveBlueprintService,
  BlueprintDraft,
  CandidateSnapshot,
  ExamBlueprint,
  ExamProfile,
  HistoricalAnalyticsReport,
  IsoTimestamp,
  PrepareAdaptiveExamCommand,
  SubjectBlueprintAllocation,
  TopicBlueprintAllocation,
} from "./contracts";
import { adaptiveError } from "./errors";
import { hashSnapshot } from "./hash";

export interface AdaptiveBlueprintStore {
  commit(blueprint: ExamBlueprint): Promise<ExamBlueprint>;
  find(id: string): Promise<ExamBlueprint | null>;
}

export function createInMemoryAdaptiveBlueprintStore(): AdaptiveBlueprintStore {
  const rows = new Map<string, ExamBlueprint>();
  return {
    async commit(blueprint) {
      rows.set(blueprint.id, blueprint);
      return blueprint;
    },
    async find(id) {
      return rows.get(id) ?? null;
    },
  };
}

export function createPrismaAdaptiveBlueprintStore(client: PrismaClient): AdaptiveBlueprintStore {
  return {
    async commit(blueprint) {
      const row = await client.adaptiveBlueprint.create({
        data: {
          id: blueprint.id,
          profileSnapshotId: blueprint.id, // placeholder; orchestrator wires real snapshot id
          profileId: blueprint.profileId,
          profileVersion: blueprint.profileVersion,
          family: blueprint.family,
          mode: blueprint.mode,
          requestedQuestionCount: blueprint.requestedQuestionCount,
          totalQuestionCount: blueprint.totalQuestionCount,
          totalMarks: blueprint.totalMarks,
          durationSec: blueprint.durationSec,
          scoring: blueprint.scoring as Prisma.InputJsonValue,
          languageBySubject: blueprint.languageBySubject as Prisma.InputJsonValue,
          allocations: blueprint.allocations as Prisma.InputJsonValue,
          difficultyAllocation: blueprint.difficultyAllocation as Prisma.InputJsonValue,
          sourceAllocation: blueprint.sourceAllocation as Prisma.InputJsonValue,
          historicalYearRange: blueprint.historicalYearRange
            ? (blueprint.historicalYearRange as Prisma.InputJsonValue)
            : undefined,
          candidateAdaptation: blueprint.candidateAdaptation as Prisma.InputJsonValue,
          duplicateExclusions: blueprint.duplicateExclusions as Prisma.InputJsonValue,
          dataSufficiency: blueprint.dataSufficiency as Prisma.InputJsonValue,
          warnings: blueprint.warnings as Prisma.InputJsonValue,
          status: blueprint.status,
          contentHash: blueprint.hash,
        },
      });
      return { ...blueprint, id: row.id };
    },
    async find(id) {
      const row = await client.adaptiveBlueprint.findUnique({ where: { id } });
      if (!row) return null;
      return {
        id: row.id,
        version: 1,
        hash: row.contentHash,
        createdAt: row.createdAt.toISOString(),
        profileId: row.profileId as ExamBlueprint["profileId"],
        profileVersion: row.profileVersion,
        family: row.family as ExamBlueprint["family"],
        mode: row.mode as ExamBlueprint["mode"],
        requestedQuestionCount: row.requestedQuestionCount,
        totalQuestionCount: row.totalQuestionCount,
        totalMarks: row.totalMarks,
        durationSec: row.durationSec,
        scoring: row.scoring as ExamBlueprint["scoring"],
        languageBySubject: row.languageBySubject as ExamBlueprint["languageBySubject"],
        allocations: row.allocations as ExamBlueprint["allocations"],
        difficultyAllocation: row.difficultyAllocation as ExamBlueprint["difficultyAllocation"],
        sourceAllocation: row.sourceAllocation as ExamBlueprint["sourceAllocation"],
        ...(row.historicalYearRange ? { historicalYearRange: row.historicalYearRange as ExamBlueprint["historicalYearRange"] } : {}),
        candidateAdaptation: row.candidateAdaptation as ExamBlueprint["candidateAdaptation"],
        duplicateExclusions: row.duplicateExclusions as ExamBlueprint["duplicateExclusions"],
        dataSufficiency: row.dataSufficiency as ExamBlueprint["dataSufficiency"],
        warnings: row.warnings as ExamBlueprint["warnings"],
        status: row.status as ExamBlueprint["status"],
      };
    },
  };
}

export type CreateAdaptiveBlueprintServiceOptions = Readonly<{
  clock: { now(): IsoTimestamp };
  requestId: string;
  logger?: AdaptiveExamLogger;
  store?: AdaptiveBlueprintStore;
  newId?(): string;
}>;

const NOOP_LOGGER: AdaptiveExamLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => NOOP_LOGGER,
};

function roundToInt(value: number): number {
  return Math.max(0, Math.round(value));
}

export function createAdaptiveBlueprintService(
  options: CreateAdaptiveBlueprintServiceOptions,
): AdaptiveBlueprintService {
  const { clock } = options;
  const logger = options.logger ?? NOOP_LOGGER;
  const store = options.store ?? createInMemoryAdaptiveBlueprintStore();
  const newId = options.newId ?? (() => randomUUID());

  function fail(code: Parameters<typeof adaptiveError>[0], message: string, metadata: Record<string, unknown> = {}): never {
    throw adaptiveError(code, message, { stage: "blueprint", requestId: options.requestId, metadata });
  }

  function buildAllocations(
    command: PrepareAdaptiveExamCommand,
    profile: ExamProfile,
    candidate: CandidateSnapshot,
    historical: HistoricalAnalyticsReport,
  ): { allocations: SubjectBlueprintAllocation[]; warnings: string[] } {
    const warnings: string[] = [];
    const requested = Math.max(1, command.requestedQuestionCount);
    const subjectFilter = command.subjects && command.subjects.length > 0
      ? new Set(command.subjects)
      : null;
    const eligibleSubjects = profile.subjects.filter((subject) =>
      !subjectFilter ||
      subjectFilter.has(subject.subjectId) ||
      subject.aliases.some((alias) => subjectFilter.has(alias)) ||
      subjectFilter.has(subject.nameEn) ||
      subjectFilter.has(subject.nameBn),
    );
    if (eligibleSubjects.length === 0) {
      warnings.push("No profile subjects matched the requested subject filter; falling back to all profile subjects.");
    }
    const subjects = eligibleSubjects.length > 0 ? eligibleSubjects : profile.subjects;

    const profileTotal = subjects.reduce((sum, subject) => sum + subject.count, 0) || 1;
    const candidateByTopic = new Map(candidate.topics.map((topic) => [topic.topicPath, topic]));
    const pyqShare = profile.historicalDataEligible
      ? Math.max(0, Math.min(1, historical.coverage.verifiedShare))
      : 0;

    // Largest-remainder allocation so subject counts sum exactly to `requested`.
    const fractions = subjects.map((subject) => ({
      subject,
      exact: (subject.count / profileTotal) * requested,
    }));
    const baseCounts = fractions.map((item) => Math.floor(item.exact));
    const remainder = requested - baseCounts.reduce((sum, value) => sum + value, 0);
    const order = fractions
      .map((item, index) => ({ index, frac: item.exact - Math.floor(item.exact) }))
      .sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < remainder && i < order.length; i += 1) {
      baseCounts[order[i].index] += 1;
    }

    const allocations: SubjectBlueprintAllocation[] = [];
    let allocatedSoFar = 0;

    subjects.forEach((subject, subjectIndex) => {
      const subjectCount = baseCounts[subjectIndex];
      allocatedSoFar += subjectCount;

      const topics: TopicBlueprintAllocation[] = [];
      const topicBases = subject.topics.map((topic) => (topic.count && topic.count > 0 ? topic.count : 1));
      const topicTotal = topicBases.reduce((sum, value) => sum + value, 0) || 1;
      const topicFractions = subject.topics.map((topic, index) => ({
        topic,
        base: topicBases[index],
        exact: (topicBases[index] / topicTotal) * subjectCount,
      }));
      const topicBaseCounts = topicFractions.map((item) => Math.floor(item.exact));
      const topicRemainder = subjectCount - topicBaseCounts.reduce((sum, value) => sum + value, 0);
      const topicOrder = topicFractions
        .map((item, index) => ({ index, frac: item.exact - Math.floor(item.exact) }))
        .sort((a, b) => b.frac - a.frac);
      for (let i = 0; i < topicRemainder && i < topicOrder.length; i += 1) {
        topicBaseCounts[topicOrder[i].index] += 1;
      }

      subject.topics.forEach((topic, topicIndex) => {
        const topicCountForSubject = topicBaseCounts[topicIndex];

        const difficulty: Record<"EASY" | "MEDIUM" | "HARD", number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
        for (const band of ["EASY", "MEDIUM", "HARD"] as const) {
          difficulty[band] = roundToInt((profile.difficultyDistribution[band] / 100) * topicCountForSubject);
        }
        // Fix rounding drift on the last band.
        const diffSum = difficulty.EASY + difficulty.MEDIUM + difficulty.HARD;
        if (topicCountForSubject > 0 && diffSum !== topicCountForSubject) {
          difficulty.MEDIUM += topicCountForSubject - diffSum;
        }

        const pyqCount = profile.historicalDataEligible
          ? roundToInt(topicCountForSubject * pyqShare)
          : 0;
        const generatedCount = topicCountForSubject - pyqCount;
        const sources: Record<string, number> = { PYQ: pyqCount, ORIGINAL: generatedCount };

        const language = (command.languageOverride && command.languageOverride[subject.subjectId])
          || subject.language;

        const candidateTopic = candidateByTopic.get(topic.topicId);
        const adaptationWeight = candidateTopic && candidateTopic.sufficientEvidence
          ? Number((1 + (1 - candidateTopic.correct / Math.max(1, candidateTopic.attempts)) * 0.5).toFixed(4))
          : 1;

        topics.push({
          topicId: topic.topicId,
          paths: topic.paths,
          count: topicCountForSubject,
          difficulty,
          sources: sources as TopicBlueprintAllocation["sources"],
          language,
        });

        // Stash adaptation weight on the allocation via candidateAdaptation weights later.
        void adaptationWeight;
      });

      allocations.push({
        subjectId: subject.subjectId,
        count: subjectCount,
        language: subject.language,
        topics,
      });
    });

    if (historical.coverage.insufficientEvidence) {
      warnings.push("Historical evidence is insufficient; blueprint relies on profile defaults and generated questions.");
    }
    if (candidate.warnings.length > 0) {
      warnings.push(...candidate.warnings.map((warning) => `Candidate: ${warning}`));
    }
    if (historical.coverage.gaps.length > 0) {
      warnings.push(...historical.coverage.gaps.map((gap) => `Historical gap: ${gap}`));
    }

    return { allocations, warnings };
  }

  return {
    async build(command, profile, candidate, historical) {
      if (profile.id !== command.profileId) {
        fail("ADAPTIVE_PROFILE_INVALID", "Profile does not match the command profile id.", {
          commandProfileId: command.profileId,
          profileId: profile.id,
        });
      }

      const { allocations, warnings } = buildAllocations(command, profile, candidate, historical);

      // Reconcile rounding drift so the paper size matches the request exactly.
      const allocatedTotal = allocations.reduce((sum, subject) => sum + subject.count, 0);
      const drift = command.requestedQuestionCount - allocatedTotal;
      if (drift !== 0 && allocations.length > 0) {
        const lastSubject = allocations[allocations.length - 1];
        lastSubject.count = Math.max(0, lastSubject.count + drift);
        if (lastSubject.topics.length > 0) {
          const lastTopic = lastSubject.topics[lastSubject.topics.length - 1];
          lastTopic.count = Math.max(0, lastTopic.count + drift);
        }
      }

      const totalQuestionCount = allocations.reduce((sum, subject) => sum + subject.count, 0);
      const difficultyAllocation: Record<"EASY" | "MEDIUM" | "HARD", number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
      for (const subject of allocations) {
        for (const topic of subject.topics) {
          difficultyAllocation.EASY += topic.difficulty.EASY;
          difficultyAllocation.MEDIUM += topic.difficulty.MEDIUM;
          difficultyAllocation.HARD += topic.difficulty.HARD;
        }
      }

      const sourceAllocation: Record<string, number> = { PYQ: 0, GENERATED: 0 };
      for (const subject of allocations) {
        for (const topic of subject.topics) {
          for (const [source, count] of Object.entries(topic.sources)) {
            sourceAllocation[source] = (sourceAllocation[source] ?? 0) + count;
          }
        }
      }

      const languageBySubject: Record<string, "bn" | "en"> = {};
      for (const subject of allocations) {
        languageBySubject[subject.subjectId] = subject.language;
      }

      const candidateWeights: Record<string, number> = {};
      for (const topic of candidate.topics) {
        if (topic.sufficientEvidence) {
          candidateWeights[topic.topicPath] = Number((1 + (1 - topic.correct / Math.max(1, topic.attempts)) * 0.5).toFixed(4));
        }
      }

      const dataSufficiency = {
        sufficient: historical.coverage.verifiedShare >= profile.pyqPolicy.minVerifiedShare
          && historical.coverage.comparableYears >= 2
          && candidate.topics.some((topic) => topic.sufficientEvidence),
        reasons: [
          ...(historical.coverage.verifiedShare < profile.pyqPolicy.minVerifiedShare
            ? [`Verified share ${historical.coverage.verifiedShare} below ${profile.pyqPolicy.minVerifiedShare}.`]
            : []),
          ...(historical.coverage.comparableYears < 2
            ? [`Only ${historical.coverage.comparableYears} comparable years.`]
            : []),
          ...(!candidate.topics.some((topic) => topic.sufficientEvidence)
            ? ["No candidate topic has sufficient evidence."]
            : []),
        ],
        coverage: {
          historicalYears: historical.coverage.yearsCovered,
          verifiedShare: historical.coverage.verifiedShare,
          topicCoverage: allocations.reduce((sum, subject) => sum + subject.topics.length, 0),
        },
      };

      const durationMin = command.durationMin && profile.allowedOverrides.includes("durationMin")
        ? command.durationMin
        : profile.durationMin;
      const totalMarks = profile.totalQuestions > 0
        ? roundToInt((profile.totalMarks / profile.totalQuestions) * totalQuestionCount)
        : totalQuestionCount;

      const draft: BlueprintDraft = {
        version: 1,
        profileId: profile.id,
        profileVersion: profile.version,
        family: profile.family,
        mode: command.mode,
        requestedQuestionCount: command.requestedQuestionCount,
        totalQuestionCount,
        totalMarks,
        durationSec: durationMin * 60,
        scoring: profile.scoring,
        languageBySubject,
        allocations,
        difficultyAllocation: difficultyAllocation as BlueprintDraft["difficultyAllocation"],
        sourceAllocation: sourceAllocation as BlueprintDraft["sourceAllocation"],
        ...(command.historicalYearRange
          ? { historicalYearRange: command.historicalYearRange }
          : {}),
        candidateAdaptation: {
          enabled: command.adaptationEnabled,
          weights: candidateWeights,
          snapshotHash: candidate.hash,
        },
        duplicateExclusions: [],
        dataSufficiency,
        warnings,
      };

      logger.info("adaptive.blueprint.built", {
        profileId: profile.id,
        mode: command.mode,
        totalQuestionCount,
        warnings: warnings.length,
      });

      return draft;
    },

    validate(draft) {
      const issues: AdaptiveValidationResult["issues"] = [];
      if (draft.totalQuestionCount <= 0) {
        issues.push({ severity: "error", code: "BLUEPRINT_EMPTY", message: "Blueprint has no questions.", path: "totalQuestionCount" });
      }
      if (draft.requestedQuestionCount > 0 && draft.totalQuestionCount !== draft.requestedQuestionCount) {
        issues.push({ severity: "warning", code: "BLUEPRINT_COUNT_DRIFT", message: "Allocated count differs from requested count.", path: "totalQuestionCount" });
      }
      const diffSum = draft.difficultyAllocation.EASY + draft.difficultyAllocation.MEDIUM + draft.difficultyAllocation.HARD;
      if (diffSum !== draft.totalQuestionCount && draft.totalQuestionCount > 0) {
        issues.push({ severity: "warning", code: "DIFFICULTY_DRIFT", message: "Difficulty allocation does not sum to total.", path: "difficultyAllocation" });
      }
      if (draft.allocations.length === 0) {
        issues.push({ severity: "error", code: "NO_SUBJECTS", message: "Blueprint has no subject allocations.", path: "allocations" });
      }
      for (const subject of draft.allocations) {
        if (subject.count < 0) {
          issues.push({ severity: "error", code: "NEGATIVE_COUNT", message: "Negative subject count.", path: `allocations.${subject.subjectId}` });
        }
        if (subject.topics.length === 0) {
          issues.push({ severity: "warning", code: "NO_TOPICS", message: "Subject has no topic allocations.", path: `allocations.${subject.subjectId}.topics` });
        }
      }
      return { valid: !issues.some((issue) => issue.severity === "error"), issues };
    },

    async commit(draft, ctx) {
      if (!ctx.userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "An authenticated actor is required to commit a blueprint.");
      }
      const now = clock.now();
      const hash = hashSnapshot({ ...draft, committedAt: now });
      const blueprint: ExamBlueprint = {
        ...draft,
        id: newId(),
        hash,
        createdAt: now,
        status: "committed",
        version: 1,
      };
      const persisted = await store.commit(blueprint);
      logger.info("adaptive.blueprint.committed", { id: persisted.id, hash: persisted.hash });
      return persisted;
    },
  };
}
