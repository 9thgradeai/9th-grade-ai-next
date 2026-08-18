# Database

## Schema

### Enums

#### UserRole
- `STUDENT`
- `ADMIN`

#### Difficulty
- `EASY`
- `MEDIUM`
- `HARD`

#### Priority
- `LOW`
- `MEDIUM`
- `HIGH`

#### QuizStatus
- `ACTIVE`
- `AVAILABLE`
- `NEW`

#### NotificationType
- `INFO`
- `SUCCESS`
- `WARNING`
- `REMINDER`

#### BadgeRarity
- `COMMON`
- `RARE`
- `EPIC`
- `LEGENDARY`

### Models

#### User
- `id` String (cuid) — PK
- `name` String
- `email` String — unique, indexed
- `emailVerified` Boolean — default `false`
- `handle` String — unique, indexed
- `passwordHash` String
- `role` UserRole — default `STUDENT`
- `createdAt` DateTime — default `now()`
- `updatedAt` DateTime — updatedAt
- Relations: `progress`, `bookmarks`, `studyTasks`, `notifications`, `sessions`

#### Subject
- `id` Int — PK, auto-increment
- `nameBn` String
- `nameEn` String
- `icon` String — default `"📘"`
- `color` String? — default `"text-emerald-400"`
- `bg` String? — default `"bg-emerald-500/10"`
- `sortOrder` Int — default `0`, indexed
- Relations: `topics`, `questions`, `flashcards`, `categories`

#### Topic
- `id` Int — PK, auto-increment
- `subjectId` Int — FK to Subject, indexed
- `subject` Subject — relation
- `groupName` String
- `name` String
- `questionCount` Int — default `0`

#### Question
- `id` Int — PK, auto-increment
- `subjectId` Int — FK to Subject
- `subject` Subject — relation
- `topic` String — default `""` (topic group name, e.g. `"বাক্য শুদ্ধি"`)
- `subtopic` String — default `""` (subtopic name from the `Topic` table; empty when not scoped)
- `question` String
- `options` Json — string array
- `correctAnswer` String
- `explanation` String — default `""`
- `difficulty` Difficulty — default `MEDIUM`
- `year` Int?
- `sourceExam` String — default `""`
- `createdAt` DateTime — default `now()`
- `updatedAt` DateTime — updatedAt
- Relations: `bookmarks`
- Indexes: `[subjectId, difficulty]`, `[subjectId, topic]`, `[subjectId, topic, subtopic]`

#### QuestionBankCategory
- `id` Int — PK, auto-increment
- `subjectId` Int? — FK to Subject, nullable (SetNull on delete)
- `subject` Subject? — relation
- `label` String
- `count` Int — default `0`

#### ExamArchive
- `id` Int — PK, auto-increment
- `name` String
- `icon` String — default `"🎯"`
- `count` Int — default `0`
- `yearRange` String — default `""`
- `status` QuizStatus — default `ACTIVE`
- `accent` String?

#### Flashcard
- `id` Int — PK, auto-increment
- `subjectId` Int? — FK to Subject, nullable, indexed
- `subject` Subject? — relation
- `subjectName` String — default `""`
- `question` String
- `answer` String
- `hint` String — default `""`
- `difficulty` Difficulty — default `MEDIUM`
- `nextReview` DateTime — default `now()`, indexed
- `interval` Int — default `1`
- `easeFactor` Float — default `2.5`
- `repetitions` Int — default `0`

#### StudyPlanDay
- `id` Int — PK, auto-increment
- `day` String
- `date` String, indexed
- `totalMinutes` Int — default `0`
- `focusAreas` Json — string array
- Relations: `tasks`

#### StudyTask
- `id` Int — PK, auto-increment
- `dayId` Int — FK to StudyPlanDay
- `planDay` StudyPlanDay — relation
- `userId` String? — FK to User, nullable
- `user` User? — relation
- `title` String
- `subject` String — default `""`
- `duration` Int — default `0`
- `priority` Priority — default `MEDIUM`
- `description` String — default `""`
- `completed` Boolean — default `false`
- `createdAt` DateTime — default `now()`
- Indexes: `[dayId, userId]`

#### DailyQuiz
- `id` Int — PK, auto-increment
- `date` String, indexed
- `completed` Boolean — default `false`
- `score` Int — default `0`
- `claimed` Boolean — default `false`
- `createdAt` DateTime — default `now()`
- Relations: `questions`

#### QuizQuestion
- `id` Int — PK, auto-increment
- `dailyQuizId` Int — FK to DailyQuiz
- `dailyQuiz` DailyQuiz — relation
- `subject` String — default `""`
- `topic` String — default `""`
- `question` String
- `options` Json
- `correctAnswer` String
- `explanation` String — default `""`

#### MockTest
- `id` Int — PK, auto-increment
- `title` String
- `subject` String — default `""`
- `totalQuestions` Int — default `0`
- `duration` Int — default `0`
- Relations: `questions`

#### MockTestQuestion
- `id` Int — PK, auto-increment
- `mockTestId` Int — FK to MockTest
- `mockTest` MockTest — relation
- `subject` String — default `""`
- `topic` String — default `""`
- `question` String
- `options` Json
- `correctAnswer` String
- `explanation` String — default `""`

#### ExamSchedule
Real, published exam dates (BCS, bank, teacher registration) backing the
dashboard countdown. Seeded from announced circulars — no fabricated entries.
- `id` Int — PK, auto-increment
- `titleBn` String
- `titleEn` String — default `""`
- `type` String — default `"BCS"` (`BCS` | `BANK` | `TEACHER` | `OTHER`)
- `date` DateTime — when the exam is scheduled
- `year` String — default `""`
- `circularNo` String — default `""`
- `note` String — default `""`
- `sortOrder` Int — default `0`
- Indexed on `date` and `type`.

#### FlashNews
- `id` Int — PK, auto-increment
- `tag` String — default `"EXAM"`
- `titleBn` String
- `titleEn` String? — default `""`
- `text` String — default `""`
- `full` String — default `""`
- `date` String — default `""`
- `readTime` Int — default `1`
- `categoryBn` String? — default `""`
- `categoryEn` String? — default `""`

#### Recommendation
- `id` Int — PK, auto-increment
- `subjectBn` String
- `subjectEn` String? — default `""`
- `metric` String — default `"accuracy"`
- `accuracy` Int — default `0`
- `titleBn` String
- `titleEn` String? — default `""`
- `descriptionBn` String
- `descriptionEn` String? — default `""`
- `ctaBn` String
- `ctaEn` String? — default `""`

#### Badge
- `id` Int — PK, auto-increment
- `name` String
- `description` String
- `icon` String — default `"🏅"`
- `rarity` BadgeRarity — default `COMMON`
- `unlockedSeed` Boolean — default `false`

#### AppNotification
- `id` Int — PK, auto-increment
- `userId` String? — FK to User, nullable
- `user` User? — relation
- `title` String
- `message` String
- `type` NotificationType — default `INFO`
- `timestamp` DateTime — default `now()`
- `read` Boolean — default `false`

#### OfflinePack
- `id` Int — PK, auto-increment
- `name` String
- `size` String — default `""`
- `downloaded` Boolean — default `false`
- `subject` String — default `""`

#### Document
- `id` Int — PK, auto-increment
- `title` String
- `category` String — default `"Syllabus"`
- `type` String — default `"md"`
- `url` String — default `""`
- `description` String — default `""`
- `year` String — default `""`
- `createdAt` DateTime — default `now()`

#### UserSession
- `id` String (cuid) — PK
- `userId` String — FK to User, indexed
- `user` User — relation
- `token` String — unique, indexed
- `expiresAt` DateTime, indexed
- `createdAt` DateTime — default `now()`

#### UserProgress
- `id` Int — PK, auto-increment
- `userId` String — unique, FK to User
- `user` User — relation
- `points` Int — default `0`
- `streak` Int — default `0`
- `accuracy` Int — default `0`
- `questionsAnswered` Int — default `0`
- `flashcardsReviewed` Int — default `0`
- `aiQuestionsAsked` Int — default `0`
- `examsAttempted` Int — default `0`
- `rank` Int — default `0`
- `updatedAt` DateTime — updatedAt

#### Bookmark
- `id` Int — PK, auto-increment
- `userId` String — FK to User
- `user` User — relation
- `questionId` Int — FK to Question
- `question` Question — relation
- `createdAt` DateTime — default `now()`
- Unique constraint: `[userId, questionId]`

#### QuestionAttempt
Per-user record of every answered question (practice, mock test, daily quiz). Powers accuracy, streaks, and per-subject reports.
- `id` Int — PK, auto-increment
- `userId` String — FK to User (cascade)
- `user` User — relation
- `questionId` Int? — FK to Question (set-null)
- `question` Question? — relation
- `subjectId` Int? — FK to Subject (set-null)
- `subject` Subject? — relation
- `subjectName` String — denormalized subject name (set for mock/daily attempts that have no Subject row)
- `topic` String
- `correct` Boolean
- `source` String — `practice` | `mock` | `daily`
- `createdAt` DateTime — default `now()`
- Indexes: `[userId, createdAt]`, `[userId, subjectId]`

#### MockTestResult
A graded mock-test attempt (history + exam KPIs).
- `id` Int — PK, auto-increment
- `userId` String — FK to User (cascade)
- `user` User — relation
- `mockTestId` Int? — FK to MockTest (set-null)
- `mockTest` MockTest? — relation
- `score` Int — percentage 0-100
- `correct` Int
- `total` Int
- `durationSec` Int
- `createdAt` DateTime — default `now()`
- Index: `[userId, createdAt]`

#### FlashcardReview
Per-user SRS review log for flashcards (nextReview scheduling is derived from these).
- `id` Int — PK, auto-increment
- `userId` String — FK to User (cascade)
- `user` User — relation
- `flashcardId` Int — FK to Flashcard (cascade)
- `flashcard` Flashcard — relation
- `rating` Int — `0`=again `1`=hard `2`=good `3`=easy
- `createdAt` DateTime — default `now()`
- Index: `[userId, flashcardId]`

#### NotificationRead
Per-user "read" marker for the global announcement feed.
- `id` Int — PK, auto-increment
- `userId` String — FK to User (cascade)
- `user` User — relation
- `notificationId` Int — FK to AppNotification (cascade)
- `notification` AppNotification — relation
- `readAt` DateTime — default `now()`
- Unique constraint: `[userId, notificationId]`

## Migrations

Migrations are not used. The schema is pushed directly:

```bash
npm run db:push
```

## Seed

Seed data is loaded via:

```bash
npm run db:seed
```

Seed sources:
- `frontend/lib/data/index.ts` — subjects, topics, categories, archives, stats, news, progress, reports.
- `frontend/lib/data/study.ts` — flashcards, mock tests, daily quizzes, badges, notifications, offline packs.
- `frontend/lib/data/ai.ts` — flash news (preferred), recommendations.
- `database/data/users.json` — user accounts (gitignored, optional).
- `database/data/bcs_syllabus/*.md` — syllabus documents.
- `database/data/ques/questions_database.txt` — raw question text for `scripts/seed-questions.ts`.

## Indexes

Prisma automatically creates indexes for:
- Primary keys (`@id`).
- Foreign keys (`subjectId`, `userId`, etc.).
- Unique constraints (`email`, `handle`, `[userId, questionId]`).
- Explicit `@@index` fields: `User.email`, `User.handle`, `Subject.sortOrder`, `Topic.subjectId`, `Question.[subjectId, difficulty]`, `Question.[subjectId, topic]`, `Question.[subjectId, topic, subtopic]`, `Flashcard.subjectId`, `Flashcard.nextReview`, `StudyTask.[dayId, userId]`, `StudyPlanDay.date`, `DailyQuiz.date`, `UserSession.userId`, `UserSession.token`, `UserSession.expiresAt`.

## Generator

```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["fullTextSearch", "postgresqlExtensions"]
}
```
