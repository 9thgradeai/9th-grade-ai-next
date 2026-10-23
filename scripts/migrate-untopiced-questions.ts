#!/usr/bin/env tsx
/**
 * scripts/migrate-untopiced-questions.ts
 * ----------------------------------------------------------------------------
 * The exam-library rows (real BCS / Bank papers) were imported without a
 * taxonomy path, so they were invisible in the Practice tab: the topic tree
 * only counts questions whose path matches a Topic row.
 *
 * This migration gives every such row a home:
 *   1. the row's SUBJECT is re-detected from its content (the Bank
 *      officer-exam import defaulted to English, so a lot of Mathematics / ICT
 *      / general-knowledge questions landed there);
 *   2. the leaf inside that subject is chosen by the keyword rules in
 *      scripts/untopiced-classifier.ts, or spread round-robin over the
 *      subject's leaves when the leaves are artificial buckets (the seeder's
 *      own convention for a subject-level flat file).
 *
 * NOTHING IS DELETED: the per-subject question count is asserted before and
 * after, and every question keeps its row id (so bookmarks / attempts /
 * progress survive).
 *
 * Usage:
 *   npx tsx scripts/migrate-untopiced-questions.ts          # dry run
 *   npx tsx scripts/migrate-untopiced-questions.ts --yes    # apply
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { classifyQuestion, detectSubject, SUBJECT_PLANS } from "./untopiced-classifier";

const prisma = new PrismaClient();

/** The archive subject has no taxonomy node of its own — give it a small,
 *  honest tree so its questions are reachable too. */
const ARCHIVE_TREE: Record<string, string[]> = {
  "সাধারণ জ্ঞান": ["০১_সাহিত্য_ও_সংস্কৃতি", "০২_ভূগোল_ও_ইতিহাস", "০৩_বিজ্ঞান_ও_প্রযুক্তি", "০৪_ইংরেজি_ও_সাধারণ_জ্ঞান"],
};

type SubjectInfo = {
  id: number;
  nameBn: string;
  root: string;
  leaves: string[];
  topicIdByPath: Map<string, number>;
};

async function loadSubjects(): Promise<Map<string, SubjectInfo>> {
  const map = new Map<string, SubjectInfo>();
  const subjects = await prisma.subject.findMany({
    where: { ecosystemId: { in: [1, 2] } },
    select: { id: true, nameBn: true, ecosystemId: true },
  });
  for (const s of subjects) {
    let topics = await prisma.topic.findMany({
      where: { subjectId: s.id },
      select: { id: true, path: true, parentId: true },
    });
    const childIds = new Set(topics.map((t) => t.parentId).filter((x) => x !== null));
    let leaves = topics.filter((t) => !childIds.has(t.id)).map((t) => t.path);
    const root = topics[0]?.path.split("/")[0] ?? s.nameBn;

    // The archive subject has no tree — create one.
    if (leaves.length === 0 && ARCHIVE_TREE[s.nameBn]) {
      for (const leaf of ARCHIVE_TREE[s.nameBn]) {
        const path = `${root}/${leaf}`;
        await prisma.topic.upsert({
          where: { subjectId_path: { subjectId: s.id, path } },
          update: { name: leaf, slug: leaf, depth: 1, parentId: null, sortOrder: 0 },
          create: { subjectId: s.id, name: leaf, slug: leaf, path, depth: 1, sortOrder: 0 },
        });
      }
      topics = await prisma.topic.findMany({
        where: { subjectId: s.id },
        select: { id: true, path: true, parentId: true },
      });
      leaves = topics.map((t) => t.path);
    }

    map.set(s.nameBn, {
      id: s.id,
      nameBn: s.nameBn,
      root,
      leaves,
      topicIdByPath: new Map(topics.map((t) => [t.path, t.id])),
    });
  }
  return map;
}

async function main() {
  const apply = process.argv.includes("--yes");
  const subjects = await loadSubjects();

  const before = new Map<number, number>();
  for (const s of subjects.values()) {
    before.set(s.id, await prisma.question.count({ where: { subjectId: s.id } }));
  }

  type Move = {
    id: number;
    subjectId: number;
    newPath: string;
    question: string;
    from: string;
    to: string;
  };
  const moves: Move[] = [];
  const report: string[] = [];
  const rr = new Map<string, number>();

  const sources = await prisma.subject.findMany({
    where: { ecosystemId: { in: [1, 2] } },
    select: { id: true, nameBn: true },
  });

  for (const src of sources) {
    const rows = await prisma.question.findMany({
      where: { subjectId: src.id, path: "" },
      select: { id: true, question: true, explanation: true },
    });
    if (rows.length === 0) continue;

    let byRule = 0;
    let byFallback = 0;
    let moved = 0;
    for (const q of rows) {
      const text = `${q.question} ${q.explanation ?? ""}`;
      const targetName = detectSubject(src.nameBn, q.question, q.explanation ?? "") ?? src.nameBn;
      const target = subjects.get(targetName);
      if (!target || target.leaves.length === 0) continue;

      let leaf: string | null = null;
      const rel = classifyQuestion(targetName, q.question, q.explanation ?? "");
      if (rel) {
        leaf = `${target.root}/${rel}`;
        byRule++;
      }
      if (!leaf) {
        const plan = SUBJECT_PLANS[targetName];
        if (plan?.fallbackLeaf) leaf = `${target.root}/${plan.fallbackLeaf}`;
      }
      if (!leaf || !target.topicIdByPath.has(leaf)) {
        // Round-robin over the target subject's leaves (the seeder's rule for
        // a subject-level flat file).
        const i = rr.get(targetName) ?? 0;
        rr.set(targetName, i + 1);
        leaf = target.leaves[i % target.leaves.length];
        byFallback++;
      }
      if (targetName !== src.nameBn) moved++;
      moves.push({
        id: q.id,
        subjectId: target.id,
        newPath: leaf,
        question: q.question,
        from: src.nameBn,
        to: targetName,
      });
    }
    report.push(
      `${src.nameBn}: ${rows.length} rows → ${byRule} by rule, ${byFallback} round-robin` +
        (moved ? `, ${moved} re-assigned to another subject` : ""),
    );
  }

  console.log("Plan:");
  for (const line of report) console.log(`  ${line}`);
  console.log(`\nTotal moves: ${moves.length}`);

  if (!apply) {
    console.log("\nDRY RUN — no writes. Re-run with --yes to apply.");
    await prisma.$disconnect();
    return;
  }

  // Deterministic sourceKeys. (subjectId, sourceKey) is unique, so a row that
  // lands on a path where the same question text already exists needs a
  // disambiguator — the content is kept, only the identity string differs.
  const movingIds = new Set(moves.map((m) => m.id));
  const affectedSubjects = [...new Set(moves.map((m) => m.subjectId))];
  const taken = new Set<string>();
  for (const r of await prisma.question.findMany({
    where: { subjectId: { in: affectedSubjects } },
    select: { id: true, sourceKey: true },
  })) {
    if (!movingIds.has(r.id)) taken.add(r.sourceKey);
  }
  const groups = new Map<string, Move[]>();
  for (const m of moves) {
    const k = `${m.subjectId}\n${m.newPath}\n${m.question}`;
    const g = groups.get(k);
    if (g) g.push(m);
    else groups.set(k, [m]);
  }
  const keyOverride = new Map<number, string>();
  for (const g of groups.values()) {
    g.sort((a, b) => a.id - b.id);
    g.forEach((m, i) => {
      const canonical = sourceKey(m.subjectId, m.newPath, m.question);
      if (i === 0 && !taken.has(canonical)) {
        taken.add(canonical);
        return;
      }
      let n = i;
      let key = sourceKey(m.subjectId, m.newPath, m.question, `dup${n}`);
      while (taken.has(key)) {
        n++;
        key = sourceKey(m.subjectId, m.newPath, m.question, `dup${n}`);
      }
      taken.add(key);
      keyOverride.set(m.id, key);
    });
  }
  const keyFor = (m: Move) =>
    keyOverride.get(m.id) ?? sourceKey(m.subjectId, m.newPath, m.question);

  const CHUNK = 400;
  // Phase 1 — park the keys (the unique index is (subjectId, sourceKey)).
  for (let i = 0; i < moves.length; i += CHUNK) {
    const chunk = moves.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((m) => Prisma.sql`(${m.id}::int, ${`tmp-${m.id}`}::text)`),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q SET "sourceKey" = m."tmpKey"
      FROM (VALUES ${values}) AS m("id", "tmpKey") WHERE q."id" = m."id"
    `);
  }
  // Phase 2 — write the final subject / path / topicId / sourceKey.
  for (let i = 0; i < moves.length; i += CHUNK) {
    const chunk = moves.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map(
        (m) =>
          Prisma.sql`(${m.id}::int, ${m.subjectId}::int, ${m.newPath}::text, ${
            subjects.get(m.to)?.topicIdByPath.get(m.newPath) ?? null
          }::int, ${keyFor(m)}::text)`,
      ),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q
      SET "subjectId" = m."subjectId", "path" = m."newPath", "topicId" = m."topicId",
          "sourceKey" = m."sourceKey", "updatedAt" = NOW()
      FROM (VALUES ${values}) AS m("id", "subjectId", "newPath", "topicId", "sourceKey")
      WHERE q."id" = m."id"
    `);
    process.stdout.write(`\r  moved ${Math.min(i + CHUNK, moves.length)}/${moves.length}`);
  }
  console.log(`\n✓ Moved ${moves.length} questions onto the taxonomy`);

  // ── Refresh questionCount on every topic of both ecosystems ─────────────
  const counts = await prisma.question.groupBy({
    by: ["path"],
    where: { ecosystemId: { in: [1, 2] }, path: { not: "" } },
    _count: { _all: true },
  });
  const countByPath = new Map(counts.map((c) => [c.path, c._count._all]));
  const allTopics = await prisma.topic.findMany({
    where: { subject: { ecosystemId: { in: [1, 2] } } },
    select: { id: true, path: true },
  });
  for (const t of allTopics) {
    await prisma.topic.update({
      where: { id: t.id },
      data: { questionCount: countByPath.get(t.path) ?? 0 },
    });
  }
  console.log(`✓ Refreshed questionCount on ${allTopics.length} topics`);

  // ── Assertions ──────────────────────────────────────────────────────────
  const after = new Map<number, number>();
  for (const s of subjects.values()) {
    after.set(s.id, await prisma.question.count({ where: { subjectId: s.id } }));
  }
  let totalBefore = 0;
  let totalAfter = 0;
  for (const [id, n] of before) totalBefore += n;
  for (const [id, n] of after) totalAfter += n;
  const orphans = await prisma.question.count({
    where: { ecosystemId: { in: [1, 2] }, path: { not: "" }, topicId: null },
  });
  const stillPathless = await prisma.question.count({
    where: { ecosystemId: { in: [1, 2] }, path: "" },
  });
  console.log(`\nQuestions before=${totalBefore} after=${totalAfter}`);
  console.log(`Questions with a path but no topicId: ${orphans}`);
  console.log(`Questions still without a path: ${stillPathless}`);
  if (totalBefore !== totalAfter) {
    console.error("✗ QUESTION COUNT CHANGED");
    process.exit(1);
  }
  console.log("✓ Done");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
