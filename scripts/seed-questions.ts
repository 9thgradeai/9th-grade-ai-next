/**
 * scripts/seed-questions.ts
 * ----------------------------------------------------------------------------
 * Seeds the content taxonomy (subjects + recursive topics) and questions from
 * database/data/ques/:
 *
 *  1. Subjects — the 10 canonical subjects from scripts/taxonomy.ts.
 *
 *  2. Topic tree — the recursive Topic hierarchy built from
 *     database/data/taxonomy.json (parsed from the Questions Architecture).
 *     Topic.path is the full content path from the subject root
 *     ("04_আন্তর্জাতিক_বিষয়াবলি/০২_নিরাপ্তা_ও_ক্ষমতা/আন্তর্জাতিক_নিরাপ্তা"),
 *     matching the local folder layout under data/ques/.
 *
 *  3. Questions — two sources:
 *      a. Flat per-subject files (data/ques/questions_database.txt) — questions
 *         are distributed round-robin across the subject's taxonomy leaves.
 *      b. Folder-structured files (data/ques/<Subject>/<Node>/…/<file>.txt) —
 *         the file path IS the taxonomy; each segment is matched to a taxonomy
 *         node by NFC-normalised name. Questions get the exact leaf path.
 *
 * Question rows carry `path` (leaf path), `topicId` (leaf Topic id) plus the
 * denormalised `topic`/`subtopic` display names used by legacy consumers.
 *
 * Run AFTER `prisma db push`:
 *   npx tsx scripts/seed-questions.ts
 *
 * Idempotent: deletes existing Question and Topic rows, then re-inserts.
 * ----------------------------------------------------------------------------
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import {
  loadTaxonomy,
  SUBJECT_META,
  subjectMetaByNameBn,
  resolveSubjectNode,
  matchNodePath,
  contentPath,
  type TaxonomyNode,
} from "./taxonomy";

// Map the raw header text found in the flat file → canonical nameBn.
// Keys are NFC-normalised so composed/decomposed Bengali forms ("য়" vs "য"+নুক্তা)
// always resolve, regardless of how the file was saved.
const HEADER_TO_CANONICAL: Record<string, string> = {
  "বাংলা ভাষা ও সাহিত্য": "বাংলা ভাষা ও সাহিত্য",
  "English Language & Literature (ইংরেজি ভাষা ও সাহিত্য)": "English Language and Literature",
  "বাংলাদেশ বিষয়াবলি": "বাংলাদেশ বিষয়াবলি",
  "আন্তর্জাতিক বিষয়াবলি": "আন্তর্জাতিক বিষয়াবলী",
  "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা": "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা",
  "সাধারণ বিজ্ঞান": "সাধারণ বিজ্ঞান",
  "কম্পিউটার ও তথ্যপ্রযুক্তি": "কম্পিউটার ও তথ্য প্রযুক্তি",
  "গাণিতিক যুক্তি": "গাণিতিক যুক্তি",
  "মানসিক দক্ষতা": "মানসিক দক্ষতা",
  "নৈতিকতা, মূল্যবোধ ও সুশাসন": "নৈতিকতা, মূল্যবোধ ও সু-শাসন",
};

const HEADER_LOOKUP = new Map<string, string>(
  Object.entries(HEADER_TO_CANONICAL).map(([k, v]) => [k.normalize("NFC"), v]),
);

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

// Recursively collects question files organised as
//   data/ques/<Subject>/<Node>/…/<file>.txt
// The path is the taxonomy: the deepest folder segment must resolve to a
// taxonomy leaf. Each spec keeps the normalised (NFC) path parts so duplicates
// that differ only by Unicode composition (e.g. "জোট" vs "জোট") collapse.
// Returns specs where parts = [subject, ...nodeSegments, filename].
function collectFolderFiles(dir: string): { file: string; parts: string[] }[] {
  const specs: { file: string; parts: string[] }[] = [];
  const walk = (d: string, ancestors: string[]) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full, [...ancestors, entry.name]);
      } else if (entry.isFile() && /\.txt$/i.test(entry.name) && ancestors.length >= 2) {
        specs.push({ file: full, parts: [...ancestors, entry.name].map((p) => p.normalize("NFC")) });
      }
    }
  };
  walk(dir, []);

  const seen = new Set<string>();
  return specs.filter((s) => {
    const key = s.parts.join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

// Finds the Subject row for a canonical Bengali name (find-or-create).
async function ensureSubject(
  prisma: PrismaClient,
  nameBn: string,
  sortOrder: number,
): Promise<{ id: number }> {
  const meta = subjectMetaByNameBn(nameBn) ?? SUBJECT_META[0];
  let subject = await prisma.subject.findFirst({ where: { nameBn } });
  if (!subject) {
    subject = await prisma.subject.create({
      data: {
        nameBn,
        nameEn: meta.nameEn,
        icon: meta.icon,
        color: meta.color,
        bg: meta.bg,
        sortOrder,
      },
    });
  } else {
    subject = await prisma.subject.update({
      where: { id: subject.id },
      data: { nameEn: meta.nameEn, icon: meta.icon, color: meta.color, bg: meta.bg, sortOrder },
    });
  }
  return { id: subject.id };
}

// Builds the recursive Topic rows for one subject from its taxonomy subtree.
// Returns maps keyed by the content path (see contentPath()).
type TopicIndex = { leafIds: Map<string, number>; idsByPath: Map<string, number> };

async function buildTopicTree(
  prisma: PrismaClient,
  subjectId: number,
  subjectNode: TaxonomyNode,
): Promise<TopicIndex> {
  const leafIds = new Map<string, number>();
  const idsByPath = new Map<string, number>();
  let order = 0;

  const createNode = async (node: TaxonomyNode, parentId: number | null, depth: number) => {
    const path = contentPath(node);
    const row = await prisma.topic.upsert({
      where: { subjectId_path: { subjectId, path } },
      update: { name: node.name, slug: node.name, depth, sortOrder: order++, parentId },
      create: {
        subjectId,
        name: node.name,
        slug: node.name,
        path,
        depth,
        sortOrder: order++,
        parentId,
        questionCount: "0",
      },
    });
    idsByPath.set(path, row.id);
    if (node.children.length === 0) {
      leafIds.set(path, row.id);
    }
    for (const child of node.children) {
      await createNode(child, row.id, depth + 1);
    }
  };

  for (const child of subjectNode.children) {
    await createNode(child, null, 1);
  }
  return { leafIds, idsByPath };
}

// Display fields for a taxonomy leaf: topic = depth-1 node name (the group
// under the subject), subtopic = the leaf name ("" when the leaf is itself a
// group). Uses the content path "Subject/Group/…/Leaf".
function leafTags(node: TaxonomyNode): { topic: string; subtopic: string } {
  const parts = contentPath(node).split("/");
  if (parts.length <= 2) return { topic: node.name, subtopic: "" };
  return { topic: parts[1], subtopic: node.name };
}

function collectLeaves(node: TaxonomyNode): TaxonomyNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectLeaves);
}

// Parses all .txt files in database/data/ques and inserts their questions,
// linked to the matching Subject + recursive Topic leaf. Idempotent: clears
// existing Question and Topic rows first. Returns the count inserted.
export async function seedQuestions(prisma: PrismaClient): Promise<number> {
  const dir = join(process.cwd(), "database", "data", "ques");
  const files = readdirSync(dir).filter((f) => /\.txt$/i.test(f));
  if (files.length === 0) throw new Error("No .txt question files found in database/data/ques");

  const taxonomy = loadTaxonomy();

  // Idempotent: clear previously-seeded content before re-inserting. Ran
  // sequentially because the Topic self-relation cascade can deadlock when the
  // Question delete shares locks in parallel.
  const delQ = await prisma.question.deleteMany({});
  const delT = await prisma.topic.deleteMany({});
  if (delQ.count > 0 || delT.count > 0) {
    console.log(`Cleared ${delQ.count} questions, ${delT.count} topics`);
  }

  // Ensure all 10 canonical subjects exist in architecture order.
  const subjectIds: Record<string, number> = {};
  for (const [i, meta] of SUBJECT_META.entries()) {
    const subject = await ensureSubject(prisma, meta.nameBn, i);
    subjectIds[meta.nameBn.normalize("NFC")] = subject.id;
  }

  // Build the recursive topic tree for every subject up front.
  const leafIdsBySubject = new Map<number, Map<string, number>>();
  const idsByPathBySubject = new Map<number, Map<string, number>>();
  for (const subjectNode of taxonomy.children) {
    const meta = SUBJECT_META.find((m) => m.architectureName === subjectNode.name);
    if (!meta) {
      console.warn(`⚠ No canonical subject for taxonomy root "${subjectNode.name}"`);
      continue;
    }
    const subjectId = subjectIds[meta.nameBn];
    const index = await buildTopicTree(prisma, subjectId, subjectNode);
    leafIdsBySubject.set(subjectId, index.leafIds);
    idsByPathBySubject.set(subjectId, index.idsByPath);
  }

  let totalInserted = 0;

  // ── Flat files: questions distributed round-robin across taxonomy leaves ──
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

  for (const section of sections) {
    const canonical = HEADER_LOOKUP.get(section.header.normalize("NFC"));
    if (!canonical || !subjectIds[canonical.normalize("NFC")]) {
      console.warn(`⚠ Skipping unknown subject header: "${section.header}"`);
      continue;
    }
    const subjectId = subjectIds[canonical.normalize("NFC")];

    const parsed = section.lines
      .map((l) => parseQuestionLine(l))
      .filter((q): q is ParsedQuestion => q !== null);

    if (parsed.length === 0) {
      console.warn(`⚠ No questions parsed for ${canonical}`);
      continue;
    }

    // Round-robin across the subject's taxonomy leaves (in file order, stable
    // for the same file). Subjects without a taxonomy fall back to the whole
    // subject pool.
    const leafIds = leafIdsBySubject.get(subjectId) ?? new Map<string, number>();
    const subjectNode = taxonomy.children.find(
      (n) => SUBJECT_META.find((m) => m.architectureName === n.name)?.nameBn === canonical,
    );
    const leaves = subjectNode ? collectLeaves(subjectNode) : [];

    await prisma.question.createMany({
      data: parsed.map((q, index) => {
        if (leaves.length === 0) {
          return {
            subjectId,
            topicId: null,
            path: "",
            topic: canonical,
            subtopic: "",
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: "MEDIUM",
            sourceExam: "BCS",
            year: null,
          };
        }
        const leaf = leaves[index % leaves.length];
        const tags = leafTags(leaf);
        return {
          subjectId,
          topicId: leafIds.get(contentPath(leaf)) ?? null,
          path: contentPath(leaf),
          topic: tags.topic,
          subtopic: tags.subtopic,
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

  // ── Folder-structured files: the path IS the taxonomy ──
  // Each segment is matched to a taxonomy node by NFC-normalised name; the
  // deepest segment must resolve to a leaf. Questions are tagged with the
  // exact leaf path (precise categorisation).
  const folderFiles = collectFolderFiles(dir);
  for (const spec of folderFiles) {
    const subjectNode = resolveSubjectNode(taxonomy, spec.parts[0]);
    if (!subjectNode) {
      console.warn(`⚠ Skipping unknown subject folder: "${spec.parts[0]}"`);
      continue;
    }
    const meta = SUBJECT_META.find((m) => m.architectureName === subjectNode.name);
    if (!meta || !subjectIds[meta.nameBn]) {
      console.warn(`⚠ No canonical subject for folder "${spec.parts[0]}"`);
      continue;
    }
    const subjectId = subjectIds[meta.nameBn];
    const nodeSegments = spec.parts.slice(1, -1);
    const leaf = matchNodePath(subjectNode, nodeSegments);
    if (!leaf) {
      console.warn(`⚠ Folder path not found in taxonomy: "${spec.parts.slice(0, -1).join(" / ")}"`);
      continue;
    }

    const lines = readFileSync(spec.file, "utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines.map((l) => parseQuestionLine(l)).filter((q): q is ParsedQuestion => q !== null);
    if (parsed.length === 0) {
      console.warn(`⚠ No questions parsed for ${spec.parts.slice(0, -1).join(" / ")}`);
      continue;
    }

    const path = contentPath(leaf);
    const tags = leafTags(leaf);
    const leafIds = leafIdsBySubject.get(subjectId) ?? new Map<string, number>();

    await prisma.question.createMany({
      data: parsed.map((q) => ({
        subjectId,
        topicId: leafIds.get(path) ?? null,
        path,
        topic: tags.topic,
        subtopic: tags.subtopic,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: "MEDIUM",
        sourceExam: "BCS",
        year: null,
      })),
    });

    totalInserted += parsed.length;
    console.log(`✓ ${meta.nameBn} → ${path}: ${parsed.length} questions`);
  }

  // ── Refresh questionCount on every topic row (aggregated over descendants) ──
  const countRows = await prisma.question.groupBy({
    by: ["subjectId", "path"],
    _count: { _all: true },
  });
  const perSubject = new Map<number, Map<string, number>>();
  for (const row of countRows) {
    if (!perSubject.has(row.subjectId)) perSubject.set(row.subjectId, new Map());
    perSubject.get(row.subjectId)!.set(row.path, row._count._all);
  }
  for (const [subjectId, index] of idsByPathBySubject.entries()) {
    const totals = new Map<string, number>();
    const counts = perSubject.get(subjectId) ?? new Map<string, number>();
    for (const [path, count] of counts) {
      // Propagate the leaf count up every ancestor path.
      const segs = path.split("/");
      let acc = "";
      for (const seg of segs) {
        acc = acc ? `${acc}/${seg}` : seg;
        totals.set(acc, (totals.get(acc) ?? 0) + count);
      }
    }
    for (const [path, count] of totals) {
      const id = index.get(path);
      if (id !== undefined) {
        await prisma.topic.update({ where: { id }, data: { questionCount: String(count) } });
      }
    }
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