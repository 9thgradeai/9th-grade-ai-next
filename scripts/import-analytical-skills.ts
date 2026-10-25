/**
 * scripts/import-analytical-skills.ts
 * ----------------------------------------------------------------------------
 * Imports the two Analytical Skills .docx sources under
 *   database/data/Bank/Analytical Skills/*.docx
 * into the Bank ecosystem's `04_Analytical_Skills` subject so the Practice tab
 * serves them under their proper leaves. The subject exists ONLY in the Bank
 * ecosystem (BCS has no Analytical Skills), so unlike the Bangla Grammar import
 * this runs against a single target.
 *
 * The .docx files are converted first (scripts/docx-analytical-skills-to-txt.py)
 * to one-record-per-line .txt under …/Analytical Skills/txt/ — conversion also
 * asserts that every record has exactly four A–D options — so this script never
 * needs docx awareness. Conversion yields 659 records (300 + 359).
 *
 * Topic routing (path is absolute, rooted at the subject):
 *   Questions(Coding–Decoding and Symbolic Logic).txt
 *     → 04_Analytical_Skills/01_Verbal_Reasoning/Logical_Deduction_and_Syllogism
 *   Questions(Number, letter and mixed series).txt
 *     → 04_Analytical_Skills/04_Numerical_and_Series_Ability/Number_and_Alphabet_Series
 *
 * ── Record shape (one line, emitted by the converter)
 *   NN. <question> A. <o1> B. <o2> C. <o3> D. <o4> Answer: <raw> Explanation: <text>
 *
 * `Answer:` keeps the source's own wording so the .txt stays auditable against
 * the .docx; this parser resolves it to option TEXT, which is what the Question
 * table stores. Two repairs are logged when the source's answer carries extra
 * words:
 *   answer-suffix  "A. 41 (Standard position sum: G=7 …)" → answer "41", the
 *                  bracketed reasoning becomes the explanation (5 records).
 *   answer-letter  the words disagree with the keyed letter → trust the letter.
 *
 * ── Gate waivers (shared with import-bangla-grammar-ii.ts, ADR-072)
 *   EMPTY_EXPLANATION — waived ONLY when the line carries no Explanation:
 *       marker, so a parsing bug can never hide behind a source omission.
 *   DUPLICATE_OPTION — always waivable: correctAnswer stores option TEXT.
 *
 * ── Dedup, in two layers (ADR-073)
 * (1) In-file: both documents repeat themselves — the coding file's 300 records
 *     hold only 133 distinct questions — so variants of one question fold onto
 *     ONE row (659 records → 455 questions). The variant carrying an
 *     explanation wins; every folded group is logged, including the 31 whose
 *     variants disagree on the answer key, so the dropped records stay auditable.
 * (2) Against the database, the Bangla three-check order applies: identical
 *     content at this leaf → skip; identical content elsewhere in the subject →
 *     skip + report; same normalized stem → refresh in place; else create. The
 *     stem index RECOMPUTES sourceKey(subject, path, question) per row because
 *     the stored column carries values like "sqlclone:60049" that never match.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { waiveGateCodes } from "./import-bangla-grammar-ii";

const TXT_DIR = join(
  process.cwd(),
  "database",
  "data",
  "Bank",
  "Analytical Skills",
  "txt",
);
/** Subject.nameBn — the label Practice queries with. */
const SUBJECT_NAME = "04_Analytical_Skills";
/** Subject path root: Topic paths are `04_Analytical_Skills/<group>/<leaf>`. */
const ROOT = "04_Analytical_Skills";

type Parsed = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

type Repair = "answer-suffix" | "answer-letter";

type FileRoute = {
  file: string;
  label: string;
  /** Path below the subject root. */
  leaf: string;
  /** `topic` / `subtopic` column values — the leaf basename, matching the
   *  305 rows that already sit in this subject. */
  subtopic: string;
  sourceExam: string;
};

const ROUTES: FileRoute[] = [
  {
    file: "Questions(Coding–Decoding and Symbolic Logic).txt",
    label: "coding-decoding",
    leaf: "01_Verbal_Reasoning/Logical_Deduction_and_Syllogism",
    subtopic: "Logical_Deduction_and_Syllogism",
    sourceExam: "Bank Analytical · coding-decoding",
  },
  {
    file: "Questions(Number, letter and mixed series).txt",
    label: "number-series",
    leaf: "04_Numerical_and_Series_Ability/Number_and_Alphabet_Series",
    subtopic: "Number_and_Alphabet_Series",
    sourceExam: "Bank Analytical · number-series",
  },
];

const ANSWER_MARKER = " Answer: ";
const EXPLANATION_MARKER = " Explanation: ";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const fold = (s: string) => squash(s).toLowerCase();
/**
 * Grouping key for "one row per question". Punctuation cannot distinguish two
 * questions — the coding file asks the same digit-puzzle once as `…"very"?`
 * and once as `…very?` — so marks are folded away before comparing. Across
 * both sources this merges exactly one pair (that quoted/unquoted restatement)
 * and nothing else, so no two records whose operators differ are ever folded.
 */
const foldStem = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const foldAnswer = (s: string) => fold(s).replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Split `A. o1 B. o2 C. o3 D. o4` off the end of a record body. Markers are
 * located as a run of four whitespace-delimited `X.` tokens — the converter
 * guarantees no question or option text contains one, and the strict check on
 * both marker count and letter order is what makes a malformed line fail
 * loudly instead of silently shifting every option by one slot.
 */
export function splitOptions(body: string): { question: string; options: string[] } | null {
  const marks: Array<{ index: number; end: number; letter: string }> = [];
  const re = /(^|\s)([A-D])\.\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    marks.push({ index: m.index + m[1].length, end: re.lastIndex, letter: m[2] });
  }
  if (marks.length !== 4) return null;
  if (marks.map((x) => x.letter).join("") !== "ABCD") return null;

  const question = squash(body.slice(0, marks[0].index));
  const options = marks.map((mark, i) => {
    const from = mark.end;
    const to = i < 3 ? marks[i + 1].index : body.length;
    return squash(body.slice(from, to));
  });
  if (!question || options.some((o) => o === "")) return null;
  return { question, options };
}

type AnswerResolution = { correctAnswer: string; suffix: string; repair?: Repair };

/**
 * Resolve the source's `Answer:` wording to option TEXT.
 *   `A. 41 (Standard position sum: …)` → "41" + the bracketed tail as `suffix`
 *   `C) 127`                          → "127"
 *   `A. A>B=C`                        → the option's own words
 * When the words and the letter disagree, the LETTER wins (it is the source's
 * key) and the disagreement is reported rather than silently re-keyed.
 */
export function resolveAnswer(raw: string, options: string[]): AnswerResolution {
  const text = squash(raw);
  const keyed = text.match(/^\(?([A-D])\)?[.)]\s*(.*)$/);
  if (keyed) {
    const idx = "ABCD".indexOf(keyed[1]);
    const rest = squash(keyed[2]);
    if (idx >= 0 && idx < options.length) {
      const option = options[idx];
      if (rest === "" || fold(rest) === fold(option)) return { correctAnswer: option, suffix: "" };
      // Trailing commentary after the keyed words — keep it as the explanation.
      if (
        fold(rest).startsWith(fold(option)) &&
        !/[\p{L}\p{N}]/u.test(rest.slice(option.length).trimStart().charAt(0) ?? "")
      ) {
        return {
          correctAnswer: option,
          suffix: squash(rest.slice(rest.indexOf(option) + option.length)),
          repair: "answer-suffix",
        };
      }
      const exact = options.findIndex((o) => fold(o) === fold(rest));
      if (exact >= 0) return { correctAnswer: options[exact], suffix: "", repair: "answer-letter" };
      return { correctAnswer: option, suffix: "", repair: "answer-letter" };
    }
  }
  const match = options.findIndex((o) => fold(o) === fold(text));
  if (match >= 0) return { correctAnswer: options[match], suffix: "" };
  return { correctAnswer: text, suffix: "", repair: "answer-letter" };
}

/** Full record parse. Exported for unit tests. */
export function parseRecord(
  line: string,
): { parsed: Parsed; repair?: Repair } | { skip: string } | null {
  const expAt = line.indexOf(EXPLANATION_MARKER);
  const explanation = expAt >= 0 ? squash(line.slice(expAt + EXPLANATION_MARKER.length)) : "";
  const head = expAt >= 0 ? line.slice(0, expAt) : line;

  const ansAt = head.indexOf(ANSWER_MARKER);
  if (ansAt < 0) return { skip: "no Answer: marker" };
  const rawAnswer = head.slice(ansAt + ANSWER_MARKER.length);
  const body = head.slice(0, ansAt);

  const num = body.match(/^\s*(\d+)\.\s+/);
  if (!num) return { skip: "record does not start with a number" };
  const split = splitOptions(body.slice(num[0].length));
  if (!split) return { skip: "expected exactly four A. B. C. D. options in order" };
  if (rawAnswer.trim() === "") return { skip: "empty answer" };

  const resolved = resolveAnswer(rawAnswer, split.options);
  const parsed: Parsed = {
    question: split.question,
    options: split.options,
    correctAnswer: resolved.correctAnswer,
    explanation: squash([resolved.suffix, explanation].filter(Boolean).join(" ")),
  };
  return resolved.repair ? { parsed, repair: resolved.repair } : { parsed };
}

/** Content-only signature (no ecosystem prefix) — compared against the same
 *  computation on an existing row. */
function contentSig(
  rec: Parsed | { question: string; correctAnswer: string; explanation: string },
): string {
  const options = "options" in rec ? rec.options : [];
  return mcaSignature({
    question: rec.question,
    options,
    correctAnswer: rec.correctAnswer,
    explanation: rec.explanation,
  });
}

/** Identity key for "is this the same stem at this path?" — normalizes the
 *  stem so two spellings of one question resolve to the same row. */
function stemKey(subjectId: number, path: string, question: string): string {
  const stem = question.normalize("NFC").replace(/\s+/g, " ").trim();
  return sourceKey(subjectId, path, stem);
}

export type DupReport = { file: string; kind: "skip"; existingPath: string };
export type FileStats = {
  records: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicatesInFile: number;
  rejected: number;
  waived: number;
  parseFailed: number;
};

/** A question the sources state more than once. `answers` holds the DISTINCT
 *  correctAnswer values across the variants — more than one means the repeats
 *  disagree on the answer key, which is why they are logged rather than
 *  silently folded together (ADR-073). */
export type RepeatGroup = {
  file: string;
  question: string;
  variants: number;
  /** DISTINCT correctAnswer values across the variants (punctuation folded, so
   *  `2160` and `2,160` count as one). More than one = the repeats disagree on
   *  the answer key, which is why they are logged rather than silently folded. */
  answers: string[];
  /** DISTINCT option sets across the variants — >1 means the distractors differ
   *  even though every variant is keyed to the same answer. */
  optionSets: number;
  kept: { correctAnswer: string; hasExplanation: boolean };
};

export type ImportReport = {
  inserted: number;
  updated: number;
  skipped: number;
  duplicatesInFile: number;
  rejected: number;
  waived: number;
  parseFailed: number;
  repaired: number;
  perFile: Record<string, FileStats>;
  dups: DupReport[];
  repeatGroups: RepeatGroup[];
  repairLog: Array<{ file: string; repair: Repair; snippet: string }>;
  waiverLog: Array<{ file: string; codes: string[]; snippet: string }>;
};

const emptyStats = (): FileStats => ({
  records: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
  duplicatesInFile: 0,
  rejected: 0,
  waived: 0,
  parseFailed: 0,
});

export async function importAnalyticalSkills(
  prisma: PrismaClient,
  opts?: { dryRun?: boolean },
): Promise<ImportReport> {
  const dryRun = opts?.dryRun ?? !process.argv.includes("--yes");
  const report: ImportReport = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    duplicatesInFile: 0,
    rejected: 0,
    waived: 0,
    parseFailed: 0,
    repaired: 0,
    perFile: {},
    dups: [],
    repeatGroups: [],
    repairLog: [],
    waiverLog: [],
  };

  const bank = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bank) throw new Error("BANGLADESH_BANK ecosystem missing");
  const subject = await prisma.subject.findFirst({
    where: { ecosystemId: bank.id, nameBn: SUBJECT_NAME },
  });
  if (!subject) throw new Error(`subject ${SUBJECT_NAME} missing in BANGLADESH_BANK`);

  const topicRows = await prisma.topic.findMany({
    where: { subjectId: subject.id },
    select: { id: true, path: true },
  });
  const topicIdByPath = new Map(topicRows.map((r) => [r.path, r.id]));

  // Every live row in this subject, keyed by signature and by recomputed stem,
  // so the report can tell "already at this leaf" from "belongs elsewhere".
  type ExistingRow = { id: number; path: string };
  const sigToRows = new Map<string, ExistingRow[]>();
  const rowSigById = new Map<number, string>();
  const explanationById = new Map<number, string>();
  const existing = await prisma.question.findMany({
    where: { subjectId: subject.id },
    select: {
      id: true,
      question: true,
      correctAnswer: true,
      explanation: true,
      path: true,
    },
  });
  for (const r of existing) {
    const sig = contentSig(r);
    rowSigById.set(r.id, sig);
    explanationById.set(r.id, r.explanation);
    const arr = sigToRows.get(sig);
    const row: ExistingRow = { id: r.id, path: r.path };
    if (arr) arr.push(row);
    else sigToRows.set(sig, [row]);
  }

  const stemIndex = new Map<string, number>();
  for (const r of existing) stemIndex.set(stemKey(subject.id, r.path, r.question), r.id);

  type Op =
    | { kind: "update"; id: number; data: Record<string, unknown> }
    | { kind: "create"; data: Record<string, unknown> };
  const ops: Op[] = [];
  const queuedUpdateIds = new Set<number>();
  const pendingCreates = new Set<string>();

  for (const route of ROUTES) {
    const stats = emptyStats();
    const text = readFileSync(join(TXT_DIR, route.file), "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const path = `${ROOT}/${route.leaf}`;

    // Phase 1 — parse + gate every record before touching the database, so
    // "does this file already carry the row's content?" can be answered.
    type Record_ = { line: string; parsed: Parsed; repair?: Repair; waived: string[] };
    const records: Record_[] = [];
    for (const line of lines) {
      stats.records += 1;
      const result = parseRecord(line);
      if (result === null || "skip" in result) {
        stats.parseFailed += 1;
        report.parseFailed += 1;
        console.warn(
          `  [unparsed] ${route.file}: ${result === null ? "no record" : result.skip} — ${line.slice(0, 70)}`,
        );
        continue;
      }
      if (result.repair) {
        report.repaired += 1;
        report.repairLog.push({ file: route.file, repair: result.repair, snippet: line.slice(0, 70) });
        console.log(`  [repair:${result.repair}] ${route.file} — ${line.slice(0, 60)}`);
      }

      const gate = scanMca(result.parsed);
      const { waived, blocking } = waiveGateCodes(gate.fatal.map((f) => f.code), line);
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
    // Phase 2 — one row per question. Both sources repeat themselves (the
    // coding file's 300 records hold only 133 distinct questions), so every
    // variant of a stem collapses onto a single row: the variant that carries
    // an explanation wins, otherwise the first occurrence. Repeats are counted
    // and every group is logged, so the variants that never land stay
    // auditable — including the groups whose variants disagree on the answer
    // key (ADR-073).
    const byStem = new Map<string, Record_[]>();
    for (const rec of records) {
      const key = foldStem(rec.parsed.question);
      const bucket = byStem.get(key);
      if (bucket) bucket.push(rec);
      else byStem.set(key, [rec]);
    }
    const winners: Record_[] = [];
    for (const group of byStem.values()) {
      const winner = group.find((r) => r.parsed.explanation !== "") ?? group[0];
      if (group.length > 1) {
        stats.duplicatesInFile += group.length - 1;
        report.duplicatesInFile += group.length - 1;
        report.repeatGroups.push({
          file: route.file,
          question: winner.parsed.question,
          variants: group.length,
          answers: (() => {
            const m = new Map<string, string>();
            for (const r of group) {
              const k = foldAnswer(r.parsed.correctAnswer);
              if (!m.has(k)) m.set(k, r.parsed.correctAnswer);
            }
            return [...m.values()];
          })(),
          optionSets: new Set(group.map((r) => r.parsed.options.map(foldStem).join("‖"))).size,
          kept: {
            correctAnswer: winner.parsed.correctAnswer,
            hasExplanation: winner.parsed.explanation !== "",
          },
        });
      }
      winners.push(winner);
    }
    // Folds can differ where signatures do not — never write two rows with
    // byte-equivalent content either.
    const fileSigs = new Set<string>();
    const deduped: Record_[] = [];
    for (const winner of winners) {
      const sig = contentSig(winner.parsed);
      if (fileSigs.has(sig)) {
        stats.duplicatesInFile += 1;
        report.duplicatesInFile += 1;
        continue;
      }
      fileSigs.add(sig);
      deduped.push(winner);
    }

    // Phase 3 — decide what happens to each surviving question in the subject.
    for (const rec of deduped) {
      const q = rec.parsed;
      const sig = contentSig(q);
      const matches = sigToRows.get(sig) ?? [];

      // 1a. Identical content already sits at this leaf — nothing to write.
      const atTarget = matches.find((m) => m.path === path);
      if (atTarget) {
        stats.skipped += 1;
        report.skipped += 1;
        report.dups.push({ file: route.file, kind: "skip", existingPath: path });
        continue;
      }

      // 1b. Identical content lives elsewhere in this subject → no copy.
      if (matches.length > 0) {
        stats.skipped += 1;
        report.skipped += 1;
        report.dups.push({ file: route.file, kind: "skip", existingPath: matches[0].path });
        continue;
      }

      // 2. Same stem already at this leaf → refresh it in place, unless its
      //    current content is already carried by another record of this file.
      const stemId = stemIndex.get(stemKey(subject.id, path, q.question));
      if (stemId !== undefined) {
        if (queuedUpdateIds.has(stemId)) {
          stats.skipped += 1;
          report.skipped += 1;
          continue;
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
          data: buildUpdateData(path, route, q, stemId, topicIdByPath, explanationById),
        });
        stats.updated += 1;
        report.updated += 1;
        continue;
      }

      // 3. Genuinely new content.
      const createKey = stemKey(subject.id, path, q.question);
      if (pendingCreates.has(createKey)) {
        stats.skipped += 1;
        report.skipped += 1;
        continue;
      }
      pendingCreates.add(createKey);
      sigToRows.set(sig, [{ id: -1, path }]);
      ops.push({
        kind: "create",
        data: {
          ecosystemId: bank.id,
          subjectId: subject.id,
          sourceKey: sourceKey(subject.id, path, q.question),
          topicId: topicIdByPath.get(path) ?? null,
          path,
          topic: route.subtopic,
          subtopic: route.subtopic,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: "MEDIUM",
          sourceExam: route.sourceExam,
          year: null,
        },
      });
      stats.inserted += 1;
      report.inserted += 1;
    }
    report.perFile[route.file] = stats;
    console.log(
      `✓ ${route.file}: ${stats.records} records → inserted ${stats.inserted}, updated ${stats.updated}, ` +
        `repeats ${stats.duplicatesInFile}, skipped ${stats.skipped}, rejected ${stats.rejected}, ` +
        `waived ${stats.waived}, unparsed ${stats.parseFailed}`,
    );
  }

  if (!dryRun && ops.length > 0) {
    const creates = ops.filter((o) => o.kind === "create").map((o) => o.data as Record<string, unknown>);
    const updates = ops.filter((o) => o.kind === "update") as Array<{
      id: number;
      data: Record<string, unknown>;
    }>;
    console.log(`writing ${creates.length} creates + ${updates.length} updates...`);
    const CHUNK = 200;
    for (let i = 0; i < creates.length; i += CHUNK) {
      await prisma.question.createMany({ data: creates.slice(i, i + CHUNK) as never });
      console.log(`  created ${Math.min(i + CHUNK, creates.length)}/${creates.length}`);
    }
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(
        updates.slice(i, i + CHUNK).map((u) => prisma.question.update({ where: { id: u.id }, data: u.data })),
      );
      console.log(`  updated ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
    }
  }

  if (!dryRun) {
    // Refresh questionCount on every leaf of the subject plus each ancestor
    // group node, so the Practice tree's counts match a fresh recount.
    const touched = new Set<string>();
    for (const route of ROUTES) {
      let acc = "";
      for (const seg of `${ROOT}/${route.leaf}`.split("/")) {
        acc = acc ? `${acc}/${seg}` : seg;
        touched.add(acc);
      }
    }
    const grouped = await prisma.question.groupBy({
      by: ["path"],
      where: { subjectId: subject.id },
      _count: { _all: true },
    });
    const byPath = new Map(grouped.map((r) => [r.path, r._count._all]));
    for (const p of touched) {
      let total = 0;
      for (const [candidate, count] of byPath) {
        if (candidate === p || candidate.startsWith(`${p}/`)) total += count;
      }
      const id = topicIdByPath.get(p);
      if (id !== undefined) await prisma.topic.update({ where: { id }, data: { questionCount: total } });
    }
    console.log(`✓ questionCount refreshed (subject ${subject.id})`);
  }

  const total =
    report.inserted +
    report.updated +
    report.skipped +
    report.duplicatesInFile +
    report.rejected +
    report.parseFailed;
  console.log(
    `${dryRun ? "DRY RUN" : "DONE"}: ${total} record slots → inserted=${report.inserted} ` +
      `updated=${report.updated} repeats=${report.duplicatesInFile} skipped=${report.skipped} ` +
      `rejected=${report.rejected} unparsed=${report.parseFailed} | ` +
      `repairs=${report.repaired} gate-waivers=${report.waived}`,
  );
  return report;
}

/** Update payload shared by the refresh path. An empty source explanation
 *  never erases one the row already carries. */
function buildUpdateData(
  path: string,
  route: FileRoute,
  q: Parsed,
  rowId: number,
  topicIdByPath: Map<string, number>,
  explanationById: Map<number, string>,
): Record<string, unknown> {
  return {
    topicId: topicIdByPath.get(path) ?? null,
    path,
    topic: route.subtopic,
    subtopic: route.subtopic,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    // The source carries no explanation for a handful of records (waived above) —
    // never let that erase the explanation the row already has.
    explanation: q.explanation || explanationById.get(rowId) || "",
    sourceExam: route.sourceExam,
    difficulty: "MEDIUM",
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
  if (report.repeatGroups.length > 0) {
    const conflicts = report.repeatGroups.filter((g) => g.answers.length > 1);
    const optionOnly = report.repeatGroups.filter((g) => g.answers.length === 1 && g.optionSets > 1);
    const repeats = report.duplicatesInFile;
    console.log(
      `\nrepeated questions folded to one row (${report.repeatGroups.length} groups, ${repeats} records):`,
    );
    console.log(
      `  wording-only restatements: ${report.repeatGroups.length - conflicts.length - optionOnly.length} groups`,
    );
    console.log(
      `  distractor differences only (same answer key): ${optionOnly.length} groups`,
    );
    console.log(`  answer-key conflicts: ${conflicts.length} groups:`);
    for (const g of conflicts) {
      console.log(`    [${g.variants}×] ${g.question.slice(0, 78)}`);
      console.log(`         answers=${g.answers.join(" | ")} → kept ${g.kept.correctAnswer}`);
    }
    if (optionOnly.length > 0) {
      console.log(`  (option-set conflicts — same answer, different distractors — ${optionOnly.length} groups, details in code/ADR)`);
    }
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
    const report = await importAnalyticalSkills(prisma);
    printFindings(report);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-analytical-skills.ts")) {
  main().catch((e) => {
    console.error("Import failed:", e);
    process.exit(1);
  });
}
