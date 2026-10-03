/**
 * scripts/seed-bangla-lit.ts
 * ----------------------------------------------------------------------------
 * Imports Bangla Literature MCQs from the 3 folder-structured files under
 * database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/
 * for BOTH BCS and Bank ecosystems.
 *
 * Uses the shared import gate (scripts/qb-forensics/import-gate.ts) for
 * Unicode validation and the same parser as seed-questions.ts.
 *
 * Run: npx tsx scripts/seed-bangla-lit.ts
 * ----------------------------------------------------------------------------
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { resolveAnswerToOption } from "./qb-forensics/parse-flat";

const BANGLA_MARKERS = ["ক.", "খ.", "গ.", "ঘ."];

function matchOptionBlock(body: string): { match: RegExpMatchArray } | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${esc(BANGLA_MARKERS[0])} (.*) ${esc(BANGLA_MARKERS[1])} (.*) ${esc(BANGLA_MARKERS[2])} (.*) ${esc(BANGLA_MARKERS[3])} (.*)$`,
  );
  const m = body.match(re);
  return m ? { match: m } : null;
}

function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
}

type ParsedQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

function parseQuestionLine(line: string): ParsedQuestion | null {
  let explanation = "";
  let body = line;

  const inlineExplMatch = body.match(/\(ব্যাখ্যা:\s*(.*?)\)/);
  if (inlineExplMatch) {
    explanation = inlineExplMatch[1].trim();
    body = body.replace(/\(ব্যাখ্যা:\s*.*?\)/, "");
  }

  const explanationIdx = body.indexOf("ব্যাখ্যা:");
  if (explanationIdx >= 0) {
    explanation = body.slice(explanationIdx + "ব্যাখ্যা:".length).trim();
    body = body.slice(0, explanationIdx);
  }

  const answerMarker = /(উত্তর\s*:)/i;
  const m = answerMarker.exec(body);
  let answerRaw = "";
  let qAndOpts = body;
  if (m) {
    answerRaw = body.slice(m.index + m[0].length).trim();
    qAndOpts = body.slice(0, m.index);
  }

  const opt = matchOptionBlock(qAndOpts);
  if (!opt) return null;
  const { match } = opt;

  const questionText = stripLeadingNumber(qAndOpts.slice(0, match.index));
  const options = [match[1], match[2], match[3], match[4]].map((s) => s.trim());
  const correctAnswer = resolveAnswerToOption(answerRaw, options) ?? answerRaw;

  if (!questionText || options.length < 2) return null;

  return { question: questionText, options, correctAnswer, explanation };
}

function isExplanationLine(line: string): boolean {
  return line.startsWith("ব্যাখ্যা:");
}

function isQuestionLine(line: string): boolean {
  return line.includes("উত্তর:") && line.includes("ক.");
}

function parseFile(lines: string[]): ParsedQuestion[] {
  const result: ParsedQuestion[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isQuestionLine(line)) {
      const explanationLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && isExplanationLine(lines[j])) {
        explanationLines.push(lines[j].replace(/^ব্যাখ্যা:\s*/, ""));
        j++;
      }
      const explanation = explanationLines.join(" ").trim();
      const p = parseQuestionLine(line + (explanation ? " ব্যাখ্যা: " + explanation : ""));
      if (p) result.push(p);
      i = j;
    } else {
      i++;
    }
  }
  return result;
}

type SourceFile = {
  file: string;
  leafName: string;
};

const SOURCE_FILES: SourceFile[] = [
  {
    file: "database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/কথা-সাহিত্য/Questions(কথা-সাহিত্য).txt",
    leafName: "কথা-সাহিত্য",
  },
  {
    file: "database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা গদ্যের উৎপত্তি ও বিকাশ/Questions(বাংলা গদ্যের উৎপত্তি ও বিকাশ).txt",
    leafName: "বাংলা গদ্যের উৎপত্তি ও বিকাশ",
  },
  {
    file: "database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা নাটক/Questions(নাটক).txt",
    leafName: "বাংলা নাটক",
  },
];

const TOPIC = "আধুনিক_যুগ_১৮০০_হতে_বর্তমান";

async function main() {
  const prisma = new PrismaClient();
  try {
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

    const bcsTopicPath = `${TOPIC}/${"সাহিত্য"}`;
    const bbTopicPath = `${TOPIC}/${"সাহিত্য"}`;

    const existingQuestions = await prisma.question.findMany({
      where: { subjectId: { in: [bcsSubject.id, bbSubject.id] } },
      select: { id: true, sourceKey: true, subjectId: true },
    });

    const bcsIdByKey = new Map<string, number>();
    const bbIdByKey = new Map<string, number>();
    for (const q of existingQuestions) {
      if (q.subjectId === bcsSubject.id) bcsIdByKey.set(q.sourceKey, q.id);
      else bbIdByKey.set(q.sourceKey, q.id);
    }

    const existingSigsByEcosystem = new Map<number, Set<string>>();
    for (const eco of [bcsEcosystem.id, bbEcosystem.id]) {
      const rows = await prisma.question.findMany({
        where: { ecosystemId: eco },
        select: { question: true, correctAnswer: true, explanation: true },
      });
      existingSigsByEcosystem.set(
        eco,
        new Set(rows.map((r) => mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }))),
      );
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalRejected = 0;

    for (const src of SOURCE_FILES) {
      const filePath = join(process.cwd(), src.file);
      let raw: string;
      try {
        raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      } catch {
        console.error(`  ✗ File not found: ${src.file}`);
        continue;
      }

      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parsedQuestions = parseFile(lines);
      const parsed: ParsedQuestion[] = [];
      let rejected = 0;

      for (const p of parsedQuestions) {
        const gate = scanMca({
          question: p.question,
          options: p.options,
          correctAnswer: p.correctAnswer,
          explanation: p.explanation,
        });
        if (gate.verdict === "REJECT") {
          rejected++;
          continue;
        }
        parsed.push({
          question: gate.normalized.question,
          options: gate.normalized.options,
          correctAnswer: gate.normalized.correctAnswer ?? "",
          explanation: gate.normalized.explanation,
        });
      }

      if (rejected > 0) {
        console.log(`  ⚠ ${rejected} question(s) rejected by import gate in ${src.leafName}`);
      }
      totalRejected += rejected;

      if (parsed.length === 0) {
        console.log(`  ⚠ No valid questions in ${src.leafName}`);
        continue;
      }

      const subtopic = src.leafName;

      for (const ecosystem of [
        { id: bcsEcosystem.id, subjectId: bcsSubject.id, idByKey: bcsIdByKey, label: "BCS" },
        { id: bbEcosystem.id, subjectId: bbSubject.id, idByKey: bbIdByKey, label: "Bank" },
      ]) {
        const creates: Array<Record<string, unknown>> = [];
        const batchKeys = new Set<string>();
        let skipped = 0;

        for (const p of parsed) {
          const key = sourceKey(ecosystem.subjectId, bcsTopicPath, p.question);
          if (ecosystem.idByKey.has(key) || batchKeys.has(key)) {
            skipped++;
            continue;
          }

          const sig = mcaSignature({
            question: p.question,
            options: p.options,
            correctAnswer: p.correctAnswer,
            explanation: p.explanation,
          });
          const ecoSigs = existingSigsByEcosystem.get(ecosystem.id)!;
          if (ecoSigs.has(sig)) {
            skipped++;
            continue;
          }
          ecoSigs.add(sig);
          batchKeys.add(key);

          creates.push({
            ecosystemId: ecosystem.id,
            subjectId: ecosystem.subjectId,
            path: `${bcsTopicPath}/${subtopic}`,
            topic: TOPIC,
            subtopic,
            question: p.question,
            options: p.options,
            correctAnswer: p.correctAnswer,
            explanation: p.explanation,
            difficulty: "MEDIUM",
            sourceExam: ecosystem.label,
            sourceKey: key,
          });
        }

        if (creates.length > 0) {
          try {
            await prisma.question.createMany({ data: creates as never });
          } catch (e: unknown) {
            const err = e as { code?: string };
            if (err.code === "P2002") {
              const seen = new Set<string>();
              const deduped = creates.filter((c) => {
                const k = `${c.subjectId}|${c.sourceKey}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
              });
              await prisma.question.createMany({ data: deduped as never });
            } else {
              throw e;
            }
          }
        }
        totalInserted += creates.length;
        totalSkipped += skipped;
      }

      console.log(`✓ ${src.leafName}: ${parsed.length} questions parsed`);
    }

    console.log(`\nDone. Inserted ${totalInserted} questions, skipped ${totalSkipped} duplicates, rejected ${totalRejected}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
