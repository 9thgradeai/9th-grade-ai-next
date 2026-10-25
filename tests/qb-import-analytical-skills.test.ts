import { describe, it, expect } from "vitest";
import { splitOptions, resolveAnswer, parseRecord } from "../scripts/import-analytical-skills";
import { waiveGateCodes } from "../scripts/import-bangla-grammar-ii";
import { scanMca } from "../scripts/qb-forensics/import-gate";

const asRec = (r: ReturnType<typeof parseRecord>) => {
  expect(r).not.toBeNull();
  expect(typeof r).toBe("object");
  expect("parsed" in (r as object)).toBe(true);
  return r as { parsed: { question: string; options: string[]; correctAnswer: string; explanation: string }; repair?: string };
};

describe("splitOptions", () => {
  it("splits four separate option paragraphs", () => {
    const r = splitOptions("1. CAT is XZG. How is DOG written? A. WLT B. VLS C. WMT D. WLS");
    const tail = "1. CAT is XZG. How is DOG written? ".slice(0); void tail;
    expect(r).not.toBeNull();
    expect(r!.question).toBe("1. CAT is XZG. How is DOG written?");
    expect(r!.options).toHaveLength(4);
  });
  it("splits a combined options line", () => {
    const r = splitOptions("Find the term: ELFA, GLHC, ? A. KLN B. KHL C. KPN D. KLH");
    expect(r).not.toBeNull();
    expect(r!.options).toEqual(["KLN", "KHL", "KPN", "KLH"]);
  });
  it("rejects fewer than four markers", () => {
    expect(splitOptions("Q? A. 1 B. 2 C. 3")).toBeNull();
  });
  it("rejects letter sequences out of A-B-C-D order", () => {
    expect(splitOptions("Q? A. 1 C. 2 B. 3 D. 4")).toBeNull();
  });
});

describe("resolveAnswer", () => {
  it("resolves a clean keyed answer to its option text", () => {
    const r = resolveAnswer("A. DNWG", ["DNWG", "DMWG", "CNWF", "DNWF"]);
    expect(r.correctAnswer).toBe("DNWG");
    expect(r.suffix).toBe("");
    expect(r.repair).toBeUndefined();
  });

  // Record 16 — "A. 41 (Standard position sum: …)" in the coding file.
  it("answer-suffix: moves a trailing bracket into the suffix", () => {
    const r = resolveAnswer("A. 41 (Standard position sum: G=7, U=21, M=13)", ["41", "80", "76", "82"]);
    expect(r.correctAnswer).toBe("41");
    expect(r.repair).toBe("answer-suffix");
    expect(r.suffix).toContain("Standard position sum");
  });

  it("answer-letter: trusts the letter when letters and words disagree", () => {
    const r = resolveAnswer("A. EGTELLOC (Wait, reverse of COLLEGE is EGELLOC)", ["EGTELLOC", "EGELLOC", "EGELLOC", "EGELLOC"]);
    expect(r.correctAnswer).toBe("EGTELLOC");
    expect(r.repair).toBe("answer-suffix"); // starts with the keyed option, so tail becomes the suffix
    expect(r.suffix).toContain("EGELLOC");
  });

  it("answer-letter: trusts the letter when the keyed words mismatch every option", () => {
    const r = resolveAnswer("A. 50", ["55", "52", "54", "48"]);
    expect(r.correctAnswer).toBe("55");
    expect(r.repair).toBe("answer-letter");
  });

  it("splits a parenthetical that is still shorter than the option", () => {
    const r = resolveAnswer("A. 41 (note)", ["41", "42", "43", "44"]);
    expect(r.correctAnswer).toBe("41");
    expect(r.suffix).toBe("(note)");
  });

  it("matches a plain answer with no letter prefix", () => {
    const r = resolveAnswer("23", ["21", "22", "23", "24"]);
    expect(r.correctAnswer).toBe("23");
  });
});

describe("parseRecord", () => {
  const clean = "In a certain code language, CAT is written as XZG. How is DOG written in that code? A. WLT B. VLS C. WMT D. WLS Answer: A. WLT Explanation: Reverse mapping.";
  it("parses a fully clean record", () => {
    const { parsed, repair } = asRec(parseRecord("1. " + clean));
    expect(repair).toBeUndefined();
    expect(parsed.question).toContain("CAT is written as XZG");
    expect(parsed.options).toEqual(["WLT", "VLS", "WMT", "WLS"]);
    expect(parsed.correctAnswer).toBe("WLT");
    expect(parsed.explanation).toContain("Reverse mapping");
  });

  // EMPTY_EXPLANATION case — letter present, no explanation marker at all.
  it("leaves the explanation empty when the source carries no Explanation: marker", () => {
    const line = "1. If > means <=, < means >=, then A > B? A. yes B. no C. maybe D. n/a Answer: A. yes";
    const { parsed, repair } = asRec(parseRecord(line));
    expect(repair).toBeUndefined();
    expect(parsed.explanation).toBe("");
    // Gate must then see EMPTY_EXPLANATION, waivable since no marker exists.
    const { waived, blocking } = waiveGateCodes(scanMca(parsed).fatal.map((f) => f.code), line);
    expect(waived).toContain("EMPTY_EXPLANATION");
    expect(blocking).toHaveLength(0);
  });

  it("records a duplicate-option gate issue that waiveGateCodes always waives", () => {
    const line = "1. Which is x? A. X B. X C. Y D. Z Answer: A. X Explanation: see.";
    const { parsed } = asRec(parseRecord(line));
    const fatal = scanMca(parsed).fatal.map((f) => f.code);
    const { waived, blocking } = waiveGateCodes(fatal, line);
    if (fatal.includes("DUPLICATE_OPTION")) {
      expect(waived).toContain("DUPLICATE_OPTION");
      expect(blocking).toHaveLength(0);
    }
  });

  it("rejects a record with no answer marker", () => {
    const r = parseRecord("1. This is just a title");
    expect(r).not.toBeNull();
    expect("skip" in (r as object)).toBe(true);
  });

  it("rejects a record that does not start with a number", () => {
    const r = parseRecord("How is DOG written? A. WLT B. VLS C. WMT D. WLS Answer: A. WLT");
    expect(r).not.toBeNull();
    expect("skip" in (r as object)).toBe(true);
  });
});

describe("waiveGateCodes — shared policy (ADR-072)", () => {
  it("waives EMPTY_EXPLANATION only when no Explanation: marker follows the answer", () => {
    const present = waiveGateCodes(["EMPTY_EXPLANATION"], "Q? A. 1 B. 2 C. 3 D. 4 Answer: A Explanation: e");
    expect(present.waived).toHaveLength(0);
    expect(present.blocking).toContain("EMPTY_EXPLANATION");
    const absent = waiveGateCodes(["EMPTY_EXPLANATION"], "Q? A. 1 B. 2 C. 3 D. 4 Answer: A");
    expect(absent.waived).toContain("EMPTY_EXPLANATION");
    expect(absent.blocking).toHaveLength(0);
  });

  it("always waives DUPLICATE_OPTION", () => {
    const r = waiveGateCodes(["DUPLICATE_OPTION", "MOJIBAKE"], "Q? A. 1 B. 2 C. 3 D. 4 Answer: A");
    expect(r.waived).toContain("DUPLICATE_OPTION");
    expect(r.blocking).toContain("MOJIBAKE");
  });
});
