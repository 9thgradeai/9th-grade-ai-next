import { describe, expect, it, vi } from "vitest";
import type { AdaptiveExamProfileId, CandidateSnapshot } from "~backend/services/adaptive-exam/contracts";
import {
  createCandidatePerformanceService,
  createInMemoryCandidateEvidenceReader,
  type CandidateEvidence,
} from "~backend/services/adaptive-exam/candidate-performance";

const NOW = "2026-11-22T12:00:00.000Z";

function evidence(overrides: Partial<CandidateEvidence> = {}): CandidateEvidence {
  return {
    aggregates: [],
    repeatedMistakes: [],
    ...overrides,
  };
}

describe("CandidatePerformanceService", () => {
  it("returns an empty, honest snapshot when there is no evidence", async () => {
    const service = createCandidatePerformanceService({
      reader: createInMemoryCandidateEvidenceReader(evidence()),
      clock: { now: () => NOW },
      requestId: "req-candidate",
    });
    const snapshot = await service.snapshot("user-1", "BCS_PRELIMINARY" as AdaptiveExamProfileId);
    expect(snapshot.userId).toBe("user-1");
    expect(snapshot.topics).toEqual([]);
    expect(snapshot.overall.attempts).toBe(0);
    expect(snapshot.overall.accuracy).toBe(0);
    expect(snapshot.warnings.join(" ")).toContain("No attempt evidence");
    expect(snapshot.hash).toHaveLength(64);
  });

  it("aggregates attempts, accuracy, recent attempts and repeated mistakes", async () => {
    const service = createCandidatePerformanceService({
      reader: createInMemoryCandidateEvidenceReader(
        evidence({
          aggregates: [
            {
              subjectName: "Bangla",
              topic: "bcs.bangla.grammar",
              attempts: 10,
              correct: 6,
              wrong: 4,
              unanswered: 0,
              totalDurationSec: 200,
              durationCount: 10,
              recentAttempts: 3,
            },
          ],
          repeatedMistakes: [{ subjectName: "Bangla", topic: "bcs.bangla.grammar", repeated: 2 }],
        }),
      ),
      clock: { now: () => NOW },
      requestId: "req-candidate",
    });
    const snapshot = await service.snapshot("user-1", "BCS_PRELIMINARY" as AdaptiveExamProfileId);
    expect(snapshot.topics).toHaveLength(1);
    const topic = snapshot.topics[0];
    expect(topic.attempts).toBe(10);
    expect(topic.correct).toBe(6);
    expect(topic.wrong).toBe(4);
    expect(topic.avgTimeSec).toBe(20);
    expect(topic.recentAttempts).toBe(3);
    expect(topic.repeatedMistakes).toBe(2);
    expect(topic.sufficientEvidence).toBe(true);
    expect(topic.indicator).not.toBe("INSUFFICIENT_EVIDENCE");
    expect(snapshot.overall.accuracy).toBeCloseTo(0.6, 6);
  });

  it("marks small samples as insufficient evidence with low confidence", async () => {
    const service = createCandidatePerformanceService({
      reader: createInMemoryCandidateEvidenceReader(
        evidence({
          aggregates: [
            {
              subjectName: "Math",
              topic: "bcs.math",
              attempts: 2,
              correct: 0,
              wrong: 2,
              unanswered: 0,
              totalDurationSec: 0,
              durationCount: 0,
              recentAttempts: 2,
            },
          ],
        }),
      ),
      clock: { now: () => NOW },
      requestId: "req-candidate",
    });
    const snapshot = await service.snapshot("user-1", "BCS_PRELIMINARY" as AdaptiveExamProfileId);
    const topic = snapshot.topics[0];
    expect(topic.sufficientEvidence).toBe(false);
    expect(topic.indicator).toBe("INSUFFICIENT_EVIDENCE");
    expect(topic.confidence).toBeLessThanOrEqual(30);
    expect(topic.avgTimeSec).toBeUndefined();
  });

  it("indicators() filters by topic path", async () => {
    const service = createCandidatePerformanceService({
      reader: createInMemoryCandidateEvidenceReader(
        evidence({
          aggregates: [
            { subjectName: "A", topic: "t1", attempts: 6, correct: 5, wrong: 1, unanswered: 0, totalDurationSec: 0, durationCount: 0, recentAttempts: 1 },
            { subjectName: "B", topic: "t2", attempts: 6, correct: 5, wrong: 1, unanswered: 0, totalDurationSec: 0, durationCount: 0, recentAttempts: 1 },
          ],
        }),
      ),
      clock: { now: () => NOW },
      requestId: "req-candidate",
    });
    const indicators = await service.indicators("user-1", ["t2"]);
    expect(indicators).toHaveLength(1);
    expect(indicators[0].topicPath).toBe("t2");
  });

  it("is reproducible: identical evidence yields identical hash", async () => {
    const reader = createInMemoryCandidateEvidenceReader(
      evidence({
        aggregates: [
          { subjectName: "A", topic: "t1", attempts: 6, correct: 5, wrong: 1, unanswered: 0, totalDurationSec: 12, durationCount: 6, recentAttempts: 2 },
        ],
      }),
    );
    const a = createCandidatePerformanceService({ reader, clock: { now: () => NOW }, requestId: "r" });
    const b = createCandidatePerformanceService({ reader, clock: { now: () => NOW }, requestId: "r" });
    const sa = await a.snapshot("u", "BCS_PRELIMINARY" as AdaptiveExamProfileId);
    const sb = await b.snapshot("u", "BCS_PRELIMINARY" as AdaptiveExamProfileId);
    expect(sa.hash).toBe(sb.hash);
  });

  it("records unanswered attempts as a warning", async () => {
    const service = createCandidatePerformanceService({
      reader: createInMemoryCandidateEvidenceReader(
        evidence({
          aggregates: [
            { subjectName: "A", topic: "t1", attempts: 6, correct: 4, wrong: 1, unanswered: 1, totalDurationSec: 0, durationCount: 0, recentAttempts: 1 },
          ],
        }),
      ),
      clock: { now: () => NOW },
      requestId: "req-candidate",
    });
    const snapshot = await service.snapshot("user-1", "BCS_PRELIMINARY" as AdaptiveExamProfileId);
    expect(snapshot.warnings.join(" ")).toContain("unanswered");
  });
});
