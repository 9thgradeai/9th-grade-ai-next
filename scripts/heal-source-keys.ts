/**
 * scripts/heal-source-keys.ts
 * ----------------------------------------------------------------------------
 * Prepares legacy production data for the integrity constraints that ship
 * with the current schema (unique sourceKey / natural-key columns).
 *
 * Runs as part of `db:deploy-sync` (prebuild) BEFORE `prisma db push`:
 *
 *   1. Backfill — rows seeded before sourceKeys existed carry '' keys.
 *      Each is stamped with its model's canonical md5(business key), matching
 *      scripts/seed-keys.ts parity contract (md5(a || '|' || b |...)).
 *   2. De-duplicate — for every group sharing a key, children carrying USER
 *      data are re-pointed to the oldest row (exact twins deleted first),
 *      then duplicate parents are removed.
 *
 * Kept row per duplicate group is always MIN(id). Idempotent: a second run
 * finds nothing to do. All statements use fixed SQL (no user input).
 * ----------------------------------------------------------------------------
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

/** Tables carrying @unique sourceKey → their md5 business-key expression. */
const BACKFILL: Array<[table: string, expr: string]> = [
  ["Flashcard", '"subjectName" || \'|\' || "question"'],
  ["AppNotification", '"title" || \'|\' || "message"'],
  ["Document", '"title" || \'|\' || "category" || \'|\' || "year"'],
  ["ExamSchedule", '"circularNo" || \'|\' || "titleBn" || \'|\' || "year"'],
  ["FlashNews", '"titleBn" || \'|\' || "date"'],
  ["Recommendation", '"subjectBn" || \'|\' || "titleBn"'],
  ["StudyPlanDay", '"day" || \'|\' || "date"'],
];

/**
 * Parent → [childTable, fkColumn, guardColumns]. Children carry user data, so
 * duplicates are re-pointed onto the kept parent instead of cascade-deleted.
 * Guard columns form the child's natural uniqueness (user + item).
 */
const CHILDREN: Array<[parent: string, child: string, fk: string, guards: string[]]> = [
  ["Flashcard", "FlashcardUserState", "flashcardId", ['"userId"']],
  ["Flashcard", "FlashcardReview", "flashcardId", ['"userId"']],
  // StudyTask twins = same plan day + title (template rows are shared, userId null).
  ["StudyPlanDay", "StudyTask", "dayId", ['"userId"', '"title"']],
  ["AppNotification", "NotificationRead", "notificationId", ['"userId"']],
];

async function backfill() {
  for (const [table, expr] of BACKFILL) {
    const res = await p.$executeRawUnsafe(
      `UPDATE "${table}" SET "sourceKey" = md5(${expr}) WHERE "sourceKey" = '' OR "sourceKey" IS NULL`,
    );
    if (res > 0) console.log(`heal: ${table} — backfilled ${res} empty sourceKey(s)`);
  }
}

async function repointChildren() {
  for (const [parent, child, fk, guards] of CHILDREN) {
    const kept = `(SELECT MIN(g.id) FROM "${parent}" g WHERE g."sourceKey" = d."sourceKey")`;
    // 2a. Children whose guard-twin already exists on the kept row cannot be
    //     moved — they duplicate the same user intent on the canonical row.
    const dropped = await p.$executeRawUnsafe(`
      DELETE FROM "${child}" s
      USING "${parent}" d
      WHERE s."${fk}" = d.id
        AND d."sourceKey" <> ''
        AND d.id <> ${kept}
        AND EXISTS (
          SELECT 1 FROM "${child}" x
          WHERE x."${fk}" = ${kept}
            AND ${guards.map((g) => `x.${g} IS NOT DISTINCT FROM s.${g}`).join(" AND ")}
        )
    `.replace(/\s+/g, " "));
    if (dropped > 0) console.log(`heal: ${child} — dropped ${dropped} conflicting twin(s)`);

    // 2b. Move everything else onto the kept row.
    const moved = await p.$executeRawUnsafe(`
      UPDATE "${child}" s
      SET "${fk}" = ${kept}
      FROM "${parent}" d
      WHERE s."${fk}" = d.id
        AND d."sourceKey" <> ''
        AND d.id <> ${kept}
        AND NOT EXISTS (
          SELECT 1 FROM "${child}" x
          WHERE x."${fk}" = ${kept}
            AND ${guards.map((g) => `x.${g} IS NOT DISTINCT FROM s.${g}`).join(" AND ")}
        )
    `.replace(/\s+/g, " "));
    if (moved > 0) console.log(`heal: ${child} — re-pointed ${moved} row(s)`);
  }
}

async function dedupeParents() {
  for (const [table] of BACKFILL) {
    const removed = await p.$executeRawUnsafe(`
      DELETE FROM "${table}" d
      WHERE d."sourceKey" <> ''
        AND EXISTS (
          SELECT 1 FROM "${table}" k
          WHERE k."sourceKey" = d."sourceKey" AND k.id < d.id
        )
    `.replace(/\s+/g, " "));
    if (removed > 0) console.log(`heal: ${table} — removed ${removed} duplicate(s)`);
  }
}

async function dedupeQuestions() {
  // Questions duplicated across old seeding generations (flat file vs folder
  // imports). Group by CONTENT identity (subjectId + question text); keep the
  // oldest row. Bookmarks are re-pointed onto it; attempts survive via
  // onDelete: SetNull (they retain subjectName/topic for analytics).
  const kept = `(SELECT MIN(k.id) FROM "Question" k
                 WHERE k."subjectId" = d."subjectId" AND k."question" = d."question")`;

  // Conflicting bookmark twins (same user already bookmarked the kept row).
  const droppedMarks = await p.$executeRawUnsafe(`
    DELETE FROM "Bookmark" s
    USING "Question" d
    WHERE s."questionId" = d.id
      AND EXISTS (SELECT 1 FROM "Bookmark" x
                  WHERE x."userId" = s."userId" AND x."questionId" = ${kept})
      AND d.id <> ${kept}
  `.replace(/\s+/g, " "));
  if (droppedMarks > 0) console.log(`heal: Bookmark — dropped ${droppedMarks} conflicting twin(s)`);

  const movedMarks = await p.$executeRawUnsafe(`
    UPDATE "Bookmark" s
    SET "questionId" = ${kept}
    FROM "Question" d
    WHERE s."questionId" = d.id AND d.id <> ${kept}
  `.replace(/\s+/g, " "));
  if (movedMarks > 0) console.log(`heal: Bookmark — re-pointed ${movedMarks} bookmark(s)`);

  const removed = await p.$executeRawUnsafe(`
    DELETE FROM "Question" d
    WHERE d.id <> ${kept}
  `.replace(/\s+/g, " "));
  if (removed > 0) console.log(`heal: Question — removed ${removed} duplicate(s)`);
}

async function report() {
  for (const [table] of BACKFILL) {
    const rows = await p.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM (
         SELECT "sourceKey" FROM "${table}"
         WHERE "sourceKey" <> ''
         GROUP BY "sourceKey" HAVING COUNT(*) > 1
       ) x`,
    );
    if (Number(rows[0]?.n ?? 0) > 0) {
      console.warn(`heal: WARNING — ${table} still has ${rows[0].n} duplicate group(s)`);
    }
  }
}

async function main() {
  await backfill();
  await repointChildren();
  await dedupeParents();
  await dedupeQuestions();
  await report();
}

main()
  .catch((e) => {
    console.error("heal failed:", e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
