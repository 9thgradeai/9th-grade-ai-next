/**
 * tests/seed-shondhi.test.ts
 * ----------------------------------------------------------------------------
 * Parser guarantees for the সন্ধি import (scripts/seed-shondhi.ts):
 *   1. Full file parses: 303 rows (282 numbered + 21 sub-numbered).
 *   2. Every answer resolves to exactly one of its options.
 *   3. Sub-numbers (১৪৭.১), 5-option ঙ rows, bare letters, parenthetical
 *      notes and trailing-দাঁড়ি answers all resolve correctly.
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseShondhiFile,
  parseShondhiLine,
  resolveShondhiAnswer,
  stripShondhiNumber,
  parseCorrectedBlocks,
  toParsedWithOriginalExplanations,
} from "../scripts/seed-shondhi";

const FILE =
  "database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /সন্ধি/Questions(সন্ধি).txt";
const CORRECTED = "database/data/Corrected_MCQs(সন্ধি).txt";

function loadLines(): string[] {
  const raw = readFileSync(join(process.cwd(), FILE), "utf8").replace(/^\uFEFF/, "");
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

describe("parseShondhiFile (full corpus)", () => {
  it("parses all 303 rows with resolved answers and explanations", () => {
    const parsed = parseShondhiFile(loadLines());
    expect(parsed.length).toBe(303);
    for (const p of parsed) {
      expect(p.options.includes(p.correctAnswer)).toBe(true);
      expect(p.explanation.length).toBeGreaterThan(0);
      expect(p.question).not.toMatch(/^\s*[০-৯0-9]/);
    }
  });
});

describe("parseShondhiLine", () => {
  it("strips sub-numbers like ১৪৭.১", () => {
    expect(stripShondhiNumber("১৪৭.১. 'পদ্ধতি' শব্দের সঠিক সন্ধি বিচ্ছেদ কোনটি?")).toBe(
      "'পদ্ধতি' শব্দের সঠিক সন্ধি বিচ্ছেদ কোনটি?",
    );
  });

  it("parses a 5-option ঙ row", () => {
    const p = parseShondhiLine(
      "২৬. 'গতানুগতিক' এর সন্ধি বিচ্ছেদ কোনটি? ক. গত + আনুগতিক খ. গতা + অনুগতিক গ. গত + অনুগতিক ঘ. গতানু + গতিক ঙ. গতা + আনুগতিক Ans. গ ব্যাখ্যা: অ + অ = আ।",
    );
    expect(p).not.toBeNull();
    expect(p!.options).toHaveLength(5);
    expect(p!.correctAnswer).toBe("গত + অনুগতিক");
  });

  it("resolves bare-letter and trailing-দাঁড়ি answers", () => {
    expect(resolveShondhiAnswer("গ", ["মিলন", "বন্ধুত্ব", "বিচ্ছেদ", "সংযোগ"])).toBe("বিচ্ছেদ");
    expect(resolveShondhiAnswer("ক", ["মিলন", "বন্ধুত্ব", "বিচ্ছেদ", "সংযোগ"])).toBe("মিলন");
    expect(resolveShondhiAnswer("গ. ২ প্রকার।", ["৩ প্রকার", "৪ প্রকার", "২ প্রকার", "৭ প্রকার"])).toBe("২ প্রকার");
  });

  it("keeps bare-letter semantics for parenthetical notes", () => {
    const p = parseShondhiLine(
      "২৫৬. ‘আশ্চর্য’ এর সন্ধি বিচ্ছেদ - ক. অ + আচর্ খ. অতি + চর্য গ. আশ + চর্য ঘ. আ + চর্য Ans. ঘ (সঠিক উত্তর: আ + চর্য = আশ্চর্য) ব্যাখ্যা: নিপাতনে সিদ্ধ।",
    );
    expect(p).not.toBeNull();
    expect(p!.correctAnswer).toBe("আ + চর্য");
  });

  it("returns null for blank lines", () => {
    expect(parseShondhiLine("")).toBeNull();
    expect(parseShondhiLine("১০০. 'উচ্ছেদ'- শব্দটির সন্ধি বিচ্ছেদ কোনটি?")).toBeNull();
  });
});

describe("parseCorrectedBlocks", () => {
  const sample = [
    "১৭. 'অভীষ্ট' এর সন্ধি বিচ্ছেদ কি?",
    "Options: ক. অভি + ইষ্ট / খ. অভি + রিষ্ট / গ. অভী + ইষ্ট / ঘ. অভি + ঈষ্ট",
    "Key: ক. অভি + ইষ্ট",
    "",
    "১৮৯.৫. ক্-এর পর বর্গীয় ঘোষধ্বনি থাকলে ক্ স্থানে কী হয়?",
    "Options: ক. খ / খ. গ / গ. ঘ / ঘ. ঙ",
    "Key: খ. গ",
  ].join("\n");

  it("parses 3-line question/options/key blocks", () => {
    const blocks = parseCorrectedBlocks(sample);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].num).toBe("১৭.");
    expect(blocks[0].options).toEqual(["অভি + ইষ্ট", "অভি + রিষ্ট", "অভী + ইষ্ট", "অভি + ঈষ্ট"]);
    expect(blocks[1].question).toContain("ঘোষধ্বনি");
  });

  it("parses 4-line blocks where ব্যাখ্যা wins over the original", () => {
    const four = [
      "৯৭. 'অলংকার' শব্দের সঠিক সন্ধিজাত বিশ্লেষণ কোনটি?",
      "Options: ক. অলম্ + কার / খ. অলং + কার / গ. অ + লঙ্কার / ঘ. অলঙ্ক + কার",
      "Key: ক. অলম্ + কার",
      "ব্যাখ্যা: ম-এর পর ক থাকলে ম স্থানে অনুস্বার হয়।",
    ].join("\n");
    const blocks = parseCorrectedBlocks(four);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].explanation).toContain("অনুস্বার");
    const original = parseShondhiFile(loadLines());
    const withExpl = toParsedWithOriginalExplanations(blocks, original);
    // Block's own ব্যাখ্যা wins over the carried-over original.
    expect(withExpl[0].explanation).toContain("ম-এর পর ক থাকলে");
  });

  it("carries explanations over from the original file by question identity", () => {
    const blocks = parseCorrectedBlocks(sample);
    const original = parseShondhiFile(loadLines());
    const withExpl = toParsedWithOriginalExplanations(blocks, original);
    expect(withExpl).toHaveLength(2);
    // Exact question-text match in the original file → explanation attached.
    expect(withExpl[0].explanation.length).toBeGreaterThan(0);
    expect(withExpl[0].correctAnswer).toBe("অভি + ইষ্ট");
  });

  it("the full corrected file yields 77 blocks", () => {
    const raw = readFileSync(join(process.cwd(), CORRECTED), "utf8");
    expect(parseCorrectedBlocks(raw)).toHaveLength(77);
  });
});
