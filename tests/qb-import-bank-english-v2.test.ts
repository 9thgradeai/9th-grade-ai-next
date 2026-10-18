/**
 * tests/qb-import-bank-english-v2.test.ts
 * ----------------------------------------------------------------------------
 * Parser + topic-routing guarantees for the second Bank English import wave
 * (scripts/import-bank-english-v2.ts, database/data/Bank/English/
 * untitled folder/*.txt):
 *   1. Four-line records with separate Explanation lines.
 *   2. Combined `Correct Answer: … Explanation: …` lines.
 *   3. Multi-line stems (split sentences, blank sentences) rejoin correctly.
 *   4. Bare sub-headers refine routing instead of corrupting explanations.
 *   5. Every file slug routes under 02_English_Language_and_Literature.
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { parseEnFile, routeTopicEn, fileSlugEn, splitOptionsEn } from "../scripts/import-bank-english-v2";

describe("parseEnFile — standard records", () => {
  it("parses separate Correct Answer / Explanation lines", () => {
    const r = parseEnFile("f.txt", [
      "Section A: Subject–Verb Agreement (1–100)",
      "1. Each of the candidates _____ required to submit an application.",
      "A. are B. is C. were D. have been",
      "Correct Answer: B. is",
      "Explanation: Each is singular and takes a singular verb.",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ n: 1, answerLetter: "B" });
    expect(r.records[0].options).toEqual(["are", "is", "were", "have been"]);
    expect(r.records[0].explanation).toContain("singular");
  });

  it("splits combined Correct Answer + Explanation lines", () => {
    const r = parseEnFile("f.txt", [
      "Section A: Synonyms (Questions 1–50)",
      "1. Choose the synonym of “Abate.”",
      "A. Intensify B. Diminish C. Accelerate D. Accumulate",
      "Correct Answer: B. Diminish Explanation: Abate means to become less intense.",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].answerLetter).toBe("B");
    expect(r.records[0].explanation).toContain("less intense");
  });
});

describe("parseEnFile — multi-line stems and sub-headers", () => {
  it("rejoins split-sentence stems", () => {
    const r = parseEnFile("f.txt", [
      "Section 1: Subject–Verb Agreement and Sentence Structure (1–25)",
      "1. Identify the part of the sentence that contains an error.",
      "Each of the candidates / have submitted / the application form / before the deadline.",
      "A. Each of the candidates B. have submitted C. the application form D. before the deadline",
      "Correct Answer: B. have submitted",
      "Explanation: “Each” is singular.",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].question).toContain("Identify the part");
    expect(r.records[0].question).toContain("have submitted / the application");
  });

  it("keeps bare sub-headers as routing context, not explanation text", () => {
    const r = parseEnFile("f.txt", [
      "Section A: Subject–Verb Agreement (1–100)",
      "Basic rules and singular/plural subjects",
      "1. Each of the candidates _____ required.",
      "A. are B. is C. were D. have been",
      "Correct Answer: B. is",
      "Explanation: Each is singular.",
      "Compound subjects and special expressions",
      "2. The poet and philosopher _____ dead.",
      "A. are B. have C. is D. were",
      "Correct Answer: C. is",
      "Explanation: Same person, singular verb.",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(2);
    expect(r.records[0].subheader).toBe("Basic rules and singular/plural subjects");
    expect(r.records[1].subheader).toBe("Compound subjects and special expressions");
    expect(r.records[0].explanation).not.toContain("Compound subjects");
  });

  it("rejects unparseable option blocks", () => {
    expect(splitOptionsEn("A. only-one")).toBeNull();
    expect(splitOptionsEn("B. b C. c D. d")).toBeNull();
  });

  it("surfaces a 'No error.' verdict as option E", () => {
    const r = parseEnFile("f.txt", [
      "Section 3: Articles, Determiners, and Pronouns (51–70)",
      "51. Identify the error.",
      "He is / an honest officer / and a university graduate / of considerable experience.",
      "A. He is B. an honest officer C. and a university graduate D. of considerable experience",
      "Correct Answer: No error.",
      "Explanation: Both articles are correct.",
    ].join("\n"));
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].answerLetter).toBe("E");
    expect(r.records[0].options).toHaveLength(5);
    expect(r.records[0].options[4]).toBe("No error");
    expect(r.records[0].noErrorAdded).toBe(true);
  });
});

describe("routeTopicEn + fileSlugEn", () => {
  it("detects slugs from the real v2 file names", () => {
    expect(fileSlugEn("Questions( Idioms and Phrasal Verbs).txt")).toBe("idioms-phrasal-verbs");
    expect(fileSlugEn("Questions(Parts of Speech; Tense and Sequence of Tenses).txt")).toBe("pos-tense-sequence");
    expect(fileSlugEn("Questions(Prepositions).txt")).toBe("prepositions");
    expect(fileSlugEn("Questions(Sentence Correction and Error Detection ).txt")).toBe("sentence-correction-error-detection");
    expect(fileSlugEn("Questions(Spelling and Appropriate Words).txt")).toBe("spelling-appropriate-words");
    expect(fileSlugEn("Questions(Subject–Verb Agreement and Right Forms of Verbs).txt")).toBe("sva-right-forms");
    expect(fileSlugEn("Questions(Synonyms and Antonyms).txt")).toBe("synonyms-antonyms");
    expect(fileSlugEn("Questions(Vocabulary and Collocations).txt")).toBe("vocab-collocations");
  });

  it("routes every slug under 02_English_Language_and_Literature", () => {
    for (const s of ["idioms-phrasal-verbs", "pos-tense-sequence", "prepositions", "sentence-correction-error-detection", "spelling-appropriate-words", "sva-right-forms", "synonyms-antonyms", "vocab-collocations"]) {
      expect(routeTopicEn(s, "", "")).toMatch(/^02_English_Language_and_Literature\//);
    }
  });

  it("routes sections to the right leaves", () => {
    expect(routeTopicEn("idioms-phrasal-verbs", "Section B: Phrasal Verbs — Meaning and Usage", "")).toContain("Phrasal_Verb");
    expect(routeTopicEn("idioms-phrasal-verbs", "Section A: Idioms and Idiomatic Expressions", "")).toContain("Meanings_of_Idioms");
    expect(routeTopicEn("prepositions", "Section 1: Basic Prepositions", "")).toContain("Preposition");
    expect(routeTopicEn("spelling-appropriate-words", "Section A: Correct Spelling", "")).toContain("Spellings");
    expect(routeTopicEn("spelling-appropriate-words", "Section C: Appropriate Words in Context", "")).toContain("One-Word");
    expect(routeTopicEn("synonyms-antonyms", "Section C: Antonyms", "")).toContain("Synonyms_and_Antonyms");
    expect(routeTopicEn("sva-right-forms", "Section A: Subject–Verb Agreement", "")).toContain("Subject-Verb_Agreement");
    expect(routeTopicEn("sva-right-forms", "Section B: Right Forms of Verbs", "Modals, conditionals and subjunctive forms")).toContain("Tense_and_Structure_Errors");
    expect(routeTopicEn("sentence-correction-error-detection", "Section 7: Voice, Narration, Clauses, and Sentence Transformation", "")).toMatch(/Narration|Voice/);
    expect(routeTopicEn("vocab-collocations", "Section D: Collocations—Natural Word Combinations", "")).toContain("Words_Vocabulary");
  });

  it("routes mixed voice/narration stems per question, not per section", () => {
    const h = "Section 7: Voice, Narration, Clauses, and Sentence Transformation";
    expect(routeTopicEn("sentence-correction-error-detection", h, "", "Choose the correct passive form.")).toContain("Active_and_Passive_Voice");
    expect(routeTopicEn("sentence-correction-error-detection", h, "", "Choose the correct indirect speech form.")).toContain("Direct_and_Indirect_Narration");
    // The override is scoped: "passive" vocabulary elsewhere stays put.
    expect(routeTopicEn("vocab-collocations", "Section A", "", "Passive smoking is harmful.")).toContain("Words_Vocabulary");
  });
});
