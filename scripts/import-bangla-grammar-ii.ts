/**
 * scripts/import-bangla-grammar-ii.ts
 * ----------------------------------------------------------------------------
 * Imports the seven Bangla Grammar .docx sources supplied under
 *   database/data/Bank/Bangla/Grammar/*.docx                    (wave 1: four)
 *   database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/*.docx          (wave 2: three)
 * into BOTH ecosystems (BCS + Bangladesh Bank) so the Practice tab shows them
 * under the right grammar leaf.
 *
 * The .docx files are converted first (scripts/docx-bangla-grammar-to-txt.py)
 * to one-record-per-line .txt under …/Bangla/Grammar/txt/ — the exact shape
 * `parseLine` in import-bangla-grammar.ts already understands — so this script
 * never needs docx awareness. The shared staging folder sits outside
 * database/data/ques on purpose: seed-questions.ts walks that tree and would
 * otherwise ingest the generated .txt a second time.
 *
 * Conversion yields 1,212 records (wave 1: 138 + 300 + 200 + 100; wave 2:
 * 150 + 224 + 100). Three wave-2 records genuinely carry only three options in
 * the .docx and are reported as unparsed rather than padded with invented
 * content — everything else is written.
 *
 * Topic routing (leaf is relative to `<root>/ভাষা`; identical in both trees):
 *   Questions(Terminology).txt → অর্থতত্ত্ব_ও_শব্দভাণ্ডার/পরিভাষা
 *   Questions(বাগধারা).txt     → অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বাগধারা_ও_প্রবাদ_প্রবচন
 *   Questions(পদ).txt          → শব্দতত্ত্ব/পদ_ও_পদ_পরিবর্তন
 *   Questions(বাচ্য).txt       → বাক্যতত্ত্ব/বাচ্য
 *   Questions(ণ-ত্ব ও ষ-ত্ব বিধান).txt → ধ্বনিতত্ত্ব/ণ-ত্ব_ও_ষ-ত্ব_বিধি
 *   Questions(বিপরীত শব্দ).txt          → অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বিপরীতার্থক_শব্দ
 *   Questions(বিরাম চিহ্ন বা যতি চিহ্ন).txt → বাক্যতত্ত্ব/ছেদচিহ্ন_বা_বিরামচিহ্ন
 *
 * ── Record repairs (strict-first; each logged, none fire on a clean record) ──
 * The strict parser resolves 731/738 as-is. The remaining 7 are source quirks:
 *   colon         “… Ans. খ. বাধ্যতামূলক ব্যাখ্যা যা করা …” — the source omits
 *                 the colon after ব্যাখ্যা, gluing the explanation onto the
 *                 answer. Without the repair the record either fails outright
 *                 or resolves the answer while silently DROPPING the
 *                 explanation (which is exactly what parseLineTolerant in
 *                 import-bangla-vasha.ts does — hence this script resolves
 *                 answers itself rather than calling it).
 *   stray-number  “ক. ১. একগুঁয়ে ও নির্বোধ ব্যক্তি” — a leftover list marker
 *                 inside option ক makes the option longer than the answer
 *                 text. (The same question recurs in the document as record
 *                 ২৭১ without the marker, so the content is unambiguous.)
 *   latin-marker  “খ. প্রত্যয়  g. বিসর্জন” — an ASCII “g” where the গ marker
 *                 belongs (wave 2, record ৯০). Only the marker is rewritten.
 *   dup-marker    “ক. জীর্ণ খ. … ঘ. দুর্বল ঘ. ভঙ্গুর” — the third marker
 *                 repeats ঘ instead of continuing to গ (wave 2, record ১৩১).
 *                 Only the repeated marker is rewritten; option text is
 *                 untouched.
 *   gloss-answer  “Ans. ক. সত্যায়িত / প্রত্যয়িত” — the answer words gloss the
 *                 keyed option instead of restating it exactly. Resolved off
 *                 the answer LETTER (never guessed from prose), explanation
 *                 preserved verbatim.
 *   letter-keyed  “Ans. গ. নির্ঘণ্ট (বা সূচক)” while গ is “ক ও খ উভয়ই” — the
 *                 source gives an explicit answer LETTER but words that gloss
 *                 a different option. The letter is the document's key, so it
 *                 wins; the single occurrence is logged for review.
 *
 * ── Gate waivers (approved) ──
 * scanMca normally rejects two defects the sources genuinely contain:
 *   EMPTY_EXPLANATION — 13 of the 138 Terminology records carry no ব্যাখ্যা at
 *       all (true in the .docx and in the older .txt alike). Waived ONLY when
 *       the source line carries no explanation marker, so a parsing bug can
 *       never masquerade as a source omission.
 *   DUPLICATE_OPTION — Terminology 122 (খ and ঘ are both “কোষাধ্যক্ষ”) and পদ 95
 *       (ক and গ are both “ঘটমান বর্তমান, প্রথম পুরুষ”). correctAnswer is stored
 *       as option TEXT, so the keyed answer still resolves unambiguously.
 * Any other fatal code still rejects the record.
 *
 * ── Duplicate handling (three checks, in order, per record per ecosystem) ──
 * The global mcaSignature registry is scoped per ecosystem — the same MCQ
 * intentionally lives in BOTH ecosystems — so no MCQ is ever written twice:
 *   1. content already in THIS subject → at the leaf: SKIP (nothing to do);
 *      at the unclassified `<root>/ভাষা` group node: RE-POINT it into the leaf
 *      (a row parked unclassified by seed-questions.ts — skipping would leave
 *      the MCQ out of the very Practice section it belongs to, and copying it
 *      would duplicate it); anywhere else: SKIP and report the path.
 *   2. same question + option set already at this leaf (key RECOMPUTED as
 *      sourceKey(subject, path, question, options) — the stored column is
 *      ignored because seeded rows carry keys like "sqlclone:64039" that never
 *      match): UPDATE that row, unless its current content already matches
 *      another record of this file (then a second record with the same identity
 *      would only clobber good data — the (subjectId, sourceKey) uniqueness
 *      allows one row per identity anyway). The option set is part of the
 *      identity because the ণ-ত্ব source repeats one stem 80 times with
 *      different options; question-only keys would collapse 150 records to 54.
 *   3. otherwise CREATE, keyed so a repeated record in the source file can
 *      never produce a second row.
 * A record whose explanation is empty never erases an existing explanation.
 *
 * Safety: DRY RUN by default; pass --yes to write.
 *
 * Run:  npx tsx scripts/import-bangla-grammar-ii.ts [--yes]
 * ----------------------------------------------------------------------------
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { BANGLA_SUBJECT_NAMEBNS } from "./taxonomy";
import { parseLine } from "./import-bangla-grammar";

const TXT_DIR = join(process.cwd(), "database", "data", "Bank", "Bangla", "Grammar", "txt");

const LETTERS = ["ক", "খ", "গ", "ঘ", "ঙ"] as const;
const ANSWER_MARK = /(উত্তর\s*:|Ans\.\s*|Answer\s*:)/i;
const EXPLANATION_MARK = /ব্যাখ্যা\s*:|Explanation\s*:/i;

/**
 * Identity key for "is this the same question at this path?", used for the
 * in-subject stem index. Normalizing here means two spellings of one question
 * (Unicode composition, stray spaces) resolve to the same row instead of
 * quietly earning a second copy — the unique index itself only ever sees the
 * stored, un-normalized sourceKey.
 *
 * The option set is part of the identity on purpose. Several Bangla Grammar
 * sources legitimately repeat one stem with different options (the ণ-ত্ব set
 * has 150 records but only 54 distinct "কোন বানানটি শুদ্ধ?" stems). Keying on
 * the question alone would collapse them into one row; keying on
 * question + options keeps every distinct MCQ while still making a rerun
 * update the same row. Precedent: import-grammar-english.ts does the same.
 */
function stemKey(subjectId: number, path: string, question: string, options: readonly string[]): string {
  const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
  return sourceKey(subjectId, path, norm(question), options.map(norm).join(" | "));
}

type Parsed = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

type Repair = "colon" | "stray-number" | "gloss-answer" | "letter-keyed" | "latin-marker" | "dup-marker";

type FileRoute = {
  file: string;
  label: string;
  /** Taxonomy leaf (relative to `<root>/ভাষা`) — shared by both trees. */
  leaf: string;
  subtopic: string;
};

const ROUTES: FileRoute[] = [
  { file: "Questions(Terminology).txt", label: "Terminology", leaf: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/পরিভাষা", subtopic: "পরিভাষা" },
  { file: "Questions(বাগধারা).txt", label: "বাগধারা", leaf: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বাগধারা_ও_প্রবাদ_প্রবচন", subtopic: "বাগধারা" },
  { file: "Questions(পদ).txt", label: "পদ", leaf: "শব্দতত্ত্ব/পদ_ও_পদ_পরিবর্তন", subtopic: "পদ" },
  { file: "Questions(বাচ্য).txt", label: "বাচ্য", leaf: "বাক্যতত্ত্ব/বাচ্য", subtopic: "বাচ্য" },
  // Wave 2 — the three .docx sets supplied under …/ques/বাংলা ভাষা ও সাহিত্য/ভাষা.
  { file: "Questions(ণ-ত্ব ও ষ-ত্ব বিধান).txt", label: "ণ-ত্ব ও ষ-ত্ব বিধান", leaf: "ধ্বনিতত্ত্ব/ণ-ত্ব_ও_ষ-ত্ব_বিধি", subtopic: "ণ-ত্ব_ও_ষ-ত্ব_বিধি" },
  { file: "Questions(বিপরীত শব্দ).txt", label: "বিপরীত শব্দ", leaf: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বিপরীতার্থক_শব্দ", subtopic: "বিপরীতার্থক_শব্দ" },
  { file: "Questions(বিরাম চিহ্ন বা যতি চিহ্ন).txt", label: "বিরাম চিহ্ন বা যতি চিহ্ন", leaf: "বাক্যতত্ত্ব/ছেদচিহ্ন_বা_বিরামচিহ্ন", subtopic: "ছেদচিহ্ন_বা_বিরামচিহ্ন" },
];

function isParsed(p: Parsed | { skip: string } | null): p is Parsed {
  return p !== null && !("skip" in p);
}

/** Content-only signature (no ecosystem prefix) — compared against the same
 *  computation on an existing row. */
function contentSig(rec: Parsed | { question: string; correctAnswer: string; explanation: string }): string {
  const options = "options" in rec ? rec.options : [];
  return mcaSignature({ question: rec.question, options, correctAnswer: rec.correctAnswer, explanation: rec.explanation });
}

// ── Repair: missing colon after ব্যাখ্যা ───────────────────────────────────
function repairMissingExplanationColon(line: string): string | null {
  const start = line.search(ANSWER_MARK);
  if (start < 0) return null;
  const at = line.indexOf("ব্যাখ্যা", start);
  if (at < 0) return null;
  const after = at + "ব্যাখ্যা".length;
  let j = after;
  while (j < line.length && (line[j] === " " || line[j] === "\t")) j += 1;
  if (line[j] === ":" || line[j] === undefined) return null; // already split (or nothing follows)
  return `${line.slice(0, after)}:${line.slice(after)}`;
}

// ── Repair: leftover list marker inside an option ───────────────────────────
function repairStrayOptionNumber(line: string): string | null {
  const m = line.match(/([কখগঘঙ]\s*[.)]\s*)[০-৯0-9]+\.\s+/);
  if (!m) return null;
  const fixed = line.replace(m[0], m[1]);
  return fixed === line ? null : fixed;
}

// ── Repair: an ASCII g standing in for the Bangla option marker গ ───────────
// Source: Questions(বিপরীত শব্দ).docx ৯০ — "খ. প্রত্যয়  g. বিসর্জন". Only the
// marker letter is rewritten; option text stays byte-identical.
function repairLatinOptionMarker(line: string): string | null {
  if (!/[কখগঘ]\s*[.)]\s+/.test(line)) return null; // not a Bangla option list
  const m = line.match(/(^|\s)[gG]\s*[.)]\s+/);
  if (!m || m.index === undefined) return null;
  const at = m.index + m[1].length;
  return `${line.slice(0, at)}গ${line.slice(at + 1)}`;
}

// ── Repair: a duplicated option marker that skips a letter ──────────────────
// Source: Questions(বিপরীত শব্দ).docx ১৩১ — "ক. জীর্ণ খ. … ঘ. দুর্বল ঘ. ভঙ্গুর":
// the third marker repeats ঘ where the sequence must be ক খ গ ঘ. Only the
// repeated marker is rewritten, and only when that produces a strict parse.
function repairMisorderedOptionMarker(line: string): string | null {
  const expected = ["ক", "খ", "গ", "ঘ"] as const;
  const re = /(^|\s)([কখগঘ])\s*[.)]\s+/g;
  const marks: Array<{ letter: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    marks.push({ letter: m[2], index: m.index + m[1].length });
  }
  if (marks.length !== expected.length) return null;
  const bad = marks.findIndex((mk, i) => mk.letter !== expected[i]);
  if (bad < 0) return null;
  // A repeated letter is a marker typo; a one-off wrong letter is not ours.
  if (marks.filter((mk) => mk.letter === marks[bad].letter).length < 2) return null;
  const { index } = marks[bad];
  return `${line.slice(0, index)}${expected[bad]}${line.slice(index + 1)}`;
}

// ── Repairs: resolve the answer off its LETTER, keeping the explanation ─────
// The strict parser resolves a letter answer only when the remainder is empty
// or exactly the pointed-to option. Both relaxations below rewrite the record
// with the answer replaced by its bare LETTER so question/option/explanation
// extraction stays byte-identical to the strict parser, then re-attach the
// explanation tail that the naive rewrite would otherwise throw away.
function repairAnswerByLetter(line: string, opts: { requireContainment: boolean }): Parsed | null {
  const ansM = line.match(ANSWER_MARK);
  if (!ansM || ansM.index === undefined) return null;
  const ansEnd = ansM.index + ansM[0].length;
  const tail = line.slice(ansEnd);
  const explIdx = tail.search(EXPLANATION_MARK);
  const answerRaw = (explIdx >= 0 ? tail.slice(0, explIdx) : tail).trim();
  const idx = LETTERS.indexOf(answerRaw.charAt(0) as (typeof LETTERS)[number]);
  if (idx < 0) return null;
  const head = line.slice(0, ansEnd).replace(/\s+$/, "");
  const expl = explIdx >= 0 ? ` ${tail.slice(explIdx).trim()}` : "";
  const base = parseLine(`${head} ${answerRaw.charAt(0)}.${expl}`);
  if (!isParsed(base) || idx >= base.options.length) return null;
  const opt = base.options[idx];
  if (opts.requireContainment) {
    const rest = answerRaw.slice(1).replace(/^[।.:)\s]+/, "").trim();
    if (rest === "") return null; // strict already accepts an empty remainder
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const nOpt = norm(opt);
    const nRest = norm(rest);
    if (!nOpt.startsWith(nRest) && !nRest.includes(nOpt)) return null;
  }
  return { ...base, correctAnswer: opt };
}

/**
 * Strict-first record parse. Returns the record plus the repair that was
 * needed (if any), or a skip reason. Exported for unit tests.
 */
export function parseDocxRecord(
  line: string,
): { parsed: Parsed; repair?: Repair } | { skip: string } | null {
  const strict = parseLine(line);
  if (isParsed(strict)) return { parsed: strict };

  const colon = repairMissingExplanationColon(line);
  if (colon) {
    const p = parseLine(colon);
    if (isParsed(p)) return { parsed: p, repair: "colon" };
  }

  const stray = repairStrayOptionNumber(line);
  if (stray) {
    const p = parseLine(stray);
    if (isParsed(p)) return { parsed: p, repair: "stray-number" };
  }

  const latin = repairLatinOptionMarker(line);
  if (latin) {
    const p = parseLine(latin);
    if (isParsed(p)) return { parsed: p, repair: "latin-marker" };
  }

  const misordered = repairMisorderedOptionMarker(line);
  if (misordered) {
    const p = parseLine(misordered);
    if (isParsed(p)) return { parsed: p, repair: "dup-marker" };
  }

  const gloss = repairAnswerByLetter(line, { requireContainment: true });
  if (gloss) return { parsed: gloss, repair: "gloss-answer" };

  const letter = repairAnswerByLetter(line, { requireContainment: false });
  if (letter) return { parsed: letter, repair: "letter-keyed" };

  return strict;
}

/**
 * Split scanMca's fatal codes into the two defects the sources genuinely
 * contain (approved waivers) and anything still blocking.
 *
 *   EMPTY_EXPLANATION — waived ONLY when the source line carries no
 *       explanation marker at all, so a parsing bug can never masquerade as a
 *       source omission and swallow a record that does have a ব্যাখ্যা.
 *   DUPLICATE_OPTION — always waivable: correctAnswer is stored as option
 *       TEXT, so the keyed answer still resolves unambiguously even when two
 *       options carry the same words.
 */
export function waiveGateCodes(fatalCodes: readonly string[], sourceLine: string): {
  waived: string[];
  blocking: string[];
} {
  // Only the part after the answer marker can carry the explanation — a
  // ব্যাখ্যা: mentioned inside the question text proves nothing.
  const at = sourceLine.search(ANSWER_MARK);
  const tail = at >= 0 ? sourceLine.slice(at) : sourceLine;
  const hasExplanationMarker = EXPLANATION_MARK.test(tail);
  const waived = fatalCodes.filter(
    (c) => c === "DUPLICATE_OPTION" || (c === "EMPTY_EXPLANATION" && !hasExplanationMarker),
  );
  return { waived, blocking: fatalCodes.filter((c) => !waived.includes(c)) };
}

export type DupReport = { file: string; kind: "repoint" | "skip"; existingPath: string };
export type FileStats = {
  records: number;
  inserted: number;
  updated: number;
  repointed: number;
  skipped: number;
  rejected: number;
  waived: number;
  parseFailed: number;
};

export type ImportReport = {
  inserted: number;
  updated: number;
  repointed: number;
  /** Duplicates: source-file repeats + content that already lives elsewhere. */
  skipped: number;
  rejected: number;
  /** Records accepted despite a waivable gate fatal (see header). */
  waived: number;
  parseFailed: number;
  repaired: number;
  perFile: Record<string, FileStats>;
  dups: DupReport[];
  repairLog: Array<{ file: string; repair: Repair; snippet: string }>;
  waiverLog: Array<{ file: string; codes: string[]; snippet: string }>;
};

const emptyStats = (): FileStats => ({
  records: 0,
  inserted: 0,
  updated: 0,
  repointed: 0,
  skipped: 0,
  rejected: 0,
  waived: 0,
  parseFailed: 0,
});

export async function importBanglaGrammarDocx(
  prisma: PrismaClient,
  opts?: { dryRun?: boolean },
): Promise<ImportReport> {
  const dryRun = opts?.dryRun ?? !process.argv.includes("--yes");
  const report: ImportReport = {
    inserted: 0,
    updated: 0,
    repointed: 0,
    skipped: 0,
    rejected: 0,
    waived: 0,
    parseFailed: 0,
    repaired: 0,
    perFile: {},
    dups: [],
    repairLog: [],
    waiverLog: [],
  };

  const bcs = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcs || !bb) throw new Error("BCS / BANGLADESH_BANK ecosystem missing");

  const bcsSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bcs.id, nameBn: { in: BANGLA_SUBJECT_NAMEBNS } },
  });
  const bbSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bb.id, nameBn: { in: BANGLA_SUBJECT_NAMEBNS } },
  });
  if (!bcsSubject || !bbSubject) throw new Error("Bangla subject missing in BCS/Bank");

  const targets = [
    { eco: bcs, subject: bcsSubject, root: "01_বাংলা_ভাষা_ও_সাহিত্য" },
    { eco: bb, subject: bbSubject, root: "01_বাংলা_ভাষা_ও_সাহিত্য" },
  ];
  // Both trees share leaf names (ADR-068) — one route serves both ecosystems.

  const topicIdBySubjectPath = new Map<number, Map<string, number>>();
  for (const t of targets) {
    const rows = await prisma.topic.findMany({
      where: { subjectId: t.subject.id },
      select: { id: true, path: true },
    });
    topicIdBySubjectPath.set(t.subject.id, new Map(rows.map((r) => [r.path, r.id])));
  }

  // Every live row, keyed by its global signature (scoped per ecosystem) plus
  // where it sits, so the report can distinguish "already at this leaf",
  // "unclassified, re-point it" and "belongs elsewhere, leave it alone".
  type ExistingRow = { id: number; path: string; subjectId: number };
  const sigToRows = new Map<string, ExistingRow[]>();
  const rowSigById = new Map<number, string>();
  const explanationById = new Map<number, string>();
  const existingForDedup = await prisma.question.findMany({
    select: {
      id: true,
      ecosystemId: true,
      subjectId: true,
      question: true,
      correctAnswer: true,
      explanation: true,
      path: true,
    },
  });
  for (const r of existingForDedup) {
    const sig = contentSig(r);
    rowSigById.set(r.id, sig);
    explanationById.set(r.id, r.explanation);
    const arr = sigToRows.get(`${r.ecosystemId}|${sig}`);
    const row: ExistingRow = { id: r.id, path: r.path, subjectId: r.subjectId };
    if (arr) arr.push(row);
    else sigToRows.set(`${r.ecosystemId}|${sig}`, [row]);
  }

  // Stem index per subject: sourceKey(subject, path, question) RECOMPUTED from
  // the row's own columns. The stored sourceKey column cannot be trusted —
  // seeded rows carry values like "sqlclone:64039" that never match, which is
  // how a second copy of the same stem would sneak in.
  const stemIndex = new Map<number, Map<string, number>>();
  for (const t of targets) {
    const rows = await prisma.question.findMany({
      where: { subjectId: t.subject.id },
      select: { id: true, path: true, question: true, options: true },
    });
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(stemKey(t.subject.id, r.path, r.question, r.options as string[]), r.id);
    }
    stemIndex.set(t.subject.id, m);
  }

  type Op =
    | { kind: "update"; id: number; data: Record<string, unknown> }
    | { kind: "create"; data: Record<string, unknown> };
  const ops: Op[] = [];
  /** Rows already queued for an update this run — a repeated record in the
   *  source file must not queue twice (the stem collides either way). */
  const queuedUpdateIds = new Set<number>();
  /** Create keys already queued this run — same stem, different content. */
  const pendingCreates = new Set<string>();

  for (const route of ROUTES) {
    const stats = emptyStats();
    const text = readFileSync(join(TXT_DIR, route.file), "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Phase 1 — parse + gate every record before touching the database, so
    // "does this file already carry the row's content?" can be answered.
    type Record_ = { line: string; parsed: Parsed; repair?: Repair; waived: string[] };
    const records: Record_[] = [];
    for (const line of lines) {
      stats.records += 1;
      const result = parseDocxRecord(line);
      if (result === null || "skip" in result) {
        stats.parseFailed += 1;
        report.parseFailed += 1;
        console.warn(
          `  [unparsed] ${route.file}: ${result === null ? "no 4-option block" : result.skip} — ${line.slice(0, 70)}`,
        );
        continue;
      }
      if (result.repair) {
        report.repaired += 1;
        report.repairLog.push({ file: route.file, repair: result.repair, snippet: line.slice(0, 70) });
        console.log(`  [repair:${result.repair}] ${route.file} — ${line.slice(0, 60)}`);
      }

      const gate = scanMca(result.parsed);
      const { waived, blocking } = waiveGateCodes(
        gate.fatal.map((f) => f.code),
        line,
      );
      if (blocking.length > 0) {
        stats.rejected += 1;
        report.rejected += 1;
        console.warn(`  [reject] ${route.file}: ${blocking.join(",")} — ${line.slice(0, 60)}`);
        continue;
      }
      if (waived.length > 0) {
        stats.waived += 1;
        report.waived += 1;
        report.waiverLog.push({ file: route.file, codes: waived, snippet: line.slice(0, 70) });
        console.log(`  [waive] ${route.file}: ${waived.join("+")} — ${line.slice(0, 60)}`);
      }

      records.push({
        line,
        repair: result.repair,
        waived,
        parsed: {
          question: gate.normalized.question,
          options: gate.normalized.options,
          correctAnswer: gate.normalized.correctAnswer ?? "",
          explanation: gate.normalized.explanation,
        },
      });
    }
    const fileSigs = new Set(records.map((r) => contentSig(r.parsed)));

    // Phase 2 — decide what happens to each record in each ecosystem.
    for (const rec of records) {
      const q = rec.parsed;
      for (const t of targets) {
        const path = `${t.root}/ভাষা/${route.leaf}`;
        const sig = contentSig(q);
        const matches = sigToRows.get(`${t.eco.id}|${sig}`) ?? [];

        // 1a. Identical content already sits at this leaf — nothing to write.
        const atTarget = matches.find((m) => m.subjectId === t.subject.id && m.path === path);
        if (atTarget) {
          stats.skipped += 1;
          report.skipped += 1;
          report.dups.push({ file: route.file, kind: "skip", existingPath: path });
          continue;
        }

        // 1b. Parked unclassified at the ভাষা group node → move into the leaf.
        const flatPath = `${t.root}/ভাষা`;
        const atFlat = matches.find((m) => m.subjectId === t.subject.id && m.path === flatPath);
        if (atFlat) {
          if (queuedUpdateIds.has(atFlat.id)) {
            stats.skipped += 1;
            report.skipped += 1;
            continue;
          }
          queuedUpdateIds.add(atFlat.id);
          ops.push({
            kind: "update",
            id: atFlat.id,
            data: buildUpdateData(t.subject.id, path, route.subtopic, q, atFlat.id, topicIdBySubjectPath, explanationById),
          });
          matches.push({ id: atFlat.id, path, subjectId: t.subject.id }); // now at the leaf
          stats.repointed += 1;
          report.repointed += 1;
          report.dups.push({ file: route.file, kind: "repoint", existingPath: flatPath });
          continue;
        }

        // 1c. Identical content lives elsewhere in this ecosystem → no copy.
        if (matches.length > 0) {
          stats.skipped += 1;
          report.skipped += 1;
          report.dups.push({ file: route.file, kind: "skip", existingPath: matches[0].path });
          continue;
        }

        // 2. Same stem already at this leaf → refresh it in place, unless its
        //    current content is already carried by another record of this file
        //    (a second record with the same stem could only clobber good data).
        const stemId = stemIndex.get(t.subject.id)?.get(stemKey(t.subject.id, path, q.question, q.options));
        if (stemId !== undefined) {
          if (queuedUpdateIds.has(stemId)) {
            stats.skipped += 1;
            report.skipped += 1;
            continue; // repeated record within the source file
          }
          const rowSig = rowSigById.get(stemId);
          if (rowSig !== undefined && fileSigs.has(rowSig)) {
            stats.skipped += 1;
            report.skipped += 1;
            report.dups.push({ file: route.file, kind: "skip", existingPath: path });
            continue;
          }
          queuedUpdateIds.add(stemId);
          ops.push({
            kind: "update",
            id: stemId,
            data: buildUpdateData(t.subject.id, path, route.subtopic, q, stemId, topicIdBySubjectPath, explanationById),
          });
          stats.updated += 1;
          report.updated += 1;
          continue;
        }

        // 3. Genuinely new content (a repeated record of this file shares the
        //    normalized stem key, so it is caught here rather than earning a
        //    twin row).
        const createKey = stemKey(t.subject.id, path, q.question, q.options);
        if (pendingCreates.has(createKey)) {
          stats.skipped += 1;
          report.skipped += 1;
          continue;
        }
        pendingCreates.add(createKey);
        const computedSourceKey = createKey;
        sigToRows.set(`${t.eco.id}|${sig}`, [{ id: -1, path, subjectId: t.subject.id }]);
        ops.push({
          kind: "create",
          data: {
            ecosystemId: t.eco.id,
            subjectId: t.subject.id,
            sourceKey: computedSourceKey,
            topicId: topicIdBySubjectPath.get(t.subject.id)?.get(path) ?? null,
            path,
            topic: "ভাষা",
            subtopic: route.subtopic,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: "MEDIUM",
            sourceExam: `Bangla Grammar · ${route.label}`,
            year: null,
          },
        });
        stats.inserted += 1;
        report.inserted += 1;
      }
    }
    report.perFile[route.file] = stats;
    console.log(
      `✓ ${route.file}: ${stats.records} records → inserted ${stats.inserted}, updated ${stats.updated}, ` +
        `re-pointed ${stats.repointed}, skipped ${stats.skipped}, rejected ${stats.rejected}, ` +
        `waived ${stats.waived}, unparsed ${stats.parseFailed} (×2 ecosystems)`,
    );
  }

  if (!dryRun && ops.length > 0) {
    const creates = ops.filter((o) => o.kind === "create").map((o) => (o.data as Record<string, unknown>));
    const updates = ops.filter((o) => o.kind === "update") as Array<{ id: number; data: Record<string, unknown> }>;
    console.log(`writing ${creates.length} creates + ${updates.length} updates...`);
    if (creates.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < creates.length; i += CHUNK) {
        await prisma.question.createMany({ data: creates.slice(i, i + CHUNK) as never });
        console.log(`  created ${Math.min(i + CHUNK, creates.length)}/${creates.length}`);
      }
    }
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(
        updates.slice(i, i + CHUNK).map((u) => prisma.question.update({ where: { id: u.id }, data: u.data })),
      );
      console.log(`  updated ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
    }
  }

  if (!dryRun) {
    // Refresh questionCount on the touched leaves + ancestors (including the
    // ভাষা group node, which loses the rows re-pointed into a leaf).
    for (const t of targets) {
      const touched = new Set<string>();
      for (const route of ROUTES) {
        let acc = "";
        for (const seg of `${t.root}/ভাষা/${route.leaf}`.split("/")) {
          acc = acc ? `${acc}/${seg}` : seg;
          touched.add(acc);
        }
      }
      touched.add(`${t.root}/ভাষা`);
      const allCounts = await prisma.question.groupBy({
        by: ["path"],
        where: { subjectId: t.subject.id },
        _count: { _all: true },
      });
      const byPath = new Map(allCounts.map((r) => [r.path, r._count._all]));
      for (const path of touched) {
        let total = 0;
        for (const [p, c] of byPath) if (p === path || p.startsWith(`${path}/`)) total += c;
        const id = topicIdBySubjectPath.get(t.subject.id)?.get(path);
        if (id !== undefined) await prisma.topic.update({ where: { id }, data: { questionCount: total } });
      }
      console.log(`✓ questionCount refreshed (subject ${t.subject.id})`);
    }
  }

  const total =
    report.inserted + report.updated + report.repointed + report.skipped + report.rejected + report.parseFailed;
  console.log(
    `${dryRun ? "DRY RUN" : "DONE"}: ${total} record slots → inserted=${report.inserted} ` +
      `updated=${report.updated} re-pointed=${report.repointed} skipped=${report.skipped} ` +
      `rejected=${report.rejected} unparsed=${report.parseFailed} | ` +
      `repairs=${report.repaired} gate-waivers=${report.waived}`,
  );
  return report;
}

/** Update payload shared by the re-point and in-place-refresh paths. An empty
 *  source explanation never erases one the row already carries. */
function buildUpdateData(
  subjectId: number,
  path: string,
  subtopic: string,
  q: Parsed,
  rowId: number,
  topicIdBySubjectPath: Map<number, Map<string, number>>,
  explanationById: Map<number, string>,
): Record<string, unknown> {
  return {
    topicId: topicIdBySubjectPath.get(subjectId)?.get(path) ?? null,
    path,
    topic: "ভাষা",
    subtopic,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    // The source carries no ব্যাখ্যা for a handful of records (waived above) —
    // never let that erase the explanation the row already has.
    explanation: q.explanation || explanationById.get(rowId) || "",
  };
}

function printFindings(report: ImportReport): void {
  if (report.repairLog.length > 0) {
    console.log(`\nrepairs applied (${report.repairLog.length}):`);
    for (const r of report.repairLog) console.log(`  [${r.repair}] ${r.file} — ${r.snippet}`);
  }
  if (report.waiverLog.length > 0) {
    console.log(`\ngate waivers (${report.waiverLog.length}):`);
    for (const w of report.waiverLog) console.log(`  ${w.codes.join("+")} ${w.file} — ${w.snippet}`);
  }
  if (report.dups.length > 0) {
    const grouped = new Map<string, number>();
    for (const d of report.dups) {
      const k = `${d.kind} | ${d.existingPath}`;
      grouped.set(k, (grouped.get(k) ?? 0) + 1);
    }
    console.log(`\nduplicate content already in the database (${report.dups.length}):`);
    for (const [k, n] of grouped) console.log(`  ${n} × ${k}`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const report = await importBanglaGrammarDocx(prisma);
    printFindings(report);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bangla-grammar-ii.ts")) {
  main().catch((e) => {
    console.error("Import failed:", e);
    process.exit(1);
  });
}
