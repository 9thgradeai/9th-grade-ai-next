/**
 * tests/qb-import-bank-math-updated-ii.test.ts
 * ----------------------------------------------------------------------------
 * Parser / errata guarantees for the Bank Math updated-II import pipeline
 * (scripts/import-bank-math-updated-ii.ts):
 *   1. Records parse with inline (one line) and multi-line (one per line)
 *      options; content is stored verbatim (no math rewriting).
 *   2. Section headers drive subtopic, taxonomy leaf and difficulty.
 *   3. The documents' own corrections are applied: block `Qn:` entries
 *      (letter / answer-is / replace-option forms) and in-record
 *      `Correction:` lines — including the "not listed" rescue path.
 *   4. Items the documents declare unanswerable are skipped, never seeded.
 *   5. Duplicate question numbers resolve to the FIRST complete variant.
 *   6. Orphan option sets (source dropped a stem, e.g. Q80) become stemless
 *      skips without polluting the previous record.
 *   7. Section → leaf mapping rules and the difficulty heuristic.
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  FILES,
  NEW_LEAVES,
  NEW_PARENTS,
  applyBlockEntry,
  applyInRecordLine,
  cleanSectionTitle,
  difficultyFor,
  leafForSection,
  parseFileText,
  reconcileAnswerLine,
  type FileConfig,
  type WorkingRec,
} from "../scripts/import-bank-math-updated-ii";

type TaxonomyNode = { name: string; children: TaxonomyNode[] };

/** Every node path of the revised Bank taxonomy (2026-10-22). */
const TAXONOMY_PATHS: Set<string> = (() => {
  const root = JSON.parse(
    readFileSync(join(process.cwd(), "database", "data", "bb-taxonomy.json"), "utf8"),
  ) as { children: TaxonomyNode[] };
  const out = new Set<string>();
  const walk = (n: TaxonomyNode, prefix: string) => {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    out.add(p);
    for (const c of n.children) walk(c, p);
  };
  for (const c of root.children) walk(c, "");
  return out;
})();

const arithmetic = FILES.find((f) => f.slug === "arithmetic")!;
const algebra = FILES.find((f) => f.slug === "algebra")!;
const timeWork = FILES.find((f) => f.slug === "time-work-speed")!;

/** Minimal mutable record for applier unit tests. */
const mkRec = (over: Partial<WorkingRec> = {}): WorkingRec => ({
  printed: 1,
  stem: "stem",
  options: ["1", "2", "3", "4"],
  letter: "A",
  answerRest: "",
  explanationParts: [],
  sectionTitle: "",
  correctionLines: [],
  order: 0,
  fixes: [],
  contentFixed: false,
  unresolved: [],
  unanswerable: null,
  ...over,
});

// ── 1. record parsing ────────────────────────────────────────────────────────

describe("parseFileText — record shapes", () => {
  it("parses an inline full option set + answer + explanation verbatim", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 1–10: Percentages and Percentage Change",
        "1. What is 20% of 150?",
        "A. 25 B. 30 C. 35 D. 40",
        "Answer: B. 30",
        "Explanation: 20/100 × 150 = 30.",
      ].join("\n"),
      arithmetic,
    );
    expect(report.skips).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      n: 1,
      stem: "What is 20% of 150?",
      options: ["25", "30", "35", "40"],
      answerLetter: "B",
      correctAnswer: "30",
      subtopic: "Percentages and Percentage Change",
      leaf: "03_Mathematics/Part_01_Arithmetic/Percentages",
      difficulty: "MEDIUM",
    });
    expect(records[0].explanation).toBe("20/100 × 150 = 30.");
    expect(report.answerRestMismatch).toBe(0);
    expect(report.missingNumbers).toContain(2);
    expect(report.missingNumbers).not.toContain(1);
  });

  it("parses options given one per line and keeps Unicode untouched", () => {
    const { records } = parseFileText(
      [
        "MCQs 21–30: Profit, Loss and Discounts",
        "2. An item costs ৳480 and is sold at a 12½% profit. Find the selling price.",
        "A. ৳520",
        "B. ৳540",
        "C. ৳560",
        "D. ৳580",
        "Correct Answer: B. ৳540",
        "Explanation: 480 × 1.125 = 540.",
      ].join("\n"),
      arithmetic,
    );
    expect(records).toHaveLength(1);
    expect(records[0].options).toEqual(["৳520", "৳540", "৳560", "৳580"]);
    expect(records[0].answerLetter).toBe("B");
    expect(records[0].correctAnswer).toBe("৳540");
    expect(records[0].stem).toContain("৳480");
  });

  it("splits an inline Explanation that trails the answer line", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 141–160: Age Problems",
        "3. Father is twice as old as son today.",
        "A. 10 B. 20 C. 30 D. 40",
        "Answer: C. 30 Explanation: Father = 2 × 15 = 30.",
      ].join("\n"),
      arithmetic,
    );
    // The answer line carries the explanation inline: "… 30 Explanation: …"
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("C");
    expect(records[0].explanation).toBe("Father = 2 × 15 = 30.");
    expect(report.skips).toEqual([]);
  });
});

// ── 2. block corrections ─────────────────────────────────────────────────────

describe("applyBlockEntry — `Qn:` correction entries", () => {
  it("(a) letter + value form: Q63: C. 45.", () => {
    const rec = mkRec({ options: ["35", "40", "45", "50"], letter: "A" });
    const r = applyBlockEntry(rec, "C. 45.");
    expect(r.applied).toContain("answer → C");
    expect(rec.letter).toBe("C");
    expect(rec.options[2]).toBe("45");
    expect(r.unresolved).toBeUndefined();
  });

  it("(b) answer-is form: Q8: Correct answer is B. 1/3.", () => {
    const rec = mkRec({ options: ["1/2", "1/3", "1/4", "1/5"], letter: "C" });
    const r = applyBlockEntry(rec, "Correct answer is B. 1/3.");
    expect(r.applied).toBeTruthy();
    expect(rec.letter).toBe("B");
  });

  it("(b) value remaps when it sits at another option", () => {
    const rec = mkRec({ options: ["1/2", "1/3", "1/4", "1/5"], letter: "C" });
    // Asserted letter B but the value lives at option C → value wins.
    const r = applyBlockEntry(rec, "Correct answer is B. 1/4.");
    expect(r.applied).toContain("answer → C");
    expect(rec.letter).toBe("C");
  });

  it("(c) replace-option form sets the replaced slot as the answer", () => {
    const rec = mkRec({ options: ["10 litres", "15 litres", "30 litres", "40 litres"], letter: "D" });
    const r = applyBlockEntry(rec, "20 litres; replace option C with 20 litres.");
    expect(r.applied).toContain('option C: "30 litres" → "20 litres"');
    expect(rec.options[2]).toBe("20 litres");
    expect(rec.letter).toBe("C");
  });

  it("(c) `this value` + explicit trailing Correct answer letter", () => {
    const rec = mkRec({ options: ["9 : 14", "7 : 12", "18 : 27", "5 : 9"], letter: "B" });
    const r = applyBlockEntry(
      rec,
      "The ratio is 9 : 14; replace option B with this value. Correct answer: A.",
    );
    expect(r.applied).toBeTruthy();
    expect(rec.options[1]).toBe("9 : 14");
    expect(rec.letter).toBe("A");
  });

  it("strips the `, such as …` tail from a replacement value", () => {
    const rec = mkRec({ options: ["9 : 14", "7 : 12", "6 : 10", "5 : 9"], letter: "A" });
    const r = applyBlockEntry(
      rec,
      "A. 9 : 14; replace option C with a non-equivalent ratio, such as 18 : 27.",
    );
    expect(r.applied).toContain('option C: "6 : 10" → "18 : 27"');
    expect(rec.options[2]).toBe("18 : 27");
    expect(rec.letter).toBe("A");
  });

  it("reports unparseable entries as unresolved instead of guessing", () => {
    const rec = mkRec();
    const r = applyBlockEntry(rec, "the answer key was wrong somehow");
    expect(r.unresolved).toBeTruthy();
    expect(r.applied).toBeUndefined();
    expect(rec.letter).toBe("A"); // untouched
  });
});

// ── 3. in-record corrections ─────────────────────────────────────────────────

describe("applyInRecordLine — `Correction:` notes inside a record", () => {
  it("applies a letter-and-value correction", () => {
    const rec = mkRec({ options: ["8 days", "9 days", "12 days", "10 days"], letter: "B" });
    const r = applyInRecordLine(rec, "The correct answer is D. 10 days.");
    expect(r.applied).toContain("answer → D");
    expect(rec.letter).toBe("D");
  });

  it("applies the value-then-option form", () => {
    const rec = mkRec({ options: ["8 days", "9 days", "12 days", "10 days"], letter: "B" });
    const r = applyInRecordLine(rec, "The correct answer is 10 days, option D.");
    expect(r.applied).toBeTruthy();
    expect(rec.letter).toBe("D");
  });

  it("remaps to where the stated value actually sits", () => {
    const rec = mkRec({ options: ["8 days", "9 days", "10 days", "12 days"], letter: "B" });
    // Note claims D but the value "10 days" is printed at option C → value wins.
    const r = applyInRecordLine(rec, "The correct answer is D. 10 days.");
    expect(r.applied).toContain("answer → C");
    expect(rec.letter).toBe("C");
  });

  it("applies the `which should replace option L` fix", () => {
    const rec = mkRec({
      options: ["160 cm²", "172 cm²", "196 cm²", "180 cm²"],
      letter: "A",
    });
    const r = applyInRecordLine(
      rec,
      "The intended nearest whole-number answer is 180 cm², which should replace option D.",
    );
    expect(r.applied).toContain("answer → D");
    expect(rec.letter).toBe("D");
    expect(rec.options[3]).toBe("180 cm²");
  });

  it("rescues a `not listed` note when the stated value IS an option", () => {
    const rec = mkRec({
      options: ["100 cm²", "120 cm²", "150 cm²", "189 cm²"],
      letter: "A",
    });
    const r = applyInRecordLine(
      rec,
      "The correct answer is 189 cm², but it is not listed among the options.",
    );
    expect(r.applied).toContain("rescued");
    expect(r.unanswerable).toBeUndefined();
    expect(rec.letter).toBe("D");
  });

  it("flags genuinely unanswerable notes (no rescue possible)", () => {
    const rec = mkRec({ options: ["5 km/h", "7 km/h", "8 km/h", "10 km/h"], letter: "A" });
    const r = applyInRecordLine(
      rec,
      "The correct answer is 6 km/h, but it is not listed among the options.",
    );
    expect(r.applied).toBeUndefined();
    expect(r.unanswerable).toContain("6 km/h");
    expect(rec.letter).toBe("A");
  });

  it("applies prefixed correction lines (mid-string letter form)", () => {
    const rec = mkRec({ options: ["75°", "80°", "90°", "85°"], letter: "B" });
    const r = applyInRecordLine(rec, "The calculation gives 85°, so the correct option is D. 85°.");
    expect(r.applied).toContain("answer → D");
    expect(rec.letter).toBe("D");
    expect(r.unanswerable).toBeUndefined();
  });

  it("applies an embedded replace-option fix even when the line also says the item is unanswerable", () => {
    const rec = mkRec({ options: ["840", "2,520", "5,040", "40,320"], letter: "C" });
    const r = applyInRecordLine(
      rec,
      "Correct answer: none of the options; replace option A with 144.",
    );
    expect(r.applied).toContain('option A: "840" → "144"');
    expect(rec.options[0]).toBe("144");
    expect(rec.letter).toBe("A");
    expect(r.unanswerable).toBeUndefined();
  });
});

describe("reconcileAnswerLine — letter vs its own restated value", () => {
  it("remaps to where the printed value actually sits", () => {
    const rec = mkRec({
      options: ["20%", "24%", "26%", "30%"],
      letter: "B",
      answerRest: "26%",
    });
    const note = reconcileAnswerLine(rec);
    expect(note).toContain("answer C");
    expect(rec.letter).toBe("C");
  });

  it("keeps the printed letter when the value is not among the options", () => {
    const rec = mkRec({ options: ["2", "3", "4", "5"], letter: "C", answerRest: "8" });
    const note = reconcileAnswerLine(rec);
    expect(note).toBeNull();
    expect(rec.letter).toBe("C");
  });

  it("does nothing when letter and value already agree", () => {
    const rec = mkRec({ options: ["2", "3", "4", "5"], letter: "C", answerRest: "4" });
    expect(reconcileAnswerLine(rec)).toBeNull();
    expect(rec.letter).toBe("C");
  });

  it("does nothing when there is no restated value", () => {
    const rec = mkRec({ options: ["2", "3", "4", "5"], letter: "C", answerRest: "" });
    expect(reconcileAnswerLine(rec)).toBeNull();
  });
});

// ── 4. full-file errata flow ─────────────────────────────────────────────────

describe("parseFileText — errata, skips and variants", () => {
  it("applies block corrections collected from `Qn:` lines", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 1–30: Percentages and Percentage Change",
        "63. What is 45?",
        "A. 35 B. 40 C. 45 D. 50",
        "Answer: A",
        "Explanation: Because 9 × 5 = 45.",
        "Q63: C. 45.",
      ].join("\n"),
      arithmetic,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("C");
    expect(records[0].correctAnswer).toBe("45");
    expect(report.errata.join(" ")).toContain("Q63");
    expect(report.unresolved).toEqual([]);
  });

  it("applies in-record correction lines and keeps them verbatim in the explanation", () => {
    const { records, report } = parseFileText(
      [
        "Section 4: Speed, Distance and Time (MCQs 76–100)",
        "17. A pipe fills a tank.",
        "A. 8 days B. 9 days C. 12 days D. 10 days",
        "Answer: B",
        "Correction to the options: The correct answer is D. 10 days.",
        "Explanation: Work = 60 units.",
      ].join("\n"),
      timeWork,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("D");
    expect(records[0].explanation).toContain(
      "Correction to the options: The correct answer is D. 10 days.",
    );
    expect(report.errata.join(" ")).toContain("answer → D");
    expect(report.skips).toEqual([]);
  });

  it("honours self-corrections inside explanations (correct letter is X, not Y)", () => {
    const { records } = parseFileText(
      [
        "Section E: Indices, Powers, Surds and Radicals",
        "40. Find x.",
        "A. 2 B. 3 C. 4 D. 5",
        "Answer: B",
        "Explanation: The correct letter is C, not B. Because 2² = 4.",
      ].join("\n"),
      algebra,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("C");
    expect(records[0].correctAnswer).toBe("4");
  });

  it("skips items the document itself declares unanswerable", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 1–10: Percentages and Percentage Change",
        "25. Which value matches?",
        "A. 1 B. 2 C. 3 D. 4",
        "Answer: A",
        "Explanation: None of the listed options is correct; the item is invalid as written.",
      ].join("\n"),
      arithmetic,
    );
    expect(records).toHaveLength(0);
    expect(report.skips).toHaveLength(1);
    expect(report.skips[0]).toContain("Q25");
    expect(report.missingNumbers).toContain(25);
  });

  it("keeps the first complete variant when a number appears twice", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 141–160: Age Problems",
        "2. Version one.",
        "A. 1 B. 2 C. 3 D. 4",
        "Answer: A",
        "Explanation: one.",
        "2. Version two.",
        "A. 5 B. 6 C. 7 D. 8",
        "Answer: B",
        "Explanation: two.",
      ].join("\n"),
      arithmetic,
    );
    expect(records).toHaveLength(1);
    expect(records[0].options).toEqual(["1", "2", "3", "4"]);
    expect(records[0].answerLetter).toBe("A");
    expect(records[0].explanation).toBe("one.");
    expect(report.variantsDropped).toHaveLength(1);
  });

  it("prefers a later complete draft over an earlier incomplete one", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 141–160: Age Problems",
        "2. Draft without an answer line.",
        "A. 1 B. 2 C. 3 D. 4",
        "Explanation: draft.",
        "2. Final version.",
        "A. 1 B. 2 C. 3 D. 4",
        "Answer: B",
        "Explanation: final.",
      ].join("\n"),
      arithmetic,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("B");
    expect(records[0].explanation).toBe("final.");
    expect(report.variantsDropped).toHaveLength(1);
    expect(report.skips).toEqual([]);
  });

  it("prefers the document's final labelled variant over an earlier clean one", () => {
    const { records, report } = parseFileText(
      [
        "Section B: Quadratic Equations and Roots",
        "3. If 5(2x-3)=3(x+4), find x.",
        "A. 3 B. 4 C. 5 D. 6",
        "Correct Answer: C. 5",
        "Explanation: 7x=27⇒x=27/7. Discard this item.",
        "3. (Replacement) If 5(2x-3)=3(x+7), find x.",
        "A. 4 B. 5 C. 6 D. 7",
        "Correct Answer: C. 6",
        "Explanation: 7x=36⇒x=36/7. This is also not 6.",
        "3. (Final corrected version) If 5(2x-3)=3(x+9), find x.",
        "A. 5 B. 6 C. 7 D. 8",
        "Correct Answer: B. 6",
        "Explanation: 7x=42⇒x=6.",
      ].join("\n"),
      algebra,
    );
    expect(records).toHaveLength(1);
    expect(records[0].stem).toContain("(Final corrected version)");
    expect(records[0].answerLetter).toBe("B");
    expect(records[0].correctAnswer).toBe("6");
    expect(report.variantsDropped).toHaveLength(2);
  });

  it("turns orphan option sets (dropped stem) into stemless skips without polluting the prior record", () => {
    const { records, report } = parseFileText(
      [
        "Section 4: Speed, Distance and Time (MCQs 76–100)",
        "79. A train travels 240 km in 4 hours.",
        "A. 3 hours B. 3 1/3 hours C. 3 1/2 hours D. 3 3/4 hours",
        "Correct Answer: B. 3 1/3 hours",
        "Explanation: Original speed = 60 km/h.",
        "A. 5 km/h B. 7 km/h C. 8 km/h D. 10 km/h",
        "A. 6 km/h B. 7 km/h C. 8 km/h D. 10 km/h",
        "Correct Answer: C. 8 km/h",
        "Explanation: Distance =5×4=20 km.",
        "81. The next real question.",
        "A. 1 B. 2 C. 3 D. 4",
        "Correct Answer: A",
        "Explanation: ok.",
      ].join("\n"),
      timeWork,
    );
    // Q79 and Q81 seed; the two orphan option sets are reported stemless.
    expect(records.map((r) => r.n)).toEqual([79, 81]);
    expect(records[0].answerLetter).toBe("B");
    expect(records[0].explanation).toBe("Original speed = 60 km/h.");
    const stemless = report.skips.filter((s) => s.startsWith("(no stem"));
    expect(stemless).toHaveLength(2);
    expect(report.missingNumbers).toContain(80);
    expect(report.missingNumbers).not.toContain(79);
  });

  it("reports unresolved errata instead of silently dropping them", () => {
    const { report } = parseFileText(
      [
        "MCQs 141–160: Age Problems",
        "9. Some question.",
        "A. 1 B. 2 C. 3 D. 4",
        "Answer: A",
        "Explanation: fine.",
        "Q9: the answer key was wrong somehow",
      ].join("\n"),
      arithmetic,
    );
    expect(report.unresolved).toHaveLength(1);
    expect(report.unresolved[0]).toContain("Q9");
  });

  it("applies fixes embedded in explanations instead of skipping the item", () => {
    const { records, report } = parseFileText(
      [
        "Section C: Fundamental Counting Principle (MCQs 61–75)",
        "62. In how many ways can the books be arranged?",
        "A. 840 B. 2,520 C. 5,040 D. 40,320",
        "Correct Answer: C. 840",
        "Explanation: Total =3!×4!=144. Correct answer: none of the options; replace option A with 144.",
      ].join("\n"),
      FILES.find((f) => f.slug === "probability-counting")!,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("A");
    expect(records[0].options[0]).toBe("144");
    expect(records[0].correctAnswer).toBe("144");
    expect(report.skips).toEqual([]);
    expect(report.errata.join(" ")).toContain("[explanation]");
  });

  it("still skips when the explanation declares invalidity with no applicable fix", () => {
    const { records, report } = parseFileText(
      [
        "Section A: Basic Probability and Complementary Events (MCQs 1–30)",
        "124. A table question.",
        "A. 95 B. 115 C. 125 D. 150",
        "Correct Answer: B. 115",
        "Explanation: Total =65. Correct answer: none of the listed options; the options must be corrected to include 65.",
      ].join("\n"),
      FILES.find((f) => f.slug === "probability-counting")!,
    );
    expect(records).toHaveLength(0);
    expect(report.skips).toHaveLength(1);
    expect(report.skips[0]).toContain("Q124");
  });
  it("remaps from an explanation restatement when the printed answer disagrees with it", () => {
    const { records, report } = parseFileText(
      [
        "Section 2: Factors, Multiples, HCF and LCM",
        "69. Which number leaves remainder 2 when divided by 3 and remainder 3 when divided by 5?",
        "A. 8 B. 13 C. 18 D. 23",
        "Correct Answer: B. 13",
        "Explanation: 8 ≡ 2 (mod 3) and 8 ≡ 3 (mod 5). Therefore, the correct answer is A. 8.",
      ].join("\n"),
      FILES.find((f) => f.slug === "number-system")!,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("A");
    expect(records[0].correctAnswer).toBe("8");
    expect(report.errata.join(" ")).toContain("explanation restates the answer");
  });

  it("remaps the answer line's own contradictory letter/value pair", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 1–30: Percentages and Percentage Change",
        "23. A shopkeeper marks an article 40% above cost price and gives a 10% discount. What is the profit percentage?",
        "A. 20% B. 24% C. 26% D. 30%",
        "Correct Answer: B. 26%",
        "Explanation: Let cost price = 100. Selling price = 126. Profit = 26%.",
      ].join("\n"),
      arithmetic,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("C");
    expect(records[0].correctAnswer).toBe("26%");
    expect(report.errata.join(" ")).toContain("answer line states B");
    expect(report.answerRestMismatch).toBe(0); // remapped pairs are no longer mismatches
  });

  it("reports the mismatch and keeps the letter when the value is not an option", () => {
    const { records, report } = parseFileText(
      [
        "MCQs 201–220: Mixed Arithmetic Practice",
        "166. If x : y = 2 : 3 and 2x + y = 28, what is x?",
        "A. 2 B. 3 C. 4 D. 5",
        "Correct Answer: C. 8",
        "Explanation: 7k = 28, so k = 4 and x = 8.",
      ].join("\n"),
      arithmetic,
    );
    expect(records).toHaveLength(1);
    expect(records[0].answerLetter).toBe("C");
    expect(records[0].correctAnswer).toBe("4");
    expect(report.answerRestMismatch).toBe(1);
    expect(report.answerRestDetails[0]).toContain("Q166");
  });
});

// ── 5. section → leaf + difficulty ───────────────────────────────────────────

describe("leafForSection / difficultyFor / cleanSectionTitle", () => {
  it("maps arithmetic sections to existing and new leaves", () => {
    expect(leafForSection(arithmetic, "MCQs 1–30: Percentages and Percentage Change")).toBe(
      "03_Mathematics/Part_01_Arithmetic/Percentages",
    );
    expect(leafForSection(arithmetic, "MCQs 101–120: Mixtures and Alligation")).toBe(
      "03_Mathematics/Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
    );
    // The 2026-10-22 taxonomy revision dropped the importer's own leaves, so
    // these sections now map onto the closest surviving taxonomy node.
    expect(leafForSection(arithmetic, "MCQs 121–140: Income, Expenditure and Savings")).toBe(
      "03_Mathematics/Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
    );
    expect(leafForSection(arithmetic, "MCQs 201–220: Mixed Arithmetic Practice")).toBe(
      "03_Mathematics/Part_01_Arithmetic",
    );
  });

  it("maps algebra letter sections and the time-work numeric sections", () => {
    expect(leafForSection(algebra, "Section H: Algebraic Fractions")).toBe(
      "03_Mathematics/Part_02_Algebra/Equations_and_Inequalities",
    );
    expect(leafForSection(algebra, "Section D: Factorisation")).toBe(
      "03_Mathematics/Part_02_Algebra/Algebraic_Identities_and_Factorization",
    );
    expect(leafForSection(algebra, "Section Q: Review")).toBe("03_Mathematics/Part_02_Algebra");
    expect(leafForSection(timeWork, "Section 2: Time and Work")).toBe(
      "03_Mathematics/Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
    );
    expect(leafForSection(timeWork, "Section 6: Trains and Boats")).toBe(
      "03_Mathematics/Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
    );
    expect(leafForSection(timeWork, "Section 11: Mixed Problems")).toBe("03_Mathematics/Part_01_Arithmetic");
  });

  it("derives difficulty from the section title", () => {
    expect(difficultyFor("Section 3: Challenging Problems")).toBe("HARD");
    expect(difficultyFor("Section 1: Basic Concepts")).toBe("EASY");
    expect(difficultyFor("Section 2: Moderately Difficult Questions")).toBe("HARD");
    expect(difficultyFor("Section 4: Final Practice")).toBe("MEDIUM");
  });

  it("cleans section titles down to a human subtopic", () => {
    expect(cleanSectionTitle("Section A: Percentages and Percentage Change (MCQs 1–30)")).toBe(
      "Percentages and Percentage Change",
    );
    expect(cleanSectionTitle("Subtopic 5: Circles (60-75)")).toBe("Circles");
    expect(cleanSectionTitle("MCQs 200–210: Sequences Review")).toBe("Sequences Review");
  });

  it("creates no topic outside the revised taxonomy", () => {
    // The 2026-10-22 revision removed the importer's own Part / leaf nodes, so
    // every target now lives in database/data/bb-taxonomy.json.
    expect(NEW_PARENTS).toEqual([]);
    expect(NEW_LEAVES).toEqual([]);
  });

  it("every leaf referenced by a file config exists in the revised taxonomy", () => {
    const declared = TAXONOMY_PATHS;
    const used = new Set<string>();
    for (const cfg of FILES as FileConfig[]) {
      for (const r of cfg.rules) used.add(r.leaf);
      used.add(cfg.fallbackLeaf);
    }
    const unknown = [...used].filter((p) => !declared.has(p));
    expect(unknown).toEqual([]);
  });
});
