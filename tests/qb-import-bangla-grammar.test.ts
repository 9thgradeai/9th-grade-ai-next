import { describe, it, expect } from "vitest";
import { parseLine } from "../scripts/import-bangla-grammar";

describe("parseLine (bangla grammar single-line records)", () => {
  it("parses a standard 4-option record with Ans. + ব্যাখ্যা:", () => {
    const p = parseLine(
      "০২. 'কূজন' শব্দের অর্থ কি? ক. খারাপ লোক খ. পাখির ডাক গ. ছোট লোক ঘ. ইতর বিশেষ Ans. খ. পাখির ডাক ব্যাখ্যা: 'কূজন' শব্দের অর্থ হলো পাখির কলতান।",
    );
    expect(p).not.toBeNull();
    expect("skip" in (p as object)).toBe(false);
    const q = p as { question: string; options: string[]; correctAnswer: string; explanation: string };
    expect(q.question).toBe("'কূজন' শব্দের অর্থ কি?");
    expect(q.options).toEqual(["খারাপ লোক", "পাখির ডাক", "ছোট লোক", "ইতর বিশেষ"]);
    expect(q.correctAnswer).toBe("পাখির ডাক");
    expect(q.explanation).toContain("পাখির কলতান");
  });

  it("keeps a 5th ঙ option and resolves ঘ/ঙ letters", () => {
    const p = parseLine(
      "০৫. 'বৃংহতি' হল : ক. ভেড়ার ডাক খ. সিংহের ডাক গ. ঘোড়ার ডাক ঘ. হস্তির ডাক ঙ. কোনোটিই নয় Ans. ঘ. হস্তির ডাক ব্যাখ্যা: হস্তীর ডাক।",
    ) as { options: string[]; correctAnswer: string };
    expect(p.options).toHaveLength(5);
    expect(p.correctAnswer).toBe("হস্তির ডাক");
  });

  it("strips a source-note parenthetical from the answer remainder", () => {
    const p = parseLine(
      "১৯৭. 'সংহত' এর বিপরীতার্থক শব্দ কোনটি? ক. বিবৃত খ. বিতত গ. অসংযত ঘ. অসংহত Ans. খ. বিতত (নোটের উত্তরমালা অনুযায়ী)। ব্যাখ্যা: কিছু ব্যাখ্যা।",
    ) as { correctAnswer: string };
    expect(p.correctAnswer).toBe("বিতত");
  });

  it("ignores a ) marker inside option-text parentheses (কর্তৃক)", () => {
    const p = parseLine(
      "১৬. কর্মবাচ্যের কর্তায় কোন বিভক্তি যুক্ত হয়? ক. দ্বিতীয়া খ. তৃতীয়া (দ্বারা, দিয়া, কর্তৃক) গ. পঞ্চমী ঘ. সপ্তমী Ans. খ. তৃতীয়া (দ্বারা, দিয়া, কর্তৃক) ব্যাখ্যা: কিছু ব্যাখ্যা।",
    ) as { options: string[]; correctAnswer: string };
    expect(p.options).toHaveLength(4);
    expect(p.options[1]).toBe("তৃতীয়া (দ্বারা, দিয়া, কর্তৃক)");
    expect(p.correctAnswer).toBe("তৃতীয়া (দ্বারা, দিয়া, কর্তৃক)");
  });

  it("skips parenthesised answers that match no option (never fabricates)", () => {
    const p = parseLine(
      "১৯. 'অপাঙ্ক্তেয়'-এর বিপরীতার্থক শব্দ কোনটি? ক. অতুলনীয় খ. ঘরোয়া গ. সামাজিক ঘ. পঙ্ক্তিহীন Ans. (সঠিক উত্তর: পাঙ্ক্তেয়) ব্যাখ্যা: কিছু ব্যাখ্যা।",
    );
    expect(p).not.toBeNull();
    expect("skip" in (p as object)).toBe(true);
  });

  it("skips records whose answer letter points at a different option", () => {
    const p = parseLine(
      "০১. প্রশ্ন? ক. এক খ. দুই গ. তিন ঘ. চার Ans. ক. দুই ব্যাখ্যা: ব্যাখ্যা।",
    );
    expect(p).not.toBeNull();
    expect("skip" in (p as object)).toBe(true);
  });
});
