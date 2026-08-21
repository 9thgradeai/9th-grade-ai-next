-- CreateEnum
CREATE TYPE "DailyQuizParticipationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "DailyQuizParticipation" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" INTEGER NOT NULL,
    "status" "DailyQuizParticipationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyQuizParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyQuizParticipation_quizId_idx" ON "DailyQuizParticipation"("quizId");

-- CreateIndex
CREATE INDEX "DailyQuizParticipation_userId_completedAt_idx" ON "DailyQuizParticipation"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuizParticipation_userId_quizId_key" ON "DailyQuizParticipation"("userId", "quizId");

-- AddForeignKey
ALTER TABLE "DailyQuizParticipation" ADD CONSTRAINT "DailyQuizParticipation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizParticipation" ADD CONSTRAINT "DailyQuizParticipation_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "DailyQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

