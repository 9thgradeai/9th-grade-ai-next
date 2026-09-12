/**
 * tests/qb-import-gate.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for the question-bank IMPORT GATE and the cleanup plan builder.
 *
 * The gate (scripts/qb-forensics/import-gate.ts) is the single source of truth
 * for "may this MCQ enter the database?" — it is used by the subject-wise
 * seeder, the BCS importer, and the one-time cleanup sweep. Everything here is
 * pure and side-effect free; no DB required.
 * ----------------------------------------------------------------------------
 */

import { describe, it, expect } from "vitest";
import { scanMca, normalizeField, mcaSignature, dupSignature, type McaInput } from "../scripts/qb-forensics/import-gate";
import { buildRemovalPlan, type ScanRow } from "../scripts/clean-broken-questions";

function clean(over: Partial<McaInput> = {}): McaInput {
  return {
    question: "প্রশ্নটির সঠিক উত্তর কোনটি?",
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer: "খ",
    explanation: "কারণ ABC.",
    ...over,
  };
}

function row(id: number, over: Partial<ScanRow> = {}): ScanRow {
  return {
    id,
    question: "প্রশ্নটির সঠিক উত্তর কোনটি?",
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer: "খ",
    explanation: "কারণ ABC.",
    subjectName: "বাংলা ভাষা ও সাহিত্য",
    topic: "ভাষা",
    subtopic: "ব্যাকরণ",
    path: "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/ব্যাকরণ",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// scanMca — fatal Unicode gate
// ---------------------------------------------------------------------------
describe("import gate: Unicode corruption is fatal", () => {
  it("rejects visual-order / cluster-split Bangla (the known corpus corruption)", () => {
    const g = scanMca(clean({ question: "বাংলােদেশর েকান িবভােগ জনসংখয্ার ঘনত্ব?" }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "VISUAL_ORDER_BANGLA")).toBe(true);
  });

  it("rejects a Unicode replacement character anywhere", () => {
    const g = scanMca(clean({ correctAnswer: "ক\uFFFD" }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "REPLACEMENT_CHAR")).toBe(true);
  });

  it("rejects mojibake (double-encoded UTF-8)", () => {
    const g = scanMca(clean({ question: "What is cafÃ© culture?" }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "MOJIBAKE" || i.code === "DOUBLE_ENCODING")).toBe(true);
  });

  it("rejects control / invisible characters (but tolerates legit ZWJ)", () => {
    expect(scanMca(clean({ explanation: "a\u0000b" })).verdict).toBe("REJECT");
    expect(scanMca(clean({ question: "a\u200Bb" })).verdict).toBe("REJECT");
    // ZWJ in a Bangla conjunct is legitimate — never flagged by CONTROL_CHAR.
    const g = scanMca(clean({ explanation: "র\u200D্যাকিট ফলাফল" }));
    expect(g.fatal.some((i) => i.code === "CONTROL_CHAR")).toBe(false);
    expect(g.verdict).toBe("ACCEPT");
  });

  it("rejects option-markers leaking into an option (scaffold bleed)", () => {
    const g = scanMca(clean({ options: ["(ক) অবৈধ", "খ", "গ", "ঘ"] }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "OPTION_MARKER_LEAK")).toBe(true);
  });

  it("rejects a concatenated MCQ scaffold welded into the question (option lines + watermark)", () => {
    const g = scanMca(
      clean({
        question:
          "বাংলাদেশে মোট দেশজ উৎপাদনে কৃষিখাতের আবদান-_- \nA দ্বি-জাতি তন্ত্র \nB সামাজিক চেতনা \nC তসাম্প্রদায়িকতা \nD বাঙ্গালী জাতীয়তাবাদ বিসিএস প্রশ্ন ব্যাক ও সমাধান \nA ১৭ \nB ২০ \nC ১৮ \nD ২১",
      }),
    );
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "QUESTION_SCAFFOLD")).toBe(true);
  });

  it("rejects question text that itself carries the (ক)(খ) option markers", () => {
    const g = scanMca(clean({ question: "(ক) তামা (খ) ইস্পাত (গ) পিতল (ঘ) বর্ণ" }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "QUESTION_SCAFFOLD")).toBe(true);
  });

  it("rejects two options holding the same value (unanswerable MCQ)", () => {
    const g = scanMca(
      clean({
        question: "বিশ্ব স্বাস্থ্য সংস্থা পোলিও টিকাদান কর্মসূচি কত সালে গ্রহণ করে?",
        options: ["১৯৭৮", "১৯৭৫", "১৯৭৮", "১৯৮৮"],
        correctAnswer: "১৯৭৮",
      }),
    );
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "DUPLICATE_OPTION")).toBe(true);
  });

  it("does NOT flag near-duplicate but distinct options", () => {
    const g = scanMca(clean({ options: ["বাংলা", "বাংলাদেশ", "বাঙালি", "বংগ"], correctAnswer: "বাংলাদেশ" }));
    expect(g.verdict).toBe("ACCEPT");
    expect(g.fatal.some((i) => i.code === "DUPLICATE_OPTION")).toBe(false);
  });

  it("rejects an explanation that carries another question's scaffold (option markers)", () => {
    const g = scanMca(
      clean({
        question: "কোন কবি 'মজলুম আদিব' ছদ্মনামে কবিতা লিখতেন?",
        explanation: "২৪.'বেতার, বিপত্বীক'-শব্দ দুটি কোন সমাসের উদাহরণ? (ক) নঞ তৎপুরুষ (খ) কর্মধারয় (গ) দ্বন্দ্ব (ঘ) তৎপুরুষ",
      }),
    );
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "EXPLANATION_SCAFFOLD")).toBe(true);
  });

  it("rejects a question that begins with a stray ব্যাখ্যা: header (scaffold shift)", () => {
    const g = scanMca(clean({ question: "ব্যাখ্যা: তারাশন্কর বন্দ্যোপাধ্যায়ের 'কবি' উপন্যাসে বেদে ও ডোম..." }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "QUESTION_HEADER_LEAK")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scanMca — structural gate
// ---------------------------------------------------------------------------
describe("import gate: structure and explanation policy", () => {
  it("rejects empty question / answer / option", () => {
    expect(scanMca(clean({ question: "" })).verdict).toBe("REJECT");
    expect(scanMca(clean({ correctAnswer: "" })).verdict).toBe("REJECT");
    expect(scanMca(clean({ options: ["ক", "", "গ", "ঘ"] })).verdict).toBe("REJECT");
  });

  it("rejects fewer than 4 options", () => {
    expect(scanMca(clean({ options: ["ক", "খ"] })).verdict).toBe("REJECT");
  });

  it("rejects an answer that matches no option (never guesses)", () => {
    const g = scanMca(clean({ options: ["প্রতাচ্য", "প্রাচ্যহান", "আপ্রাচ্য", "নবান"], correctAnswer: "প্রতীচ্য" }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "ANSWER_MISMATCH")).toBe(true);
  });

  it("accepts a letter-answer whose remainder equals its option", () => {
    const g = scanMca(clean({ options: ["চর্যাপদ", "শ্রীকৃষ্ণকীর্তন", "অগ্নিবীণা", "শেষ"], correctAnswer: "খ. শ্রীকৃষ্ণকীর্তন" }));
    expect(g.verdict).toBe("ACCEPT");
  });

  it("rejects an empty explanation (mandatory-explanation policy)", () => {
    const g = scanMca(clean({ explanation: "" }));
    expect(g.verdict).toBe("REJECT");
    expect(g.fatal.some((i) => i.code === "EMPTY_EXPLANATION")).toBe(true);
  });

  it("accepts a fully clean MCQ", () => {
    const g = scanMca(clean());
    expect(g.verdict).toBe("ACCEPT");
    expect(g.fatal).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// scanMca — non-fatal normalization
// ---------------------------------------------------------------------------
describe("import gate: non-fatal issues are auto-normalized", () => {
  it("composes decomposed Bangla (NFC) and strips BOM / non-standard spaces", () => {
    const g = scanMca(clean({ question: "\uFEFFসাধারন\u00A0ন্যায়\u09C7\u09BE" }));
    expect(g.verdict).toBe("ACCEPT");
    // ে + া compose to ো via NFC; NBSP -> space; BOM removed.
    expect(g.normalized.question).toBe("সাধারন ন্যায়ো");
    expect(g.issues.some((i) => i.code === "NON_NFC")).toBe(true);
    expect(g.issues.some((i) => i.code === "NON_STANDARD_SPACE")).toBe(true);
  });

  it("keeps zero-width joiners intact through normalization", () => {
    expect(normalizeField("র\u200D্যাকিট")).toBe("র\u200D্যাকিট");
  });
});

// ---------------------------------------------------------------------------
// dupSignature / mcaSignature — global duplicate identity
// ---------------------------------------------------------------------------
describe("duplicate identity signature", () => {
  it("collapses Unicode composition, whitespace, case and punctuation", () => {
    // Decomposed "নো" (ন + ে + া) vs composed "নো".
    expect(dupSignature("নো", "উত্তর", "ব্যাখ্যা")).toBe(dupSignature("নো", "উত্তর", "ব্যাখ্যা"));
    // Extra/odd whitespace, case, punctuation are irrelevant to identity.
    expect(dupSignature("English  ,question", "A", "B")).toBe(dupSignature("english question", "A", "B"));
  });

  it("produces the same signature for a full record", () => {
    expect(mcaSignature(clean())).toBe(dupSignature("প্রশ্নটির সঠিক উত্তর কোনটি?", "খ", "কারণ ABC."));
  });
});

// ---------------------------------------------------------------------------
// buildRemovalPlan — the cleanup decision engine (pure)
// ---------------------------------------------------------------------------
describe("cleanup plan builder", () => {
  it("classifies every row and keeps the oldest duplicate", () => {
    const plan = buildRemovalPlan([
      row(1), // clean -> kept
      row(2, { question: "েকান িবভােগ জনসংখয্া সবেচেয় কম?" }), // corruption
      row(3, { options: ["ক", "খ"] }), // <4 options
      row(4, { explanation: "" }), // empty explanation
      row(5, { question: "একই প্রশ্ন?" }), // duplicate group A (kept)
      row(6, { question: "একই প্রশ্ন?" }), // duplicate group A (removed)
      row(7, { question: "একই   প্রশ্ন?" }), // same identity, whitespace-variant (removed)
      row(8, { question: "একই প্রশ্ন?", correctAnswer: "ঘ" }), // different answer -> NOT a dup
    ]);

    expect(plan.scanned).toBe(8);
    expect(new Set(plan.removedIds)).toEqual(new Set([2, 3, 4, 6, 7]));
    expect(new Set(plan.keptIds)).toEqual(new Set([1, 5, 8]));
    expect(plan.byReason.UNICODE_CORRUPTION).toBe(1);
    expect(plan.byReason.STRUCTURAL_BROKEN).toBe(1);
    expect(plan.byReason.EMPTY_EXPLANATION).toBe(1);
    expect(plan.byReason.DUPLICATE).toBe(2);
  });

  it("groups removed rows by subject", () => {
    const plan = buildRemovalPlan([
      row(1, { subjectName: "বাংলা ভাষা ও সাহিত্য", question: "েকান?" }),
      row(2, { subjectName: "বাংলাদেশ বিষয়াবলি", question: "ােটান?" }),
    ]);
    expect(plan.bySubject["বাংলা ভাষা ও সাহিত্য"]).toBe(1);
    expect(plan.bySubject["বাংলাদেশ বিষয়াবলি"]).toBe(1);
  });

  it("removes duplicate-option and question-scaffold rows without touching clean rows", () => {
    const plan = buildRemovalPlan([
      row(1), // clean -> kept
      row(2, { options: ["১৯৭৮", "১৯৭৫", "১৯৭৮", "১৯৮৮"] }), // duplicate option
      row(3, { question: "(ক) তামা (খ) ইস্পাত (গ) পিতল (ঘ) বর্ণ" }), // scaffold in question
    ]);
    expect(new Set(plan.removedIds)).toEqual(new Set([2, 3]));
    expect(new Set(plan.keptIds)).toEqual(new Set([1]));
    expect(plan.byReason.STRUCTURAL_BROKEN).toBe(1); // duplicate option
    expect(plan.byReason.UNICODE_CORRUPTION).toBe(1); // scaffold in question
  });

  it("removes a known semantically-scrambled row by exact identity signature", () => {
    const plan = buildRemovalPlan([
      row(1),
      row(2, {
        question: "বাংলাদেশে মোট দেশজ উৎপাদনে কৃষিখাতের আবদান-_-",
        options: ["দ্বি-জাতি তন্ত্র", "সামাজিক চেতনা", "তসাম্প্রদায়িকতা", "বাঙ্গালী জাতীয়তাবাদ"],
        correctAnswer: "বাঙ্গালী জাতীয়তাবাদ",
        explanation:
          "ভাষা আন্দোলন ছিল মুলত বাঙালি জাতির আত্মপরিচয় ওসাংস্কৃতিক স্বাতন্ত্য রক্ষার সংগ্রাম, যা বাঙালি জাতীয়তাবাদের উন্মেষে সবচেয়ে গুরুত্বপূর্ণ ভুমিকা পালন করে।",
        subjectName: "বাংলাদেশ বিষয়াবলি",
      }),
    ]);
    expect(new Set(plan.removedIds)).toEqual(new Set([2]));
    expect(new Set(plan.keptIds)).toEqual(new Set([1]));
    expect(plan.byReason.STRUCTURAL_BROKEN).toBe(1);
    expect(plan.removed[0].code).toBe("SCRAMBLED_CONTENT");
  });
});