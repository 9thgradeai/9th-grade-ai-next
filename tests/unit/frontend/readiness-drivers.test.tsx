import { describe, it, expect } from "vitest";
import { computeDrivers, biggestLever } from "@/components/dashboard/command-center/ReadinessIndicatorCard";
import type { PreparationIntelligenceDTO } from "@/lib/types";

function intel(overrides: Partial<PreparationIntelligenceDTO> = {}): PreparationIntelligenceDTO {
  return {
    overall: { totalAttempts: 20, accuracy: 55 } as PreparationIntelligenceDTO["overall"],
    activity: [
      { date: "2026-09-28", answered: 5, correct: 3, durationSec: 100 },
      { date: "2026-09-29", answered: 0, correct: 0, durationSec: 0 },
      { date: "2026-09-30", answered: 8, correct: 4, durationSec: 200 },
      { date: "2026-10-01", answered: 7, correct: 4, durationSec: 150 },
    ],
    period: { accuracyDelta: -5, previousAttempts: 30 } as PreparationIntelligenceDTO["period"],
    subjectPerformance: [
      {
        subject: "বাংলা",
        attempted: 12,
        correct: 6,
        accuracy: 50,
        topics: [
          { subject: "বাংলা", topic: "বানান", attempted: 8, correct: 4, accuracy: 50 },
          { subject: "বাংলা", topic: "সমাস", attempted: 4, correct: 2, accuracy: 50 },
          { subject: "বাংলা", topic: "কারক", attempted: 0, correct: 0, accuracy: 0 },
        ],
      },
    ],
    recentResults: [],
    ...overrides,
  } as PreparationIntelligenceDTO;
}

describe("readiness drivers (O8)", () => {
  it("returns no drivers without attempts", () => {
    expect(computeDrivers(null)).toEqual([]);
    expect(
      computeDrivers(intel({ overall: { totalAttempts: 0, accuracy: 0 } as never })),
    ).toEqual([]);
  });

  it("computes all five drivers from real payload fields", () => {
    const drivers = computeDrivers(intel());
    expect(drivers.map((d) => d.id)).toEqual(["accuracy", "mock", "coverage", "consistency", "trend"]);
    const byId = new Map(drivers.map((d) => [d.id, d]));
    expect(byId.get("accuracy")).toMatchObject({ status: "warn", detailEn: "55%" });
    expect(byId.get("mock")?.status).toBe("na");
    // 2 confident topics / 2 touched (zero-attempt কারক excluded).
    expect(byId.get("coverage")).toMatchObject({ status: "good", detailEn: "2/2 topics at 3+ attempts" });
    // 3 of 4 window days active.
    expect(byId.get("consistency")).toMatchObject({ status: "good" });
    expect(byId.get("trend")).toMatchObject({ status: "bad", detailEn: "-5%" });
  });

  it("picks the weakest actionable driver as the biggest lever", () => {
    const lever = biggestLever(computeDrivers(intel()));
    expect(lever?.id).toBe("trend");
    expect(biggestLever([])).toBeNull();
  });

  it("returns null lever when everything is good", () => {
    const drivers = computeDrivers(
      intel({
        overall: { totalAttempts: 100, accuracy: 90 } as never,
        period: { accuracyDelta: 4, previousAttempts: 50 } as never,
        recentResults: [{ score: 85 }, { score: 90 }] as never,
      }),
    );
    // accuracy 90 good, mock ~88 good, coverage good, consistency good, trend good.
    expect(drivers.every((d) => d.status === "good")).toBe(true);
    expect(biggestLever(drivers)).toBeNull();
  });
});
