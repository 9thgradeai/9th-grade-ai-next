import { describe, it, expect } from "vitest";
import {
  SECONDS_PER_QUESTION,
  negativePenaltyForEcosystem,
  negativeLabelForEcosystem,
  autoDurationSec,
  autoDurationMin,
} from "@/lib/exam-scoring";

describe("exam-scoring (Practice tab rules)", () => {
  it("charges 30 seconds per MCQ", () => {
    expect(SECONDS_PER_QUESTION).toBe(30);
    expect(autoDurationSec(10)).toBe(300);
    expect(autoDurationSec(0)).toBe(0);
  });

  it("auto duration rounds up to whole minutes (min 1)", () => {
    expect(autoDurationMin(10)).toBe(5); // 300s
    expect(autoDurationMin(1)).toBe(1); // 30s → 1 min
    expect(autoDurationMin(0)).toBe(1);
  });

  it("applies −0.25 for Bank and −0.50 for BCS per wrong MCQ", () => {
    expect(negativePenaltyForEcosystem("BANGLADESH_BANK")).toBe(0.25);
    expect(negativePenaltyForEcosystem("BCS")).toBe(0.5);
    expect(negativePenaltyForEcosystem(undefined)).toBe(0.5);
  });

  it("labels penalties in Bengali digits", () => {
    expect(negativeLabelForEcosystem("BCS")).toBe("−০.৫");
    expect(negativeLabelForEcosystem("BANGLADESH_BANK")).toBe("−০.২৫");
  });
});
