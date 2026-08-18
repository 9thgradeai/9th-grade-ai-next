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
| GET | `/api/subjects` | List all subjects |
| GET | `/api/topics` | List topics, optionally filtered by `?subject=` |
| GET | `/api/questions` | List questions, filterable by `?subject=`, `?topic=`, `?difficulty=`, `?q=`, `?limit=` |
| GET | `/api/question-bank/categories` | List question bank categories |
| GET | `/api/archive` | List exam archives |
| GET | `/api/flashcards` | List flashcards, optionally filtered by `?subject=` |
| GET | `/api/exam-schedule` | List published exam dates (public, no auth) |
| GET | `/api/study-plan` | **Auth required** — List the caller's study plan tasks |
| GET | `/api/daily-quiz` | Get today's quiz |
| GET | `/api/mock-test` | List mock tests |
| GET | `/api/flash-news` | List flash news items |
| GET | `/api/recommendations` | List AI recommendations |
| GET | `/api/progress` | **Auth required** — Get user progress |
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
| POST | `/api/mock-test/submit` | **Auth required** — Grade + persist a mock test `{ mockTestId, answers, durationSec? }` |
| POST | `/api/daily-quiz/submit` | **Auth required** — Grade + persist daily quiz answers `{ quizId, answers }` |
| POST | `/api/flashcards/review` | **Auth required** — Log an SRS review `{ flashcardId, rating }` (0-3) |
| POST | `/api/notifications/:id/read` | **Auth required** — Mark a notification read |
| POST | `/api/ai/solver` | Solve a question `{ text?, imageBase64?, subject? }` |
| POST | `/api/ai/tutor` | Chat with AI tutor `{ messages: [{ role, content }] }` |

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
{ "solution": "...", "steps": ["step 1", "step 2"], "source": "anthropic" | "mock", "note": "..." }
```

### AI Tutor (streaming)
Returns `text/plain` stream. Uses the Groq-backed global assistant (`groq+web`
when `TAVILY_API_KEY` is set, otherwise `groq`), falling back to a clearly
labelled `mock` source. See `docs/AI-SYSTEM.md`.

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

const subjects = await api.subjects();
const questions = await api.questions({ subject: "বাংলা", limit: 10 });
```
