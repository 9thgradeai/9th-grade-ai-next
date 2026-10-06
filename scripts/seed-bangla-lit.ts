/**
 * scripts/seed-bangla-lit.ts
 * ----------------------------------------------------------------------------
 * Imports Bangla Literature MCQs from the 3 folder-structured files under
 * database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/
 * for BOTH BCS and Bank ecosystems:
 *   • কথা-সাহিত্য/Questions(কথা-সাহিত্য).txt                    → বাংলা_কথা-সাহিত্য
 *   • বাংলা গদ্যের উৎপত্তি ও বিকাশ/Questions(বাংলা গদ্যের …).txt → বাংলা_গদ্যের_উৎপত্তি_ও_বিকাশ
 *   • বাংলা নাটক/Questions(নাটক).txt                            → বাংলা_নাটক
 *
 * The folder names use spaces / the bare "কথা-সাহিত্য" form, so they do NOT
 * match the taxonomy leaves verbatim — the mapping is declared explicitly in
 * SOURCE_FILES (file → canonical leaf name). Questions land on the canonical
 * content paths used by the Topic tree:
 *   BCS : 01_বাংলা_ভাষা_ও_সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/<leaf>
 *   Bank: ০১_বাংলা_ভাষা_ও_সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/<leaf>
 * with topicId pointing at the leaf Topic row (upserted here when missing).
 *
 * File format: one question per line carrying `উত্তর:` (bare-letter answers
 * like `উত্তর: গ` are resolved to the option text), with the explanation
 * either inline — `উত্তর: ক (ব্যাখ্যা: …)` — or on the following line(s)
 * starting with `ব্যাখ্যা:`. Section header lines (no উত্তর:/ক.) are skipped.
 *
 * NON-DESTRUCTIVE: rows are keyed by md5(subjectId|path|question), identical
 * to scripts/seed-questions.ts. Rows seeded under a legacy path (pre-fix
 * `আধুনিক_…/সাহিত্য/…` order) are ADOPTED by question-text identity — path,
 * topic, subtopic, topicId and sourceKey are updated in place, so bookmarks
 * and attempts survive. Never inserts a duplicate of live content (global
 * per-ecosystem mcaSignature gate).
 *
 * Uses the shared import gate (scripts/qb-forensics/import-gate.ts) for
 * Unicode validation.
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

export type ParsedBanglaLitQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export function resolveBanglaLitAnswer(answerRaw: string, options: string[]): string | null {
  // Strict shared resolution first (bare letter, or letter + exact option).
  const direct = resolveAnswerToOption(answerRaw, options);
  if (direct) return direct;
  // Local tolerance for this corpus' answer styles — the remainder must still
  // be EXACTLY one option, so nothing is ever force-fitted:
  //   • "(উইলিয়াম কেরী)" — option text wrapped in parens
  //   • "ঘ রামরাম বসু"     — letter + space + exact option (no দাঁড়ি/dot)
  let rest = answerRaw.trim();
  if (rest.startsWith("(") && rest.endsWith(")")) rest = rest.slice(1, -1).trim();
  const m = rest.match(/^([কখগঘabcdABCD])\s*[।.)]?\s*(.*)$/u);
  if (!m) return null;
  const idx = ["ক", "খ", "গ", "ঘ", "a", "b", "c", "d"].indexOf(m[1].toLowerCase()) % 4;
  const tail = m[2].replace(/^\((.*)\)$/, "$1").trim().normalize("NFC");
  if (tail !== "" && tail === options[idx].normalize("NFC")) return options[idx];
  return null;
}

export function parseBanglaLitLine(line: string): ParsedBanglaLitQuestion | null {
  let explanation = "";
  let body = line;

  // Greedy to the LAST ")" so nested parens inside the explanation
  // (e.g. "(ব্যাখ্যা: 'কমলে কামিনী' (১৮৭৩) …)") stay intact.
  const inlineExplMatch = body.match(/\(ব্যাখ্যা:\s*(.*)\)\s*$/);
  if (inlineExplMatch) {
    explanation = inlineExplMatch[1].trim();
    body = body.slice(0, inlineExplMatch.index).trim();
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
  const correctAnswer = resolveBanglaLitAnswer(answerRaw, options) ?? answerRaw;

  if (!questionText || options.length < 2) return null;

  return { question: questionText, options, correctAnswer, explanation };
}

function isExplanationLine(line: string): boolean {
  return line.startsWith("ব্যাখ্যা:");
}

function isQuestionLine(line: string): boolean {
  return line.includes("উত্তর:") && line.includes("ক.");
}

export function parseBanglaLitFile(lines: string[]): ParsedBanglaLitQuestion[] {
  const result: ParsedBanglaLitQuestion[] = [];
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
      const p = parseBanglaLitLine(line + (explanation ? " ব্যাখ্যা: " + explanation : ""));
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
    leafName: "বাংলা_কথা-সাহিত্য",
  },
  {
    file: "database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা গদ্যের উৎপত্তি ও বিকাশ/Questions(বাংলা গদ্যের উৎপত্তি ও বিকাশ).txt",
    leafName: "বাংলা_গদ্যের_উৎপত্তি_ও_বিকাশ",
  },
  {
    file: "database/data/ques/বাংলা ভাষা ও সাহিত্য/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান/বাংলা নাটক/Questions(নাটক).txt",
    leafName: "বাংলা_নাটক",
  },
];

// Display tags mirroring seed-questions.ts leafTags(): topic is the group
// directly under the subject, subtopic is the leaf name.
const TOPIC = "সাহিত্য";
const ERA = "আধুনিক_যুগ_১৮০০_হতে_বর্তমান";

async function ensureLeafTopic(
  prisma: PrismaClient,
  subjectId: number,
  subjectPrefix: string,
  leafName: string,
): Promise<number> {
  const parentPath = `${subjectPrefix}/${TOPIC}/${ERA}`;
  const parent = await prisma.topic.findUnique({
    where: { subjectId_path: { subjectId, path: parentPath } },
  });
  if (!parent) {
    throw new Error(`Parent topic missing for Bangla-Lit import: subject ${subjectId} path "${parentPath}"`);
  }
  const path = `${parentPath}/${leafName}`;
  const row = await prisma.topic.upsert({
    where: { subjectId_path: { subjectId, path } },
    update: { name: leafName, slug: leafName, depth: parent.depth + 1, parentId: parent.id },
    create: {
      subjectId,
      name: leafName,
      slug: leafName,
      path,
      depth: parent.depth + 1,
      sortOrder: 0,
      parentId: parent.id,
      questionCount: 0,
    },
  });
  return row.id;
}

export async function seedBanglaLitQuestions(prisma: PrismaClient): Promise<number> {
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

  // Per-ecosystem duplicate-identity sets over live rows.
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
    const rawParsed = parseBanglaLitFile(lines);
    const parsed: ParsedBanglaLitQuestion[] = [];
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

    for (const eco of ecosystems) {
      const path = `${eco.prefix}/${TOPIC}/${ERA}/${src.leafName}`;
      const topicId = await ensureLeafTopic(prisma, eco.subjectId, eco.prefix, src.leafName);

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
          subtopic: src.leafName,
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
      if (skipped > 0) {
        console.log(`  (skipped ${skipped} duplicate(s) for ${eco.label} ${src.leafName})`);
      }
    }

    console.log(`✓ ${src.leafName}: ${parsed.length} questions parsed`);
  }

  // Refresh questionCount on the 6 leaf topics (aggregated per subject+path).
  for (const eco of ecosystems) {
    for (const src of SOURCE_FILES) {
      const path = `${eco.prefix}/${TOPIC}/${ERA}/${src.leafName}`;
      const count = await prisma.question.count({ where: { subjectId: eco.subjectId, path } });
      const leaf = await prisma.topic.findUnique({
        where: { subjectId_path: { subjectId: eco.subjectId, path } },
      });
      if (leaf) {
        await prisma.topic.update({ where: { id: leaf.id }, data: { questionCount: count } });
      }
    }
  }

  console.log(
    `\nDone. Inserted ${totalInserted} questions, migrated ${totalMigrated} onto canonical paths, import gate rejected ${totalRejected}.`,
  );
  return totalInserted;
}

if (process.argv[1]?.endsWith("seed-bangla-lit.ts")) {
  const prisma = new PrismaClient();
  seedBanglaLitQuestions(prisma)
    .then((n) => {
      console.log(`\nDone. Inserted ${n} questions.`);
    })
    .catch((e) => {
      console.error("Seed failed:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
