/**
 * scripts/heal-source-keys.ts
 * ----------------------------------------------------------------------------
 * Prepares legacy production data for the integrity constraints that ship
 * with the current schema (unique sourceKey / natural-key columns).
 *
 * Runs as part of `db:deploy-sync` (prebuild) BEFORE `prisma db push`:
 *
 *   0. Bootstrap — ensures ExamEcosystem table and BCS row exist so that
 *      prisma db push can add FK columns referencing it without errors.
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

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set — skipping heal-source-keys");
  process.exit(0);
}

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
  // Composite unique (subjectId, sourceKey); parity with seedQuestions'
  // sourceKey(subjectId, path, question).
  ["Question", '"subjectId"::text || \'|\' || COALESCE("path", \'\') || \'|\' || "question"'],
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

async function bootstrapEcosystems() {
  // Create the ExamEcosystem table if it doesn't exist, and ensure BCS (id=1)
  // exists so that prisma db push can add FK columns referencing it.
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ExamEcosystem" (
      "id" SERIAL PRIMARY KEY,
      "code" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "nameBn" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "descriptionBn" TEXT NOT NULL DEFAULT '',
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ExamEcosystem_code_key" UNIQUE ("code"),
      CONSTRAINT "ExamEcosystem_slug_key" UNIQUE ("slug")
    )
  `);

  // Insert BCS ecosystem with id=1 if it doesn't exist.
  await p.$executeRawUnsafe(`
    INSERT INTO "ExamEcosystem" ("id", "code", "slug", "name", "nameBn", "description", "descriptionBn", "isActive", "sortOrder", "createdAt", "updatedAt")
    VALUES (1, 'BCS', 'bcs', 'BCS', 'বিসিএস', 'Bangladesh Civil Service examination', 'বাংলাদেশ সিভিল সার্ভিস পরীক্ষা', true, 1, NOW(), NOW())
    ON CONFLICT ("code") DO NOTHING
  `);

  // Also insert Bangladesh Bank ecosystem.
  await p.$executeRawUnsafe(`
    INSERT INTO "ExamEcosystem" ("code", "slug", "name", "nameBn", "description", "descriptionBn", "isActive", "sortOrder", "createdAt", "updatedAt")
    VALUES ('BANGLADESH_BANK', 'bangladesh-bank', 'Bangladesh Bank', 'বাংলাদেশ ব্যাংক', 'Bangladesh Bank recruitment examination', 'বাংলাদেশ ব্যাংক নিয়োগ পরীক্ষা', true, 2, NOW(), NOW())
    ON CONFLICT ("code") DO NOTHING
  `);

  console.log("heal: ExamEcosystem table and BCS/BB rows bootstrapped");
}

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
  await bootstrapEcosystems();
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
