/**
 * scripts/seed-shondhi.ts
 * ----------------------------------------------------------------------------
 * Imports 282 Bangla-grammar সন্ধি MCQs from
 *   database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /সন্ধি/Questions(সন্ধি).txt
 * for BOTH BCS and Bank ecosystems under the canonical সন্ধি leaf:
 *   BCS : 01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সন্ধি
 *   Bank: ০১_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সন্ধি
 * with topicId pointing at the leaf Topic row (upserted here when missing).
 *
 * File format: one question per line —
 *   `<num>. <question> ক. <o1> খ. <o2> গ. <o3> ঘ. <o4> [ঙ. <o5>] Ans. <letter>[. text] ব্যাখ্যা: <expl>`
 * Sub-numbered rows (১৪৭.১, ১৮৯.১, ২৪৯.১ …) and 5-option ঙ rows are supported.
 * Bare-letter answers (`Ans. গ`) resolve to the option text; a parenthetical
 * note after the letter (`Ans. ঘ (সঠিক উত্তর: …)`) keeps bare-letter semantics.
 * Anything ambiguous resolves to null and is REJECTED by the import gate —
 * the answer is never silently forced onto a wrong option.
 *
 * NON-DESTRUCTIVE: rows are keyed by md5(subjectId|path|question), identical
 * to scripts/seed-questions.ts. Existing rows match by key (content refresh)
 * or by question text (adopted + re-keyed); never inserts a duplicate of
 * live content (global per-ecosystem mcaSignature gate).
 *
 * Uses the shared import gate (scripts/qb-forensics/import-gate.ts) for
 * Unicode validation.
 *
 * Run: npx tsx scripts/seed-shondhi.ts
 * ----------------------------------------------------------------------------
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

const LETTER_TO_IDX: Record<string, number> = {
  "ক": 0,
  "খ": 1,
  "গ": 2,
  "ঘ": 3,
  "ঙ": 4,
};

const MARKERS_5 = ["ক.", "খ.", "গ.", "ঘ.", "ঙ."];
const MARKERS_4 = ["ক.", "খ.", "গ.", "ঘ."];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function splitQuestionOptions(qAndOpts: string): { question: string; options: string[] } | null {
  for (const markers of [MARKERS_5, MARKERS_4]) {
    const first = qAndOpts.indexOf(markers[0]);
    if (first < 0) continue;
    const rest = qAndOpts.slice(first);
    const re = new RegExp("^" + markers.map((m) => `${esc(m)} (.*)`).join(" ") + "$");
    const m = rest.match(re);
    if (m) {
      return {
        question: stripShondhiNumber(qAndOpts.slice(0, first)),
        options: m.slice(1).map((s) => s.trim()),
      };
    }
  }
  return null;
}

export function stripShondhiNumber(text: string): string {
  return text
    .replace(/^\s*[০-৯0-9]+(\s*\.\s*[০-৯0-9]+)*\s*\.\s*/, "")
    .trim();
}

export type ParsedShondhiQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export function resolveShondhiAnswer(answerRaw: string, options: string[]): string | null {
  const raw = answerRaw.trim();
  if (!raw) return null;
  if (options.includes(raw)) return raw;
  const m = raw.match(/^([কখগঘঙ])\s*(.*)$/u);
  if (!m) return null;
  const idx = LETTER_TO_IDX[m[1]];
  if (idx === undefined || idx >= options.length) return null;
  const tail = m[2].trim().replace(/^[।.)\]:;ঃ]+\s*/u, "").trim();
  // Bare letter, or a parenthetical note after the letter — the letter rules.
  if (tail === "" || tail.startsWith("(")) return options[idx];
  // Trailing দাঁড়ি/period is answer-key punctuation, not content.
  const tailClean = tail.replace(/[।.\s]+$/u, "");
  if (tailClean === options[idx].normalize("NFC")) return options[idx];
  return null;
}

export function parseShondhiLine(line: string): ParsedShondhiQuestion | null {
  let explanation = "";
  let body = line;
  const explIdx = body.indexOf("ব্যাখ্যা:");
  if (explIdx >= 0) {
    explanation = body.slice(explIdx + "ব্যাখ্যা:".length).trim();
    body = body.slice(0, explIdx);
  }

  const answerMarker = /(উত্তর\s*:)|(ans\.)/i;
  const m = answerMarker.exec(body);
  let answerRaw = "";
  let qAndOpts = body;
  if (m) {
    answerRaw = body.slice(m.index + m[0].length).trim();
    qAndOpts = body.slice(0, m.index);
  }

  const split = splitQuestionOptions(qAndOpts);
  if (!split) return null;
  const { question, options } = split;
  const resolved = resolveShondhiAnswer(answerRaw, options);
  if (!question || options.length < 4) return null;

  return { question, options, correctAnswer: resolved ?? answerRaw, explanation };
}

function isQuestionLine(line: string): boolean {
  return /ans\./i.test(line) && line.includes("ক.");
}

export function parseShondhiFile(lines: string[]): ParsedShondhiQuestion[] {
  const result: ParsedShondhiQuestion[] = [];
  for (const line of lines) {
    if (!isQuestionLine(line)) continue;
    const p = parseShondhiLine(line);
    if (p) result.push(p);
  }
  return result;
}

// ── Corrected-file format (user-reviewed retype of rejected rows) ──────
// Three- or four-line blocks:
//
//   <num>. <question>
//   Options: ক. <o1> / খ. <o2> / গ. <o3> / ঘ. <o4> [/ ঙ. <o5>]
//   Key: <letter>[. text]
//   [ব্যাখ্যা: <explanation>]
//
// When a block carries its own ব্যাখ্যা it wins; otherwise the explanation
// is carried over from the original file by question-text identity (NFC).
export type CorrectedBlock = {
  num: string;
  question: string;
  options: string[];
  answerRaw: string;
  explanation: string;
};

export function parseCorrectedBlocks(text: string): CorrectedBlock[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim());
  const blocks: CorrectedBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i]) {
      i++;
      continue;
    }
    const qLine = lines[i];
    const oLine = i + 1 < lines.length ? lines[i + 1] : "";
    const kLine = i + 2 < lines.length ? lines[i + 2] : "";
    if (!oLine.startsWith("Options:") || !kLine.startsWith("Key:")) {
      i++;
      continue;
    }
    const num = (qLine.match(/^\s*[০-৯0-9]+(\s*\.\s*[০-৯0-9]+)*\s*\./)?.[0] ?? "").trim();
    const question = stripShondhiNumber(qLine);
    const options = oLine
      .replace(/^Options:\s*/, "")
      .split(/\s*\/\s*/)
      .map((o) => o.replace(/^[কখগঘঙabcdABCD]\s*\.\s*/u, "").trim())
      .filter(Boolean);
    const answerRaw = kLine.replace(/^Key:\s*/, "").trim();
    // The ব্যাখ্যা line follows after the blank separator line(s), if present.
    let explanation = "";
    let consumed = 3;
    let j = i + 3;
    while (j < lines.length && !lines[j]) j++;
    if (j < lines.length && /^ব্যাখ্যা\s*:/.test(lines[j])) {
      explanation = lines[j].replace(/^ব্যাখ্যা\s*:\s*/, "").trim();
      consumed = j - i + 1;
    }
    blocks.push({ num, question, options, answerRaw, explanation });
    i += consumed;
  }
  return blocks;
}

export function toParsedWithOriginalExplanations(
  blocks: CorrectedBlock[],
  original: ParsedShondhiQuestion[],
): ParsedShondhiQuestion[] {
  const explByQuestion = new Map<string, string>();
  for (const o of original) {
    const key = o.question.normalize("NFC");
    if (!explByQuestion.has(key)) explByQuestion.set(key, o.explanation);
  }
  const out: ParsedShondhiQuestion[] = [];
  for (const b of blocks) {
    const correctAnswer = resolveShondhiAnswer(b.answerRaw, b.options) ?? b.answerRaw;
    out.push({
      question: b.question,
      options: b.options,
      correctAnswer,
      // The block's own ব্যাখ্যা wins; otherwise fall back to the original.
      explanation: b.explanation || explByQuestion.get(b.question.normalize("NFC")) || "",
    });
  }
  return out;
}

// Display tags mirroring seed-questions.ts leafTags(): topic is the group
// directly under the subject, subtopic is the leaf name.
const TOPIC = "ভাষা";
const LEAF = "সন্ধি";
const FILE =
  "database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /সন্ধি/Questions(সন্ধি).txt";

async function ensureLeafTopic(
  prisma: PrismaClient,
  subjectId: number,
  subjectPrefix: string,
): Promise<number> {
  const parentPath = `${subjectPrefix}/${TOPIC}`;
  const parent = await prisma.topic.findUnique({
    where: { subjectId_path: { subjectId, path: parentPath } },
  });
  if (!parent) {
    throw new Error(`Parent topic missing for Shondhi import: subject ${subjectId} path "${parentPath}"`);
  }
  const path = `${parentPath}/${LEAF}`;
  const row = await prisma.topic.upsert({
    where: { subjectId_path: { subjectId, path } },
    update: { name: LEAF, slug: LEAF, depth: parent.depth + 1, parentId: parent.id },
    create: {
      subjectId,
      name: LEAF,
      slug: LEAF,
      path,
      depth: parent.depth + 1,
      sortOrder: 0,
      parentId: parent.id,
      questionCount: "0",
    },
  });
  return row.id;
}

export function gateParsedQuestions(
  rawParsed: ParsedShondhiQuestion[],
  logRejections = false,
): { accepted: ParsedShondhiQuestion[]; rejected: number } {
  const accepted: ParsedShondhiQuestion[] = [];
  let rejected = 0;
  for (const p of rawParsed) {
    const gate = scanMca({
      question: p.question,
      options: p.options,
      correctAnswer: p.correctAnswer,
      explanation: p.explanation,
    });
    if (gate.verdict === "REJECT") {
      rejected++;
      if (logRejections) {
        console.log(`  ✗ rejected: ${p.question.slice(0, 60)}… [${gate.issues.map((i) => i.code).join(",")}]`);
      }
      continue;
    }
    accepted.push({
      question: gate.normalized.question,
      options: gate.normalized.options,
      correctAnswer: gate.normalized.correctAnswer ?? "",
      explanation: gate.normalized.explanation,
    });
  }
  return { accepted, rejected };
}

export async function seedShondhiQuestions(prisma: PrismaClient): Promise<number> {
  const bcsEcosystem = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bbEcosystem = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcsEcosystem || !bbEcosystem) throw new Error("Ecosystems not found");

  const bcsSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bcsEcosystem.id, nameBn: "বাংলা ভাষা ও সাহিত্য" },
  });
  const bbSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bbEcosystem.id, nameBn: "০১_বাংলা_ভাষা_ও_সাহিত্য" },
  });
  if (!bcsSubject) throw new Error("BCS subject not found");
  if (!bbSubject) throw new Error("Bank subject not found");

  const ecosystems = [
    { id: bcsEcosystem.id, subjectId: bcsSubject.id, prefix: "01_বাংলা_ভাষা_ও_সাহিত্য", label: "BCS" },
    { id: bbEcosystem.id, subjectId: bbSubject.id, prefix: "০১_বাংলা_ভাষা_ও_সাহিত্য", label: "Bank" },
  ];

  const raw = readFileSync(join(process.cwd(), FILE), "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rawParsed = parseShondhiFile(lines);

  const { accepted: parsed, rejected } = gateParsedQuestions(rawParsed, true);
  console.log(`  parsed=${rawParsed.length} accepted=${parsed.length} rejected=${rejected}`);
  return seedParsedShondhi(prisma, ecosystems, parsed);
}

export type ShondhiEcosystem = { id: number; subjectId: number; prefix: string; label: string };

export async function seedParsedShondhi(
  prisma: PrismaClient,
  ecosystems: ShondhiEcosystem[],
  parsed: ParsedShondhiQuestion[],
): Promise<number> {

  const sigsByEcosystem = new Map<number, Set<string>>();
  for (const eco of ecosystems) {
    const rows = await prisma.question.findMany({
      where: { ecosystemId: eco.id },
      select: { question: true, correctAnswer: true, explanation: true },
    });
    sigsByEcosystem.set(
      eco.id,
      new Set(
        rows.map((r) =>
          mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }),
        ),
      ),
    );
  }

  let totalInserted = 0;
  let totalMigrated = 0;
  for (const eco of ecosystems) {
    const path = `${eco.prefix}/${TOPIC}/${LEAF}`;
    const topicId = await ensureLeafTopic(prisma, eco.subjectId, eco.prefix);

    const existing = await prisma.question.findMany({
      where: { subjectId: eco.subjectId },
      select: { id: true, sourceKey: true, question: true },
    });
    const idByKey = new Map(existing.map((r) => [r.sourceKey, r.id]));
    const idByText = new Map<string, number>();
    for (const r of existing) {
      const text = r.question.normalize("NFC");
      if (!idByText.has(text)) idByText.set(text, r.id);
    }

    const seenKeys = new Set<string>();
    const creates: Array<Record<string, unknown>> = [];
    const updates: Promise<unknown>[] = [];
    let skipped = 0;

    for (const p of parsed) {
      const key = sourceKey(eco.subjectId, path, p.question);
      if (seenKeys.has(key)) {
        skipped++;
        continue;
      }
      seenKeys.add(key);

      const contentData = {
        topicId,
        path,
        topic: TOPIC,
        subtopic: LEAF,
        question: p.question,
        options: p.options,
        correctAnswer: p.correctAnswer,
        explanation: p.explanation,
      };

      const byKey = idByKey.get(key);
      const byText = byKey === undefined ? idByText.get(p.question.normalize("NFC")) : undefined;
      const existingId = byKey ?? byText;
      if (existingId !== undefined) {
        updates.push(
          prisma.question.update({
            where: { id: existingId },
            data: byText !== undefined ? { ...contentData, sourceKey: key } : contentData,
          }),
        );
        if (byText !== undefined) totalMigrated++;
      } else {
        const sig = mcaSignature({
          question: p.question,
          options: p.options,
          correctAnswer: p.correctAnswer,
          explanation: p.explanation,
        });
        const ecoSigs = sigsByEcosystem.get(eco.id)!;
        if (ecoSigs.has(sig)) {
          skipped++;
          continue;
        }
        ecoSigs.add(sig);
        creates.push({
          ecosystemId: eco.id,
          subjectId: eco.subjectId,
          sourceKey: key,
          ...contentData,
          difficulty: "MEDIUM",
          sourceExam: eco.label,
          year: null,
        });
      }
    }

    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(updates.slice(i, i + CHUNK));
    }
    if (creates.length > 0) {
      await prisma.question.createMany({ data: creates as never });
    }
    totalInserted += creates.length;
    console.log(`  ${eco.label}: inserted=${creates.length} updated=${updates.length} skipped=${skipped}`);
  }
  if (totalMigrated > 0) console.log(`  migrated=${totalMigrated}`);
  return totalInserted;
}

const CORRECTED_FILE = "database/data/Corrected_MCQs(সন্ধি).txt";

/**
 * Imports the user-corrected retype of previously rejected rows.
 * Explanations are carried over from the original file by question identity.
 */
export async function seedCorrectedShondhi(prisma: PrismaClient): Promise<number> {
  const bcsEcosystem = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bbEcosystem = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcsEcosystem || !bbEcosystem) throw new Error("Ecosystems not found");

  const bcsSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bcsEcosystem.id, nameBn: "বাংলা ভাষা ও সাহিত্য" },
  });
  const bbSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bbEcosystem.id, nameBn: "০১_বাংলা_ভাষা_ও_সাহিত্য" },
  });
  if (!bcsSubject) throw new Error("BCS subject not found");
  if (!bbSubject) throw new Error("Bank subject not found");

  const ecosystems: ShondhiEcosystem[] = [
    { id: bcsEcosystem.id, subjectId: bcsSubject.id, prefix: "01_বাংলা_ভাষা_ও_সাহিত্য", label: "BCS" },
    { id: bbEcosystem.id, subjectId: bbSubject.id, prefix: "০১_বাংলা_ভাষা_ও_সাহিত্য", label: "Bank" },
  ];

  const originalRaw = readFileSync(join(process.cwd(), FILE), "utf8").replace(/^\uFEFF/, "");
  const original = parseShondhiFile(
    originalRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
  );
  const correctedRaw = readFileSync(join(process.cwd(), CORRECTED_FILE), "utf8");
  const blocks = parseCorrectedBlocks(correctedRaw);
  console.log(`  corrected blocks=${blocks.length}`);
  const withExpl = toParsedWithOriginalExplanations(blocks, original);
  console.log(`  explanations carried over=${withExpl.filter((p) => p.explanation).length}/${withExpl.length}`);

  const { accepted: parsed, rejected } = gateParsedQuestions(withExpl, true);
  console.log(`  accepted=${parsed.length} rejected=${rejected}`);
  return seedParsedShondhi(prisma, ecosystems, parsed);
}

if (process.argv[1]?.endsWith("seed-shondhi.ts")) {
  const prisma = new PrismaClient();
  const run = process.argv.includes("--corrected")
    ? seedCorrectedShondhi(prisma)
    : seedShondhiQuestions(prisma);
  run
    .then((n) => console.log(`✅ Shondhi seed complete: ${n} inserted.`))
    .catch((e) => {
      console.error("❌ Shondhi seed failed:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
