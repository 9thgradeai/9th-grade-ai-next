/**
 * scripts/import-raw-unicode-topic.ts  (one-shot; run with tsx)
 *
 * SWAPS the MCQs of one topic for a verbatim import of a .docx whose
 * equations are already authoritative book Unicode (superscripts ˣ⁺³,
 * subscripts log₂, √, − U+2212). Nothing is normalised: the stored text is
 * byte-identical to the document.
 *
 * Why the `rawMath` flag: backend/services/content.ts runs every field
 * through normalizeFieldForDisplay, which rewrites ~44% of these exact
 * fields into LaTeX. Rows imported with rawMath=true bypass that, so the
 * dashboard renders the document's own Unicode.
 *
 *   npx tsx scripts/import-raw-unicode-topic.ts --topic=133177 <file.docx>
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

async function main() {

  const argTopic = process.argv.find((a) => a.startsWith("--topic="));
  const DOCX = process.argv.find((a) => a.endsWith(".docx"));
  if (!argTopic || !DOCX) {
    console.error("usage: tsx scripts/import-raw-unicode-topic.ts --topic=<id> <file.docx>");
    process.exit(1);
  }
  const TOPIC = Number(argTopic.split("=")[1]);
  if (!existsSync(DOCX)) {
    console.error("no such file:", DOCX);
    process.exit(1);
  }

  // ─────────────────────────────────────────── 1. extract paragraphs from the docx
  const TMP = `/tmp/rawuni-${process.pid}`;
  execSync(`rm -rf "${TMP}" && mkdir -p "${TMP}" && cd "${TMP}" && unzip -o -q "${process.cwd()}/${DOCX}"`);
  const xml = readFileSync(`${TMP}/word/document.xml`, "utf8");

  const unescape = (s: string) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

  const paragraphs: string[] = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(xml)) !== null) {
    let txt = "";
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(pm[0])) !== null) txt += tm[1] !== undefined ? unescape(tm[1]) : "\t";
    paragraphs.push(txt);
  }
  const lines = paragraphs.map((s) => s.trim()).filter(Boolean);

  // ─────────────────────────────────────────── 2. parse into questions
  type Parsed = { stem: string; options: string[]; answerText: string; explanation: string };
  const parsed: Parsed[] = [];
  let cur: Parsed | null = null;
  let seenAnswer = false;

  for (const line of lines) {
    if (/^Section\b/i.test(line)) continue; // section headers carry no MCQ
    const qm = /^(\d{1,3})\.\s*(.*)$/.exec(line);
    if (qm) {
      if (cur) parsed.push(cur);
      const rest = qm[2];
      const ansAt = rest.search(/Answer:\s*([ABCD])/i);
      const head = ansAt >= 0 ? rest.slice(0, ansAt) : rest;
      const tail = ansAt >= 0 ? rest.slice(ansAt) : "";
      cur = { stem: "", options: [], answerText: "", explanation: "" };
      seenAnswer = false;
      const optAt = head.search(/[ABCD]\.\s/);
      if (optAt >= 0) {
        cur.stem = head.slice(0, optAt).trim();
        const blob = head.slice(optAt);
        const re = /([ABCD])\.\s*/g;
        const marks: { letter: string; at: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(blob)) !== null) marks.push({ letter: m[1], at: m.index + m[0].length });
        for (let i = 0; i < marks.length; i++) {
          const end = i + 1 < marks.length ? marks[i + 1].at - 3 : blob.length;
          cur.options[i] = blob.slice(marks[i].at, end).trim();
        }
      } else {
        cur.stem = head.trim();
      }
      const am = /Answer:\s*([ABCD])/i.exec(tail);
      if (am) {
        seenAnswer = true;
        const idx = am[1].toUpperCase().charCodeAt(0) - 65;
        cur.answerText = cur.options[idx] ?? "";
        const em = /^Explanation:\s*([\s\S]*)$/.exec(tail.slice(am.index + am[0].length));
        cur.explanation = (em ? em[1] : tail.slice(am.index + am[0].length)).trim();
      }
      continue;
    }
    // continuation paragraph → belongs to the previous explanation
    if (cur) cur.explanation = cur.explanation ? `${cur.explanation} ${line}` : line;
  }
  if (cur) parsed.push(cur);

  // ─────────────────────────────────────────── 3. validate BEFORE any DB write
  const problems: string[] = [];
  parsed.forEach((q, i) => {
    const n = i + 1;
    if (!q.stem) problems.push(`#${n}: empty stem`);
    if (q.options.length !== 4) problems.push(`#${n}: ${q.options.length} options`);
    if (!q.answerText) problems.push(`#${n}: answer not resolvable`);
    if (q.answerText && !q.options.includes(q.answerText))
      problems.push(`#${n}: answer ${JSON.stringify(q.answerText)} not among options`);
    if (!seenAnswer && i === parsed.length - 1) problems.push(`#${n}: no Answer: marker`);
    if (/\$\$?/.test(q.stem + q.options.join("") + q.explanation))
      problems.push(`#${n}: stray LaTeX delimiter — source is not pure Unicode`);
  });
  console.log(`parsed ${parsed.length} questions from the document`);
  if (problems.length) {
    console.error(`\nABORT — ${problems.length} validation problems:`);
    problems.slice(0, 20).forEach((p) => console.error("  " + p));
    await prisma.$disconnect();
    process.exit(1);
  }

  // ─────────────────────────────────────────── 4. inspect what is being replaced
  const old = await prisma.question.findMany({ where: { topicId: TOPIC }, orderBy: { id: "asc" } });
  if (old.length === 0) throw new Error(`topic ${TOPIC} has no rows to replace`);
  const tpl: any = old[0];
  console.log(`replacing ${old.length} existing rows in topic ${TOPIC}`);
  if (old.length !== parsed.length)
    console.warn(`  NOTE: existing=${old.length} document=${parsed.length} — difficulty will be reused positionally for the overlap only`);

  mkdirSync("database/backups", { recursive: true });
  const backup = `database/backups/topic-${TOPIC}-pre-rawunicode-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(old, null, 2));
  console.log(`backup -> ${backup}`);

  // ─────────────────────────────────────────── 5. insert verbatim
  const created: { ord: number; oldId: number | null; newId: number }[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    const prev: any = old[i];
    const row = await prisma.question.create({
      data: {
        ecosystemId: prev?.ecosystemId ?? tpl.ecosystemId,
        subjectId: prev?.subjectId ?? tpl.subjectId,
        topicId: TOPIC,
        path: prev?.path ?? tpl.path,
        topic: prev?.topic ?? tpl.topic,
        subtopic: prev?.subtopic ?? tpl.subtopic,
        question: q.stem,
        options: q.options,
        correctAnswer: q.answerText,
        explanation: q.explanation,
        rawMath: true,
        questionType: prev?.questionType ?? "SINGLE_CHOICE",
        difficulty: prev?.difficulty ?? "MEDIUM",
        year: prev?.year ?? null,
        sourceExam: prev?.sourceExam ?? tpl.sourceExam,
        bcsTerm: prev?.bcsTerm ?? null,
        examId: null,
        paperId: null,
        questionNumber: i + 1,
        sourceKey: createHash("sha256").update(`${TOPIC}:${q.stem}`).digest("hex").slice(0, 32),
      },
      select: { id: true },
    });
    created.push({ ord: i + 1, oldId: prev?.id ?? null, newId: row.id });
  }
  console.log(`inserted ${created.length} rows with rawMath=true`);

  // ─────────────────────────────────────────── 6. carry history onto the new ids
  let movedAttempts = 0, movedProgress = 0;
  for (const c of created) {
    if (!c.oldId) continue;
    movedAttempts += (await prisma.questionAttempt.updateMany({ where: { questionId: c.oldId }, data: { questionId: c.newId } })).count;
    movedProgress += (await prisma.userQuestionProgress.updateMany({ where: { questionId: c.oldId }, data: { questionId: c.newId } })).count;
  }
  console.log(`carried over ${movedAttempts} attempts, ${movedProgress} progress rows`);

  // ─────────────────────────────────────────── 7. drop the superseded LaTeX rows
  const oldIds = old.map((r) => r.id);
  const removed = await prisma.question.deleteMany({ where: { id: { in: oldIds } } });
  console.log(`deleted ${removed.count} superseded rows`);

  // ─────────────────────────────────────────── 8. verify
  const final = await prisma.question.findMany({ where: { topicId: TOPIC }, orderBy: { questionNumber: "asc" } });
  const issues: string[] = [];
  final.forEach((r, i) => {
    if (!r.rawMath) issues.push(`#${r.id}: rawMath=false`);
    if (/\$\$?/.test(r.question + (r.options as string[]).join("") + r.explanation))
      issues.push(`#${r.id}: LaTeX delimiter present`);
    if (!(r.options as string[]).includes(r.correctAnswer))
      issues.push(`#${r.id}: answer not in options`);
  });
  console.log(`\ntopic ${TOPIC} now holds ${final.length} raw-Unicode rows; integrity issues: ${issues.length}`);
  issues.slice(0, 10).forEach((i) => console.log("  " + i));
  console.log(`\nsample #1 : ${final[0].question}`);
  console.log(`sample opts: ${JSON.stringify(final[0].options)}`);
  console.log(`sample ans : ${JSON.stringify(final[0].correctAnswer)}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
