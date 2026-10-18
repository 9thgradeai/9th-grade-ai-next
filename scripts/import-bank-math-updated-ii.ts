/**
 * scripts/import-bank-math-updated-ii.ts
 * ---------------------------------------------------------------------------
 * Imports the eight `database/data/Bank/Math/updated/updated-II/*.docx` MCQ
 * files into the BANGLADESH_BANK "03_Mathematics" subject (the Math tree the
 * dashboard shows under the Bank ecosystem).
 *
 * Content policy (per project decision): the documents are already Unicode
 * optimised, so question / options / answer / explanation are stored VERBATIM.
 * Every row is written with `rawMath = true` so `backend/services/content.ts`
 * skips `normalizeFieldForDisplay` and the dashboard renders the book's own
 * glyphs (²³⁄½ ৳ ⇒ …), exactly like `import-bank-math-raw-unicode.ts` does.
 *
 * Source extraction
 * -----------------
 * Five of the eight files embed real Office Math (<m:oMath> ≈ 5,500 objects),
 * which plain <w:t> extraction silently drops. Every file is therefore
 * linearised through the already-verified `scripts/docx-math-to-text.py`
 * (fractions → (a)/(b), scripts → superscript/subscript Unicode glyphs). The
 * tool's output IS the document's Unicode — nothing is rewritten afterwards
 * beyond NFC canonicalisation.
 *
 * Taxonomy — SECTION-LEVEL mapping (per project decision)
 * -------------------------------------------------------
 * Each file carries 7–17 internal section headers. Every section maps to a
 * taxonomy leaf: existing Bank-Math leaves are reused where the section name
 * matches (Percentages, Profit_Loss…, AP/GP, Probability, Sets… — several of
 * which were EMPTY before), and 19 new leaves (plus one new Part node,
 * `Part_06_Time_Work_and_Speed`) are created as upsert-only data — the
 * taxonomy seeder never deletes (same approach as import-bank-ict-v2.ts).
 * Each question keeps its exact section title in `subtopic`.
 *
 * Errata — the documents' own corrections are APPLIED (per project decision)
 * -------------------------------------------------------------------------
 * The files carry ~150 embedded authoring errata, all handled deterministically:
 *   • block entries   "Q63: C. 45." / "Q104: 20 litres; replace option C with …"
 *                     / "Q8: Correct answer is B. 1/3." (collected in a pre-pass)
 *   • in-record notes "Correction to the options: The correct answer is D. 10 days."
 *                     / "Correction: The correct option is C. ৳9,840."
 *   • self-correction  "The correct letter is C, not B." inside an explanation
 *   • items the documents themselves declare unanswerable
 *     ("none of the options matches", "not counted as a valid MCQ", …) are
 *     SKIPPED — rescued first if the stated value actually is one of the options.
 *   • duplicate question numbers (draft / "(Replacement)" / redraft variants)
 *     resolve to the FIRST complete, non-flagged candidate in document order.
 *   • missing stems (the source dropped Q80's stem) → skipped + reported.
 * Every applied fix, rescue, skip and missing number lands in the report.
 *
 * Identity & idempotency
 * ----------------------
 *   sourceKey = `bankmath2:<file-slug>:<printed-number>` (readable, unique per
 *   subject). Re-runs reconcile per file: key match → update in place (row ids
 *   stay stable), new key → insert, key no longer produced → delete. Only rows
 *   inside this import's own namespace are ever touched.
 *
 * Run:
 *   npx tsx scripts/import-bank-math-updated-ii.ts               # dry run
 *   npx tsx scripts/import-bank-math-updated-ii.ts --apply       # write
 *   npx tsx scripts/import-bank-math-updated-ii.ts --apply --slug=arithmetic
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// ── constants ────────────────────────────────────────────────────────────────

const DATA_DIR = join("database", "data", "Bank", "Math", "updated", "updated-II");
const CONVERTER = join(process.cwd(), "scripts", "docx-math-to-text.py");
const ECOSYSTEM_CODE = "BANGLADESH_BANK";
const SUBJECT_NAMEBN = "03_Mathematics";
/** sourceKey namespace — readable so re-runs can reconcile per file. */
const KEY_NS = "bankmath2";
const EXPECTED_PER_FILE = 300; // every document numbers its MCQs 1–300

export const P1 = "03_Mathematics/Part_01_Arithmetic";
export const P2 = "03_Mathematics/Part_02_Algebra";
export const P3 = "03_Mathematics/Part_03_Sequences_and_Series";
export const P4 = "03_Mathematics/Part_04_Geometry_and_Mensuration";
export const P5 = "03_Mathematics/Part_05_Statistics_and_Probability";
export const P6 = "03_Mathematics/Part_06_Time_Work_and_Speed";

// ── config types ─────────────────────────────────────────────────────────────

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type SectionRule = { re: RegExp; leaf: string };

export type FileConfig = {
  /** sourceKey namespace segment, e.g. `bankmath2:arithmetic:17` */
  slug: string;
  /** .docx filename inside DATA_DIR */
  file: string;
  /** ordered section-title → leaf rules; first match wins */
  rules: SectionRule[];
  /** leaf when no rule matches (defensive — should never hit) */
  fallbackLeaf: string;
};

export const FILES: FileConfig[] = [
  {
    slug: "arithmetic",
    file: "Questions(Arithmetic).docx",
    rules: [
      { re: /Percentages and Percentage Change/, leaf: `${P1}/Percentages` },
      { re: /Profit, Loss and Discount/, leaf: `${P1}/Profit_Loss_and_Discount` },
      { re: /Simple and Compound Interest/, leaf: `${P1}/Simple_and_Compound_Interest` },
      { re: /Ratio, Proportion and Variation/, leaf: `${P1}/Ratios_Proportions_and_Mixtures` },
      { re: /Mixtures and Alligation/, leaf: `${P1}/Ratios_Proportions_and_Mixtures` },
      { re: /Average and Weighted Average/, leaf: `${P1}/Averages_and_Weighted_Average` },
      { re: /Income, Expenditure and Savings/, leaf: `${P1}/Income_Expenditure_and_Savings` },
      { re: /Age Problems/, leaf: `${P1}/Age_Problems` },
      { re: /Fractions, Decimals and Proportional Comparisons/, leaf: `${P1}/Fractions_Decimals_and_Proportional_Comparisons` },
    ],
    fallbackLeaf: `${P1}/Comprehensive_Arithmetic`,
  },
  {
    slug: "number-system",
    file: "Questions(Number System and Number Theory).docx",
    rules: [
      { re: /HCF and LCM|HCF, LCM, Factors/, leaf: `${P1}/LCM_and_HCF` },
      { re: /Fractions/, leaf: `${P1}/Fractions_Decimals_and_Proportional_Comparisons` },
    ],
    fallbackLeaf: `${P1}/Number_System_and_Number_Teory`,
  },
  {
    slug: "algebra",
    file: "Questions(Algebra).docx",
    rules: [
      { re: /^Section [ABJLMO]:/, leaf: `${P2}/Equations_and_Inequalities` },
      { re: /^Section [CDN]:/, leaf: `${P2}/Algebraic_Identities_and_Factorization` },
      { re: /^Section [EFGK]:/, leaf: `${P2}/Indices_and_Logarithms` },
      { re: /^Section H:/, leaf: `${P2}/Algebraic_Fractions_and_Rational_Expressions` },
      { re: /^Section I:/, leaf: `${P2}/Functions_Substitution_and_Graph_Concepts` },
    ],
    fallbackLeaf: `${P2}/Comprehensive_Algebra`,
  },
  {
    slug: "geometry",
    file: "Questions(Geometry and Mensuration).docx",
    rules: [
      { re: /^Section 1[1-3]:/, leaf: `${P4}/Comprehensive_Geometry_and_Mensuration` },
      { re: /^(?:Section|Subtopic) 4:/, leaf: `${P4}/Pythagorean_Theorem` },
      { re: /^(?:Section|Subtopic) 5:/, leaf: `${P4}/Lines_Angles_Triangles_Quadrilaterals_Circles` },
      { re: /^(?:Section|Subtopic) 8:/, leaf: `${P4}/2D_Mensuration_Area_Perimeter` },
      { re: /^(?:Section|Subtopic) 9:/, leaf: `${P4}/3D_Mensuration_Volume_Surface_Area` },
      { re: /^(?:Section|Subtopic) 10:/, leaf: `${P4}/Coordinate_Geometry` },
      { re: /^(?:Section|Subtopic) [12367]:/, leaf: `${P4}/Lines_Angles_Triangles_Quadrilaterals_Circles` },
    ],
    fallbackLeaf: `${P4}/Lines_Angles_Triangles_Quadrilaterals_Circles`,
  },
  {
    slug: "probability-counting",
    file: "Questions(Probability and Counting ).docx",
    rules: [
      { re: /^Section [ABI]:/, leaf: `${P5}/Probability` },
      { re: /^Section [CDEGH]:/, leaf: `${P5}/Permutations_and_Combinations` },
    ],
    fallbackLeaf: `${P5}/Probability_and_Counting_Mixed_Practice`,
  },
  {
    slug: "sequences-series",
    file: "Questions(Sequences and Series).docx",
    rules: [
      { re: /^Section [125]:/, leaf: `${P3}/Arithmetic_Progression` },
      { re: /^Section [36]:/, leaf: `${P3}/Geometric_Progression` },
    ],
    fallbackLeaf: `${P3}/Mixed_Sequences_and_Series`,
  },
  {
    slug: "sets-statistics",
    file: "Questions(Sets, Statistics, Data Interpretation and Other Mathematics).docx",
    rules: [
      { re: /^Section 1:/, leaf: `${P5}/Set_Theory_and_Venn_Diagrams` },
      { re: /^Section 2:/, leaf: `${P5}/Statistics_Mean_Median_Mode` },
      { re: /^Section 3:/, leaf: `${P5}/Data_Interpretation_and_Analysis` },
      { re: /^Section 4:/, leaf: `${P4}/Coordinate_Geometry` },
      { re: /^Section 5:/, leaf: `${P4}/Trigonometry_and_Height_Distance` },
      { re: /^Section 6:/, leaf: `${P2}/Matrices_and_Determinants` },
      { re: /^Section 7:/, leaf: `${P2}/Equations_and_Inequalities` },
    ],
    fallbackLeaf: `${P5}/Statistics_Mean_Median_Mode`,
  },
  {
    slug: "time-work-speed",
    file: "Questions(Time, Work and Speed).docx",
    rules: [
      { re: /^Section 1[0-2]:/, leaf: `${P6}/Mixed_Time_Work_and_Speed` },
      { re: /^Section [1239]:/, leaf: `${P6}/Time_and_Work` },
      { re: /^Section [4-8]:/, leaf: `${P6}/Speed_Distance_and_Time` },
    ],
    fallbackLeaf: `${P6}/Mixed_Time_Work_and_Speed`,
  },
];

/** New Part node (created as data; the taxonomy seeder never deletes). */
export const NEW_PARENTS: { path: string; depth: number; sortOrder: number }[] = [
  { path: P6, depth: 1, sortOrder: 25 },
];

/** New leaves not present in bb-taxonomy.json (upsert-only, like ICT v2). */
export const NEW_LEAVES: { path: string; parent: string }[] = [
  { path: `${P1}/Averages_and_Weighted_Average`, parent: P1 },
  { path: `${P1}/Income_Expenditure_and_Savings`, parent: P1 },
  { path: `${P1}/Age_Problems`, parent: P1 },
  { path: `${P1}/Fractions_Decimals_and_Proportional_Comparisons`, parent: P1 },
  { path: `${P1}/Comprehensive_Arithmetic`, parent: P1 },
  { path: `${P1}/Number_System_and_Number_Teory`, parent: P1 },
  { path: `${P2}/Algebraic_Fractions_and_Rational_Expressions`, parent: P2 },
  { path: `${P2}/Functions_Substitution_and_Graph_Concepts`, parent: P2 },
  { path: `${P2}/Matrices_and_Determinants`, parent: P2 },
  { path: `${P2}/Comprehensive_Algebra`, parent: P2 },
  { path: `${P3}/Mixed_Sequences_and_Series`, parent: P3 },
  { path: `${P4}/Coordinate_Geometry`, parent: P4 },
  { path: `${P4}/Trigonometry_and_Height_Distance`, parent: P4 },
  { path: `${P4}/Comprehensive_Geometry_and_Mensuration`, parent: P4 },
  { path: `${P5}/Data_Interpretation_and_Analysis`, parent: P5 },
  { path: `${P5}/Probability_and_Counting_Mixed_Practice`, parent: P5 },
  { path: `${P6}/Time_and_Work`, parent: P6 },
  { path: `${P6}/Speed_Distance_and_Time`, parent: P6 },
  { path: `${P6}/Mixed_Time_Work_and_Speed`, parent: P6 },
];

// ── record types ─────────────────────────────────────────────────────────────

/** Mutable working record during parsing + errata application. */
export type WorkingRec = {
  printed: number | null; // null = stemless (source dropped the stem)
  stem: string;
  options: string[]; // sparse: index = A..D, may be incomplete
  letter: string | null;
  answerRest: string; // printed restatement after the answer letter
  explanationParts: string[];
  sectionTitle: string;
  correctionLines: string[]; // in-record `Correction: …` lines
  order: number; // document order (variant tie-break: earliest wins)
  fixes: string[]; // applied errata descriptions
  /** True once a CONTENT fix (block/inline/explanation/letter-rule) applied —
   * only content fixes suppress a doc-declared invalidity flag; the mechanical
   * letter/value reconciliations do not. */
  contentFixed: boolean;
  unresolved: string[]; // errata entries that matched no known pattern
  unanswerable: string | null; // document declares the item unseedable
};

export type FinalRecord = {
  n: number;
  stem: string;
  options: [string, string, string, string];
  answerLetter: "A" | "B" | "C" | "D";
  correctAnswer: string;
  explanation: string;
  sectionTitle: string;
  subtopic: string;
  leaf: string;
  difficulty: Difficulty;
  errata: string[];
};

export type ParseResult = {
  records: FinalRecord[];
  report: {
    starts: number;
    candidates: number;
    variantsDropped: string[];
    skips: string[]; // "Q17: reason" | "(stemless): reason"
    missingNumbers: number[];
    errata: string[]; // "Q63 [block] …"
    unresolved: string[];
    leafCounts: Record<string, number>;
    difficulty: Record<Difficulty, number>;
    answerRestMismatch: number;
    answerRestDetails: string[];
    duplicateOptionQuestions: number;
    duplicateOptionDetails: string[];
  };
};

// ── small helpers ────────────────────────────────────────────────────────────

const IDX = (letter: string) => letter.charCodeAt(0) - 65;
const LET = (i: number) => "ABCD"[i];
const idxOf = (line: string) => line.split("").reverse();

/** Section header lines (difficulty/topic boundaries). */
const SECTION_RE =
  /^(?:Number System and Number Theory\s+—|(?:Section\s+[0-9A-Za-z]+|Subtopic\s+\d+|MCQs\s+\d+)\s*[:\-–—])/;
/** Block-correction headers — flush the open record, never a section. */
const BLOCK_HEADER_RE =
  /^(?:Corrections?\s+to\s+Questions|Answer-key corrections|Additional corrections|The following answers need correction|For accuracy)/i;
/** In-record correction notes. */
const IN_RECORD_CORR_RE = /^Correction(?:\s+to\s+the\s+options)?\s*:\s*(.*)$/i;
/** Document flags an item as unanswerable (in explanations / correction notes). */
const UNANSWERABLE_RE =
  /not listed|no option is correct|none of the (?:listed )?options|question is invalid|invalid as written|discard this item|should not be used|not counted as a valid|is not among the options|the item should be corrected|which is not listed|should be revised|needs revision/i;

export function cleanSectionTitle(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^Number System and Number Theory\s+—\s*/, "");
  t = t.replace(/^MCQs\s+\d+[–-]\d+:\s*/, "");
  t = t.replace(/^Section\s+[0-9A-Za-z]+:\s*/, "");
  t = t.replace(/^Subtopic\s+\d+:\s*/, "");
  t = t.replace(/\s*\((?:MCQs|Questions)\s+\d+[–-]\d+\)$/, "");
  t = t.replace(/\s*\(\d+[–-]\d+\)$/, "");
  return t.trim() || raw.trim();
}

export function difficultyFor(rawTitle: string): Difficulty {
  const t = rawTitle.toLowerCase();
  if (/(challeng|advanced|higher-difficulty|exam-style|high-yield|difficult|\bhard\b)/.test(t)) return "HARD";
  if (/basic|introductory|foundation/.test(t)) return "EASY";
  return "MEDIUM";
}

export function leafForSection(cfg: FileConfig, rawTitle: string): string {
  for (const r of cfg.rules) if (r.re.test(rawTitle)) return r.leaf;
  return cfg.fallbackLeaf;
}

/** Marker positions for `A. x B. y …` option runs (inline or one per line). */
function parseOptionSegments(line: string): { letter: string; text: string }[] {
  const re = /(?:^|[\s(])([A-D])[.।]\s+/g;
  const marks: { letter: string; raw: number; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    marks.push({ letter: m[1], raw: m.index, at: m.index + m[0].length });
  }
  const segs: { letter: string; text: string }[] = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].raw : line.length;
    segs.push({ letter: marks[i].letter, text: line.slice(marks[i].at, end).trim() });
  }
  return segs;
}

const isFullOptionSet = (segs: { letter: string }[]) =>
  ["A", "B", "C", "D"].every((L) => segs.some((s) => s.letter === L));

function matchQuestionStart(line: string): { printed: number; stem: string } | null {
  let m = /^(\d{1,3})\s*[.।]\s+(\S.*)$/.exec(line);
  if (m) return { printed: Number(m[1]), stem: m[2].trim() };
  m = /^(?:Corrected\s+)?Question\s+(\d{1,3})\s*[.।)]\s*(\S.*)$/i.exec(line);
  if (m) return { printed: Number(m[1]), stem: m[2].trim() };
  return null;
}

const squeeze = (s: string) => s.replace(/\s+/g, "");

/**
 * Trim a stated value down to its first sentence: cut at the first `.` that
 * is followed by whitespace ("10 days. The options…" → "10 days"; internal
 * dots like "13.33 litres." are untouched), then drop a trailing period.
 */
const firstSentence = (v: string) => {
  const i = v.search(/\.\s+\S/);
  return (i >= 0 ? v.slice(0, i) : v).trim().replace(/\.$/, "");
};

/** Exact-then-squeezed lookup of a stated value among the four options. */
function findOptionIndex(rec: WorkingRec, value: string): number {
  for (let i = 0; i < rec.options.length; i++) {
    if (rec.options[i] === value) return i;
  }
  const v = squeeze(value);
  for (let i = 0; i < rec.options.length; i++) {
    if (rec.options[i] && squeeze(rec.options[i]) === v) return i;
  }
  return -1;
}

// ── errata appliers ──────────────────────────────────────────────────────────

/**
 * Reconcile an asserted (answer letter, correct value) pair against the four
 * options: value at the letter → keep; value at another option → the value
 * wins (letter remapped); value nowhere → the option text is corrected.
 */
function reconcileValue(rec: WorkingRec, letter: string, value: string): string {
  const li = IDX(letter);
  const cur = rec.options[li];
  rec.letter = letter;
  if (!value) return `answer → ${letter}`;
  if (cur === value) return `answer → ${letter} (option ${letter} already "${value}")`;
  const other = rec.options.findIndex((o, i) => i !== li && o === value);
  if (other >= 0) {
    rec.letter = LET(other);
    return `answer → ${LET(other)} (value "${value}" sits at option ${LET(other)}; printed ${letter})`;
  }
  rec.options[li] = value;
  return `answer → ${letter}; option ${letter}: ${JSON.stringify(cur ?? null)} → "${value}"`;
}

type ApplyResult = { applied?: string; unresolved?: string; unanswerable?: string };

/**
 * The answer line states BOTH a letter and its value ("Correct Answer: B. 26%").
 * When that pair contradicts itself — the value is not the option sitting at
 * the printed letter — but the value does sit at another option, the value
 * wins: in every observed conflict the restated value equals the worked
 * explanation's result and the printed letter is the stale part. Value found
 * nowhere → the printed letter is kept (the mismatch stays in the report).
 * Runs BEFORE errata so corrections that legitimately rewrite an option are
 * not mistaken for conflicts.
 */
export function reconcileAnswerLine(rec: WorkingRec): string | null {
  if (!rec.letter || !rec.answerRest) return null;
  const li = IDX(rec.letter);
  const cur = rec.options[li];
  if (!cur) return null;
  const v = rec.answerRest.trim().replace(/\.$/, "");
  if (!v || cur === v || squeeze(cur) === squeeze(v)) return null;
  const idx = findOptionIndex(rec, v);
  if (idx < 0 || idx === li) return null;
  const before = rec.letter;
  rec.letter = LET(idx);
  return `answer line states ${before} but its own value “${v}” is option ${LET(idx)} → answer ${LET(idx)}`;
}

/**
 * Explanations sometimes restate the answer with an explicit letter and value
 * ("…therefore the correct answer is A. 36."). REMAP-ONLY: when the stated
 * value sits at a different option than the current answer, move the answer
 * there; a value that cannot be located among the options is ignored — free
 * prose must never rewrite option text.
 */
function reconcileExplanationAnswer(rec: WorkingRec): string | null {
  if (!rec.letter) return null;
  const joined = rec.explanationParts.join(" ");
  const re = /correct\s+(?:answer|option|fraction)\s+is\s+([A-D])[.．]\s*(.+)$/gi;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)) !== null) last = m;
  if (!last) return null;
  const value = firstSentence(last[2]);
  const idx = findOptionIndex(rec, value);
  if (idx < 0 || LET(idx) === rec.letter) return null;
  const before = rec.letter;
  rec.letter = LET(idx);
  return `explanation restates the answer as “${value}” (option ${LET(idx)}), printed answer ${before} → answer ${LET(idx)}`;
}

/**
 * Block-correction entry (a `Q63:` line collected in the pre-pass):
 *   (a) "C. 45." / "A. 9 : 14; replace option C with a non-equivalent ratio, such as 18 : 27."
 *   (b) "Correct answer is B. 1/3." / "… The options should be A. x; B. y; …"
 *   (c) "20 litres; replace option C with 20 litres." / "… replace option B with this value. Correct answer: A."
 */
export function applyBlockEntry(rec: WorkingRec, entry: string): ApplyResult {
  const e = entry.trim().replace(/\s+/g, " ");

  if (/replace option/i.test(e)) {
    const rm = /(?:^|;\s*)replace option\s*([A-D])\s*with\s+(.+)$/i.exec(e);
    if (!rm) return { unresolved: entry };
    const slot = rm[1];
    let replacement = rm[2].trim();
    let explicitLetter: string | null = null;
    const cm = /^(.*?)\.\s*Correct answer:\s*([A-D])\.?$/i.exec(replacement);
    if (cm) {
      replacement = cm[1];
      explicitLetter = cm[2].toUpperCase();
    }
    replacement = replacement.replace(/\.$/, "").trim();
    const sm = /,\s*such as\s+(.+)$/.exec(replacement);
    if (sm) replacement = sm[1].replace(/\.$/, "").trim();
    if (/^this value$/i.test(replacement)) {
      const head = e.split(";")[0].trim();
      const vm = /\bis\s+(?:approximately\s+)?(.+)$/i.exec(head);
      replacement = (vm ? vm[1] : head).replace(/\.$/, "").trim();
    }
    if (!replacement) return { unresolved: entry };
    // A sentence after the replacement means we cannot tell where the value
    // ends — never guess, report it instead.
    if (/\.\s/.test(replacement)) return { unresolved: entry };

    const head = e.slice(0, rm.index).trim();
    const hv = /^([A-D])\.\s*(.+)$/.exec(head);
    let letter = explicitLetter ?? (hv ? hv[1] : slot); // named letter wins, else the replaced slot IS the answer
    if (hv && !explicitLetter) reconcileValue(rec, hv[1], hv[2].trim().replace(/\.$/, ""));

    const si = IDX(slot);
    const before = rec.options[si];
    rec.options[si] = replacement;
    rec.letter = letter;
    return {
      applied: `answer → ${letter}; option ${slot}: ${JSON.stringify(before ?? null)} → "${replacement}"`,
    };
  }

  // (a) "L. value."
  const lv = /^([A-D])\.\s*(.+)$/.exec(e);
  if (lv) {
    const note = reconcileValue(rec, lv[1], firstSentence(lv[2]));
    return { applied: note };
  }

  // (b) "Correct answer is L. value." (+ optional full option list)
  const ai = /^(?:Correct\s+answer|The\s+correct\s+answer)\s+is\s+([A-D])\.\s*(.+)$/i.exec(e);
  if (ai) {
    let value = ai[2].trim();
    const optsM = /\.\s*The options should be\s+(.+)$/i.exec(value);
    let note = "";
    if (optsM) {
      value = value.slice(0, optsM.index).trim().replace(/\.$/, "");
      const four = /^A\.\s*(.+?);\s*B\.\s*(.+?);\s*C\.\s*(.+?);\s*D\.\s*(.+?)\.?$/.exec(optsM[1].trim());
      if (four) {
        for (let i = 0; i < 4; i++) rec.options[i] = four[i + 1].trim();
        note = "all four options replaced; ";
      }
    } else {
      value = firstSentence(value);
    }
    return { applied: note + reconcileValue(rec, ai[1].toUpperCase(), value) };
  }

  return { unresolved: entry };
}

/**
 * In-record correction line (`Correction:` / `Correction to the options:`).
 * Runs in order: explicit slot fix → letter forms → unanswerable (with a
 * rescue attempt when the stated value actually is one of the options).
 */
export function applyInRecordLine(rec: WorkingRec, text: string): ApplyResult {
  const t = text.trim();
  if (!t) return {};

  // "…The intended nearest whole-number answer is 189 cm², which should replace option D."
  const wr = /(.+?)\s*,?\s*which should replace option\s*([A-D])/i.exec(t);
  if (wr) {
    const sentences = wr[1].split(/(?<=\.)\s+/);
    const last = sentences[sentences.length - 1].trim();
    const vm = /\bis\s+(?:approximately\s+)?(.+)$/i.exec(last);
    const value = (vm ? vm[1] : last).trim().replace(/\.$/, "");
    return { applied: reconcileValue(rec, wr[2], value) };
  }

  // "The correct answer is D. 10 days." / "The correct option is C. ৳9,840."
  let m = /^(?:The\s+)?correct\s+(?:answer|option|fraction)\s+is\s+([A-D])[.．]\s*(.+)$/i.exec(t);
  if (m) return { applied: reconcileValue(rec, m[1].toUpperCase(), firstSentence(m[2])) };

  // "The correct answer is 20 days, option D." / "The correct fraction is 5/12, option B."
  m = /^(?:The\s+)?correct\s+answer\s+is\s+(.+?),\s*option\s+([A-D])\.?$/i.exec(t);
  if (m) return { applied: reconcileValue(rec, m[2].toUpperCase(), m[1].trim()) };
  m = /^(?:The\s+)?correct\s+[a-z]+\s+is\s+(.+?),\s*option\s+([A-D])\.?$/i.exec(t);
  if (m) return { applied: reconcileValue(rec, m[2].toUpperCase(), m[1].trim()) };

  // "… none of the options; replace option A with 144." — the fix beats the
  // skip: delegate to the block applier (same "replace option" grammar).
  if (/replace option/i.test(t) && !/which should replace option/i.test(t)) {
    const r = applyBlockEntry(rec, t);
    if (r.applied) return { applied: r.applied };
  }

  // Prefixed form: "The calculation gives 85°, so the correct option is D. 85°."
  // (only when the tail is a single sentence — never swallow following prose)
  m = /correct\s+(?:answer|option|fraction)\s+is\s+([A-D])[.．]\s*(.+)$/i.exec(t);
  if (m && !/\.\s/.test(m[2])) {
    return { applied: reconcileValue(rec, m[1].toUpperCase(), firstSentence(m[2])) };
  }

  // Unanswerable markers — rescue first if the stated value IS an option.
  if (UNANSWERABLE_RE.test(t)) {
    const vm = /^(?:The\s+correct\s+(?:answer|option|fraction)\s+is|gives)\s+(.+?)(?:[;,]|$)/i.exec(t);
    if (vm) {
      const value = vm[1].trim().replace(/\.$/, "");
      const idx = findOptionIndex(rec, value);
      if (idx >= 0) {
        rec.letter = LET(idx);
        return { applied: `rescued: document states "${value}" which is option ${LET(idx)} → answer ${LET(idx)}` };
      }
    }
    return { unanswerable: t };
  }

  return { unresolved: text };
}

/** Explanations that self-correct: "The correct letter is C, not B." */
export function applyLetterRule(rec: WorkingRec): string | null {
  const m = /(?:The\s+)?correct\s+letter\s+is\s+([A-D])(?:\s*,?\s*not\s+([A-D]))?/i.exec(
    rec.explanationParts.join(" "),
  );
  if (!m) return null;
  const want = m[1].toUpperCase();
  if (rec.letter === want) return null;
  const before = rec.letter ?? "?";
  rec.letter = want;
  return `explanation self-correction: answer ${before} → ${want}`;
}

/** Apply every erratum source to a working record (mutates it). */
function applyAllErrata(rec: WorkingRec, blockEntries: string[] | undefined): void {
  const ar = reconcileAnswerLine(rec);
  if (ar) rec.fixes.push(ar);
  if (blockEntries) {
    for (const e of blockEntries) {
      const r = applyBlockEntry(rec, e);
      if (r.applied) {
        rec.fixes.push(`[block] ${e} ⇒ ${r.applied}`);
        rec.contentFixed = true;
      } else if (r.unresolved) rec.unresolved.push(e);
    }
  }
  for (const c of rec.correctionLines) {
    const r = applyInRecordLine(rec, c);
    if (r.applied) {
      rec.fixes.push(`[inline] ${c} ⇒ ${r.applied}`);
      rec.contentFixed = true;
    } else if (r.unresolved) rec.unresolved.push(c);
    if (r.unanswerable) rec.unanswerable = `declares unanswerable: “${r.unanswerable}”`;
  }
  // Explanations can carry the fix themselves:
  // "… Total =144. Correct answer: none of the options; replace option A with 144."
  // Skip parts already handled as a `Correction:` line (they are stored in both).
  for (const part of rec.explanationParts) {
    if (!/replace option/i.test(part) || /which should replace option/i.test(part)) continue;
    if (rec.correctionLines.some((c) => part.includes(c))) continue;
    const r = applyBlockEntry(rec, part);
    if (r.applied) {
      rec.fixes.push(`[explanation] ${part} ⇒ ${r.applied}`);
      rec.contentFixed = true;
      rec.unanswerable = null; // a fix always beats a skip
      break;
    }
    if (r.unresolved) rec.unresolved.push(part);
  }
  const er = reconcileExplanationAnswer(rec);
  if (er) rec.fixes.push(er);
  const lr = applyLetterRule(rec);
  if (lr) {
    rec.fixes.push(lr);
    rec.contentFixed = true;
  }
  // An explanation-level "discard / invalid" flag stands unless a content fix
  // in this record already repaired the item.
  if (!rec.unanswerable && !rec.contentFixed) {
    const m = UNANSWERABLE_RE.exec(rec.explanationParts.join(" "));
    if (m) rec.unanswerable = `explanation flags invalid (“${m[0]}”)`;
  }
}

const isComplete = (rec: WorkingRec) =>
  !!rec.stem.trim() &&
  !!rec.letter &&
  rec.options.length === 4 &&
  [0, 1, 2, 3].every((i) => typeof rec.options[i] === "string" && rec.options[i].trim().length > 0);

// ── parsing ──────────────────────────────────────────────────────────────────

/** Pre-pass: every `Q63: …` line is a block correction targeting that number. */
export function extractBlockCorrections(lines: string[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const raw of lines) {
    const m = /^Q(\d{1,3}):\s*(.+)$/.exec(raw.trim());
    if (!m) continue;
    const n = Number(m[1]);
    map.set(n, [...(map.get(n) ?? []), m[2].trim()]);
  }
  return map;
}

export function parseFileText(text: string, cfg: FileConfig): ParseResult {
  const lines = text.split("\n");
  const blockCorrections = extractBlockCorrections(lines);

  const raws: WorkingRec[] = [];
  let cur: WorkingRec | null = null;
  let sectionTitle = "";
  let order = 0;

  const newRec = (printed: number | null, stem: string): WorkingRec => ({
    printed,
    stem,
    options: [],
    letter: null,
    answerRest: "",
    explanationParts: [],
    sectionTitle,
    correctionLines: [],
    order: order++,
    fixes: [],
    contentFixed: false,
    unresolved: [],
    unanswerable: null,
  });
  const flush = () => {
    if (cur) raws.push(cur);
    cur = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Q\d{1,3}\s*:/.test(line)) {
      flush(); // block-correction target — collected in the pre-pass
      continue;
    }
    if (BLOCK_HEADER_RE.test(line)) {
      flush();
      continue;
    }
    if (SECTION_RE.test(line)) {
      flush();
      sectionTitle = line;
      continue;
    }

    const start = matchQuestionStart(line);
    if (start) {
      flush();
      cur = newRec(start.printed, start.stem);
      continue;
    }

    if (!cur) continue; // orphan prose outside any record

    const cm = IN_RECORD_CORR_RE.exec(line);
    if (cm) {
      cur.correctionLines.push(cm[1].trim());
      cur.explanationParts.push(line); // kept verbatim in the explanation
      continue;
    }

    const em = /^Explanation\s*:\s*(.*)$/i.exec(line);
    if (em) {
      if (em[1].trim()) cur.explanationParts.push(em[1].trim());
      continue;
    }

    if (!cur.letter) {
      const am = /^(?:Correct\s+)?Answer\s*:\s*([A-Da-d])\s*[.।)]?\s*(.*)$/i.exec(line);
      if (am) {
        cur.letter = am[1].toUpperCase();
        let rest = am[2].trim();
        const xm = /^(.*?)\s+Explanation\s*:\s*(.*)$/i.exec(rest);
        if (xm) {
          rest = xm[1].trim();
          if (xm[2].trim()) cur.explanationParts.push(xm[2].trim());
        }
        cur.answerRest = rest;
        continue;
      }
    }

    const segs = parseOptionSegments(line);
    const answered = cur.letter !== null;
    const haveFour = cur.options.filter((o) => typeof o === "string" && o.trim()).length >= 4;

    // A full option set arriving after the record already answered/collected
    // four → the source dropped a stem (Q80): start a stemless record so the
    // previous explanation isn't polluted.
    if (segs.length >= 4 && (answered || haveFour) && isFullOptionSet(segs)) {
      flush();
      cur = newRec(null, "");
      for (const s of segs) cur.options[IDX(s.letter)] = s.text;
      continue;
    }

    if (!answered && segs.length > 0) {
      for (const s of segs) cur.options[IDX(s.letter)] = s.text;
      continue;
    }

    if (!answered) {
      if (cur.options.filter((o) => typeof o === "string" && o.trim()).length === 0) {
        cur.stem = cur.stem ? `${cur.stem} ${line}` : line;
      } else {
        cur.explanationParts.push(line); // stray pre-answer text — keep it
      }
      continue;
    }

    cur.explanationParts.push(line);
  }
  flush();

  // ── errata + variant selection ────────────────────────────────────────────
  const report: ParseResult["report"] = {
    starts: raws.length,
    candidates: 0,
    variantsDropped: [],
    skips: [],
    missingNumbers: [],
    errata: [],
    unresolved: [],
    leafCounts: {},
    difficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
    answerRestMismatch: 0,
    answerRestDetails: [],
    duplicateOptionQuestions: 0,
    duplicateOptionDetails: [],
  };

  const groups = new Map<number | null, WorkingRec[]>();
  for (const rec of raws) {
    const key = rec.printed;
    groups.set(key, [...(groups.get(key) ?? []), rec]);
  }

  // Stemless records (source dropped the stem) — report, never seed.
  for (const rec of groups.get(null) ?? []) {
    report.skips.push(`(no stem, doc order #${rec.order}): the source document dropped this question's stem`);
  }
  groups.delete(null);

  const records: FinalRecord[] = [];
  const selectedNums = new Set<number>();

  const sortedNums = [...groups.keys()]
    .filter((k): k is number => k !== null)
    .sort((a, b) => a - b);
  for (const n of sortedNums) {
    const candidates = groups.get(n)!;
    report.candidates += candidates.length;

    for (const rec of candidates) applyAllErrata(rec, blockCorrections.get(n));

    // Variant resolution: the best-scoring candidate wins — complete (4) +
    // not doc-flagged (2) + the document's own finality label on the stem
    // ("(Final corrected version)" +2, "(Replacement)"/"(Corrected)" +1).
    // Ties keep the EARLIEST candidate: the unlabelled duplicate drafts in
    // Sequences & Series (Q12 first-is-correct, Q41 first-is-incomplete)
    // depend on first-wins, while Algebra's labeled chains resolve to the
    // doc's final version (e.g. Q3 plain→flagged, "(Replacement)"→clean,
    // "(Final corrected version)"→picked).
    const labelBonus = (stem: string): number => {
      if (/\((?:final)\b/i.test(stem)) return 2;
      if (/\((?:replacement|corrected)\b/i.test(stem)) return 1;
      return 0;
    };
    let best: WorkingRec | null = null;
    let bestScore = -1;
    for (const rec of candidates) {
      const score =
        (isComplete(rec) ? 4 : 0) + (rec.unanswerable ? 0 : 2) + labelBonus(rec.stem);
      if (score > bestScore) {
        bestScore = score;
        best = rec;
      }
    }

    for (const rec of candidates) {
      if (rec === best) continue;
      if (candidates.length > 1) {
        report.variantsDropped.push(
          `Q${n} (doc order #${rec.order}): duplicate number — variant dropped in favour of doc order #${best!.order}`,
        );
      }
    }

    const picked = best!;
    for (const e of picked.fixes) report.errata.push(`Q${n} ${e}`);
    for (const e of picked.unresolved) report.unresolved.push(`Q${n}: ${e}`);

    if (picked.unanswerable) {
      report.skips.push(`Q${n}: ${picked.unanswerable}`);
      continue;
    }
    if (!isComplete(picked)) {
      const why = !picked.stem.trim()
        ? "empty stem"
        : !picked.letter
          ? "no answer line"
          : `${picked.options.filter((o) => typeof o === "string" && o.trim()).length}/4 options`;
      report.skips.push(`Q${n}: incomplete record (${why})`);
      continue;
    }

    const options = [0, 1, 2, 3].map((i) => picked.options[i].normalize("NFC")) as [
      string,
      string,
      string,
      string,
    ];
    const answerLetter = picked.letter! as "A" | "B" | "C" | "D";
    const correctAnswer = options[IDX(answerLetter)];

    if (picked.answerRest && picked.answerRest !== correctAnswer) {
      report.answerRestMismatch++;
      report.answerRestDetails.push(
        `Q${n}: answer line restates “${picked.answerRest}” but option ${answerLetter} = “${correctAnswer}”`,
      );
    }
    if (new Set(options).size !== options.length) {
      report.duplicateOptionQuestions++;
      report.duplicateOptionDetails.push(
        `Q${n}: ${options.map((o, i) => `${LET(i)}. ${o}`).join(" | ")}`,
      );
    }

    const subtopic = cleanSectionTitle(picked.sectionTitle);
    const leaf = leafForSection(cfg, picked.sectionTitle);
    const difficulty = difficultyFor(picked.sectionTitle);

    records.push({
      n: n as number,
      stem: picked.stem.normalize("NFC"),
      options,
      answerLetter,
      correctAnswer,
      explanation: picked.explanationParts.join(" ").normalize("NFC"),
      sectionTitle: picked.sectionTitle,
      subtopic: subtopic.normalize("NFC"),
      leaf,
      difficulty,
      errata: picked.fixes,
    });
    selectedNums.add(n as number);
    report.leafCounts[leaf] = (report.leafCounts[leaf] ?? 0) + 1;
    report.difficulty[difficulty]++;
  }

  for (let n = 1; n <= EXPECTED_PER_FILE; n++) {
    if (!selectedNums.has(n)) report.missingNumbers.push(n);
  }

  return { records, report };
}

// ── docx → text ──────────────────────────────────────────────────────────────

function convertDocx(docxAbs: string): string {
  const out = join(tmpdir(), `bankmath2-${process.pid}-${Math.random().toString(36).slice(2)}.txt`);
  execFileSync("python3", [CONVERTER, docxAbs, out], { stdio: "pipe" });
  const text = readFileSync(out, "utf8");
  try {
    unlinkSync(out);
  } catch {
    /* temp file cleanup is best-effort */
  }
  return text;
}

// ── topic provisioning ───────────────────────────────────────────────────────

async function ensureTopics(prisma: PrismaClient, subjectId: number): Promise<void> {
  for (const p of NEW_PARENTS) {
    const name = p.path.split("/").pop()!;
    await prisma.topic.upsert({
      where: { subjectId_path: { subjectId, path: p.path } },
      update: {},
      create: { subjectId, name, slug: name, path: p.path, depth: p.depth, sortOrder: p.sortOrder },
    });
  }
  let sortOrder = 30; // existing Bank-Math leaves occupy 1–24
  for (const l of NEW_LEAVES) {
    const name = l.path.split("/").pop()!;
    const parent = await prisma.topic.findUnique({
      where: { subjectId_path: { subjectId, path: l.parent } },
    });
    if (!parent) throw new Error(`parent topic missing: ${l.parent}`);
    await prisma.topic.upsert({
      where: { subjectId_path: { subjectId, path: l.path } },
      update: {},
      create: {
        subjectId,
        name,
        slug: name,
        path: l.path,
        depth: parent.depth + 1,
        parentId: parent.id,
        sortOrder: sortOrder++,
      },
    });
  }

  // Every leaf the file configs reference must now exist.
  const rows = await prisma.topic.findMany({ where: { subjectId }, select: { path: true } });
  const have = new Set(rows.map((r) => r.path));
  for (const cfg of FILES) {
    for (const leaf of new Set([...cfg.rules.map((r) => r.leaf), cfg.fallbackLeaf])) {
      if (!have.has(leaf)) throw new Error(`taxonomy leaf missing after upsert: ${leaf}`);
    }
  }
}

// ── import (write path) ──────────────────────────────────────────────────────

type RowData = {
  ecosystemId: number;
  subjectId: number;
  topicId: number;
  path: string;
  topic: string;
  subtopic: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  rawMath: boolean;
  questionType: "SINGLE_CHOICE";
  difficulty: Difficulty;
  year: null;
  sourceExam: string;
  bcsTerm: null;
  examId: null;
  paperId: null;
  questionNumber: number;
};

async function importFile(
  prisma: PrismaClient,
  cfg: FileConfig,
  records: FinalRecord[],
  ids: { ecosystemId: number; subjectId: number; topicByPath: Map<string, number> },
): Promise<{ inserted: number; updated: number; deleted: number; unchanged: number }> {
  const ns = `${KEY_NS}:${cfg.slug}:`;
  const ops = records.map((r) => {
    const key = `${ns}${r.n}`;
    const topicId = ids.topicByPath.get(r.leaf);
    if (topicId === undefined) throw new Error(`topic id missing for leaf ${r.leaf}`);
    const data: RowData = {
      ecosystemId: ids.ecosystemId,
      subjectId: ids.subjectId,
      topicId,
      path: r.leaf,
      topic: r.leaf.split("/").pop()!,
      subtopic: r.subtopic,
      question: r.stem,
      options: r.options,
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
      rawMath: true,
      questionType: "SINGLE_CHOICE",
      difficulty: r.difficulty,
      year: null,
      sourceExam: `Bank Mathematics · ${r.subtopic}`,
      bcsTerm: null,
      examId: null,
      paperId: null,
      questionNumber: r.n,
    };
    return { key, data };
  });

  const keys = ops.map((o) => o.key);
  const existing = await prisma.question.findMany({
    where: { subjectId: ids.subjectId, sourceKey: { in: keys } },
    select: {
      id: true,
      sourceKey: true,
      ecosystemId: true,
      subjectId: true,
      topicId: true,
      path: true,
      topic: true,
      subtopic: true,
      question: true,
      options: true,
      correctAnswer: true,
      explanation: true,
      rawMath: true,
      questionType: true,
      difficulty: true,
      year: true,
      sourceExam: true,
      bcsTerm: true,
      examId: true,
      paperId: true,
      questionNumber: true,
    },
  });
  const existingByKey = new Map(existing.map((e) => [e.sourceKey, e]));
  const staleRows = await prisma.question.findMany({
    where: { subjectId: ids.subjectId, sourceKey: { startsWith: ns } },
    select: { id: true, sourceKey: true },
  });
  const keySet = new Set(keys);
  const staleIds = staleRows.filter((s) => !keySet.has(s.sourceKey)).map((s) => s.id);

  if (staleIds.length > 0) {
    for (let i = 0; i < staleIds.length; i += 200) {
      await prisma.question.deleteMany({ where: { id: { in: staleIds.slice(i, i + 200) } } });
    }
  }

  const toInsert = ops.filter((o) => !existingByKey.has(o.key));
  for (let i = 0; i < toInsert.length; i += 200) {
    await prisma.question.createMany({
      data: toInsert.slice(i, i + 200).map((o) => ({ sourceKey: o.key, ...o.data })),
    });
  }

  // Diff-based updates: rows whose stored content already equals the parsed
  // payload are left untouched, so a re-run is a fast no-op and never bumps
  // updatedAt on identical text.
  const sameValue = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) {
      return (a ?? null) === (b ?? null);
    }
    if (typeof a === "object" || typeof b === "object") {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  };
  const toUpdate = ops.filter((o) => {
    const row = existingByKey.get(o.key);
    if (!row) return false;
    return (Object.keys(o.data) as (keyof RowData)[]).some((k) => !sameValue(row[k], o.data[k]));
  });
  for (let i = 0; i < toUpdate.length; i += 50) {
    await prisma.$transaction(
      async (tx) => {
        for (const o of toUpdate.slice(i, i + 50)) {
          await tx.question.update({ where: { id: existingByKey.get(o.key)!.id }, data: o.data });
        }
      },
      // Row-by-row updates of large text payloads easily exceed the default
      // 5s interactive-transaction limit; 50 rows fit comfortably in 120s.
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    deleted: staleIds.length,
    unchanged: ops.length - toInsert.length - toUpdate.length,
  };
}

// ── report ───────────────────────────────────────────────────────────────────

type FileOutcome = {
  cfg: FileConfig;
  result: ParseResult;
  write?: { inserted: number; updated: number; deleted: number; unchanged: number };
};

function formatReport(
  outcomes: FileOutcome[],
  preCounts: Record<string, number>,
  verified: { rows: number; issues: string[]; perLeaf: Record<string, number> },
  applied: boolean,
): string {
  const L: string[] = [];
  L.push(`# Bank Math updated-II import — ${applied ? "APPLY" : "DRY RUN"}`);
  L.push("");
  L.push(`Generated: ${new Date().toISOString()}`);
  L.push("");
  let T = { starts: 0, records: 0, inserted: 0, updated: 0, deleted: 0, unchanged: 0, skips: 0, errata: 0, unresolved: 0 };
  L.push("## Per file");
  L.push("");
  for (const o of outcomes) {
    const r = o.result.report;
    T.starts += r.starts;
    T.records += o.result.records.length;
    T.inserted += o.write?.inserted ?? 0;
    T.updated += o.write?.updated ?? 0;
    T.deleted += o.write?.deleted ?? 0;
    T.unchanged += o.write?.unchanged ?? 0;
    T.skips += r.skips.length;
    T.errata += r.errata.length;
    T.unresolved += r.unresolved.length;
    L.push(`### ${o.cfg.file}`);
    L.push(`- parsed starts: ${r.starts} · candidates: ${r.candidates} · seeded: ${o.result.records.length}`);
    if (o.write) L.push(`- write: inserted ${o.write.inserted} · updated ${o.write.updated} · deleted ${o.write.deleted} · unchanged ${o.write.unchanged}`);
    L.push(`- errata applied: ${r.errata.length} · unresolved: ${r.unresolved.length}`);
    L.push(`- answer restatements differing from resolved option: ${r.answerRestMismatch} · questions with duplicate option text: ${r.duplicateOptionQuestions}`);
    if (r.skips.length) L.push(`- **skips: ${r.skips.length}**`);
    if (r.missingNumbers.length) L.push(`- **missing numbers (${r.missingNumbers.length})**: ${r.missingNumbers.join(", ")}`);
    if (r.variantsDropped.length) L.push(`- duplicate variants dropped: ${r.variantsDropped.length}`);
    const dist = Object.entries(r.leafCounts).sort((a, b) => b[1] - a[1]);
    L.push("- leaves: " + dist.map(([leaf, n]) => `${leaf.replace("03_Mathematics/", "")}=${n}`).join(", "));
    const block = (title: string, items: string[]) => {
      L.push(`<details><summary>${title}</summary>`);
      L.push("");
      for (const e of items) L.push(`- ${e}`);
      L.push("");
      L.push("</details>");
    };
    if (r.skips.length) block(`skips (${r.skips.length})`, r.skips);
    if (r.variantsDropped.length) block(`duplicate variants dropped (${r.variantsDropped.length})`, r.variantsDropped);
    if (r.answerRestDetails.length) block(`answer restatement mismatches (${r.answerRestMismatch})`, r.answerRestDetails);
    if (r.duplicateOptionDetails.length) block(`duplicate option text (${r.duplicateOptionQuestions})`, r.duplicateOptionDetails);
    if (r.errata.length) block(`errata applied (${r.errata.length})`, r.errata);
    if (r.unresolved.length) block(`unresolved errata (${r.unresolved.length})`, r.unresolved);
    L.push("");
  }
  L.push("## Totals");
  L.push("");
  L.push(`- question starts parsed: ${T.starts}`);
  L.push(`- questions seeded: ${T.records}${applied ? ` (inserted ${T.inserted}, updated ${T.updated}, deleted ${T.deleted}, unchanged ${T.unchanged})` : ""}`);
  L.push(`- skips: ${T.skips} · errata applied: ${T.errata} · unresolved errata: ${T.unresolved}`);
  L.push("");
  L.push("## Post-write verification");
  L.push("");
  L.push(`- rows in this import's namespace: ${verified.rows}`);
  for (const [leaf, n] of Object.entries(verified.perLeaf).sort((a, b) => b[1] - a[1])) {
    const pre = preCounts[leaf] ?? 0;
    L.push(`- ${leaf}: ${pre} pre-existing + ${n - pre} new = ${n}`);
  }
  if (verified.issues.length) {
    L.push(`- **ISSUES (${verified.issues.length})**:`);
    for (const i of verified.issues.slice(0, 50)) L.push(`  - ${i}`);
  } else {
    L.push("- integrity: 0 issues (rawMath, answer∈options, numbering, sourceKeys)");
  }
  L.push("");
  return L.join("\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

/**
 * Best-effort cross-process invalidation of the exam selection tree.
 * backend/infrastructure/cache/query-cache.ts imports "server-only", which
 * throws under plain Node/tsx, so we reach Redis directly using the SAME key
 * layout (`qcache:${prefix}:${key}` → `qcache:exam:selection-tree*`).
 * No REDIS_URL → nothing to clear: the Next server's cache is per-process
 * memory with a 5-minute TTL, so new questions surface on their own.
 * Never throws — a Redis hiccup must not fail an already-written import.
 */
async function invalidateExamTreeAcrossProcesses(): Promise<string> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return "no REDIS_URL — exam tree expires on its 5-min TTL";
  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      retryStrategy: () => undefined, // one-shot CLI: no reconnect loops
    });
    client.on("error", () => undefined); // real failure surfaces via connect()
    try {
      await client.connect();
      let cursor = "0";
      let removed = 0;
      do {
        const [next, keys] = await client.scan(cursor, "MATCH", "qcache:exam:selection-tree*", "COUNT", 100);
        cursor = next;
        if (keys.length > 0) removed += await client.del(...keys);
      } while (cursor !== "0");
      return `removed ${removed} exam-tree cache key(s) from redis`;
    } finally {
      client.disconnect();
    }
  } catch (e) {
    return `redis invalidation skipped (${e instanceof Error ? e.message : String(e)})`;
  }
}

async function main() {
  const applied = process.argv.includes("--apply");
  const slugArg = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1];

  const { config } = await import("dotenv");
  config({ path: join(process.cwd(), ".env.local") });
  config({ path: join(process.cwd(), ".env") });
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const configs = slugArg ? FILES.filter((c) => c.slug.includes(slugArg)) : FILES;
  if (configs.length === 0) {
    console.error(`No file matched --slug=${slugArg}. Available: ${FILES.map((f) => f.slug).join(", ")}`);
    process.exit(1);
  }

  console.log(applied ? "APPLY MODE — rows will be written\n" : "DRY RUN — no database writes\n");
  const prisma = new PrismaClient();
  try {
    const bb = await prisma.examEcosystem.findUnique({ where: { code: ECOSYSTEM_CODE } });
    if (!bb) throw new Error(`${ECOSYSTEM_CODE} ecosystem missing — run: npx tsx scripts/seed-bb-subjects.ts`);
    const subject = await prisma.subject.findUnique({
      where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: SUBJECT_NAMEBN } },
    });
    if (!subject) throw new Error(`subject "${SUBJECT_NAMEBN}" missing — run seeds first`);

    const topicRows = await prisma.topic.findMany({
      where: { subjectId: subject.id },
      select: { id: true, path: true },
    });
    const topicByPath = new Map(topicRows.map((t) => [t.path, t.id]));

    if (applied) {
      await ensureTopics(prisma, subject.id);
      for (const t of await prisma.topic.findMany({
        where: { subjectId: subject.id },
        select: { id: true, path: true },
      })) {
        topicByPath.set(t.path, t.id);
      }
    } else {
      // Read-only: report the taxonomy nodes --apply would create and make
      // sure every leaf this run references exists in the DB or is declared
      // as a new leaf (a config typo must fail loudly, not write somewhere new).
      const declaredNew = new Set(NEW_LEAVES.map((l) => l.path));
      const missingParents = NEW_PARENTS.filter((p) => !topicByPath.has(p.path));
      const missingLeaves = NEW_LEAVES.filter((l) => !topicByPath.has(l.path));
      if (missingParents.length || missingLeaves.length) {
        console.log(
          `dry run — --apply will create ${missingParents.length} part node(s) + ${missingLeaves.length} leaf topic(s)`,
        );
      }
      for (const cfg of configs) {
        for (const leaf of new Set([...cfg.rules.map((r) => r.leaf), cfg.fallbackLeaf])) {
          if (!topicByPath.has(leaf) && !declaredNew.has(leaf)) {
            throw new Error(`taxonomy leaf neither exists in DB nor declared new: ${leaf}`);
          }
        }
      }
    }

    // Pre-import counts for every leaf this run can write to.
    const referenced = new Set<string>();
    for (const cfg of configs) {
      for (const r of cfg.rules) referenced.add(r.leaf);
      referenced.add(cfg.fallbackLeaf);
    }
    const preCounts: Record<string, number> = {};
    const counted = await prisma.question.groupBy({
      by: ["path"],
      _count: { _all: true },
      where: { subjectId: subject.id, path: { in: [...referenced] } },
    });
    // Subtract this importer's own previous rows: on a re-run they sit in the
    // table already, and counting them as "pre-existing" would double-count
    // them in `expected` below.
    const mineByPath = await prisma.question.groupBy({
      by: ["path"],
      _count: { _all: true },
      where: {
        subjectId: subject.id,
        path: { in: [...referenced] },
        sourceKey: { startsWith: `${KEY_NS}:` },
      },
    });
    const mineMap = new Map(mineByPath.map((m) => [m.path, m._count._all]));
    for (const row of counted) preCounts[row.path] = row._count._all - (mineMap.get(row.path) ?? 0);

    const outcomes: FileOutcome[] = [];
    for (const cfg of configs) {
      console.log(`── ${cfg.slug} ─ "${cfg.file}"`);
      const docx = join(process.cwd(), DATA_DIR, cfg.file);
      if (!existsSync(docx)) throw new Error(`missing source: ${docx}`);
      const text = convertDocx(docx);
      const result = parseFileText(text, cfg);
      const r = result.report;
      console.log(
        `   starts=${r.starts} candidates=${r.candidates} seeded=${result.records.length} ` +
          `skips=${r.skips.length} errata=${r.errata.length} unresolved=${r.unresolved.length} ` +
          `missing=${r.missingNumbers.length ? r.missingNumbers.join(",") : "0"} variantsDropped=${r.variantsDropped.length}`,
      );
      for (const s of r.skips) console.log(`   [skip] ${s}`);
      for (const u of r.unresolved) console.log(`   [UNRESOLVED] ${u}`);

      let write: FileOutcome["write"];
      if (applied) {
        // Back up this import's own previous rows (per file) before touching them.
        const ns = `${KEY_NS}:${cfg.slug}:`;
        const prev = await prisma.question.findMany({
          where: { subjectId: subject.id, sourceKey: { startsWith: ns } },
        });
        if (prev.length > 0) {
          mkdirSync(join("database", "backups"), { recursive: true });
          const file = join("database", "backups", `bankmath2-${cfg.slug}-${Date.now()}.json`);
          writeFileSync(file, JSON.stringify(prev, null, 2));
          console.log(`   backup: ${prev.length} rows -> ${file}`);
        }
        write = await importFile(prisma, cfg, result.records, {
          ecosystemId: bb.id,
          subjectId: subject.id,
          topicByPath,
        });
        console.log(`   ✓ write inserted=${write.inserted} updated=${write.updated} deleted=${write.deleted} unchanged=${write.unchanged}`);
      }
      outcomes.push({ cfg, result, write });
    }

    // ── verification (always read-back, dry run reports planned counts) ────
    const expectedByLeaf: Record<string, number> = {};
    for (const o of outcomes) {
      for (const rec of o.result.records) {
        expectedByLeaf[rec.leaf] = (expectedByLeaf[rec.leaf] ?? 0) + 1;
      }
    }
    const issues: string[] = [];
    const perLeaf: Record<string, number> = {};
    let rows = 0;

    if (applied) {
      for (const leaf of Object.keys(expectedByLeaf)) {
        perLeaf[leaf] = await prisma.question.count({ where: { subjectId: subject.id, path: leaf } });
        const expected = (preCounts[leaf] ?? 0) + expectedByLeaf[leaf];
        if (perLeaf[leaf] !== expected) {
          issues.push(`${leaf}: expected ${expected} rows, found ${perLeaf[leaf]}`);
        }
        await prisma.topic.update({
          where: { id: topicByPath.get(leaf)! },
          data: { questionCount: perLeaf[leaf] },
        });
      }

      const mine = await prisma.question.findMany({
        where: { subjectId: subject.id, sourceKey: { startsWith: `${KEY_NS}:` } },
        select: {
          id: true,
          sourceKey: true,
          options: true,
          correctAnswer: true,
          questionNumber: true,
          rawMath: true,
          path: true,
          question: true,
        },
      });
      rows = mine.length;
      const seenKeys = new Set<string>();
      const perFileNums = new Map<string, Set<number>>();
      for (const q of mine) {
        if (!q.rawMath) issues.push(`#${q.id}: rawMath=false`);
        const opts = q.options as string[];
        if (!Array.isArray(opts) || !opts.includes(q.correctAnswer)) {
          issues.push(`#${q.id}: answer not among options`);
        }
        if (!q.question.trim()) issues.push(`#${q.id}: empty stem`);
        if (seenKeys.has(q.sourceKey)) issues.push(`#${q.id}: duplicate sourceKey ${q.sourceKey}`);
        seenKeys.add(q.sourceKey);
        const file = q.sourceKey.split(":")[1] ?? "?";
        const set = perFileNums.get(file) ?? new Set<number>();
        if (q.questionNumber !== null && set.has(q.questionNumber)) {
          issues.push(`#${q.id}: duplicate questionNumber ${q.questionNumber} in ${file}`);
        }
        if (q.questionNumber !== null) set.add(q.questionNumber);
        perFileNums.set(file, set);
      }
      console.log(`\nverify: ${rows} rows in namespace ${KEY_NS}: — ${issues.length} issues`);
      for (const i of issues.slice(0, 20)) console.log(`   [issue] ${i}`);

      console.log(`cache: ${await invalidateExamTreeAcrossProcesses()}`);
    } else {
      for (const leaf of Object.keys(expectedByLeaf)) perLeaf[leaf] = (preCounts[leaf] ?? 0) + expectedByLeaf[leaf];
      console.log(`\ndry run — ${Object.values(expectedByLeaf).reduce((a, b) => a + b, 0)} questions would be written`);
    }

    const md = formatReport(outcomes, preCounts, { rows, issues, perLeaf }, applied);
    mkdirSync(join("database", "backups"), { recursive: true });
    const reportFile = join("database", "backups", `bank-math-updated-ii-report-${Date.now()}.md`);
    writeFileSync(reportFile, md);
    console.log(`report -> ${reportFile}`);
    if (issues.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const invoked = process.argv[1]?.endsWith("import-bank-math-updated-ii.ts");
if (invoked) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
