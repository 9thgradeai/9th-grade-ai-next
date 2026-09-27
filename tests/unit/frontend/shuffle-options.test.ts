import { describe, it, expect } from "vitest";
import { shuffleOptions, shuffleSessionOptions, isPinnedOption, hasLetterReference } from "@/lib/shuffle-options";

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

describe("hasLetterReference", () => {
  it("detects self-referential options", () => {
    expect(hasLetterReference(["Both A and B are perfectly standard.", "X"])).toBe(true);
    expect(hasLetterReference(["A and C are correct", "X"])).toBe(true);
    expect(hasLetterReference(["X", "Only B"])).toBe(true);
    expect(hasLetterReference(["X", "All are correct except D"])).toBe(true);
    expect(hasLetterReference(["X", "Option C is wrong"])).toBe(true);
  });
  it("ignores ordinary prose", () => {
    expect(hasLetterReference(["Vitamin A and iron are essential", "X"])).toBe(false);
    expect(hasLetterReference(["Neither type of matters", "X"])).toBe(false);
    expect(hasLetterReference(["The repo rate was adjusted", "X"])).toBe(false);
    expect(hasLetterReference(["Only a fine", "10 years imprisonment"])).toBe(false);
    expect(hasLetterReference(["Only a civil matter", "Legal"])).toBe(false);
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
  it("keeps the full authored order for self-referential questions", () => {
    const opts = [
      "Both A and B are perfectly standard.",
      "The officer addressed his friends that they should stand united during that crisis.",
      "The officer proposed to his friends that they should stand united during that crisis.",
      "The officer addressed them as friends and proposed that they should stand united during that crisis.",
    ];
    for (const seed of ["s1", "s2", "s3", "practice-123:456"]) {
      expect(shuffleOptions(opts, seed)).toEqual(opts);
    }
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
