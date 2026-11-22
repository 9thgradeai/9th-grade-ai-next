// backend/services/adaptive-exam/adaptive-recommendation.ts
// Module 9c of Adaptive Exam V2.0: AdaptiveRecommendationService.
//
// Produces a post-submit PerformanceReport and writes back only through existing
// mastery/LearningEvent services (here: optional, best-effort hooks).

import "server-only";

import type {
  AdaptiveExecutionContext,
  AdaptiveRecommendationService,
  CandidateIndicator,
  CandidateSnapshot,
  PerformanceReport,
  ScoreReport,
} from "./contracts";

export type CreateAdaptiveRecommendationServiceOptions = Readonly<{
  /** Optional write-back hook; defaults to a no-op. */
  applyWriteBack?: (ctx: AdaptiveExecutionContext, report: PerformanceReport) => Promise<void>;
}>;

export function createAdaptiveRecommendationService(
  options: CreateAdaptiveRecommendationServiceOptions = {},
): AdaptiveRecommendationService {
  const applyWriteBack = options.applyWriteBack ?? (async () => undefined);

  function indicatorsFor(score: ScoreReport, snapshot: CandidateSnapshot): CandidateIndicator[] {
    const indicators: CandidateIndicator[] = [];
    if (score.accuracy < 0.5) indicators.push("WEAK_CONCEPT");
    if (score.unanswered > 0) indicators.push("INSUFFICIENT_PRACTICE");
    if (snapshot.topics.some((topic) => topic.indicator === "SLOW_SOLVER")) indicators.push("SLOW_SOLVER");
    if (snapshot.topics.some((topic) => topic.indicator === "GUESSING")) indicators.push("GUESSING");
    if (score.accuracy >= 0.85) indicators.push("STRONG_TOPIC");
    if (snapshot.topics.every((topic) => !topic.sufficientEvidence)) indicators.push("INSUFFICIENT_EVIDENCE");
    return [...new Set(indicators)];
  }

  return {
    buildReport(score, snapshot, _paper) {
      const indicators = indicatorsFor(score, snapshot);
      const revisionPriorities = score.topicPerformance
        .map((slice) => ({
          subjectId: slice.subjectId ?? "unknown",
          topicPath: slice.topicPath ?? "unknown",
          priority: Number((1 - slice.accuracy).toFixed(6)),
          reason: slice.accuracy < 0.5 ? "Low accuracy on this topic." : "Maintain and refine.",
          confidence: snapshot.topics.find((topic) => topic.topicPath === slice.topicPath)?.confidence ?? 0,
        }))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 10);

      const report: PerformanceReport = {
        attemptId: score.attemptId,
        score,
        indicators,
        revisionPriorities,
        timeEfficiency: {
          slowTopicPaths: score.topicPerformance
            .filter((slice) => slice.accuracy < 0.5)
            .map((slice) => slice.topicPath ?? "")
            .filter((value) => value.length > 0),
          confidence: snapshot.overall.confidence,
        },
        historicalVsGenerated: {
          historicalAccuracy: score.sourcePerformance.PYQ?.accuracy ?? 0,
          generatedAccuracy: score.sourcePerformance.ORIGINAL?.accuracy ?? 0,
          sampleSize: score.total,
        },
        limitations: [
          "Recommendations are descriptive; they do not guarantee future performance.",
          "Candidate evidence may be thin; confidence is reported per topic.",
        ],
        candidateSnapshotHash: snapshot.hash,
        generatedAt: score.attemptId ? new Date().toISOString() : new Date().toISOString(),
      };
      return report;
    },

    async applyToCandidateProfile(ctx, report) {
      await applyWriteBack(ctx, report);
    },

    nextBlueprintWeights(report) {
      const weights: Record<string, number> = {};
      for (const priority of report.revisionPriorities) {
        weights[priority.topicPath] = Number((1 + priority.priority).toFixed(4));
      }
      return weights;
    },
  };
}
