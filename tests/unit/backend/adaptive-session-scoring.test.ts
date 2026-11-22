import { describe, expect, it } from "vitest";
import { getSeedProfile } from "~backend/services/adaptive-exam/profile-seeds";
import { createExamScoringService } from "~backend/services/adaptive-exam/exam-scoring";
import { createAdaptiveRecommendationService } from "~backend/services/adaptive-exam/adaptive-recommendation";
import { createInMemoryCandidateEvidenceReader } from "~backend/services/adaptive-exam/candidate-performance";
import { createCandidatePerformanceService } from "~backend/services/adaptive-exam/candidate-performance";

const NOW = "2026-11-22T00:00:00.000Z";

describe("adaptive scoring and recommendation", () => {
  it("scores answers with the profile's policy", () => {
    const profile = getSeedProfile("BCS_PRELIMINARY");
    if (!profile) throw new Error("missing profile");
    const scorer = createExamScoringService();
    const paper = {
      id: "paper-1",
      version: 1,
      blueprintId: "bp-1",
      blueprintHash: "h",
      createdAt: NOW,
      contentHash: "c",
      validation: "PASS" as const,
      questions: [
        { position: 1, sourceType: "PYQ" as const, subjectId: profile.subjects[0].subjectId, subjectName: profile.subjects[0].nameEn, topicPath: "t1", language: "bn" as const, difficulty: "MEDIUM" as const, questionText: "q", options: { A: "a", B: "b", C: "c", D: "d" }, provenance: { sourceType: "PYQ" as const }, marks: 1 },
      ],
    };
    const key = { paperId: "paper-1", contentHash: "c", entries: [{ position: 1, correctOption: "B" as const, explanation: "e" }], createdAt: NOW };
    const report = scorer.score(paper as any, key as any, profile, { attemptId: "a1", paperId: "paper-1", answers: [{ position: 1, option: "B" }], durationSec: 30, idempotencyKey: "k" });
    expect(report.correct).toBe(1);
    expect(report.incorrect).toBe(0);
    expect(report.obtainedMarks).toBe(profile.scoring.marksPerQuestion);
    expect(report.immutable).toBe(true);
  });

  it("builds a performance report and weights", async () => {
    const profile = getSeedProfile("BCS_PRELIMINARY");
    if (!profile) throw new Error("missing profile");
    const scorer = createExamScoringService();
    const paper = { id: "paper-1", version: 1, blueprintId: "bp-1", blueprintHash: "h", createdAt: NOW, contentHash: "c", validation: "PASS" as const, questions: [] };
    const key = { paperId: "paper-1", contentHash: "c", entries: [], createdAt: NOW };
    const score = scorer.score(paper as any, key as any, profile, { attemptId: "a1", paperId: "paper-1", answers: [], durationSec: 0, idempotencyKey: "k" });
    const candidateService = createCandidatePerformanceService({ reader: createInMemoryCandidateEvidenceReader({ aggregates: [], repeatedMistakes: [] }), clock: { now: () => NOW }, requestId: "r" });
    const snapshot = await candidateService.snapshot("u1", "BCS_PRELIMINARY");
    const recommender = createAdaptiveRecommendationService();
    const report = recommender.buildReport(score, snapshot, paper as any);
    expect(report.attemptId).toBe("a1");
    expect(Array.isArray(report.limitations)).toBe(true);
    const weights = recommender.nextBlueprintWeights(report);
    expect(typeof weights).toBe("object");
  });
});
