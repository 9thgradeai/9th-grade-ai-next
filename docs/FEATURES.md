# Features — Implementation Map

> Every feature traced through its full slice: **UI component → API route(s) → service(s) → Prisma model(s)**. Use this to navigate the codebase when changing or debugging a feature. Product intent lives in `PRODUCT.md`/`REQUIREMENTS.md`; endpoint contracts in `API.md`.

---

## 1. Accounts & Onboarding

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Email signup / login / logout | `app/login/`, `frontend/components/` auth UI | `/api/auth/register`, `/login`, `/logout`, `/me`, `/refresh` | `backend/services/user.ts`, `backend/auth.ts` | `User`, `Session` |
| Email verification & reset | auth pages | `/api/auth/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password` | `backend/services/user.ts` (email via `docs/EMAIL.md` transports) | `User` |
| Password change, account export/delete | Settings tab | `/api/auth/change-password`, `/export`, `/account` | `backend/services/user.ts` | `User` |
| Session management (revoke all) | Settings tab | `/api/auth/sessions/revoke-all` | `backend/session-verify.ts` | `Session` |
| Google sign-in | "Continue with Google" | `/api/auth/google`, `/google/callback` | `backend/auth/google.ts` (PKCE) | `User`, `Session` |
| Onboarding | onboarding flow | `/api/onboarding` | `backend/services/user.ts` | `UserProgress` |

**Auth mechanics:** jose JWT in HttpOnly `auth_token` cookie (7 days) — see `SECURITY.md`. Route handlers call `getUserIdFromRequest()`; `proxy.ts` guards `/dashboard` and `/login`.

## 2. Practice & Exams

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Taxonomy picker (subject → topic → subtopic) | `SubjectTopicSelect.tsx`, `TopicTreePicker.tsx` | `/api/exam/config` | `backend/services/exam.ts` | `Subject`, `Topic` |
| Custom exam engine | `CustomExamTab.tsx` | `/api/exam/config`, `/build`, `/start`, `/submit` | `exam.ts`, `exam-submission.ts` | `Exam`, `ExamAttempt`, `QuestionAttempt` |
| In-progress exam submit + status | `PracticeStartDock`, exam components | `/api/exams/[attemptId]/submit`, `/submission-status` | `exam-submission.ts` | `ExamAttempt` |
| Mock tests | `MockTestTab.tsx`, `AIMockTestTab.tsx` | `/api/mock-test/results` (+ exam endpoints) | `exam.ts` | `MockTest`, `MockTestQuestion`, `MockTestResult` |
| Daily quiz | `SpotlightQuiz`, HomeTab widget | `/api/daily-quiz`, `/submit`, `/history` | `backend/services/exam.ts` + activity | `DailyQuiz`, `QuizQuestion`, `DailyQuizParticipation` |
| Quick practice | `PracticeTab.tsx`, `QuestionDrill.tsx` | `/api/questions?paths=…`, `/api/practice/submit` | `content.ts`, `exam.ts` | `Question`, `QuestionAttempt` |
| Exam papers / library | `ExamLibraryView.tsx`, `RealExamTab.tsx` | `/api/exam-papers` (+ `[paperId]`), `/api/real-exam/export` | `content.ts` | `ExamPaper`, `ExamCategory`, `ExamArchive` |
| Exam history | `ExamHistoryTab.tsx` | `/api/exam-history` | `backend/services/exam-history.ts` | `ExamAttempt`, `MockTestResult` |
| Question bank | `QuestionBankTab.tsx` | `/api/questions`, `/api/question-bank/categories`, `/exams` | `content.ts` | `Question`, `QuestionBankCategory` |
| Exam ecosystems | `EcosystemToggle.tsx` | `/api/ecosystems` | `backend/services/ecosystem.ts` | `ExamEcosystem` |

**Implementation notes:**
- Build is **deterministic** (seeded RNG) and never returns `correctAnswer`/`explanation` until submit.
- Grading is BCS-accurate: **+1 / −0.5 / 0**; submissions bounded at 200 answers and origin-checked.
- `Question.correctAnswer` stores option **text**, not a letter (ADR-033).
- Math content goes through the canonical KaTeX pipeline; `Question.rawMath` opts out (ADR-028/036).

## 3. Mistake Notebook & Weak Topics

| Feature | API | Service | Models |
|---------|-----|---------|--------|
| Wrong-answer notebook | `/api/wrong-answers`, `/api/mistakes` | `backend/services/mistake-exam.ts`, `question-progress.ts` | `UserQuestionProgress`, `QuestionAttempt` |
| Mistake practice exams | `/api/mistakes/exam`, `/exam/config` | `mistake-exam.ts` | `Exam`, `ExamAttempt` |
| Mistake stats | `/api/mistakes/stats`, `/stats/overall`, `/subjects` | `analytics.ts` | `QuestionAttempt` |
| Weak-topic detection | `/api/weak-topics` | `preparation-intelligence.ts` | `QuestionAttempt`, `UserQuestionProgress` |

UI: `WrongAnswerNotebookTab.tsx`.

## 4. Flashcards & Study Plan

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| SRS flashcards (SM-2) | `FlashcardsTab.tsx` | `/api/flashcards`, `/api/flashcards/review` | `backend/services/flashcards.ts` | `Flashcard`, `FlashcardUserState`, `FlashcardReview` |
| Smart study planner | `StudyPlannerTab.tsx` | `/api/study-plan`, `/tasks/[id]/toggle` | `backend/services/study-plan.ts` | `StudyPlanDay`, `StudyTask`, `StudyTaskCompletion` |

**Implementation note:** SM-2 recomputes ease factor / interval / repetitions / `nextReview` per rating (Again/Hard/Good/Easy); each review is logged per-user.

## 5. Vocabulary

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Decks & words | `VocabTab.tsx`, `vocab/` | `/api/vocab/decks`, `/decks/[id]/words`, `/words` | `vocab.ts`, `vocab-decks.ts` | `VocabDeck`, `VocabDeckWord`, `VocabWord`, `UserVocabDeck` |
| Review & quiz | `vocab/` | `/api/vocab/review`, `/quiz`, `/daily`, `/word-of-the-day` | `vocab.ts`, `backend/ai` vocab skills | `VocabProgress` |
| Analytics & stats | `vocab/` | `/api/vocab/analytics`, `/stats` | `vocab-analytics.ts` | `VocabProgress` |
| Admin vocabulary | admin UI | `/api/admin/vocab` (+ `[id]`) | `vocab-admin.ts` | `VocabWord` |

## 6. Current Affairs

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Daily generation (cron) | — | `/api/cron/daily-current-affairs` (Bearer `CRON_SECRET`) | `backend/services/current-affairs.ts`, `backend/ai/current-affairs.ts` | `DailyCurrentAffairsNote`, `SourceCitation` |
| Reading & notes | `CurrentAffairsTab.tsx` | `/api/current-affairs/latest`, `/user-note` | `current-affairs.ts` | `DailyCurrentAffairsNote`, `UserCustomizedNote` |
| MCQ practice | `CurrentAffairsTab.tsx` | `/api/current-affairs/mcq-attempt` | `current-affairs.ts` | `ExamMcq`, `QuestionAttempt` |
| Rich editing & export | TipTap editor | `/api/current-affairs/generate`, `/export` (docx) | `backend/services/pdf` + docx pipeline | — |

## 7. AI Suite

| Feature | UI | API | Backend |
|---------|----|-----|---------|
| Tutor (streaming, bilingual, web-grounded) | chat surfaces | `/api/ai/tutor` | `backend/ai/` router → groq provider; Tavily grounding |
| Solver (text + image → structured JSON) | `AISolverTab.tsx`, `AIExplanationButton` | `/api/ai/solver` | anthropic provider |
| Study-coach agent loop | Advisor surfaces | `/api/ai/agent` | `backend/ai/agent/{loop,checkpoint,persistence,prompt}.ts` |
| MCQ explanations | AI Explain buttons across exams | `/api/ai/explain` | dedicated `GROQ_API_KEY_EXPLAIN` key |
| Assistant / advisor / evaluator | `AdvisorTab.tsx`, `AnswerEvaluatorTab.tsx` | `/api/ai/assistant`, `/advisor`, `/evaluate`, `/feedback` | `backend/ai/application`, `feedback*.ts` |
| Voice tutor & interview | `VoiceAITutor.tsx`, `VoiceInterviewTab.tsx` | `/api/ai/tutor` (+ browser speech) | same AI stack |
| AI mock test | `AIMockTestTab.tsx` | `/api/ai/mock-test` | orchestration |
| Student model & preparation intelligence | `StudentModelTab.tsx` | `/api/ai/student-model`, `/api/preparation-intelligence` | `backend/ai/student-model.ts`, `backend/services/preparation-intelligence.ts` |
| Conversations & memory | chat history UI | `/api/ai/conversations` (+ `[id]`) | `backend/ai/persistence`, memory | 
| Usage tracking & spend guard | `UsageTab.tsx` | `/api/ai/usage/summary` | `backend/ai/usage/`, `backend/rate-limit.ts` |

**Models:** `AIConversation`, `AIMessage`, `AIMemory`, `AIUsage`, `AIFeedback`, `AgentRun`, `AgentToolCall`.

**Implementation notes:** provider registry (`backend/ai/providers/registry.ts`) + model router (`backend/ai/router/`) with tier routing; agent loop bounded by `MAX_AGENT_STEPS` (8, `backend/ai/agent/prompt.ts`); every response labelled with its `source` (mock when unkeyed); daily USD budget guard (`AI_DAILY_BUDGET_USD`). Details: `AI-SYSTEM.md`, `AI_AGENT_*` docs.

## 8. Progress & Gamification

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Dashboard KPIs (points, accuracy, streak, rank) | `HomeTab.tsx` | `/api/dashboard-stats` | `activity.ts`, `analytics.ts` | `UserProgress`, `QuestionAttempt`, `ExamAttempt` |
| Per-subject reports | `ProgressTab.tsx` | `/api/subject-reports` | `analytics.ts` | `QuestionAttempt` |
| Streak heatmap | `StreakHeatmap.tsx` | `/api/dashboard-stats` | `activity.ts` | `UserProgress` |
| Badges | `ProgressTab.tsx` | `/api/badges` | `backend/services/badges.ts` | `Badge`, `UserBadge` |
| Leaderboard & rank | Progress surfaces | `/api/leaderboard` | `analytics.ts` | `UserProgress` |
| Learning events (activity stream) | Home | `/api/learning-events` | `backend/events/learning-events.ts` | `LearningEvent` |
| Recommendations | HomeTab | `/api/recommendations` | `analytics.ts` | `Recommendation` |
| Exam countdown | HomeTab | `/api/exam-schedule` | `content.ts` | `ExamSchedule` |
| Flash news | HomeTab | `/api/flash-news` | `content.ts` | `FlashNews` |
| Question progress & mastery | drill surfaces | `/api/questions`, learning events | `question-progress.ts`, `backend/services/mastery.ts` | `UserQuestionProgress` |
| Spotlight quiz | `SpotlightQuiz.tsx` | `/api/spotlight` | `analytics.ts` | `Question` |

**Implementation note:** all dashboard numbers are computed from real activity (ADR-010) — the dashboard never renders fabricated stats; empty states render until real data exists.

## 9. Notifications

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Notification center | `NotificationCenter.tsx`, `HeaderActions.tsx` | `/api/notifications`, `/read-all`, `/[id]/read`, `/preferences` | `backend/services/notification.ts`, `events/notification-subscriber.ts` | `AppNotification`, `NotificationRead`, `NotificationHidden`, `NotificationPreference` |

Notifications are produced by the event bus (`backend/events/bus.ts`) — domain events fan out to subscribers rather than being written inline.

## 10. Content & Documents

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Syllabus explorer | landing `SubjectUniverseSection`, dashboard | `/api/questions`, exam config tree | `content.ts` | `Subject`, `Topic` |
| Documents & offline packs | `Offline` tab | `/api/documents` | `content.ts` | `Document`, `OfflinePack` |
| Exam papers export | `RealExamTab` | `/api/real-exam/export` | pdf/docx services | `ExamPaper` |

## 11. Data Portability — BYOS

| Feature | UI | API | Service | Models |
|---------|----|-----|---------|--------|
| Storage status / connect / disconnect | `DataStorageCard.tsx`, Settings | `/api/storage/status`, `/connect`, `/disconnect` | `backend/services/storage/` | `StorageConnection` |
| Google Drive sync & backup | Settings | `/api/storage/sync`, `/export`, `/import`, `/restore`, `/google/*` | `storage/` (worker-driven) | `StorageFile`, `SyncJob`, `StorageRevision` |
| Background worker | — | `/api/storage/worker` (Bearer `WORKER_SECRET`) | `storage/observability.ts`, in-memory queue | `SyncJob` |

**Implementation note:** Drive OAuth tokens are encrypted at rest with `GOOGLE_OAUTH_ENCRYPTION_KEY` (must differ from `AUTH_SECRET`); heavy sync/import runs in the worker, not the request path. Details: `BYOS.md`.

## 12. Admin

| Feature | API | Service | Models |
|---------|-----|---------|--------|
| User management | `/api/admin/users` (+ `[id]`) | `backend/services/admin.ts` | `User`, `AuditLog` |
| Vocabulary administration | `/api/admin/vocab` (+ `[id]`) | `vocab-admin.ts` | `VocabWord` |

Role-gated (`ADMIN`); sensitive mutations are recorded in `AuditLog`.

## 13. Platform Features

| Feature | Where |
|---------|-------|
| Health check | `/api/health` |
| Command bar & shortcuts | `CommandBar.tsx`, `ShortcutList.tsx` |
| Theme (dark/light) | `theme-ctx/`, `SettingsTab.tsx` |
| Offline service worker | hand-rolled SW copied by `scripts/copy-sw.mjs` (ADR-061) |
| Error boundary | `app/error.tsx` + `frontend/components/ui/ErrorBoundary.tsx` |
| Sentry error reporting | `instrumentation.ts`, `backend/infrastructure/observability/sentry.ts` |

> The Prisma schema holds **61 models** — full reference in `DATABASE.md`.
