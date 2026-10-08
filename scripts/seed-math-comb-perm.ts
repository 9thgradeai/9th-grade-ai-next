/**
 * scripts/seed-math-comb-perm.ts
 * One-off import for the two Math MCQs dumps:
 *   database/data/ques/Math/Questions(Combinations).txt  -> সমাবেশ leaf
 *   database/data/ques/Math/Questions(Permutations).txt   -> বিন্যাস leaf
 * Subject: গাণিতিক যুক্তি (BCS ecosystem). Powers the Practice tab via
 * GET /api/questions?subject=গাণিতিক যুক্তি.
 *
 * Both files are block-structured (Permutations is multi-line, Combinations
 * is mostly single-line with one split record). Blocks are joined on the
 * leading "প্রশ্ন" marker, then parsed with the same option/answer logic as
 * seed-questions.ts and gated by scanMca. Empty-option records are skipped
 * (never fabricated). Idempotent: upsert by (subjectId, sourceKey).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { resolveAnswerToOption } from "./qb-forensics/parse-flat";

const SUBJECT_BN = "গাণিতিক যুক্তি";
const TOPIC = "Part_05_সেট_ও_পরিসংখ্যান";
const PATH_BINNASH = "08_গাণিতিক_যুক্তি/Part_05_সেট_ও_পরিসংখ্যান/বিন্যাস";
const PATH_SOMABESH = "08_গাণিতিক_যুক্তি/Part_05_সেট_ও_পরিসংখ্যান/সমাবেশ";

const FILES = [
  { file: "Questions(Combinations).txt", path: PATH_SOMABESH, subtopic: "সমাবেশ" },
  { file: "Questions(Permutations).txt", path: PATH_BINNASH, subtopic: "বিন্যাস" },
];

const LATIN = ["A.", "B.", "C.", "D."];
const BANGLA = ["ক.", "খ.", "গ.", "ঘ."];

function matchOptions(body: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const markers of [BANGLA, LATIN]) {
    const re = new RegExp(
      `${esc(markers[0])}(.*)${esc(markers[1])}(.*)${esc(markers[2])}(.*)${esc(markers[3])}(.*)$`,
    );
    const m = body.match(re);
    if (m) return m;
  }
  return null;
}

function stripNum(t: string) {
  return t
    .replace(/^\s*প্রশ্ন\s*[০-৯0-9]+\s*\.\s*/, "")
    .replace(/^\s*[০-৯0-9]+\s*\.\s*/, "")
    .trim();
}

/** Join raw lines into question blocks: a block starts at "প্রশ্ন". */
function toBlocks(raw: string): string[] {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const blocks: string[] = [];
  let cur = "";
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) continue;
    if (/^প্রশ্ন\s*[০-৯0-9]+/u.test(t)) {
      if (cur) blocks.push(cur);
      cur = t;
    } else if (cur) {
      cur += " " + t;
    }
  }
  if (cur) blocks.push(cur);
  // Drop trailing meta line like "(End of file - total 66 lines)"
  return blocks.filter((b) => /উত্তর\s*:|ans\./i.test(b));
}

function parseBlock(block: string) {
  let explanation = "";
  let body = block;
  const bi = block.indexOf("ব্যাখ্যা:");
  const ei = block.indexOf("Explanation:");
  if (bi >= 0) {
    explanation = block.slice(bi + "ব্যাখ্যা:".length).trim();
    body = block.slice(0, bi);
  } else if (ei >= 0) {
    explanation = block.slice(ei + "Explanation:".length).trim();
    body = block.slice(0, ei);
  }
  // Strip trailing "(সময়: ...)" timing notes from explanations
  explanation = explanation.replace(/\(সময়:[^)]*\)\s*$/u, "").trim();
  // Strip "* উত্তর:" bullet artifact
  body = body.replace(/\*\s*উত্তর\s*:/u, "উত্তর:");

  const m = /(উত্তর\s*:)|(ans\.\s)|(Answer\s*:)/i.exec(body);
  let answerRaw = "";
  let qAndOpts = body;
  if (m) {
    answerRaw = body.slice(m.index + m[0].length).trim();
    // Answer may be followed by leftover ব্যাখ্যা text already cut; also cut
    // at any stray "*" separator
    answerRaw = answerRaw.split("*")[0].trim();
    qAndOpts = body.slice(0, m.index);
  }
  const opt = matchOptions(qAndOpts);
  if (!opt) return null;
  const question = stripNum(qAndOpts.slice(0, opt.index));
  const options = [opt[1], opt[2], opt[3], opt[4]].map((s) => s.trim()).filter(Boolean);
  if (options.length < 4 || !question) return null;
  const correctAnswer = resolveAnswerToOption(answerRaw, options) ?? answerRaw;
  if (!options.includes(correctAnswer)) return null;
  return { question, options, correctAnswer, explanation };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const subject = await prisma.subject.findFirst({
      where: { nameBn: SUBJECT_BN, ecosystemId: 1 },
    });
    if (!subject) throw new Error(`Subject not found: ${SUBJECT_BN}`);
    const topics = await prisma.topic.findMany({
      where: { subjectId: subject.id, path: { in: [PATH_BINNASH, PATH_SOMABESH] } },
    });
    const topicIdByPath = new Map(topics.map((t) => [t.path, t.id]));

    const existing = await prisma.question.findMany({
      where: { subjectId: subject.id },
      select: { question: true, correctAnswer: true, explanation: true },
    });
    const sigs = new Set(
      existing.map((r) =>
        mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }),
      ),
    );

    let inserted = 0, updated = 0, rejected = 0, dupes = 0, rawMathCount = 0;
    const rejectReasons: Record<string, number> = {};
    for (const spec of FILES) {
      const raw = readFileSync(join(process.cwd(), "database", "data", "ques", "Math", spec.file), "utf8");
      const blocks = toBlocks(raw);
      console.log(`${spec.file}: ${blocks.length} blocks`);
      for (const b of blocks) {
        const p = parseBlock(b);
        if (!p) { rejected++; rejectReasons["UNPARSEABLE"] = (rejectReasons["UNPARSEABLE"] ?? 0) + 1; continue; }
        const gate = scanMca({ question: p.question, options: p.options, correctAnswer: p.correctAnswer, explanation: p.explanation });
        // Gate verdicts: rows rejected ONLY for book-Unicode math literals
        // and/or missing explanations are kept verbatim with rawMath=true
        // (never rewritten, never invented). All other fatal codes skip.
        let q = p.question, opts = p.options, ans = p.correctAnswer, expl = p.explanation;
        let useRawMath = false;
        if (gate.verdict === "REJECT") {
          const codes = new Set(gate.fatal.map((f) => f.code));
          const keepable = [...codes].every((c) => c === "MATH_LITERAL_LATEX" || c === "EMPTY_EXPLANATION");
          if (!keepable) {
            rejected++;
            const k = [...codes].join(",");
            rejectReasons[k] = (rejectReasons[k] ?? 0) + 1;
            continue;
          }
          useRawMath = codes.has("MATH_LITERAL_LATEX");
        } else {
          q = gate.normalized.question;
          opts = gate.normalized.options;
          ans = gate.normalized.correctAnswer ?? "";
          expl = gate.normalized.explanation;
        }
        const sig = mcaSignature({ question: q, options: opts, correctAnswer: ans, explanation: expl });
        const key = sourceKey(subject.id, spec.path, q);
        const hit = await prisma.question.findUnique({
          where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: key } },
        });
        const data = {
          topicId: topicIdByPath.get(spec.path) ?? null,
          path: spec.path,
          topic: TOPIC,
          subtopic: spec.subtopic,
          question: q,
          options: opts,
          correctAnswer: ans,
          explanation: expl,
          rawMath: useRawMath,
        };
        if (hit) {
          await prisma.question.update({ where: { id: hit.id }, data });
          updated++;
        } else {
          if (sigs.has(sig)) { dupes++; continue; }
          sigs.add(sig);
          await prisma.question.create({
            data: { subjectId: subject.id, ecosystemId: 1, sourceKey: key, difficulty: "MEDIUM", sourceExam: "BCS", ...data },
          });
          inserted++;
          if (useRawMath) rawMathCount++;
        }
      }
    }
    console.log(`Done. inserted=${inserted} updated=${updated} rejected=${rejected} dupes=${dupes} rawMath=${rawMathCount}`);
    console.log("reject breakdown:", JSON.stringify(rejectReasons));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
