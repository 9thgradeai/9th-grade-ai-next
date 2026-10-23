#!/usr/bin/env tsx
/**
 * scripts/migrate-bangla-taxonomy-alignment.ts
 * ----------------------------------------------------------------------------
 * The BCS and the Bank share ONE Bangla practice pool (the cross-ecosystem
 * union in backend/services/bangla-union.ts). The union pairs a leaf on one
 * side with the leaf of the SAME name on the other side — so the two Bangla
 * taxonomies must use the same leaf names for the same content, otherwise a
 * topic silently loses (or duplicates) the other ecosystem's questions.
 *
 * The 2026-10-22 Bank taxonomy revision regrouped the Bangla grammar leaves
 * and dropped the literary-history leaves, which broke that pairing. This
 * migration realigns the two sides:
 *
 *   • the BCS `ভাষা/` branch adopts the revised grouped leaves (the same tree
 *     the Bank now uses) — the BCS architecture file was updated to match;
 *   • the Bank's literary-history sets (কথা-সাহিত্য / গদ্যের উৎপত্তি / নাটক)
 *     move back onto their own leaves, mirroring the BCS tree, so the two
 *     sides pair 1:1 again.
 *
 * NOTHING IS DELETED: the question count per subject is asserted before and
 * after, and every question keeps its row id (bookmarks / attempts / progress
 * survive). Only `path`, `topicId` and `sourceKey` are rewritten.
 *
 * Usage:
 *   npx tsx scripts/migrate-bangla-taxonomy-alignment.ts          # dry run
 *   npx tsx scripts/migrate-bangla-taxonomy-alignment.ts --yes    # apply
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";

const prisma = new PrismaClient();

const BCS_ROOT = "01_বাংলা_ভাষা_ও_সাহিত্য";
const BANK_ROOT = "01_Bangla_Language_and_Literature";

type TaxonomyNode = { name: string; children: TaxonomyNode[]; path: string; depth: number };

/** Legacy flat BCS `ভাষা` leaf → revised grouped leaf (relative to `ভাষা`). */
const BCS_LANGUAGE_LEAF_MAP: Record<string, string> = {
  পদ: "শব্দতত্ত্ব/পদ_ও_পদ_পরিবর্তন",
  কারক: "শব্দতত্ত্ব/কারক_ও_বিভক্তি",
  সমাস: "শব্দতত্ত্ব/সমাস",
  প্রত্যয়: "শব্দতত্ত্ব/প্রকৃতি_ও_প্রত্যয়",
  উপসর্গ: "শব্দতত্ত্ব/উপসর্গ_ও_অনুসর্গ",
  শব্দ: "শব্দতত্ত্ব/শব্দরূপ_ও_শব্দদ্বৈত",
  ধ্বনি: "ধ্বনিতত্ত্ব/ধ্বনি_উচ্চারণপ্রণালী_ও_উচ্চারণের_স্থান",
  সন্ধি: "ধ্বনিতত্ত্ব/সন্ধি_বা_ধ্বনিসংযোগ",
  বর্ণ: "ধ্বনিতত্ত্ব/ধ্বনির_প্রতীক_বা_বর্ণের_বিন্যাস",
  বানান_ও_বাক্য_শুদ্ধি: "ধ্বনিতত্ত্ব/ধ্বনির_প্রতীক_বা_বর্ণের_বিন্যাস",
  "প্রয়োগ-অপপ্রয়োগ": "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/প্রয়োগ-অপপ্রয়োগ",
  পরিভাষা: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/পরিভাষা",
  সমার্থক_শব্দ: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/সমার্থক_শব্দ",
  বিপরীতার্থক_শব্দ: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বিপরীতার্থক_শব্দ",
  বাগধারা: "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/বাগধারা_ও_প্রবাদ_প্রবচন",
  বাংলা_ছন্দ_ও_অলংকার: "অন্যান্য_আলোচ্য_বিষয়/ছন্দ_ও_অলংকার",
};

/** The BCS `ভাষা/বাক্য` leaf mixes three topics — split it by subtopic. */
function bcsBakyapath(subtopic: string): string {
  if (subtopic.includes("বাচ্য")) return "বাক্যতত্ত্ব/বাচ্য";
  if (subtopic.includes("এক কথায় প্রকাশ") || subtopic.includes("এককথায়"))
    return "অর্থতত্ত্ব_ও_শব্দভাণ্ডার/এককথায়_প্রকাশ";
  return "বাক্যতত্ত্ব/বাক্য_ও_বাক্যবিন্যাস";
}

/** The Bank literary-history sets → their own leaves (mirroring the BCS). */
const BANK_LITERATURE_LEAVES = [
  "বাংলা_কথা-সাহিত্য",
  "বাংলা_গদ্যের_উৎপত্তি_ও_বিকাশ",
  "বাংলা_নাটক",
];

async function createTopicTree(
  subjectId: number,
  nodes: TaxonomyNode[],
  parentId: number | null,
  depth: number,
  parentPath: string,
  startSort: number,
): Promise<number> {
  let sort = startSort;
  for (const n of nodes) {
    const path = parentPath ? `${parentPath}/${n.name}` : n.name;
    const topic = await prisma.topic.upsert({
      where: { subjectId_path: { subjectId, path } },
      update: { name: n.name, slug: n.name, depth, parentId, sortOrder: sort },
      create: { subjectId, name: n.name, slug: n.name, path, depth, parentId, sortOrder: sort },
    });
    sort++;
    if (n.children.length > 0) {
      sort = await createTopicTree(subjectId, n.children, topic.id, depth + 1, path, sort);
    }
  }
  return sort;
}

/** Relative node paths (below the subject root) of a taxonomy subtree. */
function relativePaths(nodes: TaxonomyNode[]): string[] {
  const out: string[] = [];
  const walk = (n: TaxonomyNode, prefix: string) => {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    out.push(p);
    for (const c of n.children) walk(c, p);
  };
  for (const c of nodes) walk(c, "");
  return out;
}

function loadTaxonomy(file: string): TaxonomyNode {
  return JSON.parse(readFileSync(join(process.cwd(), file), "utf8")) as TaxonomyNode;
}

async function main() {
  const apply = process.argv.includes("--yes");

  const bcs = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bank = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcs || !bank) throw new Error("BCS / BANGLADESH_BANK ecosystem missing");

  const bcsSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bcs.id, nameBn: "বাংলা ভাষা ও সাহিত্য" },
  });
  const bankSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bank.id, nameBn: BANK_ROOT },
  });
  if (!bcsSubject || !bankSubject) throw new Error("Bangla subject missing in BCS/Bank");

  const bcsTaxonomy = loadTaxonomy("database/data/taxonomy.json");
  const bankTaxonomy = loadTaxonomy("database/data/bb-taxonomy.json");
  const bcsNode = bcsTaxonomy.children.find((c) => c.name === BCS_ROOT);
  const bankNode = bankTaxonomy.children.find((c) => c.name === BANK_ROOT);
  if (!bcsNode || !bankNode) throw new Error("Bangla node missing from a taxonomy");

  // ── Plan the moves ──────────────────────────────────────────────────────
  type Row = { id: number; subjectId: number; newPath: string; question: string };
  const rows: Row[] = [];

  const bcsRows = await prisma.question.findMany({
    where: { subjectId: bcsSubject.id },
    select: { id: true, subjectId: true, path: true, subtopic: true, question: true },
  });
  for (const r of bcsRows) {
    if (!r.path || !r.path.startsWith(`${BCS_ROOT}/ভাষা/`)) continue;
    const leaf = r.path.slice(`${BCS_ROOT}/ভাষা/`.length);
    if (!leaf) continue; // the `ভাষা` group row itself stays where it is
    const target =
      leaf === "বাক্য" ? bcsBakyapath(r.subtopic ?? "") : BCS_LANGUAGE_LEAF_MAP[leaf];
    if (!target) continue;
    rows.push({
      id: r.id,
      subjectId: r.subjectId,
      newPath: `${BCS_ROOT}/ভাষা/${target}`,
      question: r.question,
    });
  }

  const bankRows = await prisma.question.findMany({
    where: { subjectId: bankSubject.id },
    select: { id: true, subjectId: true, path: true, subtopic: true, question: true },
  });
  const bankEraPath = `${BANK_ROOT}/সাহিত্য/আধুনিক_যুগ_১৮০০_হতে_বর্তমান`;
  for (const r of bankRows) {
    if (r.path !== bankEraPath) continue;
    const leaf = BANK_LITERATURE_LEAVES.find((l) => l === (r.subtopic ?? ""));
    if (!leaf) continue;
    rows.push({
      id: r.id,
      subjectId: r.subjectId,
      newPath: `${bankEraPath}/${leaf}`,
      question: r.question,
    });
  }

  console.log(`BCS Bangla rows to move: ${rows.filter((r) => r.subjectId === bcsSubject.id).length}`);
  console.log(`Bank Bangla rows to move: ${rows.filter((r) => r.subjectId === bankSubject.id).length}`);

  const byTarget = new Map<string, number>();
  for (const r of rows) byTarget.set(r.newPath, (byTarget.get(r.newPath) ?? 0) + 1);
  console.log("\nMove plan (target ← count):");
  for (const [p, c] of [...byTarget.entries()].sort()) console.log(`  ${String(c).padStart(5)}  ${p}`);

  if (!apply) {
    console.log("\nDRY RUN — no writes. Re-run with --yes to apply.");
    await prisma.$disconnect();
    return;
  }

  // ── Apply ───────────────────────────────────────────────────────────────
  const beforeBcs = await prisma.question.count({ where: { subjectId: bcsSubject.id } });
  const beforeBank = await prisma.question.count({ where: { subjectId: bankSubject.id } });

  // 1. The topic trees (both sides) must exist before the rows move.
  await createTopicTree(bcsSubject.id, bcsNode.children, null, 1, bcsNode.name, 1);
  await createTopicTree(bankSubject.id, bankNode.children, null, 1, bankNode.name, 1);
  console.log("✓ Topic trees rebuilt for both Bangla subjects");

  const topicRows = await prisma.topic.findMany({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] } },
    select: { id: true, path: true },
  });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  // 2. Deterministic sourceKeys (duplicates get a disambiguator).
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.subjectId}\n${r.newPath}\n${r.question}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const keyOverride = new Map<number, string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.id - b.id);
    g.forEach((r, i) => {
      if (i === 0) return;
      keyOverride.set(r.id, sourceKey(r.subjectId, r.newPath, r.question, `dup${i}`));
    });
  }
  const keyFor = (r: Row) =>
    keyOverride.get(r.id) ?? sourceKey(r.subjectId, r.newPath, r.question);

  // 3. Two-phase update (park the keys first, then write the final values).
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((r) => Prisma.sql`(${r.id}::int, ${`tmp-${r.id}`}::text)`),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q SET "sourceKey" = m."tmpKey"
      FROM (VALUES ${values}) AS m("id", "tmpKey") WHERE q."id" = m."id"
    `);
  }
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map(
        (r) =>
          Prisma.sql`(${r.id}::int, ${r.newPath}::text, ${
            topicIdByPath.get(r.newPath) ?? null
          }::int, ${keyFor(r)}::text)`,
      ),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q
      SET "path" = m."newPath", "topicId" = m."topicId", "sourceKey" = m."sourceKey", "updatedAt" = NOW()
      FROM (VALUES ${values}) AS m("id", "newPath", "topicId", "sourceKey")
      WHERE q."id" = m."id"
    `);
    process.stdout.write(`\r  moved ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }
  console.log(`\n✓ Moved ${rows.length} rows`);

  const topicRowsAfter = await prisma.topic.findMany({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] } },
    select: { id: true, path: true },
  });
  for (const t of topicRowsAfter) topicIdByPath.set(t.path, t.id);

  // 4. Re-point every question at the Topic row of its path (repairs rows
  //    whose topic was pruned / renamed in an earlier run).
  const repoint: Array<{ id: number; subjectId: number; newPath?: string; path?: string; question: string }> =
    rows.length > 0
      ? rows
      : await prisma.question.findMany({
          where: { subjectId: { in: [bcsSubject.id, bankSubject.id] }, path: { not: "" } },
          select: { id: true, subjectId: true, path: true, question: true },
        });
  for (let i = 0; i < repoint.length; i += CHUNK) {
    const chunk = repoint.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map(
        (r) =>
          Prisma.sql`(${r.id}::int, ${topicIdByPath.get(r.newPath ?? r.path ?? "") ?? null}::int)`,
      ),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q SET "topicId" = m."topicId", "updatedAt" = NOW()
      FROM (VALUES ${values}) AS m("id", "topicId") WHERE q."id" = m."id"
    `);
  }
  console.log(`✓ Re-pointed ${repoint.length} questions at their Topic row`);

  // 4b. Normalise non-NFC paths (Bengali য় / ড় decomposed forms): the
  // taxonomy — and therefore every Topic row — is NFC, so a question whose
  // path is not NFC can never find its topic.
  const nonNfc = await prisma.question.findMany({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] }, path: { not: "" } },
    select: { id: true, subjectId: true, path: true, question: true },
  });
  const nfcRows = nonNfc.filter((r) => r.path !== r.path.normalize("NFC"));
  if (nfcRows.length > 0) {
    const values = Prisma.join(
      nfcRows.map((r) => {
        const nfc = r.path.normalize("NFC");
        return Prisma.sql`(${r.id}::int, ${nfc}::text, ${
          topicIdByPath.get(nfc) ?? null
        }::int, ${sourceKey(r.subjectId, nfc, r.question)}::text)`;
      }),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q
      SET "path" = m."newPath", "topicId" = m."topicId", "sourceKey" = m."sourceKey", "updatedAt" = NOW()
      FROM (VALUES ${values}) AS m("id", "newPath", "topicId", "sourceKey")
      WHERE q."id" = m."id"
    `);
    console.log(`✓ Normalised ${nfcRows.length} non-NFC paths to NFC`);
  }

  // 5. Prune the topics that the revision removed — only those that are
  //    outside the revised taxonomy AND no longer referenced by a question.
  // Every node path of the revised taxonomies (group nodes included — a
  // group node owns its subtree through `onDelete: Cascade`, so deleting one
  // takes its whole branch with it).
  const validPaths = new Set<string>();
  for (const child of bcsNode.children) {
    validPaths.add(`${bcsNode.name}/${child.name}`);
    for (const p of relativePaths(child.children))
      validPaths.add(`${bcsNode.name}/${child.name}/${p}`);
  }
  for (const child of bankNode.children) {
    validPaths.add(`${bankNode.name}/${child.name}`);
    for (const p of relativePaths(child.children))
      validPaths.add(`${bankNode.name}/${child.name}/${p}`);
  }
  const allTopics = await prisma.topic.findMany({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] } },
    select: { id: true, path: true },
  });
  const withCounts = await prisma.question.groupBy({
    by: ["topicId"],
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] } },
    _count: { _all: true },
  });
  const usedTopicIds = new Set(withCounts.map((c) => c.topicId));
  const prunable = allTopics.filter((t) => !validPaths.has(t.path) && !usedTopicIds.has(t.id));
  if (prunable.length > 0) {
    await prisma.topic.deleteMany({ where: { id: { in: prunable.map((t) => t.id) } } });
    console.log(`✓ Pruned ${prunable.length} emptied legacy topics`);
    for (const t of prunable) console.log(`    - ${t.path}`);
  }

  // 5. Refresh questionCount.
  const counts = await prisma.question.groupBy({
    by: ["path"],
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] }, path: { not: "" } },
    _count: { _all: true },
  });
  const countByPath = new Map(counts.map((c) => [c.path, c._count._all]));
  const refreshed = await prisma.topic.findMany({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] } },
    select: { id: true, path: true },
  });
  for (const t of refreshed) {
    await prisma.topic.update({
      where: { id: t.id },
      data: { questionCount: countByPath.get(t.path) ?? 0 },
    });
  }
  console.log(`✓ Refreshed questionCount on ${refreshed.length} topics`);

  // 6. Assertions.
  const afterBcs = await prisma.question.count({ where: { subjectId: bcsSubject.id } });
  const afterBank = await prisma.question.count({ where: { subjectId: bankSubject.id } });
  console.log(`\nBCS  questions before=${beforeBcs} after=${afterBcs}`);
  console.log(`Bank questions before=${beforeBank} after=${afterBank}`);
  if (beforeBcs !== afterBcs || beforeBank !== afterBank) {
    console.error("✗ QUESTION COUNT CHANGED");
    process.exit(1);
  }
  const orphans = await prisma.question.count({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] }, path: { not: "" }, topicId: null },
  });
  console.log(`Questions with a path but no topicId: ${orphans}`);
  console.log("✓ Done");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
