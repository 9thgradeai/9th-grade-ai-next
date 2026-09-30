/**
 * scripts/import-bcs-math-raw-unicode.ts
 *
 * RE-IMPORTS every BCS Mathematics MCQ (subject 608 "গাণিতিক যুক্তি",
 * ecosystem 1) verbatim from the nine supplied .txt files under
 * `database/data/ques/Math/`.
 *
 *   npx tsx scripts/import-bcs-math-raw-unicode.ts              # dry run
 *   npx tsx scripts/import-bcs-math-raw-unicode.ts --apply      # write
 *
 * Why this exists
 * ---------------
 * `scripts/seed-math.ts` already seeded these same nine files into subject 608,
 * but it ran every field through `normalizeMcqFields` + `scanMca`, which
 * rewrites a large share of this Unicode into `$...$` LaTeX and silently drops
 * rows it cannot render (the live pool was 1944 rows out of 2017 source blocks).
 * This importer keeps the *parse* and the *routing*, and throws away the
 * normalisation: `question`, `options`, `correctAnswer` and `explanation` are
 * stored byte-identical to the source and every row is written with
 * `rawMath = true`, so `backend/services/content.ts` skips
 * `normalizeFieldForDisplay` and the dashboard renders the book's own glyphs.
 *
 * Two source layouts are handled (see `parsePipeFile` / `parseBlockFile`):
 *   - single-paragraph  `N. stem ক. a খ. b গ. c ঘ. d | উত্তর: গ | ব্যাখ্যা: …`
 *   - multi-line block  `প্রশ্ন N. stem` / `A.` … `D.` / `উত্তর: C` / `ব্যাখ্যা:`
 *
 * Routing
 * -------
 * The five `পর্ব`-sectioned files route by their own section headers. The other
 * four interleave their topics throughout and are routed by weighted keyword
 * scoring (`routeByScore`), each with an explicit keyword table below. Geometry
 * uses the same five-leaf keyword approach as `seed-math.ts` but with weights,
 * because the old flat matcher left পিথাগোরাস with 19 of 398 rows.
 *
* Repairs
 * -------
 * The drafts carry authoring leftovers. Every repair is deterministic,
 * listed per file in REPAIRS, and echoed by the dry run:
 *   errata        a `সংশোধিত প্রশ্ন` block REPLACES the flawed block above it
 *   stripScratch  drop English self-talk left inside a Bengali explanation
 *   extArabic     map stray Extended-Arabic digits ۰۱৪۸۹ to Bengali ০১৪৮৯
 *   confusables   map a Telugu option label standing in for Bengali খ/গ
 *   dedupe        keep the first complete candidate for a reused printed
 *                 question number (an aborted re-draft, or the byte-identical
 *                 repeat of Q151-200 in Simple & Compound Interest)
 *   vietnamese    map the one Vietnamese option `điều harmonic` to `জ্যামিতিক`
 *
 * 2017 source blocks - 10 errata replacements - 58 duplicate blocks
 *   - 6 excluded defective MCQs = 1943 questions.
 *
 * Identity is preserved
 * ---------------------
 * `UserQuestionProgress` cascades on delete and `QuestionAttempt.questionId`
 * is `SetNull`, so a delete-and-recreate swap would silently discard mastery.
 * Every parsed row is instead paired with the row it replaces by re-deriving
 * the text `seed-math.ts` stored (`scanMca(normalizeMcqFields(raw))`) and
 * UPDATED IN PLACE, keeping the original `Question.id`. Only genuinely new
 * questions are inserted and only questions absent from all nine sources are
 * removed. The match also indexes the raw form, so a re-run after an
 * interrupted `--apply` re-finds its own rows instead of orphaning them.
 *
 * Every run first writes a full JSON backup of the pool plus its
 * `QuestionAttempt` / `UserQuestionProgress` rows to `database/backups/`.
 *
 * See ADR-038 in docs/DECISIONS.md.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { normalizeMcqFields } from "../backend/services/math";
import { scanMca } from "./qb-forensics/import-gate";

const prisma = new PrismaClient();

const SUBJECT_ID = 608;
const ECOSYSTEM_ID = 1;
const MATH_DIR = join(process.cwd(), "database/data/ques/Math");
const P = "08_গাণিতিক_যুক্তি";

// ─────────────────────────────────────────────────────── routing targets

/** Existing leaf paths, by topic id, for the ones we reuse as-is. */
const LEAF = {
  REAL_NUMBERS: `${P}/Part_01_পাটিগণিত/বাস্তব_সংখ্যা`, // 19809
  HCF_LCM: `${P}/Part_01_পাটিগণিত/লসাগু_ও_গসাগু`, // 19810
  PERCENTAGE: `${P}/Part_01_পাটিগণিত/শতকরা`, // 19811
  SIMPLE_COMPOUND: `${P}/Part_01_পাটিগণিত/সরল_ও_যৌগিক_মুনাফা`, // 19812
  RATIO: `${P}/Part_01_পাটিগণিত/অনুপাত_ও_সমানুপাত`, // 19813
  PROFIT_LOSS: `${P}/Part_01_পাটিগণিত/লাভ_ও_ক্ষতি`, // 19814
  FORMULAE: `${P}/Part_02_বীজগণিত/বীজগাণিতিক_সূত্রাবলি`, // 19816
  FACTORS: `${P}/Part_02_বীজগণিত/বহুপদী_উৎপাদক`, // 19817
  SIMPLE_EQ: `${P}/Part_02_বীজগণিত/সরল_সহসমীকরণ`, // 19820
  INDICES: `${P}/Part_03_সূচক_ও_ধারা/সূচক`, // 19822
  LOGS: `${P}/Part_03_সূচক_ও_ধারা/লগারিদম`, // 19823
  AP: `${P}/Part_03_সূচক_ও_ধারা/সমান্তর_অনুক্রম_ও_ধারা`, // 19824
  GP: `${P}/Part_03_সূচক_ও_ধারা/গুণোত্তর_অনুক্রম_ও_ধারা`, // 19825
  ANGLES: `${P}/Part_04_জ্যামিতি/রেখা_ও_কোণ_সংক্রান্ত_উপপাদ্য`, // 19827
  TRIANGLE: `${P}/Part_04_জ্যামিতি/ত্রিভুজ_সংক্রান্ত_উপপাদ্য`, // 19828
  QUADRILATERAL: `${P}/Part_04_জ্যামিতি/চতুর্ভুজ_সংক্রান্ত_উপপাদ্য`, // 19829
  PYTHAGORAS: `${P}/Part_04_জ্যামিতি/পিথাগোরাসের_উপপাদ্য`, // 19830
  CIRCLE: `${P}/Part_04_জ্যামিতি/বৃত্ত_সংক্রান্ত_উপপাদ্য`, // 19831
} as const;

/** Leaf topics created by this import (the files' own orphan sections). */
const NEW_LEAVES: { parent: string; name: string; why: string }[] = [
  { parent: `${P}/Part_01_পাটিগণিত`, name: "মিশ্রিত_ও_অ্যাডভান্সড_MCQ", why: "Percentage & Profit_Loss পর্ব ৩" },
  { parent: `${P}/Part_01_পাটিগণিত`, name: "বয়স_সংক্রান্ত_সমস্যা", why: "Ratio, Age & Partnership পর্ব ২" },
  { parent: `${P}/Part_01_পাটিগণিত`, name: "অংশীদারি_কারবার", why: "Ratio, Age & Partnership পর্ব ৩" },
  { parent: `${P}/Part_03_সূচক_ও_ধারা`, name: "বিশেষ_ধারা_ও_মধ্যক", why: "AP & GP পর্ব ৫" },
];

// ─────────────────────────────────────────────────────── keyword routing

/**
 * Weighted keyword tables. Score = number of distinct keywords present in the
 * question + explanation; highest wins, ties break by declaration order, and a
 * zero score falls back to `default`.
 */
type Router = { leaf: string; words: string[]; weight?: number };

const ROUTERS: Record<string, { routers: Router[]; default: string }> = {
  indices: {
    default: LEAF.INDICES,
    routers: [
      { leaf: LEAF.LOGS, words: ["log", "লগারিদম", "logarithm"] },
      { leaf: LEAF.INDICES, words: ["সূচক", "index", "exponent", "ঘাত", "পরিঘাত"] },
    ],
  },
  algebra: {
    default: LEAF.FORMULAE,
    routers: [
      {
        leaf: LEAF.FACTORS,
        words: [
          "উৎপাদক", "উৎপাদন", "গুণোযোগ", "ভাগ করলে ভাগশেষ", "ভাগশেষ", "গুণযোগ",
          "কোন বহুপদ", "বহুপদী", "সমীকরণের রূপে প্রকাশ", "যে বহুপদ",
        ],
      },
      {
        leaf: LEAF.FORMULAE,
        words: [
          "সূত্র", "উপপাদ্য", "সরলীকরণ", "রূপান্তর", "মান নির্ণয়", "এর মান কত",
          "পূর্ণবর্গ", "বর্গের পার্থক্য", "বর্গের সমষ্টি", "সমতলীয়",
          "সমানুপাতে রূপান্তর", "ত্রিভুজের সমীকরণ", "বর্গফল",
        ],
      },
    ],
  },
  geometry: {
    default: LEAF.ANGLES,
    routers: [
      {
        leaf: LEAF.CIRCLE,
        words: [
          "বৃত্ত", "জ্যা", "ব্যাস", "চাপ", "স্পর্শক", "কেন্দ্র", "পরিধি", "বৃত্তকলা",
          "বৃত্তাংশ", "অর্ধবৃত্ত", "চক্রের", "সমতল", "কোণের দ্বারা", "অভিলম্ব",
        ],
      },
      {
        leaf: LEAF.PYTHAGORAS,
        words: [
          "পিথাগোরাস", "সমদ্বিবাহু", "অতিভুজ", "সমকোণী", "মই", "সিঁড়ি", "খুঁটি",
          "দণ্ডায়মান", "স্থানাঙ্ক", "সোজাসুজি", "সর্বাধিক", "প্রমাণ করা",
        ],
      },
      {
        leaf: LEAF.TRIANGLE,
        words: [
          "ত্রিভুজ", "সমবাহু", "মধ্যমা", "সর্বসম", "সদৃশ", "লম্বকেন্দ্র", "ভরকেন্দ্র",
          "পরিকেন্দ্র", "অন্তঃকেন্দ্র", "পরিবৃত্ত", "অন্তর্বৃত্ত", "উচ্চতা", "মধ্যবিন্দু",
          "বিস্তৃতি", "সমদ্বিখণ্ড",
        ],
      },
      {
        leaf: LEAF.QUADRILATERAL,
        words: [
          "চতুর্ভুজ", "সামান্তরিক", "আয়ত", "বর্গ", "রম্বস", "ট্রাপিজি", "কর্ণ",
          "ঘুড়ি", "ঘনক", "ঘনবস্তু", "আয়তঘন", "সমদ্বিবাহু চতুর্ভুজ",
        ],
      },
      {
        leaf: LEAF.ANGLES,
        words: [
          "পূরক", "সম্পূরক", "সন্নিহিত", "বিপ্রতীপ", "সমান্তরাল", "ছেদক", "ছেদ",
          "কোণ", "বহুভুজ", "ষড়ভুজ", "পঞ্চভুজ", "অন্তঃস্থ", "বহিঃস্থ", "সমতল রেখা",
        ],
      },
    ],
  },
};

function routeByScore(
  router: { routers: Router[]; default: string },
  text: string
): string {
  let best = router.default;
  let bestScore = 0;
  for (const r of router.routers) {
    let s = 0;
    for (const w of r.words) if (text.includes(w)) s += r.weight ?? 1;
    if (s > bestScore) {
      bestScore = s;
      best = r.leaf;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────── source table

type Repair = "errata" | "stripScratch" | "extArabic" | "vietnamese" | "confusables" | "dedupe";

type Source = {
  file: string;
  layout: "pipe" | "block";
  /** Explicit section → leaf mapping, by the literal `পর্ব N:` prefix. */
  sections?: Array<{ match: string; leaf: string }>;
  /** Content-based routing for files that interleave their topics. */
  router?: keyof typeof ROUTERS;
  /** Leaf for every block when the file has one topic only. */
  leaf?: string;
  repairs: Repair[];
  /** Printed question numbers to exclude, mapped to why they are unusable. */
  drop?: Record<number, string>;
  expect: number;
  note?: string;
};

const SOURCES: Source[] = [
  {
    file: "Questions-(Number System & HCF_LCM)-(9Th-Grade AI).txt",
    layout: "pipe",
    sections: [
      { match: "পর্ব ১", leaf: LEAF.REAL_NUMBERS },
      { match: "পর্ব ২", leaf: LEAF.HCF_LCM },
    ],
    repairs: [],
    drop: {
      87: "all four options are the same value (the source says so outright)",
    },
    expect: 199,
  },
  {
    file: "Questions-(Percentage & Profit_Loss)-(9Th-Grade AI).txt",
    layout: "pipe",
    sections: [
      { match: "পর্ব ১", leaf: LEAF.PERCENTAGE },
      { match: "পর্ব ২", leaf: LEAF.PROFIT_LOSS },
      { match: "পর্ব ৩", leaf: `${P}/Part_01_পাটিগণিত/মিশ্রিত_ও_অ্যাডভান্সড_MCQ` },
    ],
    repairs: [],
    expect: 200,
  },
  {
    file: "Questions-(Ratio, Age & Partnership)-(9Th-Grade AI).txt",
    layout: "pipe",
    sections: [
      { match: "পর্ব ১", leaf: LEAF.RATIO },
      { match: "পর্ব ২", leaf: `${P}/Part_01_পাটিগণিত/বয়স_সংক্রান্ত_সমস্যা` },
      { match: "পর্ব ৩", leaf: `${P}/Part_01_পাটিগণিত/অংশীদারি_কারবার` },
    ],
    repairs: ["extArabic"],
    drop: {
      89: "options B and D are both 25, so two choices are correct",
      130: "the source's own answer is 'option not applicable'; its worked solution gives 2 years, which is not on offer",
    },
    expect: 198,
    note: "পর্ব ১ question 163 stem contains ۱০۰ۦ (Extended-Arabic)",
  },
  {
    file: "Questions-(Simple & Compound Interest)-(9Th-Grade AI).txt",
    layout: "pipe",
    leaf: LEAF.SIMPLE_COMPOUND,
    repairs: ["extArabic", "confusables", "dedupe"],
    drop: {
      144: "options A and C are both 155, so two choices are correct",
    },
    expect: 199,
    note: "all seven পর্ব sections are this one chapter; stems 64 and 123 contain ۧ৪৪০ / ১৫০০০, and Q68 was drafted with a Telugu option label standing in for Bengali খ/গ. Questions 151-200 each appear TWICE, byte-identically, so the file holds 200 distinct questions rather than 250",
  },
  {
    file: "Questions-(সমান্তর ও গুণোত্তর ধারা (AP & GP))-(9Th-Grade AI).txt",
    layout: "pipe",
    sections: [
      { match: "পর্ব ১", leaf: LEAF.AP },
      { match: "পর্ব ২", leaf: LEAF.AP },
      { match: "পর্ব ৩", leaf: LEAF.GP },
      { match: "পর্ব ৪", leaf: LEAF.GP },
      { match: "পর্ব ৫", leaf: `${P}/Part_03_সূচক_ও_ধারা/বিশেষ_ধারা_ও_মধ্যক` },
    ],
    repairs: ["dedupe"],
    drop: {
      179: "options A and B are both 7/16, and the stated answer 77/176 is the same number written differently",
      198: "three of the four options are all a²+b²+c²",
    },
    expect: 197,
    note: "207 numbered lines, but only 199 distinct questions: eight numbers (95, 127, 144, 159, 160, 185, 191, 196) were re-used for an aborted re-draft, and question 96 is absent from the file entirely",
  },
  {
    file: "Questions(সূচক ও লগারিদম)_9Th-Grade AI.txt",
    layout: "block",
    router: "indices",
    repairs: ["stripScratch", "vietnamese"],
    expect: 200,
    note: "the .docx twin yields byte-identical stems, so the .txt is authoritative; indices and logs interleave throughout",
  },
  {
    file: "Questions(বীজগাণিতিক_সূত্রাবলি ও বহুপদী_উৎপাদক).txt",
    layout: "block",
    router: "algebra",
    repairs: [],
    expect: 200,
    note: "formula and factorisation questions interleave throughout",
  },
  {
    file: "Questions(রেখা ও কোণ, ত্রিভুজ, চতুর্ভুজ, পিথাগোরাস এবং বৃত্ত ).txt",
    layout: "block",
    router: "geometry",
    repairs: ["errata", "stripScratch", "extArabic"],
    expect: 400,
    note: "404 blocks, 4 of which are সংশোধিত errata that replace the block above",
  },
  {
    file: "Questions(সরল_সহসমীকরণ ).txt",
    layout: "block",
    leaf: LEAF.SIMPLE_EQ,
    repairs: ["errata", "stripScratch", "extArabic"],
    expect: 150,
    note: "156 blocks, 6 of which are সংশোধিত errata that replace the block above; routed to সরল_সহসমীকরণ, the topic the file is named after",
  },
];

// ─────────────────────────────────────────────────────── repairs

// Digit tables are built from code points, never typed as literals: a hand-typed
// table rots silently. The first draft of this file stored U+06E7 in the slot for
// U+06F1 and Bengali U+09EA in the slot for U+06F4, so those two digits were never
// matched and every question using them kept its raw foreign digits.
const digitsFrom = (base: number) =>
  String.fromCodePoint(...Array.from({ length: 10 }, (_, i) => base + i));
const EXT_ARABIC = digitsFrom(0x06f0);
const BENGALI = digitsFrom(0x09e6);
const mapExtArabic = (s: string) =>
  [...s].map((c) => (EXT_ARABIC.includes(c) ? BENGALI[EXT_ARABIC.indexOf(c)] : c)).join("");

/**
 * Look-alike letters from other Indic scripts, mapped onto the Bengali letter
 * they are impersonating. Simple & Compound Interest Q68 was drafted with
 * Telugu KHA/GA in place of Bengali খ/গ, which silently hid both options.
 */
const CONFUSABLES: Record<string, string> = {
  "ఖ": "খ", // TELUGU LETTER KHA
  "గ": "গ", // TELUGU LETTER GA
  "ఘ": "ঘ", // TELUGU LETTER GHA
  "క": "ক", // TELUGU LETTER KA
};
const mapConfusables = (s: string) =>
  [...s].map((c) => CONFUSABLES[c] ?? c).join("");

const VIETNAMESE: Record<string, string> = { "điều harmonic": "জ্যামিতিক" };

/**
 * English self-talk the drafts left inside a Bengali explanation. Each pattern is
 * a whole line (or a bracketed aside) that carries no answer content — the same
 * Bengali solution lines around it are kept.
 */
const SCRATCH = [
  /^\s*Let's\b.*$/i,
  /^\s*\d[\d\s]*[a-z+\-*/=().^, ]*\(bad numbers\).*$/i,
  /^\s*\(Wait\.?.*$/i,
  /^\s*5x-3y=10.*$/i,
  /^\s*\(All options are.*$/i,
  /^\s*.*\bLet's\b\s*(use|fix|change|make|add|check|provide|re-verify).*$/i,
  /\(Wait, let's re-verify the expression\)/i,
  /\(এখানে একটু ভিন্নভাবে করা যাক\)/g,
  /ধরি প্রশ্নটি:.*$/,
  /.*একটু জটিল হতে পারে।.*$/,
  /^.*সংশোধিত উত্তর:.*$/,
];

function stripScratch(explanation: string): { text: string; stripped: number } {
  const lines = explanation.split("\n").map((l) => l.trimEnd());
  let stripped = 0;
  const kept: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    const hit = SCRATCH.some((re) => re.test(line.trim()));
    if (hit) {
      stripped++;
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), stripped };
}

// ─────────────────────────────────────────────────────── parsing

type Parsed = {
  printed: number;
  stem: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  section: string;
  repairs: string[];
};

const RE_SECTION = /^পর্ব\s*([০-৯\d]+)\s*[:.]\s*(.*)$/;
const RE_PIPE_Q = /^([০-৯]+)\s*\.\s*(.*)$/;
const RE_BLOCK_HEAD = /^\s*(সংশোধিত প্রশ্ন|প্রশ্ন)\s*([০-৯\d]*)\s*[:.]\s*(.*)$/;
const RE_OPTION_LINE = /^([A-D])\s*\.\s*(.*)$/;
const RE_ANSWER = /^উত্তর\s*:\s*(.*)$/;
const RE_EXPL_LABEL = /^ব্যাখ্যা\s*:?\s*(.*)$/;

/**
 * The single-paragraph option run.
 *
 * Only a Latin `.` counts as the label period. Bengali uses `।` (danda) as
 * sentence punctuation, so accepting it here made Ratio Q43's "…অর্ধেক। গ কত…"
 * look like a `ক` option label. The space after the period is optional
 * because Ratio Q13 was drafted as `খ.৩`.
 */
const RE_OPTION_RUN = /(ক|খ|গ|ঘ)\s*\.\s*/g;

function toInt(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  return Number([...s].map((c) => BENGALI.indexOf(c)).join(""));
}

/** Splits the `N. stem ক. a খ. b গ. c ঘ. d | উত্তর: গ | ব্যাখ্যা: …` layout. */
function parsePipeLine(line: string): Parsed | null {
  let body = line;
  let explanation = "";
  const expAt = body.indexOf("ব্যাখ্যা:");
  if (expAt >= 0) {
    explanation = body.slice(expAt + "ব্যাখ্যা:".length).replace(/^\|+\s*/, "").trim();
    body = body.slice(0, expAt).trim();
  }

  let answerLetter = "";
  const ansAt = body.search(/(?:^|\s*\|)\s*উত্তর\s*:/);
  if (ansAt >= 0) {
    answerLetter = body
      .slice(ansAt)
      .replace(/^.*উত্তর\s*:\s*/, "")
      .replace(/\s*\|.*$/, "")
      .trim()
      .replace(/[.।|]\s*$/, "")
      .trim();
    body = body.slice(0, ansAt).replace(/\s*\|+\s*$/, "").trim();
  }

  const marks: Array<{ letter: string; labelAt: number; valueAt: number }> = [];
  RE_OPTION_RUN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_OPTION_RUN.exec(body)) !== null)
    marks.push({ letter: m[1], labelAt: m.index, valueAt: m.index + m[0].length });

  // Anchor the run on the LAST label and walk backwards to ঘ→গ→খ→ক, taking the
  // nearest earlier match at each step. A forward scan cannot work here: the
  // option text itself contains label-shaped sequences ("গ.সা.গু" in Number System
  // Q121), and a stem can spell out "ক পায় খ …", both of which inject stray labels.
  const pick: Array<{ letter: string; labelAt: number; valueAt: number }> = [];
  let limit = marks.length;
  for (const letter of ["ঘ", "গ", "খ", "ক"]) {
    let at = -1;
    for (let i = limit - 1; i >= 0; i--)
      if (marks[i].letter === letter) {
        at = i;
        break;
      }
    if (at < 0) return null;
    pick.push(marks[at]);
    limit = at;
  }
  pick.reverse();
  const first = pick;

  const stem = body.slice(0, first[0].labelAt).trim();
  const options = first.map((x, i) => body.slice(x.valueAt, i + 1 < 4 ? first[i + 1].labelAt : body.length).trim());
  const idx = "কখগঘ".indexOf(answerLetter);
  return {
    printed: 0,
    stem,
    options,
    correctAnswer: idx >= 0 ? (options[idx] ?? "") : answerLetter,
    explanation,
    section: "",
    repairs: [],
  };
}

function parsePipeFile(raw: string, src: Source): Parsed[] {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const out: Parsed[] = [];
  let section = "";
  let n = 0;
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    const sm = RE_SECTION.exec(s);
    if (sm) {
      section = s;
      continue;
    }
    const qm = RE_PIPE_Q.exec(s);
    if (!qm) continue;
    const rec = parsePipeLine(qm[2]);
    if (!rec) continue;
    rec.printed = toInt(qm[1]);
    rec.section = section;
    out.push(rec);
    n++;
  }
  void n;

  if (!src.repairs.includes("dedupe")) return out;

  // Two drafts re-used printed question numbers for aborted rewrites. Keep the
  // first candidate for each number and drop later ones: in AP & GP the later
  // copy is the one that lost its options (Q185) or gained a "no valid option"
  // answer, and in Simple & Compound Interest Q151-200 are repeated verbatim.
  const seen = new Set<number>();
  const kept: Parsed[] = [];
  let dropped = 0;
  for (const rec of out) {
    if (seen.has(rec.printed)) {
      dropped++;
      continue;
    }
    seen.add(rec.printed);
    kept.push(rec);
  }
  console.log(`    dedupe: kept ${kept.length}, dropped ${dropped} aborted re-draft(s)`);
  return kept;
}

/** Splits the `প্রশ্ন N. / A.–D. / উত্তর: / ব্যাখ্যা:` block layout. */
function parseBlockFile(raw: string, src: Source): Parsed[] {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (RE_BLOCK_HEAD.test(line)) {
      if (cur.length) blocks.push(cur);
      cur = [line];
    } else if (cur.length) {
      cur.push(line);
    }
  }
  if (cur.length) blocks.push(cur);

  const errata = src.repairs.includes("errata");
  const groups: string[][] = [];
  for (const b of blocks) {
    const head = b[0].trim();
    // A সংশোধিত block is the file's own errata: it REPLACES the flawed block
    // immediately above it rather than adding a sixth question.
    if (errata && head.startsWith("সংশোধিত প্রশ্ন")) groups.pop();
    groups.push(b);
  }

  return groups.map((b, i) => {
    const head = RE_BLOCK_HEAD.exec(b[0].trim())!;
    const stem = head[3].trim();
    const options: string[] = [];
    let answerRaw = "";
    let inExpl = false;
    const expl: string[] = [];
    for (const raw2 of b.slice(1)) {
      const v = raw2.trim();
      if (!v) continue;
      const om = RE_OPTION_LINE.exec(v);
      if (om && !inExpl && options.length < 4) {
        options.push(om[2].trim());
        continue;
      }
      const am = RE_ANSWER.exec(v);
      if (am && !inExpl) {
        answerRaw = am[1].trim();
        continue;
      }
      const em = RE_EXPL_LABEL.exec(v);
      if (em) {
        inExpl = true;
        if (em[1].trim()) expl.push(em[1].trim());
        continue;
      }
      if (inExpl) expl.push(v);
    }
    let correctAnswer = answerRaw;
    const letter = /^([A-Da-d])\s*[.।)]?$/.exec(correctAnswer.trim());
    if (letter && options.length === 4)
      correctAnswer = options[letter[1].toUpperCase().charCodeAt(0) - 65] ?? correctAnswer;
    else if (correctAnswer) {
      const sq = (s: string) => s.replace(/\s+/g, "");
      correctAnswer = options.find((o) => o === correctAnswer || sq(o) === sq(correctAnswer)) ?? correctAnswer;
    }
    return {
      printed: head[2] ? toInt(head[2]) : i + 1,
      stem,
      options,
      correctAnswer: correctAnswer.trim(),
      explanation: expl.join("\n").trim(),
      section: "",
      repairs: [],
    };
  });
}

// ─────────────────────────────────────────────────────── assembly

type Row = { rec: Parsed; leaf: string; file: string };

function buildRows(src: Source, raw: string): { rows: Row[]; notes: string[] } {
  const notes: string[] = [];

  // Both mappings run on the RAW text, before parsing, because each defect hides
  // structure from the regexes rather than merely looking wrong:
  //   - the Telugu letters standing in for Bengali খ and গ are not option labels,
  //     so the option run is never found and the question is dropped outright;
  //   - JS `\d` is ASCII-only, so a block head numbered with an Extended-Arabic
  //     digit never matches RE_BLOCK_HEAD, so that block is dropped as well.
  const nExt = (raw.match(/[\u06f0-\u06f9]/g) ?? []).length;
  const nConf = (raw.match(/[\u0c00-\u0c7f]/g) ?? []).length;

  let text = raw;
  if (src.repairs.includes("extArabic") && nExt) {
    text = mapExtArabic(text);
    notes.push(`extArabic: mapped ${nExt} Extended-Arabic digit(s) to Bengali`);
  }
  if (src.repairs.includes("confusables") && nConf) {
    text = mapConfusables(text);
    notes.push(`confusables: mapped ${nConf} Telugu letter(s) to Bengali`);
  }

  let recs = src.layout === "pipe" ? parsePipeFile(text, src) : parseBlockFile(text, src);

  // Exclude the questions whose source cannot yield a usable MCQ. These are not
  // parse failures and must not be "repaired": the missing distractor would have
  // to be invented, and one of them has no answer to key against at all.
  if (src.drop) {
    const kept = recs.filter((rec) => {
      const why = src.drop![rec.printed];
      if (!why) return true;
      notes.push(`dropped #${rec.printed}: ${why}`);
      return false;
    });
    recs = kept;
  }

  if (recs.length !== src.expect)
    notes.push(`parsed ${recs.length} blocks, expected ${src.expect}`);

  const rows: Row[] = [];
  for (const rec of recs) {
    const applied: string[] = [];

    if (src.repairs.includes("vietnamese")) {
      const before = rec.options.join(" ");
      rec.options = rec.options.map((o) => VIETNAMESE[o] ?? o);
      if (rec.options.join(" ") !== before) applied.push("vietnamese");
      if (VIETNAMESE[rec.correctAnswer]) rec.correctAnswer = VIETNAMESE[rec.correctAnswer];
    }
    if (src.repairs.includes("stripScratch")) {
      const { text, stripped } = stripScratch(rec.explanation);
      if (stripped) {
        rec.explanation = text;
        applied.push(`stripScratch x${stripped}`);
      }
    }

    let leaf: string;
    if (src.router) {
      leaf = routeByScore(ROUTERS[src.router], `${rec.stem}\n${rec.explanation}\n${rec.options.join(" ")}`);
    } else if (src.sections) {
      const hit = src.sections.find((s) => rec.section.startsWith(s.match));
      if (!hit) {
        notes.push(`#${rec.printed}: section ${JSON.stringify(rec.section)} matched no mapping`);
        leaf = src.leaf ?? "";
      } else {
        leaf = hit.leaf;
      }
    } else {
      leaf = src.leaf ?? "";
    }

    rows.push({ rec: { ...rec, repairs: applied }, leaf, file: src.file });
  }
  return { rows, notes };
}

// ─────────────────────────────────────────────────────── main

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY MODE — rows will be written\n" : "DRY RUN — no database writes\n");

  // 1. topic ids
  const byPath = new Map<string, number>();
  for (const t of await prisma.topic.findMany({ where: { subjectId: SUBJECT_ID } })) byPath.set(t.path, t.id);
  const missing = new Set<string>();
  for (const s of SOURCES) {
    for (const leaf of [
      ...(s.sections ?? []).map((x) => x.leaf),
      ...(s.router ? Object.values(ROUTERS[s.router].routers).map((r) => r.leaf) : []),
      ...(s.leaf ? [s.leaf] : []),
    ])
      if (!byPath.has(leaf)) missing.add(leaf);
  }
  for (const leaf of missing)
    console.log(`  NEW TOPIC  ${leaf}${NEW_LEAVES.some((n) => `${n.parent}/${n.name}` === leaf) ? "" : "  (unexpected!)"}`);

  // 2. parse every file
  const allRows: Row[] = [];
  const fileNotes: string[] = [];
  for (const src of SOURCES) {
    const raw = readFileSync(join(MATH_DIR, src.file), "utf8");
    const { rows, notes } = buildRows(src, raw);
    allRows.push(...rows);
    console.log(
      `${src.file.slice(0, 52).padEnd(54)} parsed=${String(rows.length).padStart(4)} expect=${String(src.expect).padStart(4)}` +
        (src.repairs.length ? ` repairs=${src.repairs.join(",")}` : "")
    );
    notes.forEach((n) => console.log(`    NOTE ${n}`));
    fileNotes.push(...notes);
    if (src.note) console.log(`    (${src.note})`);
  }

  // 3. distribution
  const dist = new Map<string, number>();
  for (const r of allRows) dist.set(r.leaf, (dist.get(r.leaf) ?? 0) + 1);
  console.log(`\ntotal ${allRows.length} rows across ${dist.size} leaves`);
  const topicRows = [...dist.entries()].sort((a, b) => b[1] - a[1]);
  // One grouped query: a per-leaf count loop held the pooled connection open
  // long enough for Neon to close it under us.
  const existingCounts = new Map<number, number>();
  for (const row of await prisma.question.groupBy({
    by: ["topicId"],
    where: { subjectId: SUBJECT_ID },
    _count: { _all: true },
  }))
    existingCounts.set(row.topicId as number, row._count._all);
  for (const [leaf, n] of topicRows) {
    const id = byPath.get(leaf);
    const existing = id ? (existingCounts.get(id) ?? 0) : null;
    console.log(`  ${String(n).padStart(4)}  ${leaf.replace(P + "/", "")}${id ? `   (topic ${id}, existing ${existing})` : "   (NEW TOPIC)"}`);
  }

  // 4. validate
  const problems: string[] = [];
  for (const r of allRows) {
    const { rec } = r;
    const where = `${r.file.slice(0, 22)} #${rec.printed}`;
    if (!rec.stem) problems.push(`${where}: empty stem`);
    if (rec.options.length !== 4) problems.push(`${where}: ${rec.options.length} options`);
    if (rec.options.some((o) => !o)) problems.push(`${where}: empty option`);
    if (!rec.correctAnswer) problems.push(`${where}: answer not resolvable`);
    if (rec.correctAnswer && rec.options.length === 4 && !rec.options.includes(rec.correctAnswer))
      problems.push(`${where}: answer ${JSON.stringify(rec.correctAnswer)} not among options`);
    if (new Set(rec.options).size !== rec.options.length) problems.push(`${where}: duplicate option text`);
    if (!r.leaf) problems.push(`${where}: unrouted`);
    if (/\$\$/.test(rec.stem + rec.options.join("") + rec.explanation)) problems.push(`${where}: stray $$`);
  }
  const leftover = allRows.filter(
    (r) => /[۰-۹]/.test(r.rec.stem + r.rec.options.join("") + r.rec.explanation)
  );
  leftover.slice(0, 10).forEach((r) => problems.push(`${r.file.slice(0, 22)} #${r.rec.printed}: Extended-Arabic digit survived`));
  const scratchLeft = allRows.filter((r) => SCRATCH.some((re) => re.test(r.rec.explanation.trim())));
  scratchLeft.slice(0, 10).forEach((r) => problems.push(`${r.file.slice(0, 22)} #${r.rec.printed}: scratchpad line survived`));

  console.log(`\n${problems.length} validation problems`);
  problems.forEach((p) => console.log(`  PROBLEM ${p}`));

  const repairCount = allRows.filter((r) => r.rec.repairs.length).length;
  console.log(`\nrepaired rows: ${repairCount}`);

  if (problems.length > 0) {
    console.error(`\nABORT — ${problems.length} validation problems; nothing was written.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // 5. plan the write: pair every parsed row with the existing row it replaces.
  // Read-only, so the dry run can show exactly what --apply would do.
  const existing = await prisma.question.findMany({
    where: { subjectId: SUBJECT_ID },
    select: { id: true, question: true, rawMath: true },
    orderBy: { id: "asc" },
  });
  // Two indexes, so a re-run after a partial --apply still finds its own rows:
  // a row seeded by seed-math.ts holds the LaTeX-normalised form, while a row
  // this script already wrote holds the raw source form.
  //
  // Values are queues, not single ids: the pool holds 1944 rows over 1943
  // distinct stems, so a stem may legitimately own several rows. Consuming one
  // entry per parsed row keeps the mapping one-to-one in either direction.
  const legacyIds = new Map<string, number[]>();
  const rawIds = new Map<string, number[]>();
  for (const r of existing) {
    const key = r.question.normalize("NFC");
    const idx = r.rawMath ? rawIds : legacyIds;
    const list = idx.get(key);
    if (list) list.push(r.id);
    else idx.set(key, [r.id]);
  }
  const take = (idx: Map<string, number[]>, key: string): number | undefined => idx.get(key)?.shift();

  type Upsert = { data: Prisma.QuestionUncheckedCreateInput; id: number | null };
  const claimed = new Set<number>();
  const matched = new Map<number, Upsert>();
  const inserted: Upsert[] = [];

  for (const leaf of dist.keys()) {
    // A new leaf has no row yet. --apply creates the topics before writing, and
    // the sourceKey namespace below is per-leaf either way, so the placeholder
    // is only ever used to key the plan.
    const topicId = byPath.get(leaf) ?? -1;
    const parts = leaf.split("/");
    const rows = allRows.filter((r) => r.leaf === leaf);
    for (const [i, r] of rows.entries()) {
      const data: Prisma.QuestionUncheckedCreateInput = {
        ecosystemId: ECOSYSTEM_ID,
        subjectId: SUBJECT_ID,
        topicId,
        path: leaf,
        topic: parts[1] ?? "",
        subtopic: parts.slice(2).join("/"),
        question: r.rec.stem,
        options: r.rec.options,
        correctAnswer: r.rec.correctAnswer,
        explanation: r.rec.explanation,
        rawMath: true,
        questionType: "SINGLE_CHOICE" as const,
        difficulty: "MEDIUM" as const,
        year: null,
        sourceExam: `BCS Mathematics · ${parts[2] ?? ""}`,
        bcsTerm: null,
        examId: null,
        paperId: null,
        questionNumber: i + 1,
      };
      // seed-math.ts stored `scanMca(normalizeMcqFields(rec)).normalized`, so
      // re-running that exact chain over our raw text reproduces the old row.
      const legacy = scanMca(
        normalizeMcqFields({
          question: r.rec.stem,
          options: r.rec.options,
          correctAnswer: r.rec.correctAnswer,
          explanation: r.rec.explanation,
        }).record
      ).normalized.question.normalize("NFC");
      const raw = r.rec.stem.normalize("NFC");
      // Prefer a row already holding our raw form (idempotent re-run), else the
      // legacy row this one replaces. Either queue hands out one row per call,
      // so a stem present N times still maps to N distinct rows.
      const hit = take(rawIds, raw) ?? take(legacyIds, legacy);
      if (hit !== undefined) {
        claimed.add(hit);
        matched.set(hit, { id: hit, data });
      } else {
        // No match at all: genuinely new content, so it needs its own key.
        inserted.push({
          id: null,
          data: {
            ...data,
            sourceKey: createHash("sha256")
              .update(`bcsmath:${leaf}:${r.file}:${r.rec.printed}:${r.rec.stem}`)
              .digest("hex")
              .slice(0, 32),
          },
        });
      }
    }
  }
  const orphans = existing.filter((r) => !claimed.has(r.id)).map((r) => r.id);

  // (subjectId, sourceKey) is unique, and an UPDATE keeps an existing row's
  // legacy key — so a planned insert must collide with neither another planned
  // insert nor a row already in the pool. Caught here rather than as a P2002
  // halfway through the write.
  const liveKeys = new Set((await prisma.question.findMany({ where: { subjectId: SUBJECT_ID }, select: { sourceKey: true } })).map((r) => r.sourceKey));
  const plannedKeys = new Map<string, string>();
  for (const u of inserted) {
    const k = u.data.sourceKey as string;
    if (liveKeys.has(k)) throw new Error(`planned insert key collides with a live row: ${k} (${u.data.path})`);
    const prior = plannedKeys.get(k);
    if (prior !== undefined) throw new Error(`planned inserts share a sourceKey: ${k} (${prior} / ${u.data.path})`);
    plannedKeys.set(k, u.data.path as string);
  }

  const [orphanProgress, orphanAttempts, orphanBookmarks] = await Promise.all([
    prisma.userQuestionProgress.groupBy({ by: ["questionId"], where: { questionId: { in: orphans } }, _count: { _all: true } }),
    prisma.questionAttempt.groupBy({ by: ["questionId"], where: { questionId: { in: orphans } }, _count: { _all: true } }),
    prisma.bookmark.count({ where: { questionId: { in: orphans } } }),
  ]);
  const sum = (g: { _count: { _all: number } }[]) => g.reduce((a, r) => a + r._count._all, 0);

  // Orphans are either rows the source no longer contains, or rows the new
  // parser reads differently (so the text match misses). Both are reported
  // before anything is written.
  const orphanRows = await prisma.question.findMany({
    where: { id: { in: orphans } },
    select: { id: true, topicId: true, question: true },
  });
  const progressByQ = new Map(orphanProgress.map((r) => [r.questionId, r._count._all]));
  const attemptsByQ = new Map(orphanAttempts.map((r) => [r.questionId, r._count._all]));
  const atRisk = orphanRows.filter((r) => progressByQ.get(r.id) || attemptsByQ.get(r.id));
  if (orphanRows.length > 0) {
    console.log(`\n  orphans carrying user data (${atRisk.length} of ${orphanRows.length}):`);
    for (const r of atRisk)
      console.log(
        `    q${r.id}  progress=${progressByQ.get(r.id) ?? 0} attempts=${attemptsByQ.get(r.id) ?? 0}  ${JSON.stringify(r.question.slice(0, 58))}`
      );
  }

  console.log(`\nidentity plan (question ids are preserved by updating in place):`);
  console.log(`  ${String(matched.size).padStart(4)}  updated in place — attempts/progress links survive`);
  console.log(`  ${String(inserted.length).padStart(4)}  inserted (no matching existing row)`);
  console.log(
    `  ${String(orphans.length).padStart(4)}  deleted — ${sum(orphanProgress)} progress, ${sum(orphanAttempts)} attempts, ${orphanBookmarks} bookmarks also removed`
  );
  if (orphans.length > 0)
    console.log(`         (attempts survive as null questionId; progress and bookmarks cascade — all captured in the backup)`);

  if (!apply) {
    console.log("\ndry run complete — re-run with --apply to write");
    await prisma.$disconnect();
    return;
  }

  // 5. create the four new leaf topics
  for (const n of NEW_LEAVES) {
    if (byPath.has(`${n.parent}/${n.name}`)) continue;
    const parentId = byPath.get(n.parent);
    if (!parentId) throw new Error(`parent topic ${n.parent} missing`);
    const sibs = await prisma.topic.count({ where: { parentId } });
    const row = await prisma.topic.create({
      data: {
        subjectId: SUBJECT_ID,
        name: n.name,
        slug: n.name,
        path: `${n.parent}/${n.name}`,
        depth: 2,
        sortOrder: sibs,
        parentId,
        questionCount: "0",
      },
    });
    byPath.set(row.path, row.id);
    console.log(`created topic ${row.id}: ${row.path}   (${n.why})`);
  }
  // Re-point the planned rows at the ids the new topics actually received. The
  // sourceKey is deliberately NOT recomputed here: it is derived from the file
  // and printed number at plan time, which keeps it unique when two rows in one
  // leaf share a stem.
  for (const u of [...matched.values(), ...inserted]) {
    const id = byPath.get(u.data.path as string);
    if (!id) throw new Error(`topic still missing for ${u.data.path}`);
    u.data = { ...u.data, topicId: id };
  }

  // 6. back up every subject-608 row, with its attempt/progress links
  mkdirSync("database/backups", { recursive: true });
  const stamp = Date.now();
  const oldAll = await prisma.question.findMany({ where: { subjectId: SUBJECT_ID }, orderBy: { id: "asc" } });
  const oldIds = oldAll.map((r) => r.id);
  const attempts = await prisma.questionAttempt.findMany({ where: { questionId: { in: oldIds } } });
  const progress = await prisma.userQuestionProgress.findMany({ where: { questionId: { in: oldIds } } });
  const backupFile = `database/backups/bcs-608-pre-rawmath-${stamp}.json`;
  writeFileSync(
    backupFile,
    JSON.stringify({ questions: oldAll, attempts, progress }, null, 2)
  );
  console.log(`\nbackup: ${oldAll.length} questions, ${attempts.length} attempts, ${progress.length} progress -> ${backupFile}`);

  // 7. write the plan computed above (matching rows are updated in place, so
  // question ids — and every QuestionAttempt / UserQuestionProgress link — survive).
  //
  // Orphans go first: nothing should reference a row we are about to rewrite.

  // Delete orphans first so nothing references a row we are about to rewrite,
  // then update matched rows in batches, then insert the rest.
  if (orphans.length > 0) {
    for (let i = 0; i < orphans.length; i += 200)
      await prisma.question.deleteMany({ where: { id: { in: orphans.slice(i, i + 200) } } });
    console.log(`deleted ${orphans.length} orphan rows`);
  }

  const updateList = [...matched.values()].map((u) => ({ id: u.id as number, data: u.data }));
  for (let i = 0; i < updateList.length; i += 100) {
    await prisma.$transaction(
      updateList.slice(i, i + 100).map((u) => prisma.question.update({ where: { id: u.id }, data: u.data }))
    );
    process.stdout.write(`\r  updated ${Math.min(i + 100, updateList.length)}/${updateList.length}`);
  }
  process.stdout.write("\n");

  for (let i = 0; i < inserted.length; i += 200) {
    const res = await prisma.question.createMany({ data: inserted.slice(i, i + 200).map((u) => u.data) });
    process.stdout.write(`\r  inserted ${Math.min(i + 200, inserted.length)}/${inserted.length}`);
    if (res.count === 0) throw new Error(`insert batch at ${i} wrote 0 rows`);
  }
  process.stdout.write("\n");
  console.log(`\nwrote ${matched.size} updated + ${inserted.length} inserted rows with rawMath=true`);

  // 8. refresh the topic counters the Practice tab reads
  for (const [leaf, id] of byPath) {
    if (!leaf.startsWith(P)) continue;
    const n = await prisma.question.count({ where: { topicId: id } });
    await prisma.topic.update({ where: { id }, data: { questionCount: String(n) } });
  }

  // 9. verify from the database
  let issues = 0;
  for (const [leaf, id] of byPath) {
    if (!leaf.startsWith(P)) continue;
    const rows = await prisma.question.findMany({ where: { topicId: id }, orderBy: { questionNumber: "asc" } });
    for (const r of rows) {
      const opts = r.options as string[];
      if (!r.rawMath) { console.error(`  ${leaf} #${r.id}: rawMath=false`); issues++; }
      if (opts.length !== 4) { console.error(`  ${leaf} #${r.id}: ${opts.length} options`); issues++; }
      if (!opts.includes(r.correctAnswer)) { console.error(`  ${leaf} #${r.id}: answer not in options`); issues++; }
    }
    console.log(`  ${String(rows.length).padStart(4)} rows  ${leaf.replace(P + "/", "")}`);
  }
  const total = await prisma.question.count({ where: { subjectId: SUBJECT_ID } });
  console.log(`\nBCS Mathematics pool: ${total} questions, ${issues} integrity issues`);
  if (issues > 0) process.exitCode = 1;

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});