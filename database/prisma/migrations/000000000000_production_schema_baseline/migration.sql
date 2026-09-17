-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'ADMIN', 'BANNED');
-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('ACTIVE', 'AVAILABLE', 'NEW');
-- CreateEnum
CREATE TYPE "ExamStage" AS ENUM ('PRELIMINARY', 'WRITTEN', 'VIVA', 'OTHER');
-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('OFFICIAL', 'CURATED', 'UNKNOWN');
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'REMINDER');
-- CreateEnum
CREATE TYPE "BadgeRarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');
-- CreateEnum
CREATE TYPE "AIConversationKind" AS ENUM ('TUTOR', 'ASSISTANT', 'SOLVER');
-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
-- CreateEnum
CREATE TYPE "AIMessageStatus" AS ENUM ('COMPLETE', 'STREAMING', 'FAILED');
-- CreateEnum
CREATE TYPE "AIMemoryType" AS ENUM ('WEAK_TOPIC', 'STRONG_TOPIC', 'RECURRING_MISTAKE', 'PREFERRED_LANGUAGE', 'LEARNING_PREFERENCE', 'EXAM_GOAL', 'DIFFICULTY_PREFERENCE', 'CORRECTION');
-- CreateEnum
CREATE TYPE "AIMemorySource" AS ENUM ('INFERRED', 'USER', 'SYSTEM');
-- CreateEnum
CREATE TYPE "AIUsageTask" AS ENUM ('TUTOR', 'SOLVER', 'ASSISTANT');
-- CreateEnum
CREATE TYPE "AIFeedbackRating" AS ENUM ('HELPFUL', 'NOT_HELPFUL');
-- CreateEnum
CREATE TYPE "DailyQuizParticipationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
-- CreateEnum
CREATE TYPE "MasteryStatus" AS ENUM ('NEW', 'STRUGGLING', 'REVIEWING', 'IMPROVING', 'MASTERED');
-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
-- CreateEnum
CREATE TYPE "LearningEventType" AS ENUM ('SESSION_STARTED', 'SESSION_COMPLETED', 'QUESTION_ATTEMPTED', 'QUESTION_CORRECT', 'QUESTION_WRONG', 'QUESTION_SKIPPED', 'TOPIC_REVIEWED', 'REVISION_COMPLETED', 'MOCK_EXAM_COMPLETED', 'AI_EXPLANATION_REQUESTED', 'AI_TUTOR_SESSION', 'STUDY_PLAN_CREATED', 'STUDY_PLAN_COMPLETED');
-- CreateEnum
CREATE TYPE "MistakeErrorType" AS ENUM ('CONCEPTUAL_GAP', 'CARELESS_MISTAKE', 'MEMORY_FAILURE', 'MISREADING', 'CALCULATION_ERROR', 'CONFUSION', 'GUESSING', 'TIME_PRESSURE', 'UNKNOWN');
-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTING', 'SUBMITTED');
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "handle" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "googleId" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'password',
    "imageUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "examTarget" TEXT,
    "examDate" TIMESTAMP(3),
    "prepLevel" TEXT,
    "studyHoursPerDay" INTEGER,
    "goal" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifyExpires" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "sessions" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "nameBn" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📘',
    "color" TEXT DEFAULT 'text-emerald-400',
    "bg" TEXT DEFAULT 'bg-emerald-500/10',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Topic" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "questionCount" TEXT NOT NULL DEFAULT '0',
    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ExamCategory" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📘',
    "color" TEXT NOT NULL DEFAULT 'text-emerald-400',
    "bg" TEXT NOT NULL DEFAULT 'bg-emerald-500/10',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ExamCategory_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Exam" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "type" "ExamStage" NOT NULL DEFAULT 'PRELIMINARY',
    "durationMin" INTEGER,
    "totalQuestions" INTEGER,
    "year" INTEGER,
    "heldOn" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "titleBn" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bcsTerm" INTEGER,
    "termLabel" TEXT,
    "year" INTEGER,
    "heldOn" TIMESTAMP(3),
    "durationMin" INTEGER,
    "totalQuestions" INTEGER,
    "availableQuestions" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT '',
    "provenance" "Provenance" NOT NULL DEFAULT 'UNKNOWN',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Question" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "topicId" INTEGER,
    "path" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "subtopic" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "year" INTEGER,
    "sourceExam" TEXT NOT NULL DEFAULT '',
    "bcsTerm" TEXT,
    "examId" INTEGER,
    "paperId" INTEGER,
    "questionNumber" INTEGER,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "QuestionBankCategory" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER,
    "label" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuestionBankCategory_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ExamArchive" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🎯',
    "count" INTEGER NOT NULL DEFAULT 0,
    "yearRange" TEXT NOT NULL DEFAULT '',
    "status" "QuizStatus" NOT NULL DEFAULT 'ACTIVE',
    "accent" TEXT,
    CONSTRAINT "ExamArchive_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Flashcard" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER,
    "subjectName" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "nextReview" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "FlashcardUserState" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "flashcardId" INTEGER NOT NULL,
    "nextReview" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FlashcardUserState_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StudyPlanDay" (
    "id" SERIAL NOT NULL,
    "day" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "focusAreas" JSONB NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "StudyPlanDay_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StudyTask" (
    "id" SERIAL NOT NULL,
    "dayId" INTEGER NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL DEFAULT '',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyTask_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StudyTaskCompletion" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyTaskCompletion_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "DailyQuiz" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyQuiz_pkey" PRIMARY KEY ("id")
);
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
-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" SERIAL NOT NULL,
    "dailyQuizId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "MockTest" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MockTest_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "MockTestQuestion" (
    "id" SERIAL NOT NULL,
    "mockTestId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "MockTestQuestion_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ExamSchedule" (
    "id" SERIAL NOT NULL,
    "titleBn" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'BCS',
    "date" TIMESTAMP(3) NOT NULL,
    "year" TEXT NOT NULL DEFAULT '',
    "circularNo" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ExamSchedule_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "FlashNews" (
    "id" SERIAL NOT NULL,
    "tag" TEXT NOT NULL DEFAULT 'EXAM',
    "titleBn" TEXT NOT NULL,
    "titleEn" TEXT DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "full" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "readTime" INTEGER NOT NULL DEFAULT 1,
    "categoryBn" TEXT DEFAULT '',
    "categoryEn" TEXT DEFAULT '',
    "sourceUrl" TEXT DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "FlashNews_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Recommendation" (
    "id" SERIAL NOT NULL,
    "subjectBn" TEXT NOT NULL,
    "subjectEn" TEXT DEFAULT '',
    "metric" TEXT NOT NULL DEFAULT 'accuracy',
    "accuracy" INTEGER NOT NULL DEFAULT 0,
    "titleBn" TEXT NOT NULL,
    "titleEn" TEXT DEFAULT '',
    "descriptionBn" TEXT NOT NULL,
    "descriptionEn" TEXT DEFAULT '',
    "ctaBn" TEXT NOT NULL,
    "ctaEn" TEXT DEFAULT '',
    "sourceKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Badge" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🏅',
    "rarity" "BadgeRarity" NOT NULL DEFAULT 'COMMON',
    "unlockedSeed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "UserBadge" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AppNotification" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "OfflinePack" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT '',
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "subject" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "OfflinePack_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Syllabus',
    "type" TEXT NOT NULL DEFAULT 'md',
    "url" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "UserProgress" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "accuracy" INTEGER NOT NULL DEFAULT 0,
    "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
    "flashcardsReviewed" INTEGER NOT NULL DEFAULT 0,
    "aiQuestionsAsked" INTEGER NOT NULL DEFAULT 0,
    "examsAttempted" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Bookmark" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" INTEGER,
    "subjectId" INTEGER,
    "subjectName" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "correct" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'practice',
    "selectedAnswer" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER,
    "errorType" "MistakeErrorType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "MockTestResult" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "mockTestId" INTEGER,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MockTestResult_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "questionSetHash" TEXT NOT NULL,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "examDurationSec" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "resultId" INTEGER,
    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "FlashcardReview" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "flashcardId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlashcardReview_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "NotificationRead" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AIConversationKind" NOT NULL DEFAULT 'TUTOR',
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "subjectId" INTEGER,
    "topicId" INTEGER,
    "topicPath" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "status" "AIMessageStatus" NOT NULL DEFAULT 'COMPLETE',
    "content" TEXT NOT NULL,
    "intent" TEXT DEFAULT '',
    "provider" TEXT DEFAULT '',
    "model" TEXT DEFAULT '',
    "metadata" JSONB,
    "errorCode" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AIMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AIMemoryType" NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" "AIMemorySource" NOT NULL DEFAULT 'INFERRED',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIMemory_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "task" "AIUsageTask" NOT NULL,
    "intent" TEXT DEFAULT '',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT DEFAULT '',
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AIFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "rating" "AIFeedbackRating" NOT NULL,
    "category" TEXT DEFAULT '',
    "comment" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIFeedback_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "UserQuestionProgress" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "correctAttempts" INTEGER NOT NULL DEFAULT 0,
    "incorrectAttempts" INTEGER NOT NULL DEFAULT 0,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "consecutiveIncorrect" INTEGER NOT NULL DEFAULT 0,
    "mistakeCount" INTEGER NOT NULL DEFAULT 0,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masteryStatus" "MasteryStatus" NOT NULL DEFAULT 'NEW',
    "masteredAt" TIMESTAMP(3),
    "isMistake" BOOLEAN NOT NULL DEFAULT false,
    "firstIncorrectAt" TIMESTAMP(3),
    "lastIncorrectAt" TIMESTAMP(3),
    "lastCorrectAt" TIMESTAMP(3),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "lastSubject" TEXT NOT NULL DEFAULT '',
    "lastTopic" TEXT NOT NULL DEFAULT '',
    "lastExam" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserQuestionProgress_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "intent" TEXT NOT NULL DEFAULT '',
    "status" "AgentRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "steps" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT DEFAULT '',
    "provider" TEXT DEFAULT '',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT DEFAULT '',
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "AgentToolCall" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "argumentsJson" JSONB NOT NULL,
    "resultJson" JSONB,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LearningEventType" NOT NULL,
    "subjectId" INTEGER,
    "topicId" INTEGER,
    "questionId" INTEGER,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
-- CreateIndex
CREATE UNIQUE INDEX "Subject_nameBn_key" ON "Subject"("nameBn");
-- CreateIndex
CREATE INDEX "Subject_sortOrder_idx" ON "Subject"("sortOrder");
-- CreateIndex
CREATE INDEX "Topic_subjectId_parentId_idx" ON "Topic"("subjectId", "parentId");
-- CreateIndex
CREATE UNIQUE INDEX "Topic_subjectId_path_key" ON "Topic"("subjectId", "path");
-- CreateIndex
CREATE UNIQUE INDEX "ExamCategory_slug_key" ON "ExamCategory"("slug");
-- CreateIndex
CREATE INDEX "ExamCategory_sortOrder_idx" ON "ExamCategory"("sortOrder");
-- CreateIndex
CREATE UNIQUE INDEX "Exam_slug_key" ON "Exam"("slug");
-- CreateIndex
CREATE INDEX "Exam_categoryId_sortOrder_idx" ON "Exam"("categoryId", "sortOrder");
-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_slug_key" ON "ExamPaper"("slug");
-- CreateIndex
CREATE INDEX "ExamPaper_examId_bcsTerm_idx" ON "ExamPaper"("examId", "bcsTerm");
-- CreateIndex
CREATE INDEX "ExamPaper_year_idx" ON "ExamPaper"("year");
-- CreateIndex
CREATE INDEX "Question_subjectId_difficulty_idx" ON "Question"("subjectId", "difficulty");
-- CreateIndex
CREATE INDEX "Question_subjectId_path_idx" ON "Question"("subjectId", "path");
-- CreateIndex
CREATE INDEX "Question_topicId_idx" ON "Question"("topicId");
-- CreateIndex
CREATE INDEX "Question_subjectId_topic_subtopic_idx" ON "Question"("subjectId", "topic", "subtopic");
-- CreateIndex
CREATE INDEX "Question_examId_idx" ON "Question"("examId");
-- CreateIndex
CREATE INDEX "Question_paperId_questionNumber_idx" ON "Question"("paperId", "questionNumber");
-- CreateIndex
CREATE UNIQUE INDEX "Question_subjectId_sourceKey_key" ON "Question"("subjectId", "sourceKey");
-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankCategory_label_key" ON "QuestionBankCategory"("label");
-- CreateIndex
CREATE UNIQUE INDEX "ExamArchive_name_key" ON "ExamArchive"("name");
-- CreateIndex
CREATE UNIQUE INDEX "Flashcard_sourceKey_key" ON "Flashcard"("sourceKey");
-- CreateIndex
CREATE INDEX "Flashcard_subjectId_idx" ON "Flashcard"("subjectId");
-- CreateIndex
CREATE INDEX "Flashcard_nextReview_idx" ON "Flashcard"("nextReview");
-- CreateIndex
CREATE INDEX "FlashcardUserState_userId_nextReview_idx" ON "FlashcardUserState"("userId", "nextReview");
-- CreateIndex
CREATE UNIQUE INDEX "FlashcardUserState_userId_flashcardId_key" ON "FlashcardUserState"("userId", "flashcardId");
-- CreateIndex
CREATE UNIQUE INDEX "StudyPlanDay_sourceKey_key" ON "StudyPlanDay"("sourceKey");
-- CreateIndex
CREATE INDEX "StudyPlanDay_date_idx" ON "StudyPlanDay"("date");
-- CreateIndex
CREATE INDEX "StudyTask_userId_idx" ON "StudyTask"("userId");
-- CreateIndex
CREATE INDEX "StudyTask_dayId_userId_idx" ON "StudyTask"("dayId", "userId");
-- CreateIndex
CREATE INDEX "StudyTaskCompletion_userId_idx" ON "StudyTaskCompletion"("userId");
-- CreateIndex
CREATE UNIQUE INDEX "StudyTaskCompletion_userId_taskId_key" ON "StudyTaskCompletion"("userId", "taskId");
-- CreateIndex
CREATE UNIQUE INDEX "DailyQuiz_date_key" ON "DailyQuiz"("date");
-- CreateIndex
CREATE INDEX "DailyQuizParticipation_quizId_idx" ON "DailyQuizParticipation"("quizId");
-- CreateIndex
CREATE INDEX "DailyQuizParticipation_userId_completedAt_idx" ON "DailyQuizParticipation"("userId", "completedAt");
-- CreateIndex
CREATE UNIQUE INDEX "DailyQuizParticipation_userId_quizId_key" ON "DailyQuizParticipation"("userId", "quizId");
-- CreateIndex
CREATE INDEX "QuizQuestion_dailyQuizId_idx" ON "QuizQuestion"("dailyQuizId");
-- CreateIndex
CREATE UNIQUE INDEX "MockTest_title_key" ON "MockTest"("title");
-- CreateIndex
CREATE UNIQUE INDEX "ExamSchedule_sourceKey_key" ON "ExamSchedule"("sourceKey");
-- CreateIndex
CREATE INDEX "ExamSchedule_date_idx" ON "ExamSchedule"("date");
-- CreateIndex
CREATE INDEX "ExamSchedule_type_idx" ON "ExamSchedule"("type");
-- CreateIndex
CREATE UNIQUE INDEX "FlashNews_sourceKey_key" ON "FlashNews"("sourceKey");
-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_sourceKey_key" ON "Recommendation"("sourceKey");
-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");
-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");
-- CreateIndex
CREATE UNIQUE INDEX "AppNotification_sourceKey_key" ON "AppNotification"("sourceKey");
-- CreateIndex
CREATE INDEX "AppNotification_userId_idx" ON "AppNotification"("userId");
-- CreateIndex
CREATE INDEX "AppNotification_timestamp_id_idx" ON "AppNotification"("timestamp", "id");
-- CreateIndex
CREATE UNIQUE INDEX "OfflinePack_name_key" ON "OfflinePack"("name");
-- CreateIndex
CREATE UNIQUE INDEX "Document_sourceKey_key" ON "Document"("sourceKey");
-- CreateIndex
CREATE UNIQUE INDEX "UserProgress_userId_key" ON "UserProgress"("userId");
-- CreateIndex
CREATE INDEX "UserProgress_points_idx" ON "UserProgress"("points");
-- CreateIndex
CREATE INDEX "Bookmark_questionId_idx" ON "Bookmark"("questionId");
-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_questionId_key" ON "Bookmark"("userId", "questionId");
-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_createdAt_idx" ON "QuestionAttempt"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_subjectId_idx" ON "QuestionAttempt"("userId", "subjectId");
-- CreateIndex
CREATE INDEX "QuestionAttempt_questionId_idx" ON "QuestionAttempt"("questionId");
-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_subjectName_idx" ON "QuestionAttempt"("userId", "subjectName");
-- CreateIndex
CREATE INDEX "QuestionAttempt_userId_topic_idx" ON "QuestionAttempt"("userId", "topic");
-- CreateIndex
CREATE INDEX "MockTestResult_userId_createdAt_idx" ON "MockTestResult"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "MockTestResult_mockTestId_idx" ON "MockTestResult"("mockTestId");
-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_resultId_key" ON "ExamAttempt"("resultId");
-- CreateIndex
CREATE INDEX "ExamAttempt_userId_status_idx" ON "ExamAttempt"("userId", "status");
-- CreateIndex
CREATE INDEX "ExamAttempt_userId_submittedAt_idx" ON "ExamAttempt"("userId", "submittedAt");
-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_userId_idempotencyKey_key" ON "ExamAttempt"("userId", "idempotencyKey");
-- CreateIndex
CREATE INDEX "FlashcardReview_userId_flashcardId_idx" ON "FlashcardReview"("userId", "flashcardId");
-- CreateIndex
CREATE INDEX "FlashcardReview_flashcardId_idx" ON "FlashcardReview"("flashcardId");
-- CreateIndex
CREATE UNIQUE INDEX "NotificationRead_userId_notificationId_key" ON "NotificationRead"("userId", "notificationId");
-- CreateIndex
CREATE INDEX "AIConversation_userId_updatedAt_idx" ON "AIConversation"("userId", "updatedAt");
-- CreateIndex
CREATE INDEX "AIConversation_userId_kind_updatedAt_idx" ON "AIConversation"("userId", "kind", "updatedAt");
-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");
-- CreateIndex
CREATE INDEX "AIMemory_userId_type_idx" ON "AIMemory"("userId", "type");
-- CreateIndex
CREATE UNIQUE INDEX "AIMemory_userId_type_key_key" ON "AIMemory"("userId", "type", "key");
-- CreateIndex
CREATE INDEX "AIUsage_userId_createdAt_idx" ON "AIUsage"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "AIUsage_userId_task_createdAt_idx" ON "AIUsage"("userId", "task", "createdAt");
-- CreateIndex
CREATE INDEX "AIUsage_task_createdAt_idx" ON "AIUsage"("task", "createdAt");
-- CreateIndex
CREATE INDEX "AIUsage_model_createdAt_idx" ON "AIUsage"("model", "createdAt");
-- CreateIndex
CREATE INDEX "AIFeedback_userId_createdAt_idx" ON "AIFeedback"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "AIFeedback_messageId_idx" ON "AIFeedback"("messageId");
-- CreateIndex
CREATE INDEX "UserQuestionProgress_userId_isMistake_idx" ON "UserQuestionProgress"("userId", "isMistake");
-- CreateIndex
CREATE INDEX "UserQuestionProgress_userId_lastSubject_idx" ON "UserQuestionProgress"("userId", "lastSubject");
-- CreateIndex
CREATE INDEX "UserQuestionProgress_userId_masteryStatus_idx" ON "UserQuestionProgress"("userId", "masteryStatus");
-- CreateIndex
CREATE INDEX "UserQuestionProgress_userId_lastIncorrectAt_idx" ON "UserQuestionProgress"("userId", "lastIncorrectAt");
-- CreateIndex
CREATE INDEX "UserQuestionProgress_userId_nextReviewAt_idx" ON "UserQuestionProgress"("userId", "nextReviewAt");
-- CreateIndex
CREATE INDEX "UserQuestionProgress_questionId_idx" ON "UserQuestionProgress"("questionId");
-- CreateIndex
CREATE UNIQUE INDEX "UserQuestionProgress_userId_questionId_key" ON "UserQuestionProgress"("userId", "questionId");
-- CreateIndex
CREATE INDEX "AgentRun_userId_createdAt_idx" ON "AgentRun"("userId", "createdAt");
-- CreateIndex
CREATE INDEX "AgentRun_conversationId_idx" ON "AgentRun"("conversationId");
-- CreateIndex
CREATE INDEX "AgentToolCall_runId_idx" ON "AgentToolCall"("runId");
-- CreateIndex
CREATE INDEX "LearningEvent_userId_occurredAt_idx" ON "LearningEvent"("userId", "occurredAt");
-- CreateIndex
CREATE INDEX "LearningEvent_userId_type_idx" ON "LearningEvent"("userId", "type");
-- CreateIndex
CREATE INDEX "LearningEvent_userId_subjectId_occurredAt_idx" ON "LearningEvent"("userId", "subjectId", "occurredAt");
-- CreateIndex
CREATE INDEX "LearningEvent_userId_topicId_occurredAt_idx" ON "LearningEvent"("userId", "topicId", "occurredAt");
-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExamCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuestionBankCategory" ADD CONSTRAINT "QuestionBankCategory_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FlashcardUserState" ADD CONSTRAINT "FlashcardUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FlashcardUserState" ADD CONSTRAINT "FlashcardUserState_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudyTask" ADD CONSTRAINT "StudyTask_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "StudyPlanDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudyTask" ADD CONSTRAINT "StudyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudyTaskCompletion" ADD CONSTRAINT "StudyTaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudyTaskCompletion" ADD CONSTRAINT "StudyTaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StudyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DailyQuizParticipation" ADD CONSTRAINT "DailyQuizParticipation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "DailyQuizParticipation" ADD CONSTRAINT "DailyQuizParticipation_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "DailyQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_dailyQuizId_fkey" FOREIGN KEY ("dailyQuizId") REFERENCES "DailyQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MockTestQuestion" ADD CONSTRAINT "MockTestQuestion_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MockTestResult" ADD CONSTRAINT "MockTestResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MockTestResult" ADD CONSTRAINT "MockTestResult_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MockTestResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "AppNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIMemory" ADD CONSTRAINT "AIMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AIFeedback" ADD CONSTRAINT "AIFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AIMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "UserQuestionProgress" ADD CONSTRAINT "UserQuestionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "UserQuestionProgress" ADD CONSTRAINT "UserQuestionProgress_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
