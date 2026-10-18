/**
 * scripts/seed-bd-affairs-practice.ts
 * One-off import for 4 Bangladesh Affairs MCQ dumps under
 *   database/data/ques/বাংলাদেশ বিষয়াবলি/
 * Subject: বাংলাদেশ বিষয়াবলি (BCS ecosystem, id 603). Powers the Practice
 * tab via GET /api/questions?subject=বাংলাদেশ বিষয়াবলি.
 *
 * PRACTICE POOL ONLY: rows are created with paperId NULL + examId NULL, so
 * the Question Bank tab (which lists paperId NOT NULL / PYQ exclusively —
 * see getQuestionBankCategories in backend/services/content.ts) never shows
 * them. sourceExam="BCS" is set for filtering inside practice only.
 *
 * File → taxonomy chapter mapping (files are flat, chapter-level tagging):
 *   Questions[বাংলাদেশের সরকার ব্যবস্থা (Government System)].txt
 *     → 03_বাংলাদেশ_বিষয়াবলি/০৮_সরকার_ব্যবস্থা
 *   Questions[বাংলাদেশের রাজনৈতিক ব্যবস্থা (Political System)].txt
 *     → 03_বাংলাদেশ_বিষয়াবলি/০৭_রাজনৈতিক_ব্যবস্থা
 *   Questions(বাংলাদেশের সংবিধান).txt
 *     → 03_বাংলাদেশ_বিষয়াবলি/০৬_সংবিধান
 *   Questions(বাংলাদেশের জনসংখ্যা, ...).txt
 *     → 03_বাংলাদেশ_বিষয়াবলি/০৩_জনসংখ্যা
 *
 * Parsing mirrors seed-intl-affairs.ts (block-join + option/answer logic,
 * both "সঠিক উত্তর:" and "উত্তর:" markers). Idempotent: upsert by
 * (subjectId, sourceKey).
 *
 *   npx tsx scripts/seed-bd-affairs-practice.ts --dry-run   (validate only)
 *   npx tsx scripts/seed-bd-affairs-practice.ts             (apply)
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { resolveAnswerToOption } from "./qb-forensics/parse-flat";

const SUBJECT_BN = "বাংলাদেশ বিষয়াবলি";
const QUES_DIR = join(process.cwd(), "database", "data", "ques", "বাংলাদেশ বিষয়াবলি");

const SEC08 = "০৮_সরকার_ব্যবস্থা";
const SEC07 = "০৭_রাজনৈতিক_ব্যবস্থা";
const SEC06 = "০৬_সংবিধান";
const SEC03 = "০৩_জনসংখ্যা";
const P = (sec: string) => `03_বাংলাদেশ_বিষয়াবলি/${sec}`;

type Spec = { file: string; path: string; topic: string; subtopic: string };

const SPECS: Spec[] = [
  { file: "Questions[বাংলাদেশের সরকার ব্যবস্থা (Government System)].txt", path: P(SEC08), topic: SEC08, subtopic: "" },
  { file: "Questions[বাংলাদেশের রাজনৈতিক ব্যবস্থা (Political System)].txt", path: P(SEC07), topic: SEC07, subtopic: "" },
  { file: "Questions(বাংলাদেশের সংবিধান).txt", path: P(SEC06), topic: SEC06, subtopic: "" },
  { file: "Questions(বাংলাদেশের জনসংখ্যা, জনশুমারি, জাতি, গোষ্ঠী ও ক্ষুদ্র নৃগোষ্ঠী সংক্রান্ত বিষয়াদি ).txt", path: P(SEC03), topic: SEC03, subtopic: "" },
];

function resolveFile(dir: string, name: string): string {
  const want = name.normalize("NFC");
  for (const entry of readdirSync(dir)) {
    if (entry.normalize("NFC") === want) return join(dir, entry);
  }
  return join(dir, name);
}

const BANGLA_DOT = ["ক.", "খ.", "গ.", "ঘ."];
const BANGLA_PAREN = ["ক)", "খ)", "গ)", "ঘ)"];
const LATIN_DOT = ["A.", "B.", "C.", "D."];
const LATIN_PAREN = ["A)", "B)", "C)", "D)"];

function matchOptions(body: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const markers of [BANGLA_DOT, BANGLA_PAREN, LATIN_DOT, LATIN_PAREN]) {
    const re = new RegExp(
      `${esc(markers[0])}(.*)${esc(markers[1])}(.*)${esc(markers[2])}(.*)${esc(markers[3])}(.*)$`,
    );
    const m = body.match(re);
    if (m) return m;
  }
  return null;
}

const NUM_START = /^\s*[০-৯0-9]+\.\s*/u;
const HAS_ANSWER = /(উত্তর\s*:)|(ans\.)/i;

function toBlocks(raw: string): string[] {
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  const blocks: string[] = [];
  let cur = "";
  for (const ln of lines) {
    const t = ln.trim();
    if (!t || /^\(End of file/i.test(t) || /^পর্ব \d/i.test(t)) continue;
    if (NUM_START.test(t) && (cur === "" || HAS_ANSWER.test(cur))) {
      if (cur) blocks.push(cur);
      cur = t;
    } else if (cur) {
      cur += " " + t;
    }
  }
  if (cur) blocks.push(cur);
  return blocks.filter((b) => HAS_ANSWER.test(b));
}

function stripNum(t: string) {
  return t.replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
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
  body = body.replace(/\*\s*উত্তর\s*:/u, "উত্তর:");

  const m = /(সঠিক\s+)?উত্তর\s*:|(ans\.\s)|(Answer\s*:)/i.exec(body);
  let answerRaw = "";
  let qAndOpts = body;
  if (m) {
    answerRaw = body.slice(m.index + m[0].length).trim().split("*")[0].trim();
    qAndOpts = body.slice(0, m.index).replace(/সঠিক\s*$/u, "").trim();
  }
  const opt = matchOptions(qAndOpts);
  if (!opt) return null;
  const question = stripNum(qAndOpts.slice(0, opt.index));
  const options = [opt[1], opt[2], opt[3], opt[4]].map((s) => s.trim()).filter(Boolean);
  if (options.length < 4 || !question) return null;
  // Normalize "গ) ৪ নভেম্বর ১৯৭২।" → letter + clean text so the shared
  // resolver can match it to its option (it only strips ।/.: — not ")").
  const cleanRaw = answerRaw
    .replace(/^([কখগঘABCD])\s*[).:।]\s*/u, "$1. ")
    .replace(/।\s*$/, "")
    .trim();
  const cleanOpts = options.map((o) => o.replace(/।\s*$/, "").trim());
  let correctAnswer = resolveAnswerToOption(cleanRaw, options) ?? resolveAnswerToOption(cleanRaw, cleanOpts);
  if (correctAnswer && cleanOpts.includes(correctAnswer)) {
    correctAnswer = options[cleanOpts.indexOf(correctAnswer)];
  }
  if (!correctAnswer) correctAnswer = resolveAnswerToOption(answerRaw, options) ?? answerRaw;
  if (!options.includes(correctAnswer)) return null;
  return { question, options, correctAnswer, explanation };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();
  try {
    const subject = await prisma.subject.findFirst({
      where: { nameBn: SUBJECT_BN, ecosystemId: 1 },
    });
    if (!subject) throw new Error(`Subject not found: ${SUBJECT_BN}`);
    const topics = await prisma.topic.findMany({
      where: { subjectId: subject.id, path: { in: SPECS.map((s) => s.path) } },
    });
    const topicIdByPath = new Map(topics.map((t) => [t.path, t.id]));
    const missing = SPECS.filter((s) => !topicIdByPath.has(s.path));
    if (missing.length > 0) throw new Error(`Missing topics: ${missing.map((m) => m.path).join(", ")}`);

    const existing = await prisma.question.findMany({
      where: { subjectId: subject.id },
      select: { question: true, correctAnswer: true, explanation: true },
    });
    const sigs = new Set(
      existing.map((r) =>
        mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }),
      ),
    );

    let inserted = 0, updated = 0, rejected = 0, dupes = 0;
    const rejectReasons: Record<string, number> = {};
    for (const spec of SPECS) {
      console.log(`… ${spec.file}: reading + parsing`);
      const raw = readFileSync(resolveFile(QUES_DIR, spec.file), "utf8");
      const blocks = toBlocks(raw);
      type Cand = { key: string; sig: string; data: Record<string, unknown> };
      const cands = new Map<string, Cand>();
      for (const b of blocks) {
        const p = parseBlock(b);
        if (!p) { rejected++; rejectReasons["UNPARSEABLE"] = (rejectReasons["UNPARSEABLE"] ?? 0) + 1; continue; }
        const gate = scanMca({ question: p.question, options: p.options, correctAnswer: p.correctAnswer, explanation: p.explanation });
        let q = p.question, opts = p.options, ans = p.correctAnswer, expl = p.explanation;
        if (gate.verdict === "REJECT") {
          const codes = new Set(gate.fatal.map((f) => f.code));
          const keepable = [...codes].every((c) => c === "MATH_LITERAL_LATEX" || c === "EMPTY_EXPLANATION");
          if (!keepable) {
            rejected++;
            const k = [...codes].join(",");
            rejectReasons[k] = (rejectReasons[k] ?? 0) + 1;
            continue;
          }
        } else {
          q = gate.normalized.question;
          opts = gate.normalized.options;
          ans = gate.normalized.correctAnswer ?? "";
          expl = gate.normalized.explanation;
        }
        const key = sourceKey(subject.id, spec.path, q);
        if (cands.has(key)) continue;
        cands.set(key, {
          key,
          sig: mcaSignature({ question: q, options: opts, correctAnswer: ans, explanation: expl }),
          data: {
            topicId: topicIdByPath.get(spec.path) ?? null,
            path: spec.path,
            topic: spec.topic,
            subtopic: spec.subtopic,
            question: q,
            options: opts,
            correctAnswer: ans,
            explanation: expl,
          },
        });
      }
      if (dryRun) {
        console.log(`${spec.file}: ${blocks.length} blocks → ${cands.size} valid candidates (dry-run, no writes)`);
        continue;
      }
      const keys = [...cands.keys()];
      const rows = await prisma.question.findMany({
        where: { subjectId: subject.id, sourceKey: { in: keys } },
        select: { id: true, sourceKey: true },
      });
      const idByKey = new Map(rows.map((r) => [r.sourceKey, r.id]));
      const creates: Record<string, unknown>[] = [];
      const updates: { id: number; data: Record<string, unknown> }[] = [];
      let ins = 0, upd = 0;
      for (const c of cands.values()) {
        const id = idByKey.get(c.key);
        if (id !== undefined) {
          updates.push({ id, data: c.data });
        } else {
          if (sigs.has(c.sig)) { dupes++; continue; }
          sigs.add(c.sig);
          // PRACTICE POOL: paperId/examId intentionally omitted (NULL) —
          // bank tab only lists paperId NOT NULL, so these never appear there.
          creates.push({ subjectId: subject.id, ecosystemId: 1, sourceKey: c.key, difficulty: "MEDIUM", sourceExam: "BCS", ...c.data });
        }
      }
      const CHUNK = 200;
      for (let i = 0; i < creates.length; i += CHUNK) {
        await prisma.question.createMany({ data: creates.slice(i, i + CHUNK) as never });
        ins += Math.min(CHUNK, creates.length - i);
      }
      const UCHUNK = 5;
      for (let i = 0; i < updates.length; i += UCHUNK) {
        await Promise.all(updates.slice(i, i + UCHUNK).map((u) => prisma.question.update({ where: { id: u.id }, data: u.data })));
        upd += Math.min(UCHUNK, updates.length - i);
      }
      inserted += ins; updated += upd;
      console.log(`${spec.file}: ${blocks.length} blocks → +${ins} new, ${upd} refreshed`);
    }
    if (dryRun) {
      console.log(`DRY-RUN done. rejected=${rejected} dupes=${dupes}`);
      console.log("reject breakdown:", JSON.stringify(rejectReasons));
    } else {
      console.log(`Done. inserted=${inserted} updated=${updated} rejected=${rejected} dupes=${dupes}`);
      console.log("reject breakdown:", JSON.stringify(rejectReasons));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
