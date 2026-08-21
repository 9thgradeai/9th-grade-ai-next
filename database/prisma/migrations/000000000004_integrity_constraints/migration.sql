-- Migration 000000000004_integrity_constraints
-- Query-matched index (rank computation) + domain CHECK constraints.
--
-- NOTE: Prisma schemas cannot express CHECK constraints; they live here only.
-- Future `migrate diff` runs will NOT re-create them, so any table rebuild
-- must re-apply this block. Bounds mirror the app-layer validation exactly.

CREATE INDEX "UserProgress_points_idx" ON "UserProgress"("points");

ALTER TABLE "UserProgress" ADD CONSTRAINT "userprogress_nonnegative_chk"
  CHECK ("points" >= 0 AND "streak" >= 0 AND "questionsAnswered" >= 0
     AND "flashcardsReviewed" >= 0 AND "aiQuestionsAsked" >= 0 AND "examsAttempted" >= 0);
ALTER TABLE "UserProgress" ADD CONSTRAINT "userprogress_accuracy_range_chk"
  CHECK ("accuracy" BETWEEN 0 AND 100);

ALTER TABLE "DailyQuizParticipation" ADD CONSTRAINT "dqparticipation_score_range_chk"
  CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "DailyQuizParticipation" ADD CONSTRAINT "dqparticipation_counts_chk"
  CHECK ("correct" >= 0 AND "total" >= 0 AND "pointsEarned" >= 0);

ALTER TABLE "FlashcardUserState" ADD CONSTRAINT "fcstate_bounds_chk"
  CHECK ("interval" >= 0 AND "repetitions" >= 0 AND "lapses" >= 0 AND "easeFactor" >= 1);
ALTER TABLE "FlashcardUserState" ADD CONSTRAINT "fcstate_lastrating_range_chk"
  CHECK ("lastRating" IS NULL OR "lastRating" BETWEEN 0 AND 3);

ALTER TABLE "FlashcardReview" ADD CONSTRAINT "fcreview_rating_range_chk"
  CHECK ("rating" BETWEEN 0 AND 3);

ALTER TABLE "MockTestResult" ADD CONSTRAINT "mockresult_score_range_chk"
  CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "MockTestResult" ADD CONSTRAINT "mockresult_counts_chk"
  CHECK ("correct" >= 0 AND "total" >= 0 AND "durationSec" >= 0);

ALTER TABLE "AIMemory" ADD CONSTRAINT "aimemory_confidence_range_chk"
  CHECK ("confidence" BETWEEN 0 AND 100);

ALTER TABLE "AIUsage" ADD CONSTRAINT "aiusage_nonnegative_chk"
  CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0 AND "latencyMs" >= 0 AND "estimatedCostUsd" >= 0);

ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "qattempt_source_enum_chk"
  CHECK ("source" IN ('practice', 'daily', 'exam', 'mock'));
