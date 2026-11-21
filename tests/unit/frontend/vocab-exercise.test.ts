import { describe, it, expect } from "vitest";
import { blankWordInSentence, escapeRegExp } from "@/lib/vocab-exercise";

describe("escapeRegExp", () => {
  it("escapes regex metacharacters literally", () => {
    expect(escapeRegExp("a.b[c](d)")).toBe("a\\.b\\[c\\]\\(d\\)");
  });
});

describe("blankWordInSentence", () => {
  it("blanks the exact headword", () => {
    expect(blankWordInSentence("The policy was abandoned.", "abandoned")).toBe(
      "The policy was ______.",
    );
  });

  it("blanks a common inflected form of the headword", () => {
    expect(blankWordInSentence("She abandons the plan.", "abandon")).toBe(
      "She ______ the plan.",
    );
  });

  it("is case-insensitive", () => {
    expect(blankWordInSentence("They ABANDON the plan.", "abandon")).toBe(
      "They ______ the plan.",
    );
  });

  it("does not match substrings inside other words", () => {
    expect(blankWordInSentence("The abandonment was sudden.", "abandon")).toBeNull();
  });

  it("returns null when the headword is absent so callers can fall back", () => {
    expect(blankWordInSentence("A completely unrelated sentence.", "abandon")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(blankWordInSentence("", "abandon")).toBeNull();
    expect(blankWordInSentence("Some sentence.", "")).toBeNull();
  });
});
