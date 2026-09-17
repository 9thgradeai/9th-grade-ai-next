/**
 * scripts/seed-bangla-grammar.ts
 * ----------------------------------------------------------------------------
 * Seeds MCQs from the Bangla Grammar topic files into the database.
 *
 * Reads .txt files from database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/Bangla Grammar /
 * and maps each file to its taxonomy topic based on the filename.
 *
 * Usage:
 *   npx tsx scripts/seed-bangla-grammar.ts
 *
 * Idempotent: safe to run repeatedly; uses the same upsert logic as the main seed.
 * ----------------------------------------------------------------------------
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature, type GateIssue } from "./qb-forensics/import-gate";
import { resolveAnswerToOption } from "./qb-forensics/parse-flat";
import {
  loadTaxonomy,
  SUBJECT_META,
  subjectMetaByNameBn,
  resolveSubjectNode,
  matchNodePath,
  contentPath,
  type TaxonomyNode,
} from "./taxonomy";

const BANGLA_MARKERS = ["ক.", "খ.", "গ.", "ঘ."];
const LATIN_MARKERS = ["A.", "B.", "C.", "D."];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchOptionBlock(
  body: string,
): { markers: string[]; match: RegExpMatchArray } | null {
  for (const markers of [BANGLA_MARKERS, LATIN_MARKERS]) {
    const re = new RegExp(
      `${esc(markers[0])} (.*) ${esc(markers[1])} (.*) ${esc(markers[2])} (.*) ${esc(markers[3])} (.*)$`,
    );
    const match = body.match(re);
    if (match) return { markers, match };
  }
  return null;
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
  const explanationIdx = line.indexOf("ব্যাখ্যা:");
  let explanation = "";
  let body = line;
  if (explanationIdx >= 0) {
    explanation = line.slice(explanationIdx + "ব্যাখ্যা:".length).trim();
    body = line.slice(0, explanationIdx);
  }

  const answerMarker = /(উত্তর\s*:)|(ans\.)/i;
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

/**
 * Map from filename topic extract to taxonomy node name.
 * Extracts the topic from filenames like "Questions(বাচ্য).txt" → "বাচ্য".
 */
function extractTopicFromFilename(filename: string): string | null {
  const match = filename.match(/Questions\(([^)]+)\)\.txt$/i);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Maps a topic name (from filename) to its taxonomy node name.
 * Some topics need underscore normalization to match taxonomy.
 */
function topicToTaxonomyName(topic: string): string {
  return topic.replace(/\s+/g, "_");
}

/** Collect all .txt files from the Bangla Grammar directory. */
function collectGrammarFiles(dir: string): { file: string; filename: string }[] {
  const specs: { file: string; filename: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    if (entry.isFile() && /\.txt$/i.test(entry.name)) {
      specs.push({ file: join(dir, entry.name), filename: entry.name });
    }
  }
  return specs;
}

function collectLeaves(node: TaxonomyNode): TaxonomyNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectLeaves);
}

function leafTags(node: TaxonomyNode): { topic: string; subtopic: string } {
  const parts = contentPath(node).split("/");
  if (parts.length <= 2) return { topic: node.name, subtopic: "" };
  return { topic: parts[1], subtopic: node.name };
}

/** Duplicate registry to avoid inserting the same MCQ twice. */
class DuplicateRegistry {
  private sigs = new Set<string>();

  constructor(existing?: Iterable<string>) {
    if (existing) for (const s of existing) this.sigs.add(s);
  }

  isDuplicate(sig: string): boolean {
    return this.sigs.has(sig);
  }

  claim(sig: string): void {
    this.sigs.add(sig);
  }
}

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("🌱 Seeding Bangla Grammar MCQs...\n");

    const grammarDir = join(
      process.cwd(),
      "database",
      "data",
      "ques",
      "বাংলা ভাষা ও সাহিত্য",
      "ভাষা",
      "Bangla Grammar ",
    );

    // Verify directory exists
    let grammarFiles: { file: string; filename: string }[];
    try {
      grammarFiles = collectGrammarFiles(grammarDir);
    } catch {
      console.error(`❌ Directory not found: ${grammarDir}`);
      process.exit(1);
    }

    if (grammarFiles.length === 0) {
      console.error("❌ No .txt files found in the Bangla Grammar directory");
      process.exit(1);
    }

    console.log(`📁 Found ${grammarFiles.length} files in Bangla Grammar directory\n`);

    // Load taxonomy and find the Bangla subject
    const taxonomy = loadTaxonomy();
    const banglaMeta = SUBJECT_META.find(
      (m) => m.nameBn === "বাংলা ভাষা ও সাহিত্য",
    );
    if (!banglaMeta) {
      console.error("❌ Bangla subject not found in SUBJECT_META");
      process.exit(1);
    }

    const banglaNode = resolveSubjectNode(taxonomy, banglaMeta.architectureName);
    if (!banglaNode) {
      console.error("❌ Bangla subject not found in taxonomy");
      process.exit(1);
    }

    // Ensure the Bangla subject exists in the database
    const subject = await prisma.subject.upsert({
      where: { ecosystemId_nameBn: { ecosystemId: 1, nameBn: banglaMeta.nameBn } },
      update: { nameEn: banglaMeta.nameEn, icon: banglaMeta.icon, color: banglaMeta.color, bg: banglaMeta.bg },
      create: {
        ecosystemId: 1,
        nameBn: banglaMeta.nameBn,
        nameEn: banglaMeta.nameEn,
        icon: banglaMeta.icon,
        color: banglaMeta.color,
        bg: banglaMeta.bg,
        sortOrder: 0,
      },
    });
    const subjectId = subject.id;
    console.log(`✓ Subject: ${banglaMeta.nameBn} (id: ${subjectId})\n`);

    // Build the topic tree for ভাষা subtree
    const bhashaNode = banglaNode.children.find(
      (c) => c.name.normalize("NFC") === "ভাষা".normalize("NFC"),
    );
    if (!bhashaNode) {
      console.error("❌ ভাষা node not found in taxonomy");
      process.exit(1);
    }

    // Create topic rows for all leaves in ভাষা
    const leafIds = new Map<string, number>();
    const idsByPath = new Map<string, number>();
    let order = 0;

    const createTopicNode = async (
      node: TaxonomyNode,
      parentId: number | null,
      depth: number,
    ) => {
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
        await createTopicNode(child, row.id, depth + 1);
      }
    };

    // Look up the existing ভাষা topic id from the database
    const bhashaTopic = await prisma.topic.findFirst({
      where: { subjectId, path: contentPath(bhashaNode) },
      select: { id: true },
    });
    const bhashaId = bhashaTopic?.id ?? null;

    for (const child of bhashaNode.children) {
      await createTopicNode(child, bhashaId, 2);
    }
    console.log(`✓ Topic tree built (${idsByPath.size} nodes, ${leafIds.size} leaves)\n`);

    // Build global duplicate registry from existing questions
    const existingRows = await prisma.question.findMany({
      where: { subjectId },
      select: { id: true, question: true, correctAnswer: true, explanation: true, sourceKey: true },
    });
    const duplicateRegistry = new DuplicateRegistry(
      existingRows.map((r) =>
        mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }),
      ),
    );
    const existingByKey = new Map(existingRows.map((r) => [r.sourceKey, r.id]));

    // Process each file
    let totalParsed = 0;
    let totalAccepted = 0;
    let totalRejected = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    const rejectedReport: Array<{ file: string; reason: string; question: string }> = [];

    for (const { file, filename } of grammarFiles) {
      const topicName = extractTopicFromFilename(filename);
      if (!topicName) {
        console.warn(`⚠ Skipping file (cannot extract topic): ${filename}`);
        continue;
      }

      const taxonomyName = topicToTaxonomyName(topicName);

      // Find the matching taxonomy leaf
      const leafNode = matchNodePath(bhashaNode, [taxonomyName]);
      if (!leafNode) {
        console.warn(`⚠ No taxonomy node for topic "${topicName}" (expected "${taxonomyName}") — skipping ${filename}`);
        continue;
      }

      const leafPath = contentPath(leafNode);
      const leafId = leafIds.get(leafPath) ?? null;
      const tags = leafTags(leafNode);

      // Read and parse the file
      const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      // Skip header line if present (first line without option markers)
      const questionLines: string[] = [];
      for (const line of lines) {
        // A header line has no option markers and no answer marker
        const isHeader = !line.includes("ক.") && !line.includes("Ans.") && !line.includes("উত্তর:");
        if (isHeader && questionLines.length === 0) {
          continue; // skip topic header
        }
        questionLines.push(line);
      }

      // Parse questions
      const parsed: ParsedQuestion[] = [];
      const fileRejected: Array<{ reason: string; question: string }> = [];

      for (const line of questionLines) {
        const p = parseQuestionLine(line);
        if (!p) continue;

        // Run through import gate
        const gate = scanMca({
          question: p.question,
          options: p.options,
          correctAnswer: p.correctAnswer,
          explanation: p.explanation,
        });

        if (gate.verdict === "REJECT") {
          fileRejected.push({
            reason: gate.fatal.map((f: GateIssue) => `${f.code}@${f.field}`).join(","),
            question: p.question.slice(0, 60),
          });
          continue;
        }

        parsed.push({
          question: gate.normalized.question,
          options: gate.normalized.options,
          correctAnswer: gate.normalized.correctAnswer,
          explanation: gate.normalized.explanation,
        });
      }

      totalParsed += parsed.length + fileRejected.length;
      totalAccepted += parsed.length;
      totalRejected += fileRejected.length;

      for (const r of fileRejected) {
        rejectedReport.push({ file: filename, ...r });
      }

      if (parsed.length === 0) {
        console.warn(`  ⚠ ${filename}: 0 accepted (${fileRejected.length} rejected)`);
        continue;
      }

      // Upsert questions
      let inserted = 0;
      let updated = 0;

      for (const q of parsed) {
        const key = sourceKey(subjectId, leafPath, q.question);
        const contentData = {
          topicId: leafId,
          path: leafPath,
          topic: tags.topic,
          subtopic: tags.subtopic,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        };

        const sig = mcaSignature({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        });

        const existingId = existingByKey.get(key);
        if (existingId !== undefined) {
          // Update existing question
          await prisma.question.update({
            where: { id: existingId },
            data: contentData,
          });
          updated += 1;
        } else if (!duplicateRegistry.isDuplicate(sig)) {
          // New question — claim and insert
          duplicateRegistry.claim(sig);
          try {
            await prisma.question.create({
              data: {
                ecosystemId: 1,
                subjectId,
                sourceKey: key,
                ...contentData,
                difficulty: "MEDIUM",
                sourceExam: "BCS",
                year: null,
              },
            });
            inserted += 1;
          } catch (err: unknown) {
            // Handle race condition / unique constraint (already seeded)
            if (
              typeof err === "object" &&
              err !== null &&
              "code" in err &&
              (err as { code: string }).code === "P2002"
            ) {
              // sourceKey already exists — skip silently
            } else {
              throw err;
            }
          }
        }
      }

      totalInserted += inserted;
      totalUpdated += updated;
      console.log(`  ✓ ${filename} → ${topicName}: ${parsed.length} synced (${inserted} new, ${updated} updated)`);
    }

    // Update question counts on topics
    const countRows = await prisma.question.groupBy({
      by: ["subjectId", "path"],
      where: { subjectId },
      _count: { _all: true },
    });
    for (const row of countRows) {
      if (row.subjectId !== subjectId) continue;
      const id = idsByPath.get(row.path);
      if (id !== undefined) {
        await prisma.topic.update({
          where: { id },
          data: { questionCount: String(row._count._all) },
        });
      }
    }

    // Summary
    console.log("\n═══════════════════════════════════════════════");
    console.log("📊 Summary");
    console.log("═══════════════════════════════════════════════");
    console.log(`  Total lines parsed: ${totalParsed}`);
    console.log(`  Accepted (valid):   ${totalAccepted}`);
    console.log(`  Rejected (broken):  ${totalRejected}`);
    console.log(`  New questions:      ${totalInserted}`);
    console.log(`  Updated questions:  ${totalUpdated}`);

    if (rejectedReport.length > 0) {
      console.log(`\n⚠ Rejected questions (${rejectedReport.length}):`);
      for (const r of rejectedReport.slice(0, 20)) {
        console.log(`  • [${r.file}] ${r.reason} — "${r.question}…"`);
      }
      if (rejectedReport.length > 20) {
        console.log(`  … and ${rejectedReport.length - 20} more`);
      }
    }

    // Note: server-side QueryCache (5 min TTL) holds stale exam tree data.
    // It auto-expires after 5 min or clears on dev server restart.
    // Cannot import query-cache.ts from scripts due to server-only guard.

    console.log("\n✅ Bangla Grammar seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("seed-bangla-grammar.ts")) {
  main()
    .catch((e) => {
      console.error("❌ Seed failed:", e);
      process.exit(1);
    });
}
