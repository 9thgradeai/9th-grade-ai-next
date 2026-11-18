// Unit tests for the staged-cleanup helpers in scripts/clean-broken-questions.ts
// (filterPlanByReasons / parseReasonsFlag). Importing the module must have no
// side effects: main() only runs when process.argv[1] points at the script.

import { describe, expect, it } from "vitest";

import {
  buildRemovalPlan,
  filterPlanByReasons,
  parseReasonsFlag,
  type RemovalPlan,
  type ScanRow,
} from "../../../scripts/clean-broken-questions";

function row(id: number, question: string, extra: Partial<ScanRow> = {}): ScanRow {
  return {
    id,
    subjectId: 1,
    question,
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer: "ক",
    // Same explanation on purpose: mcaSignature = question|answer|explanation,
    // so #1 and #2 below are true duplicates of each other (same leaf).
    explanation: "একই ব্যাখ্যা",
    path: "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা",
    ...extra,
  };
}

/** Minimal plan shaped like the real one: kept, duplicate, structural, corrupt. */
function samplePlan(): RemovalPlan {
  const rows: ScanRow[] = [
    row(1, "প্রশ্ন ক"),
    row(2, "প্রশ্ন ক"), // duplicate of #1 (same normalized identity)
    { ...row(3, "প্রশ্ন খ"), correctAnswer: "উত্তর নেই" }, // not an option, not a letter → ANSWER_MISMATCH
    { ...row(4, "প্রশ্ন গ"), question: "প্রশ্ন � গ" }, // U+FFFD → UNICODE_CORRUPTION
  ];
  return buildRemovalPlan(rows);
}

describe("filterPlanByReasons", () => {
  it("keeps only entries whose reason is in the set", () => {
    const plan = samplePlan();
    expect(plan.removed.length).toBeGreaterThanOrEqual(2);

    const filtered = filterPlanByReasons(plan, new Set(["DUPLICATE"]));
    expect(filtered.removed.every((e) => e.reason === "DUPLICATE")).toBe(true);
    expect(filtered.removed.length).toBeLessThan(plan.removed.length);
  });

  it("recomputes removedIds/keptIds so the partition stays complete", () => {
    const plan = samplePlan();
    const filtered = filterPlanByReasons(plan, new Set(["DUPLICATE"]));

    const all = new Set([...filtered.removedIds, ...filtered.keptIds]);
    expect(all.size).toBe(plan.scanned); // every row is either removed or kept
    for (const id of filtered.removedIds) {
      expect(filtered.keptIds).not.toContain(id);
    }
    // Filtered-out removals move back to kept.
    const filteredOut = plan.removedIds.filter((id) => !filtered.removedIds.includes(id));
    for (const id of filteredOut) {
      expect(filtered.keptIds).toContain(id);
    }
  });

  it("recomputes byReason/bySubject/byPath counters from the filtered entries", () => {
    const plan = samplePlan();
    const filtered = filterPlanByReasons(plan, new Set(["DUPLICATE", "UNICODE_CORRUPTION"]));

    expect(filtered.byReason.DUPLICATE + filtered.byReason.UNICODE_CORRUPTION).toBe(
      filtered.removed.length,
    );
    expect(filtered.byReason.STRUCTURAL_BROKEN).toBe(0);
    const subjectTotal = Object.values(filtered.bySubject).reduce((a, b) => a + b, 0);
    expect(subjectTotal).toBe(filtered.removed.length);
    const pathTotal = Object.values(filtered.byPath).reduce((a, b) => a + b, 0);
    expect(pathTotal).toBe(filtered.removed.length);
  });

  it("an empty reason set yields an empty removal plan with ids all kept", () => {
    const plan = samplePlan();
    const filtered = filterPlanByReasons(plan, new Set());
    expect(filtered.removed).toEqual([]);
    expect(filtered.removedIds).toEqual([]);
    expect(filtered.keptIds.length).toBe(plan.scanned);
  });
});

describe("buildRemovalPlan duplicate scoping (regression: global dedupe wiped cross-ecosystem copies)", () => {
  const base = {
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer: "ক",
    explanation: "একই ব্যাখ্যা",
    path: "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমাস",
  };

  it("does NOT flag identical content under different subjects (per-ecosystem pools)", () => {
    const rows: ScanRow[] = [
      { id: 1, subjectId: 10, question: "অভিধান কী?", ...base },
      { id: 2, subjectId: 20, question: "অভিধান কী?", ...base }, // other ecosystem's copy
    ];
    const plan = buildRemovalPlan(rows);
    expect(plan.removed).toEqual([]);
    expect(plan.keptIds).toEqual([1, 2]);
  });

  it("does NOT flag identical content at different paths of the same subject", () => {
    const rows: ScanRow[] = [
      { id: 1, subjectId: 10, question: "অভিধান কী?", ...base },
      { id: 2, subjectId: 10, question: "অভিধান কী?", ...base, path: "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/বাগধারা" },
    ];
    const plan = buildRemovalPlan(rows);
    expect(plan.removed).toEqual([]);
    expect(plan.keptIds).toEqual([1, 2]);
  });

  it("STILL flags a true double-import: same subject, same path, same content", () => {
    const rows: ScanRow[] = [
      { id: 1, subjectId: 10, question: "অভিধান কী?", ...base },
      { id: 2, subjectId: 10, question: "অভিধান কী?", ...base },
    ];
    const plan = buildRemovalPlan(rows);
    expect(plan.removed).toHaveLength(1);
    expect(plan.removedIds).toEqual([2]); // oldest row survives
    expect(plan.removed[0].reason).toBe("DUPLICATE");
  });

  it("keeps the lowest id per leaf independently across leaves", () => {
    const rows: ScanRow[] = [
      { id: 5, subjectId: 10, question: "প্রশ্ন", ...base },
      { id: 9, subjectId: 10, question: "প্রশ্ন", ...base },
      { id: 3, subjectId: 20, question: "প্রশ্ন", ...base },
      { id: 7, subjectId: 20, question: "প্রশ্ন", ...base },
    ];
    const plan = buildRemovalPlan(rows);
    expect(plan.removedIds).toEqual([7, 9]); // per-leaf min ids 5 and 3 survive
    expect(plan.keptIds).toEqual([3, 5]);
  });
});

describe("parseReasonsFlag", () => {
  it("returns null when the flag is absent", () => {
    expect(parseReasonsFlag(["--yes"])).toBeNull();
  });

  it("parses a comma-separated list into a validated set", () => {
    const set = parseReasonsFlag(["--reasons=DUPLICATE,UNICODE_CORRUPTION"]);
    expect(set).toEqual(new Set(["DUPLICATE", "UNICODE_CORRUPTION"]));
  });

  it("rejects unknown reason names", () => {
    expect(() => parseReasonsFlag(["--reasons=BOGUS"])).toThrow(/Unknown removal reason/);
  });

  it("rejects an empty value", () => {
    expect(() => parseReasonsFlag(["--reasons="])).toThrow(/at least one reason/);
  });
});
