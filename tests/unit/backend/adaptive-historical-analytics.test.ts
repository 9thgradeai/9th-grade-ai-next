import { describe, expect, it, vi } from "vitest";
import type {
  AuditEvent,
  HistoricalAnalyticsFilter,
  HistoricalQuestionRecord,
} from "~backend/services/adaptive-exam/contracts";
import {
  createHistoricalAnalyticsService,
  createInMemoryAnalyticsSnapshotStore,
  type HistoricalAnalyticsSnapshotStore,
} from "~backend/services/adaptive-exam/historical-analytics";
import { createInMemoryHistoricalRepository } from "~backend/services/adaptive-exam/historical-repository";

const NOW = "2026-11-22T00:00:00.000Z";

function record(overrides: Partial<HistoricalQuestionRecord> = {}): HistoricalQuestionRecord {
  return {
    id: "r-default",
    family: "BANK",
    organization: "Bangladesh Bank",
    recruitmentPost: "Senior Officer (General)",
    examinationName: "Senior Officer (General) 2024",
    examYear: 2024,
    stage: "preliminary",
    subjectId: "bank.english",
    subjectName: "English",
    topicPath: "bank.english.language",
    originalLanguage: "en",
    questionText: "Question text",
    options: { A: "a", B: "b", C: "c", D: "d" },
    claimedAnswer: "A",
    verifiedAnswer: "A",
    verification: "HUMAN_VERIFIED",
    explanationOrigin: "none",
    provenance: { sourceType: "PYQ", sourceFile: "source.txt" },
    classification: { status: "classified", difficulty: "MEDIUM" },
    originalSourceText: "source question text",
    normalizedText: "question text",
    eligibleForPyq: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const corpus: HistoricalQuestionRecord[] = [
  record({
    id: "r1",
    examYear: 2023,
    topicPath: "bank.english.recurrence",
    normalizedText: "repeated question",
  }),
  record({
    id: "r2",
    examYear: 2024,
    topicPath: "bank.english.recurrence",
    normalizedText: "another question",
  }),
  record({
    id: "r3",
    examYear: 2024,
    subjectId: "bank.math",
    subjectName: "Mathematics",
    topicPath: "bank.math.arithmetic",
    normalizedText: "claimed only question",
    claimedAnswer: "B",
    verifiedAnswer: undefined,
    verification: "SOURCE_CLAIMED",
    classification: { status: "unclassified" },
  }),
  record({
    id: "r4",
    examYear: 2025,
    topicPath: "bank.english.recurrence",
    normalizedText: "repeated question",
  }),
];

function makeService(
  store?: HistoricalAnalyticsSnapshotStore,
  audit?: { record: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> },
) {
  return createHistoricalAnalyticsService({
    repository: createInMemoryHistoricalRepository(corpus),
    clock: { now: () => NOW },
    requestId: "req-analytics",
    snapshotStore: store,
    audit: audit as never,
    newId: () => "snapshot-1",
  });
}

describe("historical repository eligibility", () => {
  it("never exposes source-claimed or answerless records as eligible", async () => {
    const repository = createInMemoryHistoricalRepository([
      ...corpus,
      record({
        id: "r5",
        verification: "CROSS_CHECKED",
        verifiedAnswer: undefined,
        normalizedText: "answerless",
        subjectId: "bank.ict",
        topicPath: "bank.ict",
      }),
      record({
        id: "r6",
        eligibleForPyq: false,
        normalizedText: "flagged out",
        subjectId: "bank.ict",
        topicPath: "bank.ict",
      }),
    ]);
    const eligible = await repository.findEligible({});
    expect(eligible.map((item) => item.id).sort()).toEqual(["r1", "r2", "r4"]);
    expect(await repository.count({})).toBe(3);
    expect((await repository.findAll({})).length).toBe(6);
    expect(await repository.getByIds(["r3", "r1"])).toHaveLength(1);
  });

  it("returns nothing for an unavailable profile id", async () => {
    const repository = createInMemoryHistoricalRepository(corpus);
    const filter: HistoricalAnalyticsFilter = { profileId: "BANK_OFFICER_GENERAL" };
    expect(await repository.findAll(filter)).toEqual([]);
    expect(await repository.findEligible(filter)).toEqual([]);
  });
});

describe("historical analytics", () => {
  it("reports observations, explicit gaps and duplicate facts", async () => {
    const service = makeService();
    const report = await service.analyze({ family: "BANK" });

    expect(report.coverage.sampleSize).toBe(4);
    expect(report.coverage.yearsCovered).toBe(3);
    expect(report.coverage.verifiedShare).toBeCloseTo(0.75, 6);
    expect(report.coverage.insufficientEvidence).toBe(true);
    expect(report.coverage.gaps.join(" ")).toContain("Near-duplicate classification");
    expect(report.yearWise).toEqual([
      { year: 2023, count: 1 },
      { year: 2024, count: 2 },
      { year: 2025, count: 1 },
    ]);
    expect(report.subjectWise.find((item) => item.subjectId === "bank.english")?.count).toBe(3);
    const recurring = report.topics.find((item) => item.topicPath === "bank.english.recurrence");
    expect(recurring?.count).toBe(3);
    expect(recurring?.distinctYears).toBe(3);
    expect(recurring?.recurrenceRate).toBe(100);
    expect(report.questionTypeDistribution).toEqual({});
    expect(report.duplicates.exact).toBe(1);
    expect(report.duplicates.near).toBe(0);
    expect(report.quality).toEqual({ verified: 3, disputed: 0, malformed: 0 });
    expect(report.difficultyProfile).toEqual({ EASY: 0, MEDIUM: 3, HARD: 0 });
  });

  it("can meet explicit governance thresholds without changing the data", async () => {
    const service = createHistoricalAnalyticsService({
      repository: createInMemoryHistoricalRepository(corpus),
      clock: { now: () => NOW },
      requestId: "req-analytics",
      thresholds: { minSampleSize: 2, minComparableYears: 2, minVerifiedShare: 0.75 },
    });
    const report = await service.analyze({});
    expect(report.coverage.insufficientEvidence).toBe(false);
  });

  it("caches identical reports and clears them on invalidate", async () => {
    const store = createInMemoryAnalyticsSnapshotStore();
    const insert = vi.spyOn(store, "insert");
    const service = makeService(store);
    const filter: HistoricalAnalyticsFilter = { profileId: "BB_SENIOR_OFFICER_GENERAL" };

    const first = await service.analyze(filter);
    const second = await service.analyze(filter);
    expect(second).toEqual(first);
    expect(insert).toHaveBeenCalledTimes(1);

    await service.invalidate("new verified batch");
    await service.analyze(filter);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("audits a content hash and counts, never answer values", async () => {
    const events: AuditEvent[] = [];
    const audit = {
      record: vi.fn(async (event: AuditEvent) => {
        events.push(event);
      }),
      query: vi.fn(async () => events),
    };
    const service = makeService(undefined, audit);
    await service.analyze({ family: "BANK" });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("ANALYTICS_COMPUTED");
    expect(events[0].metadata).toMatchObject({ sampleSize: 4, verifiedShare: 0.75 });
    expect(JSON.stringify(events[0].metadata)).not.toContain("repeated question");
  });
});
