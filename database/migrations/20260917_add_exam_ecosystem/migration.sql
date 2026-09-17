-- Migration: Add Exam Ecosystem
-- Date: 2026-09-17
-- Purpose: Introduce first-class exam ecosystem boundary for BCS + Bangladesh Bank isolation
-- Strategy: Additive only — noDROP, no data loss. Nullable columns first, backfill, then NOT NULL.

-- Step 1: Create enum
CREATE TYPE "ExamEcosystemCode" AS ENUM ('BCS', 'BANGLADESH_BANK');

-- Step 2: Create ExamEcosystem table
CREATE TABLE "ExamEcosystem" (
    "id" SERIAL PRIMARY KEY,
    "code" "ExamEcosystemCode" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "descriptionBn" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamEcosystem_code_key" UNIQUE ("code"),
    CONSTRAINT "ExamEcosystem_slug_key" UNIQUE ("slug")
);
CREATE INDEX "ExamEcosystem_sortOrder_idx" ON "ExamEcosystem"("sortOrder");

-- Step 3: Seed BCS and Bangladesh Bank ecosystems
INSERT INTO "ExamEcosystem" ("code", "slug", "name", "nameBn", "description", "descriptionBn", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('BCS', 'bcs', 'BCS', 'বিসিএস', 'Bangladesh Civil Service examination', 'বাংলাদেশ সিভিল সার্ভিস পরীক্ষা', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('BANGLADESH_BANK', 'bangladesh-bank', 'Bangladesh Bank', 'বাংলাদেশ ব্যাংক', 'Bangladesh Bank recruitment examinations', 'বাংলাদেশ ব্যাংক নিয়োগ পরীক্ষা', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Step 4: Add nullable ecosystemId columns (safe — no constraint yet)
ALTER TABLE "Subject" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "ExamCategory" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "Question" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "DailyQuiz" ADD COLUMN "ecosystemId" INTEGER;
ALTER TABLE "QuestionAttempt" ADD COLUMN "ecosystemId" INTEGER;

-- Step 5: Backfill all existing rows to BCS ecosystem
UPDATE "Subject" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "ExamCategory" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "Question" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "DailyQuiz" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');
UPDATE "QuestionAttempt" SET "ecosystemId" = (SELECT id FROM "ExamEcosystem" WHERE code = 'BCS');

-- Step 6: Verify zero NULLs (run manually after backfill)
-- SELECT COUNT(*) FROM "Subject" WHERE "ecosystemId" IS NULL;
-- SELECT COUNT(*) FROM "ExamCategory" WHERE "ecosystemId" IS NULL;
-- SELECT COUNT(*) FROM "Question" WHERE "ecosystemId" IS NULL;
-- SELECT COUNT(*) FROM "DailyQuiz" WHERE "ecosystemId" IS NULL;
-- SELECT COUNT(*) FROM "QuestionAttempt" WHERE "ecosystemId" IS NULL;

-- Step 7: Add NOT NULL constraints (safe after backfill)
ALTER TABLE "Subject" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "ExamCategory" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "Question" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "DailyQuiz" ALTER COLUMN "ecosystemId" SET NOT NULL;
ALTER TABLE "QuestionAttempt" ALTER COLUMN "ecosystemId" SET NOT NULL;

-- Step 8: Add FK constraints
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_ecosystemId_fkey"
    FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamCategory" ADD CONSTRAINT "ExamCategory_ecosystemId_fkey"
    FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_ecosystemId_fkey"
    FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyQuiz" ADD CONSTRAINT "DailyQuiz_ecosystemId_fkey"
    FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_ecosystemId_fkey"
    FOREIGN KEY ("ecosystemId") REFERENCES "ExamEcosystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 9: Drop old Subject nameBn unique constraint, add composite
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_nameBn_key";
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_ecosystemId_nameBn_key" UNIQUE ("ecosystemId", "nameBn");

-- Step 10: Add new composite unique for ExamCategory (ecosystemId, slug)
-- Note: slug is already globally unique via ExamCategory_slug_key, this adds ecosystem-scoped uniqueness
ALTER TABLE "ExamCategory" ADD CONSTRAINT "ExamCategory_ecosystemId_slug_key" UNIQUE ("ecosystemId", "slug");

-- Step 11: Add new composite unique for DailyQuiz
ALTER TABLE "DailyQuiz" DROP CONSTRAINT "DailyQuiz_date_key";
ALTER TABLE "DailyQuiz" ADD CONSTRAINT "DailyQuiz_ecosystemId_date_key" UNIQUE ("ecosystemId", "date");

-- Step 12: Add new indexes
CREATE INDEX "Subject_ecosystemId_idx" ON "Subject"("ecosystemId");
CREATE INDEX "ExamCategory_ecosystemId_idx" ON "ExamCategory"("ecosystemId");
CREATE INDEX "Question_ecosystemId_idx" ON "Question"("ecosystemId");
CREATE INDEX "Question_ecosystemId_subjectId_idx" ON "Question"("ecosystemId", "subjectId");
CREATE INDEX "Question_ecosystemId_subjectId_difficulty_idx" ON "Question"("ecosystemId", "subjectId", "difficulty");
CREATE INDEX "Question_ecosystemId_subjectId_path_idx" ON "Question"("ecosystemId", "subjectId", "path");
CREATE INDEX "Question_ecosystemId_subjectId_topic_subtopic_idx" ON "Question"("ecosystemId", "subjectId", "topic", "subtopic");
CREATE INDEX "DailyQuiz_ecosystemId_date_idx" ON "DailyQuiz"("ecosystemId", "date");
CREATE INDEX "QuestionAttempt_ecosystemId_userId_createdAt_idx" ON "QuestionAttempt"("ecosystemId", "userId", "createdAt");
CREATE INDEX "QuestionAttempt_ecosystemId_userId_subjectId_idx" ON "QuestionAttempt"("ecosystemId", "userId", "subjectId");
CREATE INDEX "QuestionAttempt_ecosystemId_userId_subjectName_idx" ON "QuestionAttempt"("ecosystemId", "userId", "subjectName");
CREATE INDEX "QuestionAttempt_ecosystemId_userId_topic_idx" ON "QuestionAttempt"("ecosystemId", "userId", "topic");

-- Step 13: Drop old indexes that are now superseded by ecosystem-prefixed composites
DROP INDEX IF EXISTS "Subject_sortOrder_idx";
DROP INDEX IF EXISTS "Question_subjectId_difficulty_idx";
DROP INDEX IF EXISTS "Question_subjectId_path_idx";
DROP INDEX IF EXISTS "Question_subjectId_topic_subtopic_idx";
DROP INDEX IF EXISTS "QuestionAttempt_userId_createdAt_idx";
DROP INDEX IF EXISTS "QuestionAttempt_userId_subjectId_idx";
DROP INDEX IF EXISTS "QuestionAttempt_userId_subjectName_idx";
DROP INDEX IF EXISTS "QuestionAttempt_userId_topic_idx";
