# API

## Base URL

All API routes live under `/api/*`.

## Authentication

Auth-protected routes require the `auth_token` HttpOnly cookie (JWT, 7-day expiry, SameSite=Lax).

Session JWTs carry a `ver` claim matching the user's `tokenVersion`. Changing the password or revoking all sessions bumps that version, instantly invalidating every previously issued token on every device.

- `GET /api/auth/me` — Returns the current user or `401`.
 - `POST /api/auth/login` — Authenticates `{ email, password, remember? }`, sets cookie, returns user. `remember: true` extends the `auth_token` cookie from 7 to 30 days; otherwise the session-length default applies. Timing-equalized (unknown emails run a dummy bcrypt compare) and rate-limited per-IP (5/min) and per-account (10/hour). Social-only accounts (Google/Apple) are rejected with `AUTH_SOCIAL_ONLY`.
- `POST /api/auth/register` — Creates account `{ name, email, password }` (8–128 chars), sets cookie, returns user.
- `POST /api/auth/logout` — Clears the session cookie.
- `POST /api/auth/refresh` — Re-issues the session JWT, extends the `auth_token` cookie, returns `{ expiresIn }` (ms until expiry). Enforces a 30-day absolute session cap. Requires a valid session cookie; `401` otherwise.
- `PATCH /api/auth/profile` — **Auth required** — Updates `{ name }`.
- `POST /api/auth/change-password` — **Auth required** — Verifies `{ currentPassword }`, updates to `{ newPassword }`, **invalidates all other sessions**, and re-mints this device's cookie so it stays signed in.
- `DELETE /api/auth/account` — **Auth required** — Deletes the account and clears the cookie.
 - `POST /api/auth/sessions/revoke-all` — **Auth required** — "Sign out everywhere": invalidates every session (including the caller's) and clears the local cookie.
 - `POST /api/auth/forgot-password` — Starts a password-reset flow. Accepts `{ email }`; always returns `{ ok: true }` (anti-enumeration — does not reveal whether the email is registered). In non-production with no email transport, the response includes a `devLink` to the reset page.
 - `POST /api/auth/reset-password` — Consumes a reset token. Accepts `{ token, password }` (password ≥ 8). Rotates the password, **invalidates all sessions**, and clears the token. Returns `400` for expired/invalid tokens.
  - `POST /api/auth/verify-email` — Verifies an email-confirmation token. Accepts `{ token }`; returns `{ ok: true }` on success or `{ ok: false }` for expired/invalid tokens.
  - `POST /api/auth/resend-verification` — Re-issues an email-verification token. Accepts `{ email }`; always returns `{ ok: true }` (anti-enumeration — does not reveal whether the email is registered or already verified). In non-production with no email transport, the response includes a `devLink` to the verify page. Rate-limited per IP (`RL_PASSWORD_PER_MIN`, default 5/min).
  - `GET /api/auth/google` — Begins Google OAuth 2.0 (Authorization Code + PKCE). 307-redirects to Google's consent screen and sets a short-lived (`oauth_google`) HttpOnly cookie carrying the `state` + PKCE `code_verifier` + requested `?redirect=`. When Google OAuth is unconfigured it redirects to `/login?error=google_unavailable`. Rate-limited per IP (`RL_GOOGLE_PER_MIN`, default 10/min).
  - `GET /api/auth/google/callback` — Google's redirect target. Verifies `state` (CSRF), exchanges the `code` using the PKCE verifier, locally verifies the Google `id_token` (issuer + audience + signature via Google's JWKS), then finds-or-creates the user and sets the `auth_token` cookie. New (un-onboarded) users land on `/onboarding`; others on the requested redirect (default `/dashboard`). Failures redirect to `/login?error=google_*` (no secrets leaked).
  - `GET /api/auth/apple` — Begins Apple Sign In (OIDC, `response_mode=query`). 307-redirects to Apple's consent screen and sets a short-lived (`oauth_apple`) HttpOnly cookie carrying the `state` + `nonce` + requested `?redirect=`. When Apple Sign In is unconfigured it redirects to `/login?error=apple_unavailable`. Gated on `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. Rate-limited per IP (`RL_GOOGLE_PER_MIN`, default 10/min).
  - `GET /api/auth/apple/callback` — Apple's redirect target. Verifies `state` (CSRF), exchanges the `code` for an Apple `id_token`, locally verifies it (issuer + audience + nonce via Apple's JWKS), then finds-or-creates the user and sets the `auth_token` cookie. Mirrors the Google callback's onboarding/redirect behavior. Failures redirect to `/login?error=apple_*` (no secrets leaked).
 - `POST /api/onboarding` — **Auth required** — Persists post-signup onboarding `{ examTarget?, examDate?, prepLevel?, studyHoursPerDay?, goal? }` and marks the user `onboarded`. All fields optional and validated server-side.


All mutating endpoints (auth and non-auth) reject cross-origin requests via an Origin/Host check (`403 CSRF_ORIGIN_MISMATCH`).

## Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/questions` | List questions, filterable by `?subject=`, `?topic=`, `?difficulty=`, `?q=`, `?limit=`, `?page=` (1-based, default 1), `?paths=`, `?ids=` (comma-separated question IDs, max 200), `?year=` (previous-year-question filter), `?sourceExam=` (e.g. `45th BCS`). Response: `{ questions, page, pageSize, total }` — `total` enables pagination controls. Cached 60s (`stale-while-revalidate` 300s) |
| GET | `/api/question-bank/categories` | List question bank categories |
| GET | `/api/question-bank/exams` | List the exam-library taxonomy as a hierarchy: `category → [exam → [paper]]`. Papers carry `availableQuestions` (curated); used by the dashboard's BCS exam browser. Cached 5min (`stale-while-revalidate` 10min) |
| GET | `/api/flashcards` | List flashcards, optionally filtered by `?subject=`. Authenticated callers additionally receive a per-card `srs` overlay (their own SM-2 state) |
| GET | `/api/exam-schedule` | List published exam dates (public, no auth) |
| GET | `/api/study-plan` | **Auth required** — List the caller's study plan tasks |
| GET | `/api/daily-quiz` | Get today's quiz |
| GET | `/api/flash-news` | List flash news items |
| GET | `/api/recommendations` | List AI recommendations |
> Progress (`points`, `streak`, counters) is **server-derived only** from the attempt log — there is no client-writable progress endpoint by design.
| GET | `/api/notifications` | **Auth required** — List notifications with per-user read state. Keyset-paginated (Phase 6): `?limit=` (default 20, max 50) and `?cursor=` (previous page's `nextCursor` = last item id). Response: `{ notifications, pageSize, total, nextCursor }` — `nextCursor` is null on the final page |
| GET | `/api/badges` | List achievement badges. Authenticated callers get their real unlock state from `UserBadge` (`unlocked: true`); anonymous callers get the catalog with seed flags only |
| GET | `/api/subject-reports` | **Auth required** — Per-subject reports from the caller's attempts (`name`, `score`, `attempted`, `correct` — no fabricated trend) |
| GET | `/api/mock-test/results` | **Auth required** — Caller's recent mock test results |
| GET | `/api/documents` | List documents (syllabus, circulars) |
| GET | `/api/bookmarks` | **Auth required** — Get bookmarked question IDs |
| POST | `/api/bookmarks` | **Auth required** — Toggle bookmark `{ questionId }` |
| POST | `/api/study-plan/tasks/:id/toggle` | **Auth required** — Toggle task completion (per-user completion marker; template tasks toggleable) |
| POST | `/api/flashcards/review` | **Auth required** — Grade a flashcard `{ flashcardId, rating: 0\|1\|2\|3 }` (0=again, 1=hard, 2=good, 3=easy) → per-user SM-2 state `{ state: { nextReview, interval, easeFactor, repetitions, lapses } }` |
| GET | `/api/dashboard-stats` | **Auth required** — Caller's dashboard stats (per-user) |
| POST | `/api/practice/submit` | **Auth required** — Grade practice answers `{ answers: [{ questionId, selected }] }` → `{ summary: { correct, total, score, pointsEarned, feedback? } }`. `feedback` is a per-question map `{ [questionId]: { masteryStatus, isMistake, justMastered } }` powering the mistake-drill's mastery labels (see `MistakeFeedback`). |
| POST | `/api/daily-quiz/submit` | **Auth required** — Grade + persist daily quiz answers `{ quizId, answers }` |
| POST | `/api/notifications/:id/read` | **Auth required** — Mark a notification read |
| GET | `/api/exam/config` | List the custom-exam selection tree (subjects → topics → subtopics with question counts) |
| POST | `/api/exam/build` | **Auth required** — Build a custom BCS-style exam `{ subjects: [{ subjectId, groups, count? }], questionCount, durationSec }` (401 without a session — construction is DB-heavy) |
| POST | `/api/exam/start` | **Auth required** — Register a freshly built exam as `IN_PROGRESS`. Body: `{ attemptId: UUID, questionIds: number[] }`. Idempotent — subsequent calls for the same `attemptId` are no-ops when the row is still `IN_PROGRESS`. |
| POST | `/api/exam/submit` | **Auth required, idempotent** — Grade + persist a custom exam. Body: `{ attemptId: UUID, questionIds: number[], durationSec: number, answers: [{ questionId, selected }] }`. Re-submits for the same `(userId, attemptId)` return the original `SUBMITTED` result with `outcome: "resumed"` and never double-count points or duplicate attempts. |
| POST | `/api/ai/solver` | **Auth required** — Solve a question `{ text?, imageBase64?, subject?, subjectId?, questionId? }` → `{ solution, steps, explanation, relatedConcept, source }` |
| POST | `/api/ai/tutor` | **Auth required** — **Streaming** AI tutor turn `{ messages: [{ role, content }], conversationId?, subjectId?, topicId?, questionId?, topicPath?, intent? }` |
| POST | `/api/ai/assistant` | **Auth required** — Study guidance `{ messages, conversationId?, questionId?, intent? }` → `{ reply, suggestedActions, source }` |
| POST | `/api/ai/evaluate` | **Auth required** — Grade a learner's written answer `{ question, learnerAnswer, questionId?, subjectId? }` → `{ score, verdict, strengths[], gaps[], modelAnswer, improvementTips[], source }` (grounded on the curated question bank when `questionId` is given) |
| POST | `/api/ai/mock-test` | **Auth required** — Generate an AI mock test `{ subject?, subjectId?, exam?, count?, difficulty? }` → `{ title, questions: [{ id, question, options[], answer, explanation, topic, difficulty }], source }` |
| POST | `/api/ai/advisor` | **Auth required** — Personalized exam-target + study plan `{ education?, interests?, targetExam?, weeklyHours?, examDate? }` → `{ summary, recommendedExam, focusAreas[], timelineWeeks, weeklyPlan[], tips[], source }` |
| GET | `/api/ai/student-model` | **Auth required** — The learner's long-term profile (goals, language, weak/strong topics, usage) |
| GET | `/api/ai/usage/summary` | **Auth required** — The caller's own AI usage/observability (`{ totalCalls, totalCostUsd, successRate, avgLatencyMs, byProvider[], byDay[] }`) |
| GET | `/api/ai/conversations` | **Auth required** — List the caller's AI conversations (`?kind=TUTOR\|ASSISTANT\|SOLVER`) |
| POST | `/api/ai/conversations` | **Auth required** — Create an AI conversation `{ kind, title?, subjectId?, topicId?, topicPath? }` |
| GET | `/api/ai/conversations/:id` | **Auth required** — Get one conversation + messages (ownership-checked) |
| PATCH | `/api/ai/conversations/:id` | **Auth required** — Update a conversation: rename `{ title }` or pin/unpin `{ pinned: boolean }` (ownership-checked) |
| DELETE | `/api/ai/conversations/:id` | **Auth required** — Delete a conversation (ownership-checked) |
| POST | `/api/ai/feedback` | **Auth required** — Record feedback `{ rating: "HELPFUL"\|"NOT_HELPFUL", messageId?, category?, comment? }` |

## Study & Progress Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wrong-answers` | **Auth required** — The caller's wrong-answer notebook: questions whose **most recent** attempt was incorrect. Query: `?page=` (default 1), `?limit=` (default 20, max 100). Response: `{ questions: [Question], page, pageSize, total }` |
| GET | `/api/weak-topics` | **Auth required** — Topics ranked weakest-first by accuracy from the caller's attempts. Query: `?minAttempts=` (default 3), `?limit=` (default 10). Response: `{ topics: [{ subject, topic, attempted, correct, score }] }` (ascending `score`) |
| GET | `/api/leaderboard` | **Auth required** — Points-ranked leaderboard. Query: `?limit=` (default 20, max 50). Response: `{ entries: [{ rank, name, points, streak }], me: { rank, points } \| null }` |
| GET | `/api/daily-quiz/history` | **Auth required** — The caller's completed daily quizzes (newest-first, default 14). Response: `{ history: [{ quizId, date, score, correct, total, completedAt }] }` (dates stringified) |
| GET | `/api/mistakes` | **Auth required** — The caller's persistent mistake list (questions answered incorrectly, tracked until mastered). Query: `?page=` (default 1), `?limit=` (default 20, max 100), `?subject=`, `?status=`, `?sort=`. Response: `{ data: [MistakeItem], total, page, limit, totalPages }` |
| GET | `/api/mistakes/stats` | **Auth required** — Mistake summary metrics. Response: `{ totalMistakes, unmastered, struggling, reviewing, improving, mastered, totalAttempts, totalCorrect, accuracy }` |
| GET | `/api/mistakes/stats/overall` | **Auth required** — Overall answer-history accuracy across ALL attempts (not just mistakes). Response: `{ totalAttempts, totalCorrect, totalWrong, accuracy, questionsAttempted }` |
| GET | `/api/mistakes/exam/config` | **Auth required** — Subject → topic → subtopic selection tree scoped ONLY to the caller's wrong questions, each with the number of wrong questions available under it. Response: `{ subjects: [{ subject, count, topics: [{ topic, count, subtopics: [{ subtopic, count }] }] }] }` |
| GET | `/api/mistakes/subjects` | **Auth required** — Mistake count broken down by subject. Response: `{ subjects: [{ subject, count, unmastered }] }` |
| POST | `/api/mistakes/exam` | **Auth required** — Build a mistake-focused practice drill from the caller's tracked mistakes. Body: `{ subject?, topic?, subtopic?, count, focus }`. `topic`/`subtopic` narrow selection strictly to the caller's wrong questions in that preference. Returns `ExamBuild`-shaped `{ questions: [MistakeExamQuestion] }` including `correctAnswer` + `explanation` so the practice drill can grade and reveal the answer (this is a study drill, not a graded exam). 404 if there are no mistakes to practice |

## Response Shapes

### Subject
```json
{ "id": 1, "nameBn": "বাংলা", "nameEn": "Bangla", "icon": "📖", "color": "...", "bg": "...", "sortOrder": 0 }
```

### Question
```json
{ "id": 1, "subjectId": 1, "subject": "বাংলা", "topic": "বাক্য শুদ্ধি", "question": "...", "options": ["A","B","C","D"], "correctAnswer": "A", "explanation": "...", "difficulty": "EASY", "year": 2023, "sourceExam": "BCS" }
```
> `correctAnswer` is part of the public question bank by design (open study
> material). Grading for practice/exam/daily-quiz is server-authoritative;
> exam-mode DTOs omit it so in-flight attempts can't be trivially auto-answered.

### Flashcard
```json
{ "id": 1, "subjectName": "বাংলা", "question": "...", "answer": "...", "hint": "...", "difficulty": "easy" }
```

### DailyQuiz
```json
{ "id": 1, "date": "2026-08-16", "completed": false, "score": 0, "claimed": false, "questions": [...] }
```

### MockTest
```json
{ "id": 1, "title": "...", "subject": "...", "totalQuestions": 10, "duration": 20, "questions": [...] }
```

### ExamSchedule
```json
{ "exams": [{ "id": 1, "titleBn": "...", "titleEn": "...", "type": "BCS", "date": "2026-11-15T00:00:00.000Z", "year": "2026", "circularNo": "...", "note": "..." }] }
```

### MockTestResult
```json
{ "results": [{ "id": 1, "mockTestId": 1, "title": "...", "score": 80, "correct": 8, "total": 10, "durationSec": 900, "createdAt": "2026-08-18T..." }] }
```

### SubjectReport
```json
{ "reports": [{ "name": "বাংলা ভাষা ও সাহিত্য", "score": 80, "attempted": 12, "correct": 10 }] }
```

### DashboardStats
```json
{ "stats": { "points": 120, "exams": 2, "rank": 1, "streak": 3, "questionsAnswered": 40, "accuracy": 75, "completion": 8, "flashcardsReviewed": 5, "aiQuestionsAsked": 2, "activity": [{ "date": "2026-08-18", "answered": 6, "correct": 5 }] } }
```

### AI Solver
Now **streams** a `application/json` token stream (same shape as below). Headers:
`X-Conversation-Id`, `X-AI-Source` (`groq` | `anthropic` | `mock` | `cache`), `X-AI-Model`.
```json
{ "solution": "...", "steps": ["step 1", "step 2"], "explanation": "...", "relatedConcept": "...", "source": "anthropic" | "groq" | "mock" | "cache" }
```

### AI Tutor (streaming)
Returns a `text/plain` **token stream** (real model output). Headers:
`X-Conversation-Id`, `X-AI-Intent`, `X-AI-Source` (`groq` | `anthropic` | `mock`), `X-AI-Model`.
Falls back to a clearly labelled `mock` source when no API key is set. See `docs/AI-SYSTEM.md`.

### AI Assistant
Now **streams** a `application/json` token stream (same shape as below). Headers:
`X-Conversation-Id`, `X-AI-Source` (`groq` | `anthropic` | `mock` | `cache`), `X-AI-Model`.
```json
{ "reply": "...", "suggestedActions": [{ "id": "...", "labelBn": "...", "labelEn": "...", "action": "continue|weak-topics|mistakes|what-today|practice|current-affairs|general" }], "source": "groq" | "anthropic" | "mock" | "cache" }
```

### AIConversation
```json
{ "id": "cuid", "kind": "TUTOR" | "ASSISTANT" | "SOLVER", "title": "...", "pinned": false, "createdAt": "...", "updatedAt": "..." }
```
`GET /api/ai/conversations` → `{ "conversations": [AIConversation] }`; `GET .../:id` → `{ "conversation": AIConversation, "messages": [{ "id": "...", "role": "USER"|"ASSISTANT", "status": "COMPLETE"|"FAILED", "content": "...", "intent": "...", "createdAt": "..." }] }`.

### WrongAnswerNotebook
```json
{ "questions": [Question], "page": 1, "pageSize": 20, "total": 7 }
```

### WeakTopics
```json
{ "topics": [{ "subject": "বাংলা", "topic": "নাতিহ", "attempted": 10, "correct": 3, "score": 30 }] }
```

### Leaderboard
```json
{ "entries": [{ "rank": 1, "name": "A", "points": 200, "streak": 5 }], "me": { "rank": 2, "points": 50 } }
```
`me` is `null` when the caller has no `UserProgress` row. Ranks are 1-based by descending `points`.

### DailyQuizHistory
```json
{ "history": [{ "quizId": 1, "date": "2026-01-01", "score": 80, "correct": 4, "total": 5, "completedAt": "2026-01-01T10:00:00.000Z" }] }
```

### MistakeItem
One tracked mistake (`GET /api/mistakes` list item).
```json
{
  "id": 1, "questionId": 101,
  "totalAttempts": 3, "correctAttempts": 1, "incorrectAttempts": 2,
  "consecutiveCorrect": 0, "consecutiveIncorrect": 2,
  "mistakeCount": 2, "masteryScore": 30, "masteryStatus": "STRUGGLING",
  "masteredAt": null, "isMistake": true,
  "firstIncorrectAt": "2024-01-01T00:00:00Z", "lastIncorrectAt": "2024-01-02T00:00:00Z",
  "lastCorrectAt": null, "reviewCount": 0, "lastReviewedAt": null, "nextReviewAt": null,
  "lastSubject": "Math", "lastTopic": "Algebra", "lastExam": "",
  "createdAt": "2024-01-01T00:00:00Z", "updatedAt": "2024-01-02T00:00:00Z",
  "question": { "id": 101, "subjectId": 1, "subject": "Math", "topic": "Algebra", "subtopic": "Linear Equation", "question": "...", "options": ["a","b","c","d"], "correctAnswer": "a", "explanation": "...", "difficulty": "MEDIUM", "year": null, "sourceExam": "BCS", "bcsTerm": null }
}
```
`masteryStatus` is one of `NEW | STRUGGLING | REVIEWING | IMPROVING | MASTERED`.

### MistakeStats
```json
{ "totalMistakes": 5, "unmastered": 4, "struggling": 3, "reviewing": 1, "improving": 0, "mastered": 1, "totalAttempts": 12, "totalCorrect": 5, "accuracy": 42 }
```

### MistakeSubjects
```json
{ "subjects": [{ "subject": "Math", "count": 3, "unmastered": 2 }] }
```

### OverallStats
`GET /api/mistakes/stats/overall` — overall answer-history accuracy across every
question flow (practice, exams, daily quizzes). `accuracy = round(totalCorrect / totalAttempts * 100)`.
```json
{ "totalAttempts": 120, "totalCorrect": 84, "totalWrong": 36, "accuracy": 70, "questionsAttempted": 25 }
```

### MistakeSelection
`GET /api/mistakes/exam/config` — a subject → topic → subtopic tree scoped
strictly to the user's own wrong questions. Each node carries the count of wrong
questions available under it, so the dashboard can offer subject/topic/subtopic
preferences when building a mistake exam.
```json
{ "subjects": [{ "subject": "Math", "count": 8, "topics": [{ "topic": "Algebra", "count": 5, "subtopics": [{ "subtopic": "Quadratics", "count": 3 }] }] }] }
```

### MistakeExamBuild
`POST /api/mistakes/exam` returns an `ExamBuild`-shaped payload. Because the
mistake exam is a *practice drill* (studied, not graded), each question includes
`correctAnswer` (the correct option string) and `explanation` so `QuestionDrill`
can grade and reveal the answer. `focus` is one of `most_wrong | recently_wrong | weakest_topics | due_for_review | random`.
Optional `topic`/`subtopic` narrow selection to the caller's wrong questions matching that preference.
```json
{ "questions": [{ "id": 101, "subjectId": 1, "subject": "Math", "topic": "Algebra", "subtopic": "", "question": "...", "options": ["a","b","c","d"], "correctAnswer": "c", "explanation": "...", "difficulty": "MEDIUM", "year": null, "sourceExam": "BCS" }] }
```

### MistakeFeedback
Per-question mastery feedback returned on `POST /api/practice/submit` (and per
review item on `POST /api/exam/submit`). The mistake drill uses it to show
question-level labels: **Improved!** (correct, still a mistake), **Keep Working
On It** (wrong), and **Mastered!** (`justMastered: true`).
```json
{ "feedback": { "101": { "masteryStatus": "MASTERED", "isMistake": false, "justMastered": true } } }
```
`masteryStatus` is one of `NEW | STRUGGLING | REVIEWING | IMPROVING | MASTERED`.

### ExamConfig (selection tree)
The tree mirrors the recursive Topic taxonomy. Every node carries its aggregated
subtree `questionCount`; nodes with zero questions are pruned. A node with
non-empty `children` is a group; a node with empty `children` is a leaf. The
`path` values are what the client sends back in `ExamBuild`.
```json
{ "subjects": [{ "id": 1, "nameBn": "বাংলা", "nameEn": "Bangla", "icon": "📘", "color": "text-emerald-400", "bg": "bg-emerald-500/10", "questionCount": 20, "nodes": [{ "id": 10, "name": "ভাষা", "path": "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা", "depth": 1, "questionCount": 12, "children": [{ "id": 24, "name": "সমার্থক শব্দ", "path": "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমার্থক_শব্দ", "depth": 2, "questionCount": 4, "children": [] }] }] }] }
```
The exam engine supports arbitrarily deep trees (English goes to depth 4).

### ExamBuild
```json
{ "exam": { "examId": "...", "durationSec": 900, "subjects": ["বাংলা"], "shortfall": 0, "questions": [{ "id": 1, "subject": "বাংলা", "topic": "বাক্য শুদ্ধি", "subtopic": "উপযুক্ত শব্দ চয়ন", "question": "...", "options": ["A","B","C","D"], "difficulty": "EASY" }] } }
```
Request body:
```json
{ "durationSec": 900, "questionCount": 10, "subjects": [{ "subjectId": 1, "paths": ["01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমার্থক_শব্দ"], "count": 4 }] }
```
- `paths: []` selects the whole subject; otherwise questions are drawn from the
  **union** of the selected nodes' subtrees (selecting a group includes all its
  descendants).
- Each selected subject may carry an optional `count`. When **every** selected
  subject provides an integer `count`, the effective `questionCount` is their sum
  and each subject is allocated exactly `min(count, available)`; a subject's
  count may be `0` (excluded). Otherwise the legacy behaviour applies: the global
  `questionCount` is distributed proportionally (largest remainder) across subjects.
`questions` never include `correctAnswer` or `explanation` — those are only
returned after submission. `shortfall` reports the number of requested
questions that could not be sourced from the selection.

### ExamResult
```json
{ "result": { "examId": "...", "correct": 8, "wrong": 2, "unanswered": 0, "total": 10, "score": 8, "pointsEarned": 80, "accuracy": 100, "percentage": 80, "durationSec": 900, "subjects": ["বাংলা"], "review": [{ "questionId": 1, "question": "...", "options": ["A","B","C","D"], "selected": "A", "correctAnswer": "A", "explanation": "...", "isCorrect": true }] } }
```
Scoring follows the BCS convention: **+1** per correct answer, **−0.5** per
wrong answer, **0** for unanswered. `score` = correct − wrong×0.5; `accuracy`
= correct/attempted; `percentage` = score/total (clamped 0–100).

## Error Shapes

```json
{ "error": "Unauthorized" }
```

```json
{ "error": "Provide 'text' or 'imageBase64'." }
```

## Client SDK

All API calls are wrapped in `frontend/lib/services/api.ts`:

```ts
import { api } from "@/lib/services/api";

const questions = await api.questions({ subject: "বাংলা", limit: 10 });
```

### `?paths=` on `GET /api/questions`
`paths` is a comma-separated list of taxonomy paths (slash-joined, URL-encoded)
matching the `path` values from `ExamConfig`. It narrows the result to questions
whose leaf path is one of the given paths **or** lives anywhere under one of
their subtrees — the same eligibility semantics as `ExamBuild`. Selecting a group
path includes all its descendants. Examples:
```
GET /api/questions?subject=বাংলা&paths=01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমার্থক_শব্দ
GET /api/questions?paths=01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা&paths=02_English/Literature&limit=100
```
Passing no `paths` returns the whole subject (or the entire question set when no
other filter is given). The client SDK accepts an array: `api.questions({ paths: ["a/b"], limit: 10 })`.
