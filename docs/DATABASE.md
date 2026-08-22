# Database

## Seed identity & idempotency (Phase 2B1)

All seed-managed content rows carry either a natural unique key or a deterministic
`sourceKey` (md5 of pipe-joined parts — see `scripts/seed-keys.ts`). The seeder
**upserts** and never deletes, so row ids stay stable across deploys and user data
referencing content (Bookmarks → Question, NotificationRead → AppNotification,
DailyQuizParticipation → DailyQuiz, FlashcardReview → Flashcard) survives every deploy.

`sourceKey` part orders (must match migration `000000000002_seed_source_keys` backfills):

| Table | sourceKey parts | Unique on |
|---|---|---|
| Question | subjectId, path, question | `[subjectId, sourceKey]` |
| Flashcard | subjectName, question | `sourceKey` |
| StudyPlanDay | day, date | `sourceKey` |
| ExamSchedule | circularNo, titleBn, year | `sourceKey` |
| FlashNews | titleBn, date | `sourceKey` |
| Recommendation | subjectBn, titleBn | `sourceKey` |
| AppNotification | title, message | `sourceKey` |
| Document | title, category, year | `sourceKey` |
| Subject / MockTest / DailyQuiz / ExamArchive / QuestionBankCategory / Badge / OfflinePack | natural field | `nameBn` / `title` / `date` / `name` / `label` / `name` / `name` |

## Integrity Constraints (Phase 3)

Prisma cannot express CHECK constraints; they live in migration
`000000000004_integrity_constraints` and must be re-applied manually if a table is
ever rebuilt outside migrations:

| Table | Constraint | Rule |
|---|---|---|
| UserProgress | nonnegative / accuracy range | all counters ≥ 0, `accuracy` 0–100 |
| DailyQuizParticipation | score range / counts | `score` 0–100, counts ≥ 0 |
| FlashcardUserState | bounds / lastRating | interval, repetitions, lapses ≥ 0, easeFactor ≥ 1, lastRating 0–3 or NULL |
| FlashcardReview | rating range | `rating` 0–3 |
| MockTestResult | score range / counts | `score` 0–100, counts & durationSec ≥ 0 |
| AIMemory | confidence range | `confidence` 0–100 |
| AIUsage | nonnegative | tokens, latencyMs, estimatedCostUsd ≥ 0 |
| QuestionAttempt | source enum | `source` ∈ practice/daily/exam/mock |

**Documented decisions (Phase 3):**
- *Date-label columns stay String* (`DailyQuiz.date`, `FlashNews.date`, `StudyPlanDay.date`,
  `ExamSchedule.year`): they are timezone-free date-only labels surfaced verbatim in API
  DTOs. Instant columns (`ExamSchedule.date`, timestamps) use DateTime.
- *No premature partitioning*: high-growth tables (QuestionAttempt, AIUsage, AIMessage)
  keep serial bigint PKs plus `(userId, createdAt)` composites — sufficient for future
  time-based partition attachment without changes today.

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

#### AIConversationKind
- `TUTOR` — teaching conversations
- `ASSISTANT` — study-guidance conversations
- `SOLVER` — one-shot solve-and-explain conversations

#### AIMessageRole
- `USER`
- `ASSISTANT`
- `SYSTEM`

#### AIMessageStatus
- `COMPLETE`
- `STREAMING`
- `FAILED`

#### AIMemoryType
- `WEAK_TOPIC` — learner shows weakness in a topic
- `STRONG_TOPIC` — learner shows strength in a topic
- `RECURRING_MISTAKE` — repeated misconception/error
- `PREFERRED_LANGUAGE` — language the learner prefers
- `LEARNING_PREFERENCE` — how the learner likes to learn
- `EXAM_GOAL` — the exam the learner is targeting
- `DIFFICULTY_PREFERENCE` — preferred difficulty
- `CORRECTION` — a corrected misconception

#### AIMemorySource
- `INFERRED`
- `USER`
- `SYSTEM`

#### AIUsageTask
- `TUTOR`
- `SOLVER`
- `ASSISTANT`

#### AIFeedbackRating
- `HELPFUL`
- `NOT_HELPFUL`

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
- Relations: `progress`, `bookmarks`, `studyTasks`, `notifications`, `sessions`, `aiConversations`, `aiMemories`, `aiUsage`, `aiFeedback`

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
- `parentId` Int? — FK to Topic (`TopicTree` self-relation), `null` for depth-1 groups
- `parent` Topic? — relation
- `children` Topic[] — relation
- `name` String
- `slug` String
- `path` String — full content path from the subject root, e.g. `"04_আন্তর্জাতিক_বিষয়াবলি/০২_নিরাপ্তা_ও_ক্ষমতা/আন্তর্জাতিক_নিরাপ্তা"`
- `depth` Int — default `0` (1 = group under subject, 2 = leaf, …)
- `sortOrder` Int — default `0`
- `questionCount` String — default `"0"` (aggregated subtree count, denormalised by the seed)
- `questions` Question[] — relation
- Unique: `[subjectId, path]`; Index: `[subjectId, parentId]`

#### Question
- `id` Int — PK, auto-increment
- `subjectId` Int — FK to Subject
- `subject` Subject — relation
- `topicId` Int? — FK to Topic leaf (SetNull on delete)
- `leaf` Topic? — relation
- `path` String — default `""` (full leaf content path, e.g. `"04_আন্তর্জাতিক_বিষয়াবলি/০২_নিরাপ্তা_ও_ক্ষমতা/আন্তর্জাতিক_নিরাপ্তা"`)
- `topic` String — default `""` (topic group display name, depth-1 node)
- `subtopic` String — default `""` (leaf display name, `Topic.name`; empty when the leaf is a group)
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
- Indexes: `[subjectId, difficulty]`, `[subjectId, topic]`, `[subjectId, topic, subtopic]`, `[subjectId, path]`

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
- `subjectId` Int? — FK to Subject, `onDelete: SetNull`
- `subjectName` String — default `""` (denormalised for deck filtering)
- `question`, `answer`, `hint`
- `difficulty` Difficulty — default `MEDIUM`
- `nextReview` / `interval` / `easeFactor` / `repetitions` — **DEPRECATED (Phase 2B2)**: legacy shared defaults; authoritative scheduling is per-user in `FlashcardUserState`.
- `sourceKey` String @unique — seed identity `md5(subjectName|question)`
- Relations: `reviews` (FlashcardReview), `userStates` (FlashcardUserState)

#### FlashcardUserState (Phase 2B2)
Per-user SM-2 scheduling. A row exists only after the first review; unseen cards are implicitly new.

- `userId` + `flashcardId` FKs (Cascade), unique `[userId, flashcardId]`
- `nextReview` DateTime, `interval` Int (days), `easeFactor` Float (default 2.5, floor 1.3)
- `repetitions` / `lapses` Int, `lastRating` Int? (`0=again 1=hard 2=good 3=easy`)
- Indexes: `[userId, nextReview]`

#### UserBadge (Phase 2B2)
Per-user unlock record. Catalog state stays in `Badge`; earned state lives here.
- `userId` + `badgeId` FKs (Cascade), unique `[userId, badgeId]`, `unlockedAt` DateTime
- Written by the domain-event subscribers registered in `instrumentation.ts`
  (`backend/events/subscribers.ts` → `evaluateBadgesForEvent`): daily-quiz
  completion, mock-test ≥80% (min 5 questions), 100 flashcard reviews, and
  3/7-day streaks derived from the attempt log. Awarding is idempotent.
- Read by `GET /api/badges` to overlay real unlock state per caller.

#### StudyTaskCompletion (Phase 2B2)
Per-user completion marker for a (usually template) study task; replaces the shared `StudyTask.completed` boolean so one user's progress never affects another.
- `userId` + `taskId` FKs (Cascade), unique `[userId, taskId]`, `completedAt` DateTime
- Indexes: `[userId]`

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
- `userId` String? — FK to User, nullable (`null` = shared template row)
- `user` User? — relation
- `title` String
- `subject` String — default `""`
- `duration` Int — default `0`
- `priority` Priority — default `MEDIUM`
- `description` String — default `""`
- `completed` Boolean — default `false` — **DEPRECATED (Phase 2B2)**: superseded by per-user `StudyTaskCompletion`; never written by new code
- `createdAt` DateTime — default `now()`
- Relations: `completions` (StudyTaskCompletion)
- Indexes: `[dayId, userId]`

#### DailyQuiz
- `id` Int — PK, auto-increment
- `date` String, indexed
- `completed` Boolean — default `false` — **DEPRECATED (Phase 2)**: legacy GLOBAL state shared by all users; kept only for the dual-read transition. Never read from new code.
- `score` Int — default `0` — **DEPRECATED**: same as above
- `claimed` Boolean — default `false` — **DEPRECATED**: same as above
- `createdAt` DateTime — default `now()`
- Relations: `questions`, `participations`

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

#### DailyQuizParticipation (Phase 2)
Per-user daily-quiz state. One row per `(userId, quizId)`; replaces the deprecated global flags on DailyQuiz so one user's completion can never affect another user.

- `id` Int — PK, auto-increment
- `userId` String — FK to User, `onDelete: Cascade`
- `user` User — relation
- `quizId` Int — FK to DailyQuiz, `onDelete: Cascade`
- `dailyQuiz` DailyQuiz — relation
- `status` DailyQuizParticipationStatus (`IN_PROGRESS` | `COMPLETED`) — default `IN_PROGRESS`
- `score` Int — percentage 0–100, default `0`
- `correct` Int — default `0`
- `total` Int — default `0`
- `pointsEarned` Int — default `0`
- `completedAt` DateTime? — set when status becomes `COMPLETED`
- `createdAt` / `updatedAt` DateTime
- Unique: `[userId, quizId]`
- Indexes: `[quizId]`, `[userId, completedAt]`

Behavior notes:
- `GET /api/daily-quiz` maps the requesting user's participation onto the existing DTO fields (`completed`, `score`); anonymous callers receive neutral flags. Response shape unchanged.
- `POST /api/daily-quiz/submit` writes attempts + progress recompute + participation inside a single Prisma transaction.

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
- Indexes: `[userId]`, `[timestamp, id]` (keyset pagination order)

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
- `streak` Int — default `0` (legacy column; the API now derives streaks server-side from consecutive `QuestionAttempt` days via `computeStreak` — clients cannot write it)
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
- Indexes: `[userId, createdAt]`, `[userId, subjectId]`, `[userId, subjectName]`, `[userId, topic]` (the last two back the raw-SQL analytics group-bys)

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

#### AIConversation
A persisted AI chat thread (Tutor, Assistant, or Solver), always owned by one user.
- `id` String (cuid) — PK
- `userId` String — FK to User (cascade)
- `user` User — relation
- `kind` AIConversationKind — default `TUTOR`
- `title` String — default `"New conversation"`
- `pinned` Boolean — default `false` (pinned conversations sort to the top of the list)
- `subjectId` Int? — FK to Subject (set-null)
- `subject` Subject? — relation
- `topicId` Int? — FK to Topic (set-null)
- `topic` Topic? — relation
- `topicPath` String — default `""` (Topic path when the conversation is topic-scoped)
- `createdAt` DateTime — default `now()`
- `updatedAt` DateTime — updatedAt
- Relations: `messages`
- Indexes: `[userId, updatedAt]`, `[userId, kind, updatedAt]` (list queries order by `pinned` desc first)

#### AIMessage
A single turn inside an AI conversation. Content only — never system prompts.
- `id` String (cuid) — PK
- `conversationId` String — FK to AIConversation (cascade)
- `conversation` AIConversation — relation
- `role` AIMessageRole
- `status` AIMessageStatus — default `COMPLETE`
- `content` String
- `intent` String? — default `""` (task intent, e.g. `tutor`, `explain`, `hint`, `solve`)
- `provider` String? — default `""`
- `model` String? — default `""`
- `metadata` Json? — non-sensitive context (subject/topic/question id); never prompts
- `errorCode` String? — default `""`
- `createdAt` DateTime — default `now()`
- Relations: `feedback`
- Index: `[conversationId, createdAt]`

#### AIMemory
Persistent learning memory about the learner. Written deliberately by the AI application layer — the model never writes arbitrary memory directly.
- `id` String (cuid) — PK
- `userId` String — FK to User (cascade)
- `user` User — relation
- `type` AIMemoryType
- `key` String
- `value` String
- `source` AIMemorySource — default `INFERRED`
- `confidence` Int — default `50` (0-100)
- `expiresAt` DateTime?
- `createdAt` DateTime — default `now()`
- `updatedAt` DateTime — updatedAt
- Unique constraint: `[userId, type, key]`
- Index: `[userId, type]`

#### AIUsage
Usage/cost/observability ledger for every AI call. No prompt content stored.
- `id` String (cuid) — PK
- `userId` String? — FK to User (set-null)
- `user` User? — relation
- `task` AIUsageTask
- `intent` String? — default `""`
- `provider` String
- `model` String
- `inputTokens` Int — default `0`
- `outputTokens` Int — default `0`
- `totalTokens` Int — default `0`
- `latencyMs` Int — default `0`
- `success` Boolean — default `true`
- `errorCode` String? — default `""`
- `estimatedCostUsd` Float — default `0`
- `createdAt` DateTime — default `now()`
- Indexes: `[userId, createdAt]`, `[userId, task, createdAt]` (daily quota backstop), `[task, createdAt]`, `[model, createdAt]`

#### AIFeedback
Lightweight user feedback on AI responses — the seed of an evaluation set.
- `id` String (cuid) — PK
- `userId` String — FK to User (cascade)
- `user` User — relation
- `messageId` String? — FK to AIMessage (set-null)
- `message` AIMessage? — relation
- `rating` AIFeedbackRating
- `category` String? — default `""` (e.g. `hallucination`, `wrong_language`, `unhelpful`)
- `comment` String? — default `""`
- `createdAt` DateTime — default `now()`
- Indexes: `[userId, createdAt]`, `[messageId]`

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
- `frontend/lib/data/index.ts` — archive categories, flash news, question bank categories.
- `frontend/lib/data/study.ts` — flashcards, mock tests, daily quizzes, badges, notifications, offline packs.
- `frontend/lib/data/ai.ts` — flash news (preferred), recommendations.
- `database/data/users.json` — user accounts (gitignored, optional).
- `database/data/bcs_syllabus/*.md` — syllabus documents.
- `database/data/ques/questions_database.txt` — raw flat question text for `scripts/seed-questions.ts`.
- `database/data/ques/<Subject>/<Node>/…/<file>.txt` — folder-structured questions; the folder path IS the taxonomy (each segment matched by NFC-normalised name).
- `database/data/taxonomy.json` — parsed taxonomy tree driving subject/topic creation, round-robin flat-question distribution, and folder imports via `scripts/taxonomy.ts`.

The recursive Topic tree, leaf `topicId`/`path` tagging on questions, and per-topic aggregated `questionCount` are (re)built by `scripts/seed-questions.ts`, invoked by `npm run db:seed-questions` and as part of `npm run db:seed`.

## Indexes

Prisma automatically creates indexes for:
- Primary keys (`@id`).
- Foreign keys (`subjectId`, `userId`, etc.).
- Unique constraints (`email`, `handle`, `[userId, questionId]`).
- Explicit `@@index` fields: `User.email`, `User.handle`, `Subject.sortOrder`, `Topic.subjectId`, `Topic.[subjectId, parentId]`, `Question.[subjectId, difficulty]`, `Question.[subjectId, topic]`, `Question.[subjectId, topic, subtopic]`, `Question.[subjectId, path]`, `Flashcard.subjectId`, `Flashcard.nextReview`, `StudyTask.[dayId, userId]`, `StudyPlanDay.date`, `DailyQuiz.date`, `UserProgress.points` (rank range-scan, Phase 3), `DailyQuizParticipation.quizId`, `DailyQuizParticipation.[userId, completedAt]`, `FlashcardUserState.[userId, nextReview]`, `StudyTaskCompletion.userId`, `UserSession.userId`, `UserSession.token`, `UserSession.expiresAt`, `AIConversation.[userId, updatedAt]`, `AIConversation.[userId, kind, updatedAt]`, `AIMessage.[conversationId, createdAt]`, `AIMemory.[userId, type]`, `AIUsage.[userId, createdAt]`, `AIUsage.[userId, task, createdAt]`, `AIUsage.[task, createdAt]`, `AIUsage.[model, createdAt]`, `QuestionAttempt.[userId, subjectName]`, `QuestionAttempt.[userId, topic]`, `AppNotification.[timestamp, id]`, `AIFeedback.[userId, createdAt]`, `AIFeedback.[messageId]`.
- Unique constraints: `User.email`, `User.handle`, `Topic.[subjectId, path]`, `Bookmark.[userId, questionId]`, `NotificationRead.[userId, notificationId]`, `AIMemory.[userId, type, key]`, `DailyQuizParticipation.[userId, quizId]`, `UserSession.token`.
- Unique constraint: `Topic.[subjectId, path]`.

## Generator

```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["fullTextSearch", "postgresqlExtensions"]
}
```
