import { describe, expect, it } from "vitest";
import type { PrepareAdaptiveExamCommand } from "~backend/services/adaptive-exam/contracts";
import { getSeedProfile } from "~backend/services/adaptive-exam/profile-seeds";
import { createAdaptiveBlueprintService, createInMemoryAdaptiveBlueprintStore } from "~backend/services/adaptive-exam/adaptive-blueprint";
import { createInMemoryCandidateEvidenceReader } from "~backend/services/adaptive-exam/candidate-performance";
import { createInMemoryHistoricalRepository } from "~backend/services/adaptive-exam/historical-repository";
import { createHistoricalAnalyticsService } from "~backend/services/adaptive-exam/historical-analytics";

const NOW = "2026-11-22T00:00:00.000Z";

describe("AdaptiveBlueprintService", () => {
  it("builds a deterministic blueprint from a seeded profile", async () => {
    const profile = getSeedProfile("BCS_PRELIMINARY");
    if (!profile) throw new Error("missing profile");
    const historical = createHistoricalAnalyticsService({
      repository: createInMemoryHistoricalRepository([]),
      clock: { now: () => NOW },
      requestId: "r",
    });
    const historicalReport = await historical.analyze({ family: "BCS" });
    const candidateReader = createInMemoryCandidateEvidenceReader({ aggregates: [], repeatedMistakes: [] });
    const candidateService = (await import("~backend/services/adaptive-exam/candidate-performance")).createCandidatePerformanceService({
      reader: candidateReader,
      clock: { now: () => NOW },
      requestId: "r",
    });
    const candidate = await candidateService.snapshot("u1", "BCS_PRELIMINARY");
    const service = createAdaptiveBlueprintService({ clock: { now: () => NOW }, requestId: "r", store: createInMemoryAdaptiveBlueprintStore() });

    const command: PrepareAdaptiveExamCommand = {
      userId: "u1",
      family: "BCS",
      profileId: "BCS_PRELIMINARY",
      subjects: [],
      requestedQuestionCount: 20,
      mode: "PRACTICE",
      adaptationEnabled: false,
      idempotencyKey: "k1",
    };

    const draft = await service.build(command, profile, candidate, historicalReport);
    expect(draft.totalQuestionCount).toBe(20);
    expect(draft.allocations.length).toBeGreaterThan(0);
    const validation = service.validate(draft);
    expect(validation.valid).toBe(true);
  });

  it("commits an immutable blueprint with a hash", async () => {
    const profile = getSeedProfile("BCS_PRELIMINARY");
    if (!profile) throw new Error("missing profile");
    const historical = createHistoricalAnalyticsService({
      repository: createInMemoryHistoricalRepository([]),
      clock: { now: () => NOW },
      requestId: "r",
    });
    const historicalReport = await historical.analyze({ family: "BCS" });
    const candidateService = (await import("~backend/services/adaptive-exam/candidate-performance")).createCandidatePerformanceService({
      reader: createInMemoryCandidateEvidenceReader({ aggregates: [], repeatedMistakes: [] }),
      clock: { now: () => NOW },
      requestId: "r",
    });
    const candidate = await candidateService.snapshot("u1", "BCS_PRELIMINARY");
    const store = createInMemoryAdaptiveBlueprintStore();
    const service = createAdaptiveBlueprintService({ clock: { now: () => NOW }, requestId: "r", store });

    const command: PrepareAdaptiveExamCommand = {
      userId: "u1",
      family: "BCS",
      profileId: "BCS_PRELIMINARY",
      subjects: [],
      requestedQuestionCount: 10,
      mode: "PRACTICE",
      adaptationEnabled: false,
      idempotencyKey: "k2",
    };
    const draft = await service.build(command, profile, candidate, historicalReport);
    const committed = await service.commit(draft, { userId: "u1", requestId: "r", ports: {} as never });
    expect(committed.id).toBeTruthy();
    expect(committed.hash).toHaveLength(64);
    expect(committed.status).toBe("committed");
  });
});
