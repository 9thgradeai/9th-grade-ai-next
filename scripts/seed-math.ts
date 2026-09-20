import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";

const FILE_CHAPTER_MAP: Record<string, { topicName: string; topicNameEn: string }[]> = {
  "Questions-(Number System & HCF_LCM)-(9Th-Grade AI).txt": [
    { topicName: "সংখ্যা পদ্ধতি (Number System)", topicNameEn: "Number System" },
    { topicName: "গ.সা.গু এবং ল.সা.গু (HCF & LCM)", topicNameEn: "HCF & LCM" },
  ],
  "Questions-(Percentage & Profit_Loss)-(9Th-Grade AI).txt": [
    { topicName: "শতকরা (Percentage)", topicNameEn: "Percentage" },
    { topicName: "লাভ-ক্ষতি (Profit & Loss)", topicNameEn: "Profit & Loss" },
    { topicName: "মিশ্রিত ও অ্যাডভান্সড এমসিকিউ (Advanced MCQ)", topicNameEn: "Advanced MCQ" },
  ],
  "Questions-(Ratio, Age & Partnership)-(9Th-Grade AI).txt": [
    { topicName: "অনুপাত ও সমানুপাত (Ratio & Proportion)", topicNameEn: "Ratio & Proportion" },
    { topicName: "বয়স সংক্রান্ত সমস্যা (Age Problems)", topicNameEn: "Age Problems" },
    { topicName: "অংশীদারি কারবার (Partnership)", topicNameEn: "Partnership" },
  ],
  "Questions-(Simple & Compound Interest)-(9Th-Grade AI).txt": [
    { topicName: "সরল মুনাফার বেসিক (Simple Interest Basics)", topicNameEn: "Simple Interest Basics" },
    { topicName: "সুদ-আসল (Amount)", topicNameEn: "Amount" },
    { topicName: "গুণ সংক্রান্ত শর্টকাট (Times/Multiple)", topicNameEn: "Times-Multiple" },
    { topicName: "চক্রবৃদ্ধি মুনাফার বেসিক (Compound Interest)", topicNameEn: "Compound Interest" },
    { topicName: "সরল ও চক্রবৃদ্ধি সুদের পার্থক্য (CI vs SI)", topicNameEn: "CI vs SI Difference" },
    { topicName: "খণ্ডিত বছর ও চক্রবৃদ্ধির প্রকারভেদ", topicNameEn: "Fractional Time & Compounding" },
    { topicName: "ব্যাংক এডি ও বিবিধ (Advanced & Word Problems)", topicNameEn: "Advanced & Word Problems" },
  ],
  "Questions-(সমান্তর ও গুণোত্তর ধারা (AP & GP))-(9Th-Grade AI).txt": [
    { topicName: "সমান্তর ধারা (AP) বেসিক", topicNameEn: "AP Basics" },
    { topicName: "সমান্তর ধারার যোগফল (AP Sums)", topicNameEn: "AP Sums" },
    { topicName: "গুণোত্তর ধারা (GP) বেসিক", topicNameEn: "GP Basics" },
    { topicName: "গুণোত্তর ধারার সমষ্টি ও অসীম ধারা", topicNameEn: "GP Sum & Infinite Series" },
    { topicName: "বিশেষ ধারা, মধ্যক ও অ্যাডভান্সড", topicNameEn: "Special Series & Means" },
  ],
};

const PARENT_GROUPS: Record<string, { name: string; nameEn: string }> = {
  "সংখ্যা পদ্ধতি ও HCF/LCM": { name: "সংখ্যা পদ্ধতি ও HCF/LCM", nameEn: "Number System & HCF_LCM" },
  "শতকরা, লাভ-ক্ষতি ও মিশ্রিত এমসিকিউ": { name: "শতকরা, লাভ-ক্ষতি ও মিশ্রিত এমসিকিউ", nameEn: "Percentage, Profit_Loss & Advanced MCQ" },
  "অনুপাত, বয়স ও অংশীদারি": { name: "অনুপাত, বয়স ও অংশীদারি", nameEn: "Ratio, Age & Partnership" },
  "সরল ও চক্রবৃদ্ধি সুদ": { name: "সরল ও চক্রবৃদ্ধি সুদ", nameEn: "Simple & Compound Interest" },
  "সমান্তর ও গুণোত্তর ধারা": { name: "সমান্তর ও গুণোত্তর ধারা (AP & GP)", nameEn: "Arithmetic & Geometric Progressions" },
};

const FILE_TO_GROUP: Record<string, string> = {
  "Questions-(Number System & HCF_LCM)-(9Th-Grade AI).txt": "সংখ্যা পদ্ধতি ও HCF/LCM",
  "Questions-(Percentage & Profit_Loss)-(9Th-Grade AI).txt": "শতকরা, লাভ-ক্ষতি ও মিশ্রিত এমসিকিউ",
  "Questions-(Ratio, Age & Partnership)-(9Th-Grade AI).txt": "অনুপাত, বয়স ও অংশীদারি",
  "Questions-(Simple & Compound Interest)-(9Th-Grade AI).txt": "সরল ও চক্রবৃদ্ধি সুদ",
  "Questions-(সমান্তর ও গুণোত্তর ধারা (AP & GP))-(9Th-Grade AI).txt": "সমান্তর ও গুণোত্তর ধারা",
};

const BANGLA_MARKERS = ["ক.", "খ.", "গ.", "ঘ."];

function matchOptionBlock(body: string): { match: RegExpMatchArray } | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${esc(BANGLA_MARKERS[0])} (.*) ${esc(BANGLA_MARKERS[1])} (.*) ${esc(BANGLA_MARKERS[2])} (.*) ${esc(BANGLA_MARKERS[3])} (.*)$`,
  );
  const match = body.match(re);
  if (match) return { match };
  return null;
}

function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
}

function parseQuestionLine(line: string) {
  const explanationIdx = line.indexOf("ব্যাখ্যা:");
  let explanation = "";
  let body = line;
  if (explanationIdx >= 0) {
    explanation = line.slice(explanationIdx + "ব্যাখ্যা:".length).trim();
    body = line.slice(0, explanationIdx);
  }

  const answerMarker = /(উত্তর\s*:)/;
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

  const letterMap: Record<string, number> = { "ক": 0, "খ": 1, "গ": 2, "ঘ": 3 };
  const letter = answerRaw.replace(/\./g, "").trim();
  let correctAnswer = answerRaw;
  if (letterMap[letter] !== undefined) {
    correctAnswer = options[letterMap[letter]] ?? answerRaw;
  }

  if (!questionText || options.length < 2) return null;
  return { question: questionText, options, correctAnswer, explanation };
}

function parseFileContent(content: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: { chapterIdx: number; questions: ReturnType<typeof parseQuestionLine>[] }[] = [];
  let currentChapter = 0;
  let currentQuestions: ReturnType<typeof parseQuestionLine>[] = [];

  for (const line of lines) {
    if (line.startsWith("পর্ব") && line.includes(":")) {
      if (currentQuestions.length > 0) {
        result.push({ chapterIdx: currentChapter, questions: currentQuestions });
      }
      currentChapter++;
      currentQuestions = [];
      continue;
    }
    if (!line.includes("ক.") || !line.includes("উত্তর:")) continue;
    currentQuestions.push(parseQuestionLine(line));
  }
  if (currentQuestions.length > 0) {
    result.push({ chapterIdx: currentChapter, questions: currentQuestions });
  }
  return result;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Seeding Math MCQs for BCS ecosystem...\n");

    const subject = await prisma.subject.upsert({
      where: { ecosystemId_nameBn: { ecosystemId: 1, nameBn: "গণিত" } },
      update: { nameEn: "Mathematics", icon: "🧮", color: "text-amber-400", bg: "bg-amber-500/10", sortOrder: 8 },
      create: {
        ecosystemId: 1, nameBn: "গণিত", nameEn: "Mathematics",
        icon: "🧮", color: "text-amber-400", bg: "bg-amber-500/10", sortOrder: 8,
      },
    });
    console.log(`Subject: গণিত (Mathematics) — id=${subject.id}`);

    const parentIds = new Map<string, number>();
    let parentOrder = 0;
    for (const [groupName, group] of Object.entries(PARENT_GROUPS)) {
      const path = `গণিত/${group.nameEn}`;
      const row = await prisma.topic.upsert({
        where: { subjectId_path: { subjectId: subject.id, path } },
        update: { name: group.name, slug: group.nameEn, depth: 1, sortOrder: parentOrder++ },
        create: {
          subjectId: subject.id, name: group.name, slug: group.nameEn,
          path, depth: 1, sortOrder: parentOrder++, questionCount: "0",
        },
      });
      parentIds.set(groupName, row.id);
    }
    console.log(`${parentIds.size} parent topic groups created`);

    const dataDir = join(process.cwd(), "database", "data", "ques", "Math");
    const files = readdirSync(dataDir).filter((f) => /\.txt$/i.test(f));
    let totalInserted = 0;
    let totalRejected = 0;

    const existingKeys = new Set(
      (await prisma.question.findMany({ where: { subjectId: subject.id }, select: { sourceKey: true } }))
        .map((r) => r.sourceKey),
    );

    for (const fileName of files) {
      const content = readFileSync(join(dataDir, fileName), "utf8");
      const parsed = parseFileContent(content);
      const fileChapters = FILE_CHAPTER_MAP[fileName];
      const groupName = FILE_TO_GROUP[fileName];

      if (!fileChapters || !groupName) {
        console.warn(`Unknown file: ${fileName}, skipping`);
        continue;
      }

      const parentId = parentIds.get(groupName)!;
      const topicIds: number[] = [];
      let leafOrder = 0;
      for (const chapter of fileChapters) {
        const topicPath = `গণিত/${PARENT_GROUPS[groupName].nameEn}/${chapter.topicNameEn}`;
        const topic = await prisma.topic.upsert({
          where: { subjectId_path: { subjectId: subject.id, path: topicPath } },
          update: { name: chapter.topicName, slug: chapter.topicNameEn, depth: 2, sortOrder: leafOrder++, parentId },
          create: {
            subjectId: subject.id, name: chapter.topicName, slug: chapter.topicNameEn,
            path: topicPath, depth: 2, sortOrder: leafOrder++, parentId, questionCount: "0",
          },
        });
        topicIds.push(topic.id);
      }

      let fileInserted = 0;
      let fileRejected = 0;
      for (const chapterData of parsed) {
        const topicId = topicIds[chapterData.chapterIdx] ?? topicIds[0];
        const chapterInfo = fileChapters[chapterData.chapterIdx] ?? fileChapters[0];

        const validQuestions = chapterData.questions.filter((q): q is NonNullable<typeof q> => q !== null);
        const batch: Array<Record<string, unknown>> = [];

        for (const q of validQuestions) {
          const sk = sourceKey(subject.id, `${groupName}/${chapterInfo.topicNameEn}`, q.question);
          if (existingKeys.has(sk)) continue;
          existingKeys.add(sk);

          batch.push({
            ecosystemId: 1, subjectId: subject.id, topicId,
            path: `${groupName}/${chapterInfo.topicNameEn}`,
            topic: groupName, subtopic: chapterInfo.topicName,
            question: q.question, options: q.options,
            correctAnswer: q.correctAnswer, explanation: q.explanation,
            difficulty: "MEDIUM", sourceExam: "BCS", sourceKey: sk,
          });
        }

        if (batch.length > 0) {
          await prisma.question.createMany({ data: batch as never });
          fileInserted += batch.length;
        }
        fileRejected += chapterData.questions.length - validQuestions.length;
      }

      totalInserted += fileInserted;
      totalRejected += fileRejected;
      console.log(`${fileName}: ${fileInserted} inserted, ${fileRejected} rejected`);
    }

    const countRows = await prisma.question.groupBy({
      by: ["topicId"], _count: { _all: true }, where: { subjectId: subject.id },
    });
    for (const row of countRows) {
      if (row.topicId) {
        await prisma.topic.update({ where: { id: row.topicId }, data: { questionCount: String(row._count._all) } });
      }
    }

    for (const [, pid] of parentIds) {
      const children = await prisma.topic.findMany({ where: { parentId: pid }, select: { questionCount: true } });
      const total = children.reduce((sum, c) => sum + parseInt(c.questionCount || "0", 10), 0);
      await prisma.topic.update({ where: { id: pid }, data: { questionCount: String(total) } });
    }

    const subjectTotal = await prisma.question.count({ where: { subjectId: subject.id } });
    console.log(`\nMath MCQs seeded: ${totalInserted} inserted, ${totalRejected} rejected, ${subjectTotal} total in subject.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
