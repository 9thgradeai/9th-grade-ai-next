/**
 * scripts/seed-bcs.ts
 * ----------------------------------------------------------------------------
 * Seeds BCS exam-wise questions extracted from the question bank PDF
 * (database/data/question_bank/bcs/bcs_questions.json, produced by the OCR +
 * parser pipeline in /tmp/parse_bcs.py) into the Question table.
 *
 * Each question is tagged with its specific BCS term via `sourceExam`
 * (e.g. "৫০তম বিসিএস") and an optional `year`, so the dashboard's PYQ
 * filters (year + sourceExam) can surface them per exam.
 *
 * NON-DESTRUCTIVE: rows upsert by (subjectId, sourceKey) where
 * sourceKey = md5(subjectId | sourceExam | question). Re-running refreshes
 * content in place; ids (and user bookmarks/attempts) stay stable.
 *
 * Run standalone:  npx tsx scripts/seed-bcs.ts
 * Or via main seed: it is wired into database/prisma/seed.ts.
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Difficulty } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { SUBJECT_META } from "./taxonomy";

// Maps the parser's `subjectKey` → canonical Subject.nameBn (NFC-normalised).
const SUBJECT_KEY_TO_NAMEBN: Record<string, string> = {
  bn_lang: "বাংলা ভাষা ও সাহিত্য",
  en_lang: "English Language and Literature",
  bd_affairs: "বাংলাদেশ বিষয়াবলি",
  intl: "আন্তর্জাতিক বিষয়াবলী",
  geo: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
  science: "সাধারণ বিজ্ঞান",
  cs: "কম্পিউটার ও তথ্য প্রযুক্তি",
  math: "গাণিতিক যুক্তি",
  mental: "মানসিক দক্ষতা",
  ethics: "নৈতিকতা, মূল্যবোধ ও সু-শাসন",
};

const LETTER_TO_IDX: Record<string, number> = {
  "ক": 0, "খ": 1, "গ": 2, "ঘ": 3,
  "a": 0, "b": 1, "c": 2, "d": 3,
};

type BcsQuestion = {
  examTerm: string;
  examNum: number;
  subjectKey: string;
  qnum: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  year?: number | null;
};

// Resolves the stored `correctAnswer` to the option TEXT. The parser usually
// leaves the option text already; this catches the case where only a letter
// survived (e.g. "(খ) …" → "খ") and maps it to the full option string.
function resolveCorrectAnswer(raw: string, options: string[]): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const m = t.match(/^\(?\s*([কখগঘa-dA-D])\s*\)?\.?\s*([\s\S]*)$/);
  if (m) {
    const idx = LETTER_TO_IDX[m[1].toLowerCase()];
    if (idx !== undefined && options[idx] !== undefined) return options[idx];
  }
  return t;
}

async function ensureSubjects(prisma: PrismaClient): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const [i, meta] of SUBJECT_META.entries()) {
    const row = await prisma.subject.upsert({
      where: { nameBn: meta.nameBn },
      update: {
        nameEn: meta.nameEn,
        icon: meta.icon,
        color: meta.color,
        bg: meta.bg,
        sortOrder: i,
      },
      create: {
        nameBn: meta.nameBn,
        nameEn: meta.nameEn,
        icon: meta.icon,
        color: meta.color,
        bg: meta.bg,
        sortOrder: i,
      },
    });
    map.set(meta.nameBn.normalize("NFC"), row.id);
  }
  return map;
}

export async function seedBcsQuestions(prisma: PrismaClient): Promise<number> {
  const file = join(process.cwd(), "database", "data", "question_bank", "bcs", "bcs_questions.json");
  let raw: BcsQuestion[];
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as BcsQuestion[];
  } catch (e) {
    console.warn(`⚠ Could not read BCS questions file at ${file}:`, (e as Error).message);
    return 0;
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    console.warn("⚠ No BCS questions to seed (empty file).");
    return 0;
  }

  const subjectIds = await ensureSubjects(prisma);

  const creates: Array<Record<string, unknown>> = [];

  // De-dupe within the batch by sourceKey so a single run never self-collides.
  const seen = new Set<string>();

  for (const q of raw) {
    const nameBn = SUBJECT_KEY_TO_NAMEBN[q.subjectKey];
    if (!nameBn) {
      console.warn(`⚠ Unknown subjectKey "${q.subjectKey}" — skipping question`);
      continue;
    }
    const subjectId = subjectIds.get(nameBn.normalize("NFC"));
    if (subjectId === undefined) continue;

    const question = (q.question ?? "").trim();
    const options = (q.options ?? []).map((o) => (o ?? "").trim()).filter(Boolean);
    if (question.length < 5 || options.length < 2) continue;

    const correctAnswer = resolveCorrectAnswer(q.correctAnswer, options);
    const sourceExam = (q.examTerm ?? "").trim();
    const key = sourceKey(subjectId, sourceExam, question);
    if (seen.has(key)) continue;
    seen.add(key);

    const data = {
      subjectId,
      path: "",
      topic: sourceExam,
      subtopic: "",
      topicId: null,
      question,
      options,
      correctAnswer,
      explanation: (q.explanation ?? "").trim(),
      difficulty: "MEDIUM" as Difficulty,
      year: q.year ?? null,
      sourceExam,
    };

    creates.push({ sourceKey: key, ...data });
  }

  let inserted = 0;
  let updated = 0;
  if (creates.length > 0) {
    // Upsert in chunks to avoid one giant transaction.
    const CHUNK = 100;
    for (let i = 0; i < creates.length; i += CHUNK) {
      const batch = creates.slice(i, i + CHUNK);
      for (const c of batch) {
        const where = {
          subjectId_sourceKey: { subjectId: c.subjectId as number, sourceKey: c.sourceKey as string },
        };
        const { sourceKey: _k, ...content } = c as Record<string, unknown> & { sourceKey: string };
        const existing = await prisma.question.findUnique({ where, select: { id: true } });
        if (existing) {
          await prisma.question.update({ where, data: content as never });
          updated++;
        } else {
          await prisma.question.create({ data: { ...content, sourceKey: c.sourceKey as string } as never });
          inserted++;
        }
      }
    }
  }

  console.log(`  ✓ BCS exam-wise: ${creates.length} valid, ${inserted} inserted, ${updated} updated`);
  return inserted;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const inserted = await seedBcsQuestions(prisma);
    console.log(`\nDone. Seeded ${inserted} BCS exam-wise questions.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("seed-bcs.ts")) {
  main().catch((e) => {
    console.error("BCS seed failed:", e);
    process.exit(1);
  });
}
