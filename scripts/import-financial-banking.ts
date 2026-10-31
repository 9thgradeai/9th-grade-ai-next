import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

const DIR = join(process.cwd(), "database", "data", "Bank", "Financial & Banking Knowledge");
const FILES = [
  "Questions(Payment Systems and Digital Banking).txt",
  "Questions(Commercial Banking and Operations).txt",
  "Questions(Bangladesh Bank Monetary Policy & Central Banking ).txt",
  "Questions(Bangladesh Banking System and Institutions).txt",
  "Questions(Bangladesh Bank & Banking Laws).txt",
  "Questions(All Banking Terms, Full Forms & Monetary Policy Rates).txt",
];

const LETTERS = ["A", "B", "C", "D"] as const;

type Parsed = { question: string; options: string[]; correctAnswer: string; explanation: string };

/**
 * Parses a block of text for one question from the financial-banking .txt files.
 * Each question block has this form (spanning multiple lines):
 *   1. What is the question?
 *      A. option A
 *      B. option B
 *      C. option C
 *      D. option D
 *   Correct Answer: B. answer text
 *   Explanation: explanation text
 *
 * The function receives the full file text and the index of the line that starts
 * with "N. " (the question stem line). It then scans forward to find the options,
 * correct answer and explanation within the same block (stopping before the next
 * "N. " line or the end of the file).
 */
function parseQuestionBlock(text: string, startLineIdx: number): Parsed | null {
  const lines = text.split(/\r?\n/);

  // --- Find the question stem line ---
  const stemLine = lines[startLineIdx];
  if (!/^\s*[0-9]+\s*\.\s/.test(stemLine)) return null;

  // Extract question text: everything after "N. " on the stem line
  const question = stemLine.replace(/^\s*[0-9]+\s*\.\s*/, "").trim();

  // --- Scan forward for options, correct answer and explanation ---
  // We look within lines[startLineIdx + 1 ...] until we hit the next "N. " line
  // or the end of the array.
  let options: string[] = [];
  let correctAnswerRaw = "";
  let explanation = "";
  let optCount = 0;
  let foundAnswer = false;

  for (let i = startLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Stop if we hit the next question stem
    if (/^\s*[0-9]+\s*\.\s/.test(line)) break;

    // Collect option markers A. B. C. D.
    if (!foundAnswer) {
      const markerMatch = line.match(/^([ABCD])\s*\.\s(.*)$/);
      if (markerMatch) {
        const letter = markerMatch[1];
        const optText = markerMatch[2].trim();
        // Ensure we have exactly 4 options A through D in order
        if (letter >= "A" && letter <= "D") {
          // Extend options array if needed
          while (options.length <= optCount) options.push("");
          options[optCount] = optText;
          optCount++;
        }
        // Once we have all 4 options, look for the Correct Answer on subsequent lines
        if (options.length === 4) {
          foundAnswer = true;
        }
        continue;
      }
    }

    // After we have 4 options, look for "Correct Answer:"
    if (foundAnswer && !/^Correct Answer:/i.test(line)) {
      // This line is part of the correct answer text
      correctAnswerRaw += (correctAnswerRaw ? " " : "") + line;
      continue;
    }

    if (foundAnswer && /^Correct Answer:/i.test(line)) {
      // Extract the answer text after "Correct Answer:"
      const answerPart = line.slice("Correct Answer:".length).trim();
      // The answer format is typically "B. answer text" — take everything after the letter
      const answerLetterMatch = answerPart.match(/^[A-D]\s*\.\s*(.*)$/);
      if (answerLetterMatch) {
        correctAnswerRaw = answerLetterMatch[1].trim();
      } else {
        // Bare letter or just the text
        correctAnswerRaw = answerPart;
      }
      foundAnswer = true; // prevent re-processing
      continue;
    }

    // Look for "Explanation:" — capture everything after it until next block
    if (/^Explanation:/i.test(line)) {
      const explPart = line.slice("Explanation:".length).trim();
      explanation = explPart;
      // Also try to capture explanation text on subsequent lines
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        // Stop if we hit a new question stem or Correct Answer we haven't processed
        if (/^\s*[0-9]+\s*\.\s/.test(nextLine) || /^Correct Answer:/i.test(nextLine)) break;
        explanation += (explanation ? " " : "") + nextLine;
        j++;
      }
      break; // done with this block
    }
  }

  // Validate: need question + 4 options + correct answer
  if (!question || options.length < 4 || !correctAnswerRaw) return null;

  // Resolve the correct answer to the matching option text
  const correctAnswer = resolveCorrectAnswer(correctAnswerRaw, options);

  if (!correctAnswer) return null;

  return { question, options, correctAnswer, explanation };
}

/**
 * Given the raw correct-answer text (e.g. "B. Automating the clearing...") and
 * the array of option texts, return the matching option string or null.
 */
function resolveCorrectAnswer(raw: string, options: string[]): string | null {
  const firstChar = raw.charAt(0).toUpperCase();
  const idx = LETTERS.indexOf(firstChar as (typeof LETTERS)[number]);
  if (idx < 0 || idx >= options.length) return null;
  return options[idx];
}

async function main() {
  const dryRun = !process.argv.includes("--yes");
  const prisma = new PrismaClient();
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing");
  const subject = await prisma.subject.findFirst({ where: { ecosystemId: bb.id, nameEn: "Financial & Banking Knowledge" } });
  if (!subject) throw new Error("subject missing");
  const topicRows = await prisma.topic.findMany({ where: { subjectId: subject.id }, select: { id: true, path: true } });
  const topicIdByPath = new Map(topicRows.map((r) => [r.path, r.id]));

  const existingBySubject = await prisma.question.findMany({ where: { subjectId: subject.id }, select: { id: true, sourceKey: true } });
  const existingKeys = new Map(existingBySubject.map((r) => [r.sourceKey, r.id]));

  let inserted = 0, updated = 0, skipped = 0, rejected = 0;
  const ops: Array<{ kind: "create" | "update"; id?: number; data: Record<string, unknown> }> = [];

  for (const file of FILES) {
    const text = readFileSync(join(DIR, file), "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Find all lines that start a question (e.g. "1. ...", "2. ...", etc.)
    const questionStartIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*[0-9]+\s*\./.test(lines[i])) {
        questionStartIndices.push(i);
      }
    }

    let parsed = 0;
    for (const idx of questionStartIndices) {
      const p = parseQuestionBlock(text, idx);
      if (p === null) { skipped++; continue; }

      const gate = scanMca({
        question: p.question,
        options: p.options,
        correctAnswer: p.correctAnswer,
        explanation: p.explanation,
      });
      if (gate.verdict === "REJECT") { rejected++; continue; }

      const q = { question: gate.normalized.question, options: gate.normalized.options, correctAnswer: gate.normalized.correctAnswer ?? "", explanation: gate.normalized.explanation };
      parsed++;
      const path = "Financial & Banking Knowledge";
      const key = sourceKey(subject.id, path, q.question);
      const existingId = existingKeys.get(key);
      const data = { topicId: topicIdByPath.get(path) ?? null, path, topic: "Financial & Banking Knowledge", subtopic: file, question: q.question, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation };
      if (existingId !== undefined) { ops.push({ kind: "update", id: existingId, data }); updated++; }
      else { ops.push({ kind: "create", data: { ecosystemId: bb.id, subjectId: subject.id, sourceKey: key, ...data, difficulty: "MEDIUM", sourceExam: file, year: null } }); inserted++; }
    }
    console.log(`✓ ${file}: ${parsed} gated-in`);
  }

  if (!dryRun && ops.length > 0) {
    const creates = ops.filter((o) => o.kind === "create").map((o) => o.data);
    const updates = ops.filter((o) => o.kind === "update") as Array<{ kind: "update"; id: number; data: Record<string, unknown> }>;
    if (creates.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < creates.length; i += CHUNK) {
        await prisma.question.createMany({ data: creates.slice(i, i + CHUNK) as never });
      }
    }
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      await Promise.all(updates.slice(i, i + CHUNK).map((u) => prisma.question.update({ where: { id: u.id! }, data: u.data })));
    }
  }
  console.log(`${dryRun ? "DRY RUN" : "DONE"}: inserted=${inserted} updated=${updated} skipped=${skipped} rejected=${rejected}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });