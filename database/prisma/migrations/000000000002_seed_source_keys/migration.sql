-- Migration 000000000002_seed_source_keys
-- Stable seed identities so the seeder can upsert instead of wipe-and-recreate.
-- User data hanging off content rows (Bookmark, NotificationRead,
-- FlashcardReview, DailyQuizParticipation, QuestionAttempt links) therefore
-- survives every deploy.
--
-- sourceKey convention: md5 of pipe-joined parts, identical to the TS helper
-- in scripts/seed-keys.ts (node crypto md5 hex == PostgreSQL md5() over the
-- same UTF-8 bytes). Parts that may be NULL are COALESCEd to '' on both sides.

ALTER TABLE "Question" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Flashcard" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StudyPlanDay" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExamSchedule" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FlashNews" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Recommendation" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppNotification" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Document" ADD COLUMN "sourceKey" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows (matches scripts/seed-keys.ts sourceKey(...) calls).
UPDATE "Question" SET "sourceKey" = md5("subjectId"::text || '|' || COALESCE("path", '') || '|' || "question") WHERE "sourceKey" = '';
UPDATE "Flashcard" SET "sourceKey" = md5(COALESCE("subjectName", '') || '|' || "question") WHERE "sourceKey" = '';
UPDATE "StudyPlanDay" SET "sourceKey" = md5("day" || '|' || "date") WHERE "sourceKey" = '';
UPDATE "ExamSchedule" SET "sourceKey" = md5(COALESCE("circularNo", '') || '|' || "titleBn" || '|' || COALESCE("year", '')) WHERE "sourceKey" = '';
UPDATE "FlashNews" SET "sourceKey" = md5("titleBn" || '|' || COALESCE("date", '')) WHERE "sourceKey" = '';
UPDATE "Recommendation" SET "sourceKey" = md5("subjectBn" || '|' || "titleBn") WHERE "sourceKey" = '';
UPDATE "AppNotification" SET "sourceKey" = md5("title" || '|' || "message") WHERE "sourceKey" = '';
UPDATE "Document" SET "sourceKey" = md5("title" || '|' || "category" || '|' || COALESCE("year", '')) WHERE "sourceKey" = '';

-- Deduplicate natural keys before adding unique constraints.
-- Only childless tables are delete-deduped; DailyQuiz dupes cascade away
-- participations (seed artifacts); MockTest dupes SetNull their results.

DELETE FROM "QuestionBankCategory" a USING "QuestionBankCategory" b
  WHERE a."label" = b."label" AND a."id" > b."id";
DELETE FROM "ExamArchive" a USING "ExamArchive" b
  WHERE a."name" = b."name" AND a."id" > b."id";
DELETE FROM "Badge" a USING "Badge" b
  WHERE a."name" = b."name" AND a."id" > b."id";
DELETE FROM "OfflinePack" a USING "OfflinePack" b
  WHERE a."name" = b."name" AND a."id" > b."id";
DELETE FROM "DailyQuiz" a USING "DailyQuiz" b
  WHERE a."date" = b."date" AND a."id" > b."id";
DELETE FROM "MockTest" a USING "MockTest" b
  WHERE a."title" = b."title" AND a."id" > b."id";

-- Subjects cannot be safely auto-deduped (deleting one cascades Topics ->
-- Questions -> Bookmarks). Fail loudly if duplicates exist so a human merges.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Subject" GROUP BY "nameBn" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Subject.nameBn rows exist - merge manually before migrating';
  END IF;
END
$$;

-- Unique constraints (natural keys + seed identities).
CREATE UNIQUE INDEX "Subject_nameBn_key" ON "Subject"("nameBn");
CREATE UNIQUE INDEX "Question_subjectId_sourceKey_key" ON "Question"("subjectId", "sourceKey");
CREATE UNIQUE INDEX "Flashcard_sourceKey_key" ON "Flashcard"("sourceKey");
CREATE UNIQUE INDEX "StudyPlanDay_sourceKey_key" ON "StudyPlanDay"("sourceKey");
CREATE UNIQUE INDEX "ExamSchedule_sourceKey_key" ON "ExamSchedule"("sourceKey");
CREATE UNIQUE INDEX "FlashNews_sourceKey_key" ON "FlashNews"("sourceKey");
CREATE UNIQUE INDEX "Recommendation_sourceKey_key" ON "Recommendation"("sourceKey");
CREATE UNIQUE INDEX "AppNotification_sourceKey_key" ON "AppNotification"("sourceKey");
CREATE UNIQUE INDEX "Document_sourceKey_key" ON "Document"("sourceKey");
CREATE UNIQUE INDEX "QuestionBankCategory_label_key" ON "QuestionBankCategory"("label");
CREATE UNIQUE INDEX "ExamArchive_name_key" ON "ExamArchive"("name");
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");
CREATE UNIQUE INDEX "OfflinePack_name_key" ON "OfflinePack"("name");
CREATE UNIQUE INDEX "DailyQuiz_date_key" ON "DailyQuiz"("date");
CREATE UNIQUE INDEX "MockTest_title_key" ON "MockTest"("title");
