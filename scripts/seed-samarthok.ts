/**
 * scripts/seed-samarthok.ts
 * ----------------------------------------------------------------------------
 * Imports 200 সমার্থক-শব্দ (synonym) MCQs from
 *   database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /Questions(সমার্থক শব্দ).txt
 * for BOTH BCS and Bank ecosystems under the canonical leaf:
 *   BCS : 01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমার্থক_শব্দ
 *   Bank: ০১_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমার্থক_শব্দ
 * with topicId pointing at the leaf Topic row (upserted here when missing).
 *
 * File format: 4-line blocks —
 *   `<num>. <question>`
 *   `ক. <o1> খ. <o2> গ. <o3> ঘ. <o4>`
 *   `উত্তর: <letter>. <text>`
 *   `ব্যাখ্যা: <explanation>`
 *
 * NON-DESTRUCTIVE: rows keyed by md5(subjectId|path|question), identical to
 * scripts/seed-shondhi.ts. Uses the shared import gate for Unicode validation.
 *
 * Run: npx tsx scripts/seed-samarthok.ts
 * ----------------------------------------------------------------------------
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { seedParsedShondhi, type ShondhiEcosystem, type ParsedShondhiQuestion } from "./seed-shondhi";

const FILE =
  "database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /Questions(সমার্থক শব্দ).txt";

const OPT_RE =
  /^ক\.\s*(.+?)\s+খ\.\s*(.+?)\s+গ\.\s*(.+?)\s+ঘ\.\s*(.+?)\s*$/u;
const Q_RE = /^[০-৯0-9]+\s*\.\s*(.+)$/u;
const LETTER_TO_IDX: Record<string, number> = { ক: 0, খ: 1, গ: 2, ঘ: 3 };

export function parseSamarthokFile(text: string): ParsedShondhiQuestion[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: ParsedShondhiQuestion[] = [];
  let i = 0;
  // Skip the header line ("সমার্থক শব্দ — ২০০টি …") — it matches no pattern.
  while (i < lines.length) {
    const qm = lines[i].match(Q_RE);
    if (!qm || i + 1 >= lines.length) {
      i++;
      continue;
    }
    const om = lines[i + 1].match(OPT_RE);
    if (!om) {
      i++;
      continue;
    }
    const question = qm[1].trim();
    const options = [om[1], om[2], om[3], om[4]].map((s) => s.trim());
    // Answer line: "উত্তর: ক. অনল"
    let answerRaw = "";
    let explanation = "";
    let consumed = 2;
    if (i + 2 < lines.length && /^উত্তর\s*:/.test(lines[i + 2])) {
      answerRaw = lines[i + 2].replace(/^উত্তর\s*:\s*/u, "").trim();
      consumed = 3;
    }
    if (i + consumed < lines.length && /^ব্যাখ্যা\s*:/.test(lines[i + consumed])) {
      explanation = lines[i + consumed].replace(/^ব্যাখ্যা\s*:\s*/u, "").trim();
      consumed += 1;
    }
    // Resolve "ক. অনল" / bare "ক" → option text (strict: letter must index
    // a real option; trailing text must equal the option or be empty).
    let correctAnswer = answerRaw;
    const am = answerRaw.match(/^([কখগঘ])\s*(.*)$/u);
    if (am) {
      const idx = LETTER_TO_IDX[am[1]];
      const tail = am[2].trim().replace(/^[।.)\]:;ঃ]+\s*/u, "").trim();
      if (idx !== undefined && idx < options.length) {
        if (tail === "" || tail.replace(/[।.\s]+$/u, "") === options[idx].normalize("NFC")) {
          correctAnswer = options[idx];
        } else if (options.includes(tail)) {
          correctAnswer = tail;
        }
      }
    } else if (options.includes(answerRaw)) {
      correctAnswer = answerRaw;
    }
    if (question && options.length === 4) {
      out.push({ question, options, correctAnswer, explanation });
    }
    i += consumed;
  }
  return out;
}

export async function seedSamarthokQuestions(prisma: PrismaClient): Promise<number> {
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

  // NOTE: leaf here is সমার্থক_শব্দ (taxonomy canonical), while seed-shondhi's
  // internal TOPIC/LEAF constants target সন্ধি — so we seed via a local path
  // override instead of reusing its hardcoded leaf. We still reuse its
  // non-destructive sync helper by temporarily mapping: simplest is to call
  // the shared gate + a local sync. To avoid duplicating sync logic, reuse
  // seedParsedShondhi's ecosystems type but write our own leaf sync below.
  void seedParsedShondhi;

  const ecosystems: ShondhiEcosystem[] = [
    { id: bcsEcosystem.id, subjectId: bcsSubject.id, prefix: "01_বাংলা_ভাষা_ও_সাহিত্য", label: "BCS" },
    { id: bbEcosystem.id, subjectId: bbSubject.id, prefix: "০১_বাংলা_ভাষা_ও_সাহিত্য", label: "Bank" },
  ];

  const raw = readFileSync(join(process.cwd(), FILE), "utf8");
  const rawParsed = parseSamarthokFile(raw);

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
      console.log(`  ✗ rejected: ${p.question.slice(0, 60)}… [${gate.issues.map((iss) => iss.code).join(",")}]`);
      continue;
    }
    accepted.push({
      question: gate.normalized.question,
      options: gate.normalized.options,
      correctAnswer: gate.normalized.correctAnswer ?? "",
      explanation: gate.normalized.explanation,
    });
  }
  console.log(`  parsed=${rawParsed.length} accepted=${accepted.length} rejected=${rejected}`);

  const TOPIC = "ভাষা";
  const LEAF = "সমার্থক_শব্দ";
  let totalInserted = 0;

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

  for (const eco of ecosystems) {
    const parentPath = `${eco.prefix}/${TOPIC}`;
    const parent = await prisma.topic.findUnique({
      where: { subjectId_path: { subjectId: eco.subjectId, path: parentPath } },
    });
    if (!parent) throw new Error(`Parent topic missing: subject ${eco.subjectId} path "${parentPath}"`);
    const path = `${parentPath}/${LEAF}`;
    const leaf = await prisma.topic.upsert({
      where: { subjectId_path: { subjectId: eco.subjectId, path } },
      update: { name: LEAF, slug: LEAF, depth: parent.depth + 1, parentId: parent.id },
      create: {
        subjectId: eco.subjectId,
        name: LEAF,
        slug: LEAF,
        path,
        depth: parent.depth + 1,
        sortOrder: 0,
        parentId: parent.id,
        questionCount: 0,
      },
    });

    const existing = await prisma.question.findMany({
      where: { subjectId: eco.subjectId },
      select: { id: true, sourceKey: true, question: true },
    });
    const idByKey = new Map(existing.map((r) => [r.sourceKey, r.id]));
    const idByText = new Map<string, number>();
    for (const r of existing) {
      const t = r.question.normalize("NFC");
      if (!idByText.has(t)) idByText.set(t, r.id);
    }

    const seen = new Set<string>();
    const creates: Array<Record<string, unknown>> = [];
    const updates: Promise<unknown>[] = [];
    let skipped = 0;
    for (const p of accepted) {
      const key = sourceKey(eco.subjectId, path, p.question);
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      const contentData = {
        topicId: leaf.id,
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
    for (let k = 0; k < updates.length; k += CHUNK) {
      await Promise.all(updates.slice(k, k + CHUNK));
    }
    if (creates.length > 0) {
      await prisma.question.createMany({ data: creates as never });
    }
    await prisma.topic.update({
      where: { id: leaf.id },
      data: { questionCount: await prisma.question.count({ where: { subjectId: eco.subjectId, path } }) },
    });
    totalInserted += creates.length;
    console.log(`  ${eco.label}: inserted=${creates.length} updated=${updates.length} skipped=${skipped}`);
  }
  return totalInserted;
}

if (process.argv[1]?.endsWith("seed-samarthok.ts")) {
  const prisma = new PrismaClient();
  seedSamarthokQuestions(prisma)
    .then((n) => console.log(`✅ Samarthok seed complete: ${n} inserted.`))
    .catch((e) => {
      console.error("❌ Samarthok seed failed:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
