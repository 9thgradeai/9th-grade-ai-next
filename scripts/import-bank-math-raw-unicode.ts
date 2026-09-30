/**
 * scripts/import-bank-math-raw-unicode.ts
 *
 * SWAPS every Bank Mathematics MCQ (subject 4960, ecosystem 2) for a verbatim
 * import of the eight supplied .docx files under
 * `database/data/Bank/Math/updated/`.
 *
 * Nothing is normalised. The stored `question` / `options` / `correctAnswer` /
 * `explanation` strings are byte-identical to the document, and every row is
 * written with `rawMath = true` so `backend/services/content.ts` skips
 * `normalizeFieldForDisplay` (which rewrites a large share of this exact
 * Unicode into LaTeX). The dashboard then renders the book's own glyphs.
 *
 *   npx tsx scripts/import-bank-math-raw-unicode.ts              # dry run
 *   npx tsx scripts/import-bank-math-raw-unicode.ts --apply      # write
 *
 * Source handling
 * ---------------
 * `rawMath` bypasses *our* normaliser, not Word's OMML. Arithmetic_Progression
 * and Ratios_Proportions_and_Mixtures carry real Office Math objects, so those
 * two are linearised with `scripts/docx-math-to-text.py` (the existing,
 * already-verified extractor). Every other file is pure book Unicode and is
 * read straight from `<w:t>` runs so no byte is touched.
 *
 * A handful of the documents are machine-drafted and carry authoring
 * leftovers: duplicated numbering, an aborted draft question, and near
 * identical restatements. The rule applied everywhere is deterministic and
 * positional — see `pickQuestion` — never "first line wins" heuristics.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const prisma = new PrismaClient();

const SUBJECT_ID = 4960;
const ECOSYSTEM_ID = 2;
const DOCX_DIR = "database/data/Bank/Math/updated";

/** How a document's own defects are neutralised. Documented per file. */
type Repair =
  | "ordinal" // mislabelled numbers -> trust position, not the printed digit
  | "dropQuestionWord" // stray "Question N." redraft lines are authoring leftovers
  | "none";

type Source = {
  topicId: number;
  slug: string;
  subtopic: string;
  file: string;
  repair: Repair;
  expect: number;
};

const SOURCES: Source[] = [
  { topicId: 133169, slug: "LCM_and_HCF", subtopic: "LCM and HCF", file: "Questions(LCM_HCF).docx", repair: "none", expect: 100 },
  { topicId: 133170, slug: "Percentages", subtopic: "Percentages", file: "Questions(Percentages).docx", repair: "none", expect: 150 },
  { topicId: 133171, slug: "Simple_and_Compound_Interest", subtopic: "Simple and Compound Interest", file: "Questions(Simple and Compound Interest).docx", repair: "dropQuestionWord", expect: 200 },
  { topicId: 133172, slug: "Ratios_Proportions_and_Mixtures", subtopic: "Ratios, Proportions and Mixtures", file: "Questions(Ratios, Proportions, and Mixtures).docx", repair: "none", expect: 100 },
  { topicId: 133173, slug: "Profit_Loss_and_Discount", subtopic: "Profit, Loss and Discount", file: "Questions(Profit_Loss_and_Discount).docx", repair: "none", expect: 200 },
  { topicId: 133177, slug: "Indices_and_Logarithms", subtopic: "Indices and Logarithms", file: "Indices and Logarithms — Bank Mathematics MCQ.docx", repair: "ordinal", expect: 200 },
  { topicId: 133179, slug: "Arithmetic_Progression", subtopic: "Arithmetic Progression", file: "Questions(ArithmeticProgression).docx", repair: "none", expect: 110 },
  { topicId: 133180, slug: "Geometric_Progression", subtopic: "Geometric Progression", file: "Questions(Geometric Progression).docx", repair: "none", expect: 100 },
];

// ─────────────────────────────────────────────────────────── 1. extraction

const BENGALI = "০১২৩৪৫৬৭৮৯";

function bengaliToInt(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  const chars = [...s];
  if (chars.length > 0 && chars.every((c) => BENGALI.includes(c)))
    return Number(chars.map((c) => BENGALI.indexOf(c)).join(""));
  return null;
}

/** Plain `<w:t>` extraction — used when the document holds no Office Math. */
function extractDirect(docxAbs: string): { lines: string[]; omml: number } {
  const tmp = `/tmp/bankmath-${process.pid}-${Math.random().toString(36).slice(2)}`;
  execSync(`rm -rf "${tmp}" && mkdir -p "${tmp}" && unzip -o -q "${docxAbs}" -d "${tmp}"`);
  const xml = readFileSync(`${tmp}/word/document.xml`, "utf8");
  const omml = (xml.match(/<m:oMath/g) ?? []).length;
  const unescape = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  const lines: string[] = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(xml)) !== null) {
    let txt = "";
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(pm[0])) !== null) txt += tm[1] !== undefined ? unescape(tm[1]) : "\t";
    const trimmed = txt.trim();
    if (trimmed) lines.push(trimmed);
  }
  execSync(`rm -rf "${tmp}"`);
  return { lines, omml };
}

/** Office-Math linearisation — used when the document embeds equations. */
function extractViaMathTool(docxAbs: string): string[] {
  const out = `/tmp/bankmath-${process.pid}-${Math.random().toString(36).slice(2)}.txt`;
  execSync(`python3 scripts/docx-math-to-text.py "${docxAbs}" "${out}"`);
  const lines = readFileSync(out, "utf8").replace(/\r\n/g, "\n").split("\n");
  execSync(`rm -f "${out}"`);
  return lines.map((l) => l.trim()).filter(Boolean);
}

function extractLines(src: Source): { lines: string[]; omml: number; tool: string } {
  const docxAbs = resolve(process.cwd(), DOCX_DIR, src.file);
  if (!existsSync(docxAbs)) throw new Error(`missing source: ${DOCX_DIR}/${src.file}`);
  const direct = extractDirect(docxAbs);
  if (direct.omml > 0) {
    // Equations live in <m:oMath>, which <w:t> extraction silently drops.
    return { lines: extractViaMathTool(docxAbs), omml: direct.omml, tool: "docx-math-to-text.py" };
  }
  return { lines: direct.lines, omml: 0, tool: "<w:t> direct" };
}

// ─────────────────────────────────────────────────────────── 2. parsing

type Candidate = {
  printed: number;
  stem: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  line: number;
  complete: boolean;
};

const RE_QUESTION_WORD = /^(?:Question|Q)\s*(\d{1,3})\s*[.:)]\s*(.*)$/i;
const RE_BENGALI_NUM = /^([০-৯]+)\s*[.।]\s*(.*)$/;
const RE_PLAIN_NUM = /^(\d{1,3})\s*[.।]\s+(.*)$/;
const RE_OPTION_LINE = /^([A-Da-d])\s*[.।]\s*(.*)$/;
const RE_ANSWER = /^Answer\s*:\s*(.*)$/i;
const RE_EXPLANATION = /^(?:Explanation|Shortcut|Solution|Sol)\s*:\s*(.*)$/i;
const RE_OPTION_INLINE = /([A-D])\s*[.।]\s+/g;
const RE_ANSWER_INLINE = /Answer\s*:\s*([ABCD])\s*([\s\S]*)$/i;
const RE_EXPLANATION_INLINE = /(?:^|\s)(?:Explanation|Shortcut|Solution|Sol)\s*:\s*/i;

type Start = { printed: number; rest: string; at: number; isQuestionWord: boolean };

function findStarts(lines: string[], repair: Repair): Start[] {
  const starts: Start[] = [];
  lines.forEach((line, at) => {
    const m = RE_PLAIN_NUM.exec(line);
    if (m) return void starts.push({ printed: Number(m[1]), rest: m[2].trim(), at, isQuestionWord: false });
    const b = RE_BENGALI_NUM.exec(line);
    if (b) return void starts.push({ printed: bengaliToInt(b[1])!, rest: b[2].trim(), at, isQuestionWord: false });
    // `Question N.` is the redrafted spelling. Sources that use it for the whole
    // file still parse; sources that only use it for leftovers flag the repair.
    const w = RE_QUESTION_WORD.exec(line);
    if (w) starts.push({ printed: Number(w[1]), rest: w[2].trim(), at, isQuestionWord: true });
  });
  if (repair !== "ordinal") return starts;
  // "ordinal": the printed digit is unreliable (this document labels two
  // different questions "175" and never labels the 176th), so position in the
  // document is the only truth. Its redrafted `Question N.` lines duplicate an
  // existing question verbatim, so they are dropped rather than renumbered.
  return starts.filter((s) => !s.isQuestionWord).map((s, i) => ({ ...s, printed: i + 1 }));
}

/** Single-paragraph layout: stem and all four options share one line. */
function parseInline(rest: string): Candidate["options"] extends never ? never : Omit<Candidate, "printed" | "line" | "complete"> | null {
  const marks: Array<{ letter: string; at: number }> = [];
  RE_OPTION_INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_OPTION_INLINE.exec(rest)) !== null)
    marks.push({ letter: m[1], at: m.index + m[0].length });
  if (marks.length < 4) return null;

  let end = rest.length;
  let answerLetter = "";
  let answerTail = "";
  const am = RE_ANSWER_INLINE.exec(rest);
  if (am) {
    end = am.index;
    answerLetter = am[1];
    answerTail = am[2] ?? "";
  }
  const run = marks.filter((x) => x.at < end);
  if (run.length < 4) return null;
  const first = run.slice(0, 4);
  if (first.map((x) => x.letter).join("") !== "ABCD") return null;

  const stem = rest.slice(0, first[0].at - 3).trim();
  const options = first.map((x, i) => {
    const from = x.at;
    const to = i + 1 < 4 ? first[i + 1].at - 3 : end;
    return rest.slice(from, to).trim();
  });
  const em = RE_EXPLANATION_INLINE.exec(answerTail);
  const explanation = (em ? answerTail.slice(em.index + em[0].length) : answerTail).trim();
  const correctAnswer = answerLetter ? (options[answerLetter.charCodeAt(0) - 65] ?? "") : "";
  return { stem, options, correctAnswer, explanation };
}

/** Multi-line layout: `N. stem`, then `A.` … `D.`, then `Answer:`/explanation. */
function parseBlock(lines: string[], from: number, to: number, stem0: string): Omit<Candidate, "printed" | "line" | "complete"> {
  const body = lines.slice(from, to);
  let stem = stem0;
  const options: string[] = [];
  let answerRaw = "";
  const explanation: string[] = [];
  let phase: 0 | 1 | 2 = 0;

  for (const raw of body) {
    const v = raw.trim();
    if (!v) continue;
    const om = RE_OPTION_LINE.exec(v);
    if (om && phase !== 2) {
      options.push(om[2].trim());
      phase = 1;
      if (options.length === 4) phase = 2;
      continue;
    }
    if (phase === 0) {
      // stem spills onto further lines before the options begin
      stem = stem ? `${stem} ${v}` : v;
      continue;
    }
    const am = RE_ANSWER.exec(v);
    if (am) {
      answerRaw = am[1].trim();
      continue;
    }
    const em = RE_EXPLANATION.exec(v);
    explanation.push(em ? em[1] : v);
  }

  let correctAnswer = answerRaw;
  const letter = /^([A-Da-d])(?:\s*[.।)]|$)/.exec(correctAnswer);
  if (letter && options.length === 4) {
    correctAnswer = options[letter[1].toUpperCase().charCodeAt(0) - 65] ?? "";
  } else if (correctAnswer) {
    const squeezed = (s: string) => s.replace(/\s+/g, "");
    correctAnswer = options.find((o) => o === correctAnswer || squeezed(o) === squeezed(correctAnswer)) ?? correctAnswer;
  }
  return { stem: stem.trim(), options, correctAnswer: correctAnswer.trim(), explanation: explanation.join(" ").trim() };
}

function parse(lines: string[], repair: Repair): Candidate[] {
  const starts = findStarts(lines, repair);
  const out: Candidate[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].at : lines.length;
    const inline = parseInline(s.rest);
    const parsed = inline ?? parseBlock(lines, s.at + 1, end, s.rest);
    const complete =
      parsed.options.length === 4 &&
      !!parsed.correctAnswer &&
      parsed.options.includes(parsed.correctAnswer) &&
      !!parsed.stem;
    out.push({ printed: s.printed, line: s.at + 1, complete, ...parsed });
  }
  return out;
}

/**
 * One row per question number.
 *
 * Several drafts repeat a number: an exact duplicate (harmless), a redraft
 * under a different spelling (only if it yields a complete question), or a
 * genuinely different question. We therefore keep the FIRST candidate that
 * parses completely, which discards duplicates and rejects aborted drafts
 * without ever guessing which restatement the author preferred.
 */
function pickQuestion(
  candidates: Candidate[],
  repair: Repair
): { picked: Candidate[]; rejected: string[] } {
  const byNumber = new Map<number, Candidate>();
  const rejected: string[] = [];
  for (const c of candidates) {
    const existing = byNumber.get(c.printed);
    if (existing && existing.complete) continue;
    if (!c.complete) {
      if (!existing)
        rejected.push(
          `#${c.printed} (line ${c.line}, ${repair}): ${c.options.length} options, ` +
            `answer=${JSON.stringify(c.correctAnswer)} — incomplete block skipped`,
        );
      continue;
    }
    if (!existing || !existing.complete) byNumber.set(c.printed, c);
  }
  return { picked: [...byNumber.values()].sort((a, b) => a.printed - b.printed), rejected };
}

// ─────────────────────────────────────────────────────────── 3. validation

type Parsed = {
  src: Source;
  path: string;
  tool: string;
  omml: number;
  questions: Candidate[];
  rejected: string[];
  problems: string[];
  latexSpans: number;
};

function validate(src: Source, path: string, extracted: { lines: string[]; omml: number; tool: string }): Parsed {
  const candidates = parse(extracted.lines, src.repair);
  const { picked, rejected } = pickQuestion(candidates, src.repair);

  const problems: string[] = [];
  if (picked.length !== src.expect)
    problems.push(`expected ${src.expect} questions, parsed ${picked.length}`);
  picked.forEach((q, i) => {
    const n = i + 1;
    if (!q.stem) problems.push(`#${n}: empty stem`);
    if (q.options.length !== 4) problems.push(`#${n}: ${q.options.length} options`);
    if (!q.correctAnswer) problems.push(`#${n}: answer not resolvable`);
    if (q.correctAnswer && !q.options.includes(q.correctAnswer))
      problems.push(`#${n}: answer ${JSON.stringify(q.correctAnswer)} is not one of the options`);
    if (/\$\$/.test(q.stem + q.options.join("") + q.explanation))
      problems.push(`#${n}: stray display-math delimiter`);
    if (new Set(q.options).size !== q.options.length) problems.push(`#${n}: duplicate option text`);
  });

  // `$...$` is *allowed*: a few AP questions carry the author's own inline
  // LaTeX in the .docx, and MathText already renders those spans with KaTeX.
  let latexSpans = 0;
  for (const q of picked) latexSpans += (q.stem + " " + q.options.join(" ") + " " + q.explanation).match(/\$[^$\n]+\$/g)?.length ?? 0;

  return { src, path, tool: extracted.tool, omml: extracted.omml, questions: picked, rejected, problems, latexSpans };
}

// ─────────────────────────────────────────────────────────── 4. main

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY MODE — rows will be written\n" : "DRY RUN — no database writes\n");

  const parsed: Parsed[] = [];
  for (const src of SOURCES) {
    const topic = await prisma.topic.findUnique({ where: { id: src.topicId } });
    if (!topic) throw new Error(`topic ${src.topicId} (${src.slug}) does not exist`);
    if (topic.subjectId !== SUBJECT_ID) throw new Error(`topic ${src.topicId} is not in subject ${SUBJECT_ID}`);
    const result = validate(src, topic.path, extractLines(src));
    parsed.push(result);
    const existing = await prisma.question.count({ where: { topicId: src.topicId } });
    console.log(
      `${src.slug.padEnd(34)} parsed=${String(result.questions.length).padStart(4)} expect=${String(src.expect).padStart(4)} ` +
        `existing=${String(existing).padStart(4)} omml=${String(result.omml).padStart(4)} ` +
        `via=${result.tool}${result.latexSpans ? ` inline$-latex=${result.latexSpans}` : ""}`,
    );
    result.rejected.forEach((r) => console.log(`    skipped ${r}`));
    result.problems.forEach((p) => console.log(`    PROBLEM ${p}`));
  }

  const totalProblems = parsed.reduce((n, p) => n + p.problems.length, 0);
  const totalQuestions = parsed.reduce((n, p) => n + p.questions.length, 0);
  console.log(`\ntotal ${totalQuestions} questions across ${parsed.length} topics, ${totalProblems} problems`);

  if (!apply) {
    console.log("\ndry run complete — re-run with --apply to write");
    await prisma.$disconnect();
    return;
  }
  if (totalProblems > 0) {
    console.error(`\nABORT — ${totalProblems} validation problems; nothing was written.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Back up whatever is live right now, per topic, before touching anything.
  mkdirSync("database/backups", { recursive: true });
  const stamp = Date.now();
  for (const src of SOURCES) {
    const old = await prisma.question.findMany({ where: { topicId: src.topicId }, orderBy: { id: "asc" } });
    const file = `database/backups/topic-${src.topicId}-pre-bankmath-${stamp}.json`;
    writeFileSync(file, JSON.stringify(old, null, 2));
    console.log(`backup topic ${src.topicId}: ${old.length} rows -> ${file}`);
  }

  // One transaction per topic: the swap is atomic per topic, and each
  // transaction stays short so Neon's pooled connection does not reap it
  // mid-flight (a single 1160-row interactive transaction gets P2028 here).
  let written = 0;
  for (const p of parsed) {
    const count = await prisma.$transaction(
      async (tx) => {
        await tx.question.deleteMany({ where: { topicId: p.src.topicId } });
        const res = await tx.question.createMany({
          data: p.questions.map((q, i) => ({
            ecosystemId: ECOSYSTEM_ID,
            subjectId: SUBJECT_ID,
            topicId: p.src.topicId,
            path: p.path,
            topic: p.src.slug,
            subtopic: p.src.subtopic,
            question: q.stem,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            rawMath: true,
            questionType: "SINGLE_CHOICE" as const,
            difficulty: "MEDIUM" as const,
            year: null,
            sourceExam: `Bank Mathematics · ${p.src.subtopic}`,
            bcsTerm: null,
            examId: null,
            paperId: null,
            questionNumber: i + 1,
            sourceKey: createHash("sha256")
              .update(`bankmath:${p.src.topicId}:${q.printed}`)
              .digest("hex")
              .slice(0, 32),
          })),
        });
        return res.count;
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
    written += count;
    console.log(`  ${p.src.slug.padEnd(34)} replaced with ${count} rows`);
  }
  console.log(`\nwrote ${written} rows with rawMath=true`);

  // Verify from the database, not from the in-memory parse.
  let issues = 0;
  for (const src of SOURCES) {
    const rows = await prisma.question.findMany({ where: { topicId: src.topicId }, orderBy: { questionNumber: "asc" } });
    rows.forEach((r, i) => {
      const opts = r.options as string[];
      if (!r.rawMath) { console.error(`  ${src.slug} #${r.id}: rawMath=false`); issues++; }
      if (!opts.includes(r.correctAnswer)) { console.error(`  ${src.slug} #${r.id}: answer not in options`); issues++; }
      if (r.questionNumber !== i + 1) { console.error(`  ${src.slug} #${r.id}: questionNumber=${r.questionNumber}`); issues++; }
    });
    console.log(`  ${src.slug.padEnd(34)} ${String(rows.length).padStart(4)} rows verified`);
  }
  const bank = await prisma.question.count({ where: { subjectId: SUBJECT_ID } });
  console.log(`\nBank Mathematics pool: ${bank} questions, ${issues} integrity issues`);
  if (issues > 0) process.exitCode = 1;

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});