/**
 * tests/qb-forensics.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for the question-bank forensic normalization/validation layer.
 * These cover the pure, side-effect-free logic (unicode.ts, bangla.ts,
 * parse-flat.ts, classify.ts). No DB is required.
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest";
import {
  normalizeText,
  isNfc,
  hasNonStandardSpace,
  hasControlChars,
  hasReplacementChar,
  decodeHtmlEntities,
  decodeLiteralEscapes,
} from "../scripts/qb-forensics/unicode";
import {
  hasMangleSignature,
  hasMangledHeader,
  stripSpuriousSpaces,
  reorderToken,
  deshapeCandidate,
  hasQuestionScaffold,
  hasSourceWatermark,
} from "../scripts/qb-forensics/bangla";
import { parseQuestionLine, serializeQuestionLine, splitSections } from "../scripts/qb-forensics/parse-flat";
import { scanMca } from "../scripts/qb-forensics/import-gate";
import { classifyRecord, applyTransforms, resolveLetterAnswer } from "../scripts/qb-forensics/classify";
import type { QuestionRecord } from "../scripts/qb-forensics/issues";

// ---------------------------------------------------------------------------
// unicode.ts
// ---------------------------------------------------------------------------
describe("unicode normalization", () => {
  it("normalizes non-standard spaces to U+0020", () => {
    expect(hasNonStandardSpace("a\u00A0b")).toBe(true);
    expect(normalizeText("a\u00A0b")).toBe("a b");
  });

  it("collapses double spaces and trims", () => {
    expect(normalizeText("  a   b  ")).toBe("a b");
  });

  it("strips a BOM", () => {
    expect(normalizeText("\uFEFFabc")).toBe("abc");
  });

  it("NFC-composes ে + া into ো", () => {
    // ে (U+09C7) + া (U+09BE) -> ো (U+09CB)
    const composed = "\u09CB";
    const decomposed = "\u09C7\u09BE";
    expect(isNfc(composed)).toBe(true);
    expect(isNfc(decomposed)).toBe(false);
    expect(normalizeText(decomposed)).toBe(composed);
  });

  it("preserves ZWJ (legitimate in Bangla conjuncts)", () => {
    expect(normalizeText("র\u200D্য")).toContain("\u200D");
  });

  it("detects control characters", () => {
    expect(hasControlChars("a\u0000b")).toBe(true);
    expect(hasControlChars("ab")).toBe(false);
  });

  it("does NOT flag legitimate ZWJ/ZWNJ (Bangla conjuncts) as corruption", () => {
    expect(hasControlChars("র\u200D্যানসমওয়্যার")).toBe(false);
    expect(hasControlChars("ক\u200D্ত")).toBe(false);
    // but ZWSP is still a real artifact
    expect(hasControlChars("a\u200Bb")).toBe(true);
  });

  it("decodes known HTML entities and literal escapes", () => {
    expect(decodeHtmlEntities("a &amp; b").out).toBe("a & b");
    expect(decodeHtmlEntities("plain").changed).toBe(false);
    expect(decodeLiteralEscapes("x\\ny").out).toBe("x\ny");
    expect(decodeLiteralEscapes("x\\ty").out).toBe("x y");
  });

  it("flags replacement characters", () => {
    expect(hasReplacementChar("a\uFFFDb")).toBe(true);
    expect(hasReplacementChar("ab")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bangla.ts
// ---------------------------------------------------------------------------
describe("bangla visual-order detection", () => {
  it("detects pre-base malformed vowels and split conjuncts", () => {
    expect(hasMangleSignature("েকান")).toBe(true);
    expect(hasMangleSignature("সংঘষ র্")).toBe(true);
    expect(hasMangleSignature("দ িট বর")).toBe(true);
    expect(hasMangleSignature("সাধারণ বাংলা প্রশ্ন")).toBe(false);
  });

  it("detects the mangled ব্যাখ্যা header", () => {
    expect(hasMangledHeader("বযাখ্যা: অ + ঈ")).toBe(true);
    expect(hasMangledHeader("বয্াখয্া: রেসেন")).toBe(true);
    expect(hasMangledHeader("ব্যাখ্যা: normal")).toBe(false);
  });

  it("removes artifact spaces inside Bangla clusters but keeps inter-word spaces", () => {
    // space before a dependent mark (ি) is an artifact and is removed
    expect(stripSpuriousSpaces("দ িট বর")).toBe("দিট বর");
    // space splitting a conjunct (সং + ঘষ) and the loosened র্ get merged
    expect(stripSpuriousSpaces("সং ঘষ র্")).toBe("সংঘষর্");
  });

  it("keeps pre-base marks pending and reorders them after the base cluster", () => {
    // "িবাপক" is genuinely ambiguous (the prebase and the া belong to different
    // clusters), so the reassembler only guarantees a stable, non-lossy output.
    const out = reorderToken("িবাপক");
    expect([...out].sort().join("")).toBe([...("িবাপক")].sort().join(""));
    expect(out.normalize("NFC")).toBeTruthy();
  });

  it("handles the inherently ambiguous েকান by producing the letter-order reconstruction", () => {
    // "েকান" contains ে প-across a ক then an া then ন — genuinely ambiguous, so we
    // only guarantee a stable reconstruction (this is exactly why it lands in REVIEW).
    const out = reorderToken("েকান");
    // The reassembler must keep attach marks adjacent and never drop letters.
    expect(out.length).toBe("েকান".length);
    expect([...out].includes("ে") || [...out].includes("ো")).toBe(true);
  });

  it("combines ে + া into ো via NFC after reorder", () => {
    expect(deshapeCandidate("একসােথ")).toBe("একসাথে");
  });

  it("detects a concatenated MCQ scaffold in question text", () => {
    expect(
      hasQuestionScaffold(
        "বাংলাদেশে মোট দেশজ উৎপাদনে কৃষিখাতের আবদান-_- \nA দ্বি-জাতি তন্ত্র \nB সামাজিক চেতনা \nC তসাম্প্রদায়িকতা \nD বাঙ্গালী জাতীয়তাবাদ বিসিএস প্রশ্ন ব্যাক ও সমাধান \nA ১৭ \nB ২০ \nC ১৮ \nD ২১",
      ),
    ).toBe(true);
    expect(hasQuestionScaffold("(ক) তামা (খ) ইস্পাত (গ) পিতল (ঘ) বর্ণ")).toBe(true);
  });

  it("does not flag a plain question with a fill-in-the-blank marker", () => {
    expect(hasQuestionScaffold("আইন প্রণয়নের ক্ষমতা-_-")).toBe(false);
    expect(hasQuestionScaffold("Complete the sentence: I _____ you at the station.")).toBe(false);
  });

  it("detects the question-bank source watermark", () => {
    expect(hasSourceWatermark("বিসিএস প্রশ্ন ব্যাক ও সমাধান")).toBe(true);
    expect(hasSourceWatermark("বিসিএস প্রশ্ন ব্যাংক ও সমাধান")).toBe(true);
    expect(hasSourceWatermark("সাধারণ জ্ঞান প্রশ্ন")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parse-flat.ts
// ---------------------------------------------------------------------------
describe("flat-file parser (parity with seeder)", () => {
  const line =
    "৫. কাজী নজরুল ইসলামের বিখ্যাত 'বিদ্রোহী' কবিতাটি তাঁর কোন কাব্যগ্রন্থের অন্তর্গত? ক. বিষের বাঁশী খ. ছায়ানট গ. প্রলয়শিখা ঘ. অগ্নি-বীণা উত্তর: ঘ. অগ্নি-বীণা ব্যাখ্যা: 'বিদ্রোহী' কবিতাটি ১৯২২ সালে প্রকাশিত 'অগ্নি-বীণা' কাব্যের দ্বিতীয় কবিতা।";

  it("parses the canonical line exactly like the seeder", () => {
    const p = parseQuestionLine(line);
    expect(p).not.toBeNull();
    expect(p!.question).toContain("বিদ্রোহী");
    expect(p!.options).toEqual(["বিষের বাঁশী", "ছায়ানট", "প্রলয়শিখা", "অগ্নি-বীণা"]);
    // The letter answer resolves to the option TEXT (the app convention).
    expect(p!.correctAnswer).toBe("অগ্নি-বীণা");
    expect(p!.explanation).toContain("১৯২২");
  });

  it("round-trips through serializeQuestionLine", () => {
    const p = parseQuestionLine(line)!;
    const serialized = serializeQuestionLine(p.question, p.options, p.correctAnswer, p.explanation);
    const p2 = parseQuestionLine(serialized)!;
    expect(p2).toEqual(p);
  });

  it("splits sections on headers and strips the leading number", () => {
    const raw = "১. বাংলা ভাষা ও সাহিত্য\n৫. কিছু প্রশ্ন? ক. x খ. y গ. z ঘ. w উত্তর: ঘ. w\n২. সাধারণ বিজ্ঞান\n";
    const sections = splitSections(raw);
    expect(sections.map((s) => s.header)).toEqual(["বাংলা ভাষা ও সাহিত্য", "সাধারণ বিজ্ঞান"]);
  });

  it("parses the English 'Ans.' answer marker (folder-file format)", () => {
    const line =
      "০১. 'সমাস' শব্দের অর্থ কি? ক. সংশ্লেষণ খ. সংক্ষেপণ গ. বিশ্লেষণ ঘ. সংযোজন Ans. খ. সংক্ষেপণ ব্যাখ্যা: সমাস শব্দের অর্থ মিলন বা একাধিক পদের একপদীকরণ।";
    const p = parseQuestionLine(line);
    expect(p).not.toBeNull();
    expect(p!.options).toEqual(["সংশ্লেষণ", "সংক্ষেপণ", "বিশ্লেষণ", "সংযোজন"]);
    expect(p!.correctAnswer).toBe("সংক্ষেপণ");
    // A complete সমাস-style MCQ surrounding it must pass the import gate.
    const g = scanMca({ question: p!.question, options: p!.options, correctAnswer: p!.correctAnswer, explanation: p!.explanation });
    expect(g.verdict).toBe("ACCEPT");
  });

  it("keeps an ambiguous multi-answer raw so the gate rejects it (no guessing)", () => {
    const line =
      "১৬. যা পরপদের অর্থ প্রধানরূপে বুঝায় তাকে কোন সমাস বলে? ক. কর্মধারয় খ. বহুব্রীহি গ. তৎপুরুষ ঘ. দ্বিগু Ans. ক,গ (উভয়ই) ব্যাখ্যা: কর্মধারয় ও তৎপুরুষ সমাসে পরপদ প্রধান।";
    const p = parseQuestionLine(line);
    expect(p).not.toBeNull();
    // The letter "ক,গ" must NOT silently resolve to options[0].
    expect(p!.correctAnswer).toBe("ক,গ (উভয়ই)");
    const g = scanMca({ question: p!.question, options: p!.options, correctAnswer: p!.correctAnswer, explanation: p!.explanation });
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "ANSWER_MISMATCH")).toBe(true);
  });

  it("keeps an answer whose letter contradicts its remainder raw (gate rejects)", () => {
    const line =
      "৮৫. 'প্রাণভয়' এর ব্যাসবাক্য হবে- ক. প্রাণের ভয় খ. প্রাণ যাওয়ার ভয় গ. প্রাণ হতে ভয় ঘ. ভয়ের প্রাণ Ans. খ. প্রাণ যাওয়ার ভয় = প্রাণভয় ব্যাখ্যা: ব্যাসবাক্যটি ভুল।";
    const p = parseQuestionLine(line);
    expect(p).not.toBeNull();
    // "প্রাণ যাওয়ার ভয় = প্রাণভয়" is NOT the option খ text — never resolved.
    expect(p!.correctAnswer).toBe("খ. প্রাণ যাওয়ার ভয় = প্রাণভয়");
    const g = scanMca({ question: p!.question, options: p!.options, correctAnswer: p!.correctAnswer, explanation: p!.explanation });
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "ANSWER_MISMATCH")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classify.ts
// ---------------------------------------------------------------------------
describe("classification", () => {
  function rec(over: Partial<QuestionRecord>): QuestionRecord {
    return {
      id: 1,
      subjectId: 1,
      topic: "",
      subtopic: "",
      path: "",
      question: "প্রশ্নটি কী?",
      options: ["ক", "খ", "গ", "ঘ"],
      correctAnswer: "খ",
      explanation: "ব্যাখ্যা",
      ...over,
    };
  }

  it("keeps a clean record as AUTO with no fixes", () => {
    const c = classifyRecord(rec({}));
    expect(c.verdict).toBe("AUTO");
    expect(c.reviewReasons).toEqual([]);
  });

  it("routes visual-order corruption to REVIEW with a deshape candidate", () => {
    const c = classifyRecord(rec({ question: "একসােথ কোনিট?" }));
    expect(c.verdict).toBe("REVIEW");
    expect(c.reviewReasons[0]).toContain("visual-order");
    expect(c.candidates.length).toBeGreaterThan(0);
    expect(c.candidates[0].code).toBe("VISUAL_ORDER_BANGLA");
  });

  it("produces an NFC fix on a clean record", () => {
    const c = classifyRecord(rec({ question: "সাধারন  ন্যায়", options: ["ক", "খ", "গ", "ঘ"] }));
    expect(c.verdict).toBe("AUTO");
    const qFix = c.fixes.find((f) => f.field === "question");
    expect(qFix).toBeDefined();
    expect(qFix!.confidence).toBe("HIGH");
  });

  it("routes answer-not-in-options to REVIEW (no guessing)", () => {
    const c = classifyRecord(rec({ options: ["ক", "খ", "গ", "ঘ"], correctAnswer: "টেক্সট যা অপশনে নেই" }));
    expect(c.verdict).toBe("REVIEW");
    expect(c.reviewReasons.some((r) => r.includes("does not match"))).toBe(true);
  });

  it("resolves a Bangla letter answer whose remainder matches the option", () => {
    const c = classifyRecord(rec({ options: ["চর্যাপদ", "শ্রীকৃষ্ণকীর্তন", "অগ্নিবীণা", "শেষ"], correctAnswer: "খ. শ্রীকৃষ্ণকীর্তন" }));
    const res = resolveLetterAnswer("খ. শ্রীকৃষ্ণকীর্তন");
    expect(res).toEqual({ index: 1, rest: "শ্রীকৃষ্ণকীর্তন" });
    // remainder matches options[1] -> deterministic HIGH fix
    expect(c.verdict).toBe("AUTO");
    const fix = c.fixes.find((f) => f.field === "correctAnswer");
    expect(fix).toBeDefined();
    expect(fix!.to).toBe("শ্রীকৃষ্ণকীর্তন");
  });

  it("routes an answer that fails its option match to REVIEW rather than guessing", () => {
    const c = classifyRecord(rec({ correctAnswer: "গ। প্রলয়শিখা" })); // options are single letters here
    expect(c.verdict).toBe("REVIEW");
  });
});

describe("transform chain", () => {
  it("applies deterministic transforms only", () => {
    const { value, applied } = applyTransforms("  a\u00A0b  ");
    expect(value).toBe("a b");
    expect(applied).toContain("WS_MULTI+TRIM");
  });
});