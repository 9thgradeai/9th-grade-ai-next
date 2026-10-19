import { describe, it, expect } from "vitest";
import {
  allocateScope,
  distributeWeighted,
  largestRemainder,
  sumAllocated,
  type ScopeNode,
  type ScopeSubject,
  type ScoringPolicy,
} from "~backend/services/exam-config";

const SCORING: ScoringPolicy = { marksPerQuestion: 1, penaltyPerWrong: 0.5, marksForUnanswered: 0 };

function leaf(id: string, capacity: number, marks?: number, allocationSource: "official" | "inferred" = "official"): ScopeNode {
  return { id, nameBn: id, marks, allocationSource, capacity, children: [] };
}

function subject(id: string, marks: number, capacity: number, children: ScopeNode[]): ScopeSubject {
  return { id, nameBn: id, nameEn: id, marks, allocationSource: "official", capacity, children };
}

function run(subjects: ScopeSubject[], opts: Partial<Parameters<typeof allocateScope>[0]> = {}) {
  return allocateScope({
    examCode: "BCS",
    configVersion: 1,
    scoring: SCORING,
    mode: "mock",
    subjects,
    fullPaper: true,
    ...opts,
  });
}

describe("largestRemainder", () => {
  it("sums to the requested total", () => {
    expect(largestRemainder(10, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(10);
    expect(largestRemainder(7, [1, 2, 3]).reduce((a, b) => a + b, 0)).toBe(7);
  });

  it("falls back to an even split when all weights are zero", () => {
    const out = largestRemainder(5, [0, 0]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(5);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
  });
});

describe("distributeWeighted", () => {
  it("sums to min(total, capacity) and respects caps", () => {
    const out = distributeWeighted(10, [
      { weight: 1, capacity: 2 },
      { weight: 1, capacity: 100 },
    ]);
    expect(out[0]).toBe(2);
    expect(out.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("returns all zeros for zero capacity", () => {
    expect(distributeWeighted(5, [{ weight: 1, capacity: 0 }])).toEqual([0]);
  });
});

describe("allocateScope — full paper", () => {
  it("meets official quotas when inventory is sufficient", () => {
    const r = run([
      subject("a", 10, 100, [leaf("a1", 100, 10)]),
      subject("b", 20, 100, [leaf("b1", 100, 20)]),
    ]);
    expect(r.outcome).toBe("feasible");
    expect(r.requested).toBe(30);
    expect(r.achievable).toBe(30);
    expect(sumAllocated(r)).toBe(30);
  });

  it("fails explicitly with a deficit diagnostic when a subject is short", () => {
    const r = run([
      subject("a", 10, 100, [leaf("a1", 100, 10)]),
      subject("b", 20, 3, [leaf("b1", 3, 20)]),
    ]);
    expect(r.outcome).toBe("infeasible");
    const diag = r.diagnostics.find((d) => d.code === "SUBJECT_QUOTA_SHORTFALL");
    expect(diag).toBeDefined();
    expect(diag?.subjectId).toBe("b");
    expect(diag?.requested).toBe(20);
    expect(diag?.achievable).toBe(3);
    expect(diag?.deficit).toBe(17);
  });

  it("honours official within-subject suballocations", () => {
    const r = run([
      subject("intl", 10, 1000, [leaf("x", 500, 6), leaf("y", 500, 4)]),
    ]);
    expect(r.outcome).toBe("feasible");
    const topics = r.subjects[0].topics;
    expect(topics.find((t) => t.id === "x")?.allocated).toBe(6);
    expect(topics.find((t) => t.id === "y")?.allocated).toBe(4);
  });

  it("flags an official suballocation that cannot be met", () => {
    const r = run([subject("s", 10, 7, [leaf("big", 7, 6), leaf("small", 0, 4)])]);
    expect(r.outcome).toBe("infeasible");
    expect(r.diagnostics.some((d) => d.code === "OFFICIAL_TOPIC_QUOTA_SHORTFALL")).toBe(true);
  });

  it("redistributes an unmet topic sub-quota instead of failing the paper", () => {
    // Subject total IS met (10/10) by pulling the short topic's marks from the
    // topic that still has headroom — so the paper is buildable (not infeasible)
    // and the deviation is disclosed as a warning + `redistributed` outcome.
    const r = run([subject("s", 10, 10, [leaf("big", 10, 6), leaf("small", 0, 4)])]);
    expect(r.outcome).toBe("redistributed");
    expect(r.achievable).toBe(10);
    expect(r.subjects[0].allocated).toBe(10);
    expect(r.subjects[0].topics.find((t) => t.id === "big")?.allocated).toBe(10);
    expect(r.subjects[0].topics.find((t) => t.id === "small")?.allocated).toBe(0);
    const diag = r.diagnostics.find((d) => d.code === "OFFICIAL_TOPIC_QUOTA_SHORTFALL");
    expect(diag?.severity).toBe("warning");
    expect(diag?.deficit).toBe(4);
    // No error-severity diagnostic → the paper is buildable.
    expect(r.diagnostics.some((d) => d.severity === "error")).toBe(false);
  });

  it("distributes inferred nodes neutrally by inventory", () => {
    const r = run([
      subject("m", 10, 30, [
        { id: "p1", nameBn: "p1", allocationSource: "inferred", capacity: 10, children: [] },
        { id: "p2", nameBn: "p2", allocationSource: "inferred", capacity: 20, children: [] },
      ]),
    ]);
    // Equal weights, capped by capacity → 5/5.
    const topics = r.subjects[0].topics;
    expect(topics.find((t) => t.id === "p1")?.allocated).toBe(5);
    expect(topics.find((t) => t.id === "p2")?.allocated).toBe(5);
  });
});

describe("allocateScope — custom / practice", () => {
  it("discloses deviations when permitted", () => {
    const r = run([subject("a", 10, 5, [])], {
      fullPaper: false,
      mode: "practice",
      requested: 20,
      allowDeviations: true,
    });
    expect(r.outcome).toBe("deviations");
    expect(r.diagnostics.some((d) => d.code === "CUSTOM_DEVIATION")).toBe(true);
  });

  it("fails when deviations are not permitted", () => {
    const r = run([subject("a", 10, 5, [])], {
      fullPaper: false,
      mode: "practice",
      requested: 20,
      allowDeviations: false,
    });
    expect(r.outcome).toBe("infeasible");
  });

  it("respects explicit per-subject counts", () => {
    const r = run(
      [subject("a", 10, 100, []), subject("b", 10, 100, [])],
      { fullPaper: false, requested: 15, perSubject: { a: 5, b: 10 } },
    );
    expect(r.subjects.find((s) => s.id === "a")?.allocated).toBe(5);
    expect(r.subjects.find((s) => s.id === "b")?.allocated).toBe(10);
  });

  it("returns invalid for an empty scope", () => {
    const r = run([]);
    expect(r.outcome).toBe("invalid");
    expect(r.diagnostics[0].code).toBe("SCOPE_EMPTY");
  });
});
