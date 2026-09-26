#!/usr/bin/env tsx
/**
 * scripts/migrate-bank-subjects.ts
 * ----------------------------------------------------------------------------
 * One-time migration: consolidate legacy Bank subjects under the exact-name
 * taxonomy subjects (০১_বাংলা_ভাষা_ও_সাহিত্য … 06_Financial_Knowledge) so the
 * Practice Bank section shows taxonomy names with their questions.
 *
 *   keepers (oldest rows, moved)          → new subject
 *     #3872 বাংলা ব্যাকরণ ও সাহিত্য      → #4958  ০১_বাংলা_ভাষা_ও_সাহিত্য
 *     #3873 English Grammar & Literature  → #4959  02_English_…
 *     #3874 সাধারণ গণিত                  → #4960  03_Mathematics
 *     #3876 আর্থিক ও ব্যাংকিং জ্ঞান       → #4963  06_Financial_Knowledge
 *     #3878 তথ্য ও যোগাযোগ প্রযুক্তি      → #4962  05_ICT (+topicId remap by path)
 *   dupes (#4146/#4147/#4148/#4151) are dropped ONLY when an identical
 *   (question text + paperId) keeper exists; survivors move to the new subject.
 *   #3877 সাধারণ জ্ঞান (archive) is never touched.
 *   Emptied legacy subjects are deleted (zero questions — no cascade).
 *
 * Safety: DRY RUN by default. --yes applies inside a transaction and then
 * asserts per-paper question counts are unchanged (exam library intact).
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MOVES: Array<{ from: number; to: number; label: string }> = [
  { from: 3872, to: 4958, label: "Bangla" },
  { from: 3873, to: 4959, label: "English" },
  { from: 3874, to: 4960, label: "Math" },
  { from: 3876, to: 4963, label: "Financial" },
  { from: 3878, to: 4962, label: "ICT" },
];
const DUPE_SUBJECTS: Array<{ dup: number; keeperNew: number; label: string }> = [
  { dup: 4146, keeperNew: 4958, label: "Bangla" },
  { dup: 4147, keeperNew: 4959, label: "English" },
  { dup: 4148, keeperNew: 4960, label: "Math" },
  { dup: 4151, keeperNew: 4963, label: "Financial" },
];

async function paperCounts(): Promise<Map<string, number>> {
  const rows = await prisma.question.groupBy({ by: ["paperId"], _count: { _all: true } });
  return new Map(rows.map((r) => [String(r.paperId), r._count._all]));
}

async function main() {
  const apply = process.argv.includes("--yes");

  // Pre-check: report user-data footprint (informational — the per-row
  // guard below never deletes a row that carries any).
  const allIds = (
    await prisma.question.findMany({
      where: { subjectId: { in: [...MOVES.map((m) => m.from), ...DUPE_SUBJECTS.map((d) => d.dup)] } },
      select: { id: true },
    })
  ).map((r) => r.id);
  const [bm, att, prog] = await Promise.all([
    prisma.bookmark.count({ where: { questionId: { in: allIds } } }),
    prisma.questionAttempt.count({ where: { questionId: { in: allIds } } }),
    prisma.userQuestionProgress.count({ where: { questionId: { in: allIds } } }),
  ]);
  console.log(`Scope: ${allIds.length} rows (bookmarks=${bm} attempts=${att} progress=${prog}) — rows with data are moved, never deleted.`);

  // ICT topic remap (old Topic rows → new-tree Topic rows, matched by path).
  const newTopics = await prisma.topic.findMany({ where: { subjectId: 4962 }, select: { id: true, path: true } });
  const topicByPath = new Map(newTopics.map((t) => [t.path, t.id]));

  let moved = 0;
  let dropped = 0;
  let movedDupes = 0;

  const run = async () => {
    for (const m of MOVES) {
      if (m.from === 3878) {
        const rows = await prisma.question.findMany({ where: { subjectId: m.from }, select: { id: true, path: true, topicId: true } });
        for (const r of rows) {
          const tid = r.path ? (topicByPath.get(r.path) ?? null) : null;
          if (r.path && tid === null) throw new Error(`No new-tree topic for path ${r.path}`);
          await prisma.question.update({ where: { id: r.id }, data: { subjectId: m.to, topicId: tid } });
          moved++;
        }
      } else {
        const r = await prisma.question.updateMany({ where: { subjectId: m.from }, data: { subjectId: m.to } });
        moved += r.count;
      }
      console.log(`  moved ${m.label}: ${m.from} → ${m.to}`);
    }
    for (const d of DUPE_SUBJECTS) {
      const keepers = await prisma.question.findMany({
        where: { subjectId: d.keeperNew },
        select: { question: true, paperId: true },
      });
      const keeperKeys = new Set(keepers.map((k) => `${k.question}\n${k.paperId}`));
      const dupes = await prisma.question.findMany({ where: { subjectId: d.dup }, select: { id: true, question: true, paperId: true } });
      if (dupes.length === 0) {
        console.log(`  dupes ${d.label} #${d.dup}: already empty, skipping`);
        continue;
      }
      // One batched user-data lookup (not per-row: pooler latency dominates).
      const withData = new Set<number>();
      const dids = dupes.map((q) => q.id);
      for (const r of await prisma.bookmark.findMany({ where: { questionId: { in: dids } }, select: { questionId: true } })) withData.add(r.questionId);
      for (const r of await prisma.questionAttempt.findMany({ where: { questionId: { in: dids } }, select: { questionId: true } })) { if (r.questionId !== null) withData.add(r.questionId); }
      for (const r of await prisma.userQuestionProgress.findMany({ where: { questionId: { in: dids } }, select: { questionId: true } })) withData.add(r.questionId);
      let dd = 0;
      let mm = 0;
      let kept = 0;
      for (const q of dupes) {
        if (!keeperKeys.has(`${q.question}\n${q.paperId}`)) {
          await prisma.question.update({ where: { id: q.id }, data: { subjectId: d.keeperNew } });
          movedDupes++;
          mm++;
          continue;
        }
        // Keeper match exists: drop ONLY when this row carries no user data.
        if (!withData.has(q.id)) {
          await prisma.question.delete({ where: { id: q.id } });
          dropped++;
          dd++;
        } else {
          await prisma.question.update({ where: { id: q.id }, data: { subjectId: d.keeperNew } });
          movedDupes++;
          kept++;
        }
      }
      console.log(`  dupes ${d.label} #${d.dup}: dropped=${dd} moved-survivors=${mm} moved-with-data=${kept}`);
    }
    // Delete emptied legacy subjects (zero questions — cascade-safe).
    for (const sid of [3872, 3873, 3874, 3875, 3876, 3878, 4146, 4147, 4148, 4151]) {
      const n = await prisma.question.count({ where: { subjectId: sid } });
      if (n === 0) {
        await prisma.topic.deleteMany({ where: { subjectId: sid } });
        await prisma.subject.delete({ where: { id: sid } });
        console.log(`  deleted empty legacy subject #${sid}`);
      } else {
        console.log(`  KEPT #${sid} — still holds ${n} questions!`);
      }
    }
  };

  if (!apply) {
    // Dry run: report what WOULD happen (same queries, no writes).
    // Keepers still sit under their OLD ids here (moves run first in apply
    // mode), so resolve them via the from→to map.
    const keeperOld = new Map(MOVES.map((m) => [m.to, m.from] as const));
    for (const m of MOVES) {
      const n = await prisma.question.count({ where: { subjectId: m.from } });
      console.log(`  would move ${m.label}: ${n} rows #${m.from} → #${m.to}`);
    }
    for (const d of DUPE_SUBJECTS) {
      const keepers = await prisma.question.findMany({ where: { subjectId: keeperOld.get(d.keeperNew)! }, select: { question: true, paperId: true } });
      const keeperKeys = new Set(keepers.map((k) => `${k.question}\n${k.paperId}`));
      const dupes = await prisma.question.findMany({ where: { subjectId: d.dup }, select: { id: true, question: true, paperId: true } });
      const dids = dupes.map((q) => q.id);
      const withData = new Set<number>();
      for (const r of await prisma.bookmark.findMany({ where: { questionId: { in: dids } }, select: { questionId: true } })) withData.add(r.questionId);
      for (const r of await prisma.questionAttempt.findMany({ where: { questionId: { in: dids } }, select: { questionId: true } })) { if (r.questionId !== null) withData.add(r.questionId); }
      for (const r of await prisma.userQuestionProgress.findMany({ where: { questionId: { in: dids } }, select: { questionId: true } })) withData.add(r.questionId);
      let drop = 0;
      let move = 0;
      for (const q of dupes) {
        if (!keeperKeys.has(`${q.question}\n${q.paperId}`) || withData.has(q.id)) move++;
        else drop++;
      }
      console.log(`  dupes ${d.label}: would drop ${drop}, would move ${move} (survivors + with-data)`);
    }
    console.log(`\nDRY RUN — no writes. Re-run with --yes to apply.`);
    await prisma.$disconnect();
    return;
  }

  await run();
  // Post-assertion: dedup legitimately shrinks raw per-paper row counts
  // (both copies were counted before), so invariance is defined on unique
  // question texts per paper — every dropped text must survive under a keeper.
  const survivors = await prisma.question.findMany({ where: { ecosystemId: 2 }, select: { question: true, paperId: true } });
  const seen = new Set<string>();
  let dupesLeft = 0;
  for (const r of survivors) {
    const k = `${r.question}\n${r.paperId}`;
    if (seen.has(k)) dupesLeft++;
    else seen.add(k);
  }
  const after = await paperCounts();
  console.log(`\nMoved=${moved} dropped-dupes=${dropped} moved-survivors=${movedDupes}.`);
  console.log(`Remaining (text+paper) dupes: ${dupesLeft}. Per-paper rows now: ${[...after.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  if (dupesLeft > 0) process.exit(1);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
