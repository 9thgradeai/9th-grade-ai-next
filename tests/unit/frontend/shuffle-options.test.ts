import { describe, it, expect } from "vitest";
import { shuffleOptions, shuffleSessionOptions, isPinnedOption } from "@/lib/shuffle-options";

describe("isPinnedOption", () => {
  it("pins conventional options exactly", () => {
    expect(isPinnedOption("All of the above")).toBe(true);
    expect(isPinnedOption("none of these")).toBe(true);
    expect(isPinnedOption("Neither")).toBe(true);
    expect(isPinnedOption("Both A and B")).toBe(true);
  });
  it("does not pin content that merely starts the same", () => {
    expect(isPinnedOption("Neither type of matters")).toBe(false);
    expect(isPinnedOption("All of them together")).toBe(false);
  });
});

describe("shuffleOptions", () => {
  it("preserves the option set and is deterministic per seed", () => {
    const opts = ["Confidentiality", "Integrity", "Availability", "Authentication"];
    const a = shuffleOptions(opts, "s1:5");
    const b = shuffleOptions(opts, "s1:5");
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...opts].sort());
  });
  it("differs across seeds (per-session variety)", () => {
    const opts = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const seen = new Set(
      Array.from({ length: 12 }, (_, i) => shuffleOptions(opts, `seed-${i}`).join("|")),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
  it("keeps pinned options at their authored index", () => {
    const opts = ["X", "All of the above", "Y", "Z", "None of these"];
    const out = shuffleOptions(opts, "s");
    expect(out[1]).toBe("All of the above");
    expect(out[4]).toBe("None of these");
    expect([...out].sort()).toEqual([...opts].sort());
  });
  it("handles short/degenerate lists without crashing", () => {
    expect(shuffleOptions([], "s")).toEqual([]);
    expect(shuffleOptions(["only"], "s")).toEqual(["only"]);
  });
});

describe("shuffleSessionOptions", () => {
  it("gives each question its own arrangement from one session seed", () => {
    const qs = [
      { id: 1, options: ["a1", "b1", "c1", "d1", "e1", "f1"] },
      { id: 2, options: ["a2", "b2", "c2", "d2", "e2", "f2"] },
    ];
    const out = shuffleSessionOptions(qs, "session-9");
    expect(out).toHaveLength(2);
    for (const q of out) expect(q.options).toHaveLength(6);
    // Same seed → same session arrangement (stable within the session).
    expect(shuffleSessionOptions(qs, "session-9")).toEqual(out);
  });
  it("does not mutate the input questions", () => {
    const qs = [{ id: 1, options: ["a", "b", "c"] }];
    shuffleSessionOptions(qs, "s");
    expect(qs[0].options).toEqual(["a", "b", "c"]);
  });
});
