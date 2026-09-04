-- Migration 000000000006_exam_attempt
-- Adds the ExamAttempt table — the canonical per-user exam submission record
-- that makes exam submission idempotent. Without it, network retries and
-- double-clicks would double-count points and duplicate MockTestResult rows
-- because there was no attempt token to dedupe against.
--
-- Also enforces the new lifecycle CHECK so the column cannot be set to an
-- unknown status.

CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTING', 'SUBMITTED');

CREATE TABLE "ExamAttempt" (
  "id"              SERIAL PRIMARY KEY,
  "userId"          TEXT NOT NULL,
  "idempotencyKey"  TEXT NOT NULL,
  "questionSetHash" TEXT NOT NULL,
  "status"          "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "durationSec"     INTEGER NOT NULL DEFAULT 0,
  "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt"     TIMESTAMP(3),
  "summaryJson"     JSONB,
  "resultId"        INTEGER,
  CONSTRAINT "ExamAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamAttempt_resultId_fkey"
    FOREIGN KEY ("resultId") REFERENCES "MockTestResult"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ExamAttempt_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey"),
  CONSTRAINT "ExamAttempt_resultId_key" UNIQUE ("resultId"),
  CONSTRAINT "ExamAttempt_durationSec_nonnegative_chk" CHECK ("durationSec" >= 0)
);

CREATE INDEX "ExamAttempt_userId_status_idx" ON "ExamAttempt"("userId", "status");
CREATE INDEX "ExamAttempt_userId_submittedAt_idx" ON "ExamAttempt"("userId", "submittedAt");

-- Back-relation on MockTestResult pointing to the (at most one) ExamAttempt
-- that owns this result row. The @unique constraint above is what enforces the
-- one-to-one cardinality — two attempts cannot share a result.
