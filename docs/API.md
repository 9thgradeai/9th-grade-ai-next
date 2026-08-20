# API

## Base URL

All API routes live under `/api/*`.

## Authentication

Auth-protected routes require the `auth_token` HttpOnly cookie (JWT, 7-day expiry, SameSite=Lax).

- `GET /api/auth/me` — Returns the current user or `401`.
- `POST /api/auth/login` — Authenticates `{ email, password }`, sets cookie, returns user.
- `POST /api/auth/register` — Creates account `{ name, email, password }`, sets cookie, returns user.
- `POST /api/auth/logout` — Clears the session cookie.
- `POST /api/auth/refresh` — Re-issues the session JWT, extends the `auth_token` cookie, returns `{ expiresIn }` (ms until expiry). Requires a valid session cookie; `401` otherwise.

## Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/questions` | List questions, filterable by `?subject=`, `?topic=`, `?difficulty=`, `?q=`, `?limit=`, `?paths=` |
| GET | `/api/question-bank/categories` | List question bank categories |
| GET | `/api/flashcards` | List flashcards, optionally filtered by `?subject=` |
| GET | `/api/exam-schedule` | List published exam dates (public, no auth) |
| GET | `/api/study-plan` | **Auth required** — List the caller's study plan tasks |
| GET | `/api/daily-quiz` | Get today's quiz |
| GET | `/api/flash-news` | List flash news items |
| GET | `/api/recommendations` | List AI recommendations |
| PATCH | `/api/progress` | **Auth required** — Patch user progress (whitelisted fields only) |
| GET | `/api/notifications` | **Auth required** — List notifications with per-user read state |
| GET | `/api/badges` | List achievement badges |
| GET | `/api/subject-reports` | **Auth required** — Per-subject reports from the caller's attempts (`name`, `score`, `attempted`, `correct` — no fabricated trend) |
| GET | `/api/mock-test/results` | **Auth required** — Caller's recent mock test results |
| GET | `/api/documents` | List documents (syllabus, circulars) |
| GET | `/api/bookmarks` | **Auth required** — Get bookmarked question IDs |
| POST | `/api/bookmarks` | **Auth required** — Toggle bookmark `{ questionId }` |
| POST | `/api/study-plan/tasks/:id/toggle` | **Auth required** — Toggle task completion |
| GET | `/api/dashboard-stats` | **Auth required** — Caller's dashboard stats (per-user) |
| POST | `/api/practice/submit` | **Auth required** — Grade practice answers `{ answers: [{ questionId, selected }] }` |
| POST | `/api/daily-quiz/submit` | **Auth required** — Grade + persist daily quiz answers `{ quizId, answers }` |
| POST | `/api/notifications/:id/read` | **Auth required** — Mark a notification read |
| GET | `/api/exam/config` | List the custom-exam selection tree (subjects → topics → subtopics with question counts) |
| POST | `/api/exam/build` | Build a custom BCS-style exam `{ subjects: [{ subjectId, groups, count? }], questionCount, durationSec }` |
| POST | `/api/exam/submit` | **Auth required** — Grade + persist a custom exam `{ answers: [{ questionId, selected }] }` |
| POST | `/api/ai/solver` | **Auth required** — Solve a question `{ text?, imageBase64?, subject?, subjectId?, questionId? }` → `{ solution, steps, explanation, relatedConcept, source }` |
| POST | `/api/ai/tutor` | **Auth required** — **Streaming** AI tutor turn `{ messages: [{ role, content }], conversationId?, subjectId?, topicId?, questionId?, topicPath?, intent? }` |
| POST | `/api/ai/assistant` | **Auth required** — Study guidance `{ messages, conversationId?, questionId?, intent? }` → `{ reply, suggestedActions, source }` |
| GET | `/api/ai/conversations` | **Auth required** — List the caller's AI conversations (`?kind=TUTOR\|ASSISTANT\|SOLVER`) |
| POST | `/api/ai/conversations` | **Auth required** — Create an AI conversation `{ kind, title?, subjectId?, topicId?, topicPath? }` |
| GET | `/api/ai/conversations/:id` | **Auth required** — Get one conversation + messages (ownership-checked) |
| PATCH | `/api/ai/conversations/:id` | **Auth required** — Rename a conversation `{ title }` |
| DELETE | `/api/ai/conversations/:id` | **Auth required** — Delete a conversation (ownership-checked) |
| POST | `/api/ai/feedback` | **Auth required** — Record feedback `{ rating: "HELPFUL"\|"NOT_HELPFUL", messageId?, category?, comment? }` |

## Response Shapes

### Subject
```json
{ "id": 1, "nameBn": "বাংলা", "nameEn": "Bangla", "icon": "📖", "color": "...", "bg": "...", "sortOrder": 0 }
```

### Question
```json
{ "id": 1, "subjectId": 1, "subject": "বাংলা", "topic": "বাক্য শুদ্ধি", "question": "...", "options": ["A","B","C","D"], "correctAnswer": "A", "explanation": "...", "difficulty": "EASY", "year": 2023, "sourceExam": "BCS" }
```

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
```json
{ "solution": "...", "steps": ["step 1", "step 2"], "explanation": "...", "relatedConcept": "...", "source": "anthropic" | "groq" | "mock" }
```

### AI Tutor (streaming)
Returns a `text/plain` **token stream** (real model output). Headers:
`X-Conversation-Id`, `X-AI-Intent`, `X-AI-Source` (`groq` | `anthropic` | `mock`), `X-AI-Model`.
Falls back to a clearly labelled `mock` source when no API key is set. See `docs/AI-SYSTEM.md`.

### AI Assistant
```json
{ "reply": "...", "suggestedActions": [{ "id": "...", "labelBn": "...", "labelEn": "...", "action": "continue|weak-topics|mistakes|what-today|practice|current-affairs|general" }], "source": "groq" | "anthropic" | "mock" }
```

### AIConversation
```json
{ "id": "cuid", "kind": "TUTOR" | "ASSISTANT" | "SOLVER", "title": "...", "createdAt": "...", "updatedAt": "..." }
```
`GET /api/ai/conversations` → `{ "conversations": [AIConversation] }`; `GET .../:id` → `{ "conversation": AIConversation, "messages": [{ "id": "...", "role": "USER"|"ASSISTANT", "status": "COMPLETE"|"FAILED", "content": "...", "intent": "...", "createdAt": "..." }] }`.

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
