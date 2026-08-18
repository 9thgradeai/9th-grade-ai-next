/**
 * scripts/seed-questions.ts
 * ----------------------------------------------------------------------------
 * Parses the 200 questions provided in data/ques/questions_database.txt
 * (10 subjects × 20 questions) and seeds them into the database, linked to the
 * correct Subject (by canonical Bengali name so the dashboard's
 * Question Bank filter matches).
 *
 * Run AFTER `prisma db push`:
 *   npx tsx scripts/seed-questions.ts
 *
 * Idempotent: it deletes existing Question rows, then re-inserts.
 * ----------------------------------------------------------------------------
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { TOPIC_TREES } from "../frontend/lib/data";

// Canonical subjects (must match SUBJECTS.name / QUESTION_BANK_CATEGORIES.label
// in src/lib/data.ts so the dashboard filters by subject correctly).
const SUBJECT_META: Record<string, { nameEn: string; icon: string; color: string; bg: string }> = {
  "বাংলা ভাষা ও সাহিত্য": { nameEn: "Bangla Language & Literature", icon: "📖", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  "English Language and Literature": { nameEn: "English Language and Literature", icon: "📚", color: "text-sky-400", bg: "bg-sky-500/10" },
  "বাংলাদেশ বিষয়াবলি": { nameEn: "Bangladesh Affairs", icon: "🇧🇩", color: "text-green-400", bg: "bg-green-500/10" },
  "আন্তর্জাতিক বিষয়াবলী": { nameEn: "International Affairs", icon: "🌍", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা": { nameEn: "Geography, Environment & Disaster Management", icon: "🗺️", color: "text-teal-400", bg: "bg-teal-500/10" },
  "সাধারণ বিজ্ঞান": { nameEn: "General Science", icon: "🔬", color: "text-purple-400", bg: "bg-purple-500/10" },
  "কম্পিউটার ও তথ্য প্রযুক্তি": { nameEn: "Computer & IT", icon: "💻", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  "গাণিতিক যুক্তি": { nameEn: "Mathematical Reasoning", icon: "🧮", color: "text-amber-400", bg: "bg-amber-500/10" },
  "মানসিক দক্ষতা": { nameEn: "Mental Ability", icon: "🧠", color: "text-rose-400", bg: "bg-rose-500/10" },
  "নৈতিকতা, মূল্যবোধ ও সু-শাসন": { nameEn: "Ethics, Values & Good Governance", icon: "⚖️", color: "text-emerald-500", bg: "bg-emerald-500/10" },
};

// Map the raw header text found in the file → canonical nameBn.
const HEADER_TO_CANONICAL: Record<string, string> = {
  "বাংলা ভাষা ও সাহিত্য": "বাংলা ভাষা ও সাহিত্য",
  "English Language & Literature (ইংরেজি ভাষা ও সাহিত্য)": "English Language and Literature",
  "বাংলাদেশ বিষয়াবলি": "বাংলাদেশ বিষয়াবলি",
  "আন্তর্জাতিক বিষয়াবলি": "আন্তর্জাতিক বিষয়াবলী",
  "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা": "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
  "সাধারণ বিজ্ঞান": "সাধারণ বিজ্ঞান",
  "কম্পিউটার ও তথ্যপ্রযুক্তি": "কম্পিউটার ও তথ্য প্রযুক্তি",
  "গাণিতিক যুক্তি": "গাণিতিক যুক্তি",
  "মানসিক দক্ষতা": "মানসিক দক্ষতা",
  "নৈতিকতা, মূল্যবোধ ও সুশাসন": "নৈতিকতা, মূল্যবোধ ও সু-শাসন",
};

const BANGLA_MARKERS = ["ক.", "খ.", "গ.", "ঘ."];
const LATIN_MARKERS = ["A.", "B.", "C.", "D."];
const LETTER_TO_IDX: Record<string, number> = {
  "ক": 0, "খ": 1, "গ": 2, "ঘ": 3,
  "a": 0, "b": 1, "c": 2, "d": 3,
};

// Detect the option-marker style used in a question body: the Bengali set
// (ক/খ/গ/ঘ) or the Latin set (A/B/C/D). English-section questions use the
// Latin set. The block is matched greedily so a marker that appears *inside*
// option text (e.g. "A. W. B. Yeats") does not break the split — each option
// text runs up to the LAST occurrence of the next marker.
function matchOptionBlock(body: string): { markers: string[]; match: RegExpMatchArray } | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const markers of [BANGLA_MARKERS, LATIN_MARKERS]) {
    const re = new RegExp(
      `${esc(markers[0])} (.*) ${esc(markers[1])} (.*) ${esc(markers[2])} (.*) ${esc(markers[3])} (.*)$`,
    );
    const match = body.match(re);
    if (match) return { markers, match };
  }
  return null;
}

type ParsedQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

function stripLeadingNumber(text: string): string {
  // Removes a leading "১. " / "10. " style prefix (Bengali or Latin digits).
  return text.replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
}

function parseQuestionLine(line: string): ParsedQuestion | null {
  const explanationIdx = line.indexOf("ব্যাখ্যা:");
  let explanation = "";
  let body = line;
  if (explanationIdx >= 0) {
    explanation = line.slice(explanationIdx + "ব্যাখ্যা:".length).trim();
    body = line.slice(0, explanationIdx);
  }

  const answerIdx = body.indexOf("উত্তর:");
  let answerRaw = "";
  let qAndOpts = body;
  if (answerIdx >= 0) {
    answerRaw = body.slice(answerIdx + "উত্তর:".length).trim();
    qAndOpts = body.slice(0, answerIdx);
  }

  // Locate option markers (Bengali ক/খ/গ/ঘ or Latin A/B/C/D).
  const opt = matchOptionBlock(qAndOpts);
  if (!opt) return null; // no full 4-option block found
  const { match } = opt;

  const questionText = stripLeadingNumber(qAndOpts.slice(0, match.index));

  const options = [match[1], match[2], match[3], match[4]].map((s) => s.trim());

  // Resolve correct answer text from the letter in "উত্তর:" ("গ. ১৩টি" or "C. Frank").
  // The regex above guarantees exactly four options, so idx (0-3) is always valid.
  let correctAnswer = answerRaw;
  const ansLetter = answerRaw.charAt(0).toLowerCase();
  if (ansLetter in LETTER_TO_IDX) {
    const idx = LETTER_TO_IDX[ansLetter];
    correctAnswer = options[idx];
  }

  if (!questionText || options.length < 2) return null;

  return { question: questionText, options, correctAnswer, explanation };
}

// Parses all .txt files in database/data/ques and inserts their questions,
// linked to the matching Subject (find-or-create by canonical Bengali name).
// Idempotent: clears existing Question rows first. Returns the count inserted.
export async function seedQuestions(prisma: PrismaClient): Promise<number> {
  // Find the questions file (single combined file or per-subject files).
  const dir = join(process.cwd(), "database", "data", "ques");
  const files = readdirSync(dir).filter((f) => /\.txt$/i.test(f));
  if (files.length === 0) throw new Error("No .txt question files found in database/data/ques");

  const raw = files
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/^\uFEFF/, ""))
    .join("\n");
  const lines = raw.split(/\r?\n/);

  // Group lines by subject header.
  const sections: { header: string; lines: string[] }[] = [];
  let current: { header: string; lines: string[] } | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // A header line is one that has no "উত্তর:" and starts with a number + "."
    const isHeader = !trimmed.includes("উত্তর:") && /^[০-৯0-9]+\.\s+/.test(trimmed);
    if (isHeader && !trimmed.includes("ক.")) {
      // Could be a question like "১. ..." that also lacks উত্তর:? Header detection:
      // headers have no option markers and no answer. Questions always have উত্তর:.
      // So a line without উত্তর: and starting with "N. " is a header.
      if (current) sections.push(current);
      current = { header: stripLeadingNumber(trimmed), lines: [] };
    } else if (current) {
      current.lines.push(trimmed);
    }
  }
  if (current) sections.push(current);

  console.log(`Found ${sections.length} subject sections`);

  // Idempotent: clear previously-seeded questions before re-inserting.
  const deleted = await prisma.question.deleteMany({});
  if (deleted.count > 0) console.log(`Cleared ${deleted.count} existing questions`);

  let totalInserted = 0;

  for (const section of sections) {
    const canonical = HEADER_TO_CANONICAL[section.header];
    if (!canonical || !SUBJECT_META[canonical]) {
      console.warn(`⚠ Skipping unknown subject header: "${section.header}"`);
      continue;
    }
    const meta = SUBJECT_META[canonical];

    // Find-or-create the Subject so the dashboard category filter matches it.
    // (nameBn is not a unique field, so we can't use upsert's `where`.)
    let subject = await prisma.subject.findFirst({ where: { nameBn: canonical } });
    if (!subject) {
      subject = await prisma.subject.create({
        data: {
          nameBn: canonical,
          nameEn: meta.nameEn,
          icon: meta.icon,
          color: meta.color,
          bg: meta.bg,
          sortOrder: 0,
        },
      });
    } else {
      subject = await prisma.subject.update({
        where: { id: subject.id },
        data: { nameEn: meta.nameEn, icon: meta.icon, color: meta.color, bg: meta.bg },
      });
    }

    const parsed = section.lines
      .map((l) => parseQuestionLine(l))
      .filter((q): q is ParsedQuestion => q !== null);

    if (parsed.length === 0) {
      console.warn(`⚠ No questions parsed for ${canonical}`);
      continue;
    }

    // Map each question to a real topic group + subtopic from TOPIC_TREES so the
    // custom exam engine can filter deterministically by subject → topic → subtopic.
    // The raw question file carries no per-question topic tags, so questions are
    // distributed round-robin across the subject's topics/subtopics in file order
    // (stable for the same file). Subjects without a tree fall back to the whole
    // subject pool (topic = subject, subtopic = "").
    const groups = (TOPIC_TREES as Record<string, { name: string; subTopics: { name: string }[] }[]>)[canonical] ?? [];
    const topicPairs: { groupName: string; subTopic: string }[] = [];
    for (const group of groups) {
      for (const sub of group.subTopics) {
        topicPairs.push({ groupName: group.name, subTopic: sub.name });
      }
    }

    // Insert questions for this subject.
    await prisma.question.createMany({
      data: parsed.map((q, index) => {
        const pair = topicPairs.length > 0 ? topicPairs[index % topicPairs.length] : null;
        return {
          subjectId: subject.id,
          topic: pair ? pair.groupName : canonical,
          subtopic: pair ? pair.subTopic : "",
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: "MEDIUM",
          sourceExam: "BCS",
          year: null,
        };
      }),
    });

    totalInserted += parsed.length;
    console.log(`✓ ${canonical}: ${parsed.length} questions`);
  }

  return totalInserted;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const inserted = await seedQuestions(prisma);
    console.log(`\nDone. Inserted ${inserted} questions total.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("seed-questions.ts")) {
  main()
    .catch((e) => {
      console.error("Seed failed:", e);
      process.exit(1);
    });
}
