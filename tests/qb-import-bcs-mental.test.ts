/**
 * tests/qb-import-bcs-mental.test.ts
 * ----------------------------------------------------------------------------
 * Parser + routing guarantees for the BCS Mental Ability import pipeline
 * (scripts/import-bcs-mental.ts):
 *   1. Bengali-numbered, Bengali-marker records parse with letter-resolved
 *      answers validated against the embedded answer text.
 *   2. Mismatched answer text, missing markers, or missing explanations
 *      are skipped — never force-fitted.
 *   3. Every file routes under 09_মানসিক_দক্ষতা (BCS only).
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { parseMentalFile, routeTopic, fileSlug, bnToNumber } from "../scripts/import-bcs-mental";

describe("bnToNumber", () => {
  it("converts Bengali numerals", () => {
    expect(bnToNumber("০১")).toBe(1);
    expect(bnToNumber("২০০")).toBe(200);
  });
});

describe("parseMentalFile", () => {
  it("parses a Bengali record and validates the embedded answer", () => {
    const r = parseMentalFile(
      "f.txt",
      "০৩. ৩, ৫, ৯, ১৭, ৩৩, ? পরবর্তী সংখ্যাটি কত? ক. ৬৫ খ. ৬৪ গ. ৬৩ ঘ. ৬৬ Ans. ক. ৬৫ ব্যাখ্যা: দ্বিগুণ বিয়োগ এক।",
    );
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ n: 3, answerLetter: "ক" });
    expect(r.records[0].options[0]).toBe("৬৫");
    expect(r.records[0].explanation).toContain("দ্বিগুণ");
  });

  it("rejects records whose answer text mismatches the letter", () => {
    const r = parseMentalFile(
      "f.txt",
      "০১. Q? ক. aaa খ. bbb গ. ccc ঘ. ddd Ans. খ. aaa ব্যাখ্যা: s",
    );
    expect(r.records).toHaveLength(0);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("rejects records missing the explanation", () => {
    const r = parseMentalFile(
      "f.txt",
      "০১. Q? ক. aaa খ. bbb গ. ccc ঘ. ddd Ans. ক. aaa",
    );
    expect(r.records).toHaveLength(0);
  });

  it("rejects records with shuffled-out-of-order markers", () => {
    const r = parseMentalFile(
      "f.txt",
      "০১. Q? ক. aaa গ. ccc খ. bbb ঘ. ddd Ans. ক. aaa ব্যাখ্যা: s",
    );
    expect(r.records).toHaveLength(0);
  });

  it("normalizes parenthetical remarks between answer and option", () => {
    // Option carries the remark, answer is bare: correctAnswer stays the
    // full displayed option text.
    const r = parseMentalFile(
      "f.txt",
      "৯৬. Q? ক. F (বা note) খ. E গ. G ঘ. H Ans. ক. F ব্যাখ্যা: s",
    );
    expect(r.skipped).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].options[0]).toBe("F (বা note)");
  });

  it("recovers typo-duplicated answer markers", () => {
    const r = parseMentalFile(
      "f.txt",
      "১৪৪. Q? ক. ৯০° খ. ১৮০° গ. ১২০° ঘ. ৬০° Ans. Kob. ৯০° Ans. ক. ৯০° ব্যাখ্যা: s",
    );
    expect(r.records).toHaveLength(1);
    expect(r.records[0].answerLetter).toBe("ক");
  });
});

describe("routeTopic", () => {
  it("routes every file under the BCS mental-ability tree", () => {
    for (const slug of ["verbal-reasoning", "numerical-ability", "problem-solving"]) {
      expect(routeTopic(slug)).toMatch(/^09_মানসিক_দক্ষতা\//);
    }
    expect(routeTopic("verbal-reasoning")).toContain("Verbal_Reasoning");
    expect(routeTopic("numerical-ability")).toContain("Numerical_Ability");
    expect(routeTopic("problem-solving")).toContain("Problem_Solving");
  });

  it("detects file slugs from real file names", () => {
    expect(fileSlug("Questions[ভাষাগত যৌক্তিক বিচার (Verbal Reasoning)].txt")).toBe("verbal-reasoning");
    expect(fileSlug("Questions[সংখ্যাগত ক্ষমতা (Numerical Ability)].txt")).toBe("numerical-ability");
    expect(fileSlug("Questions[সমস্যা সমাধান (Problem Solving)].txt")).toBe("problem-solving");
  });
});
