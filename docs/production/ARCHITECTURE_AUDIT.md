# 9Th-Grade AI — Architecture Audit

## Overall Architecture

The project follows a Next.js App Router architecture with a clear separation of concerns:

- **Frontend** (`frontend/`): Client React components, TypeScript, Tailwind CSS
- **Application** (`app/`): Next.js pages, layouts, API routes (Route Handlers)
- **Domain** (`backend/services/`): Business logic, data access interfaces
- **Infrastructure** (`backend/db.ts`, `database/prisma/`): Prisma ORM, database connections
- **AI** (`app/api/ai/*`): AI provider integrations (Groq primary, Anthropic fallback, mock)

### Data Flow
```
Client Component
  → frontend/lib/services/api.ts (browser fetch wrapper)
  → Next.js API routes (app/api/*)
  → backend/services/* (server-side business logic)
  → backend/db.ts (PrismaClient singleton)
  → database/prisma/schema.prisma (DB schema)
  → PostgreSQL (production) / SQLite (development)
```

### Authentication Architecture
- **Stateless JWTs** signed with HS256 using `AUTH_SECRET`
- **HttpOnly cookies** named `auth_token` set via `setSessionCookie()`
- **7-day expiry** with 30-day "remember me" option
- **Session table** in Prisma for concurrency tracking (`MAX_CONCURRENT_SESSIONS = 5`)
- **Token versioning** (`tokenVersion`) for password change / revoke-all
- **Grace window** for secret rotation (previous secret accepted during transition)

**Auth API Routes:**
- `POST /api/auth/signup` — Create account with email/password
- `POST /api/auth/signin` — JWT sign-in, set session cookie
- `POST /api/auth/signout` — Clear session cookie, delete session row
- `POST /api/auth/refresh` — Refresh session (uses tokenVersion check)
- `POST /api/auth/reset-password` — Password reset workflow
- `GET /api/auth/me` — Get current user from cookie
- `GET /api/auth/check-banned` — Ban status check

### API Route Pattern
All route handlers follow this structure:
1. `assertSameOrigin(request)` — Prevent open redirect
2. `getUserIdFromRequest(request)` — Extract user from JWT cookie
3. `UnauthorizedError` if no valid user
4. `enforceAiQuotas(request, endpoint, userId)` — Rate limiting
5. `readJsonBody(request, maxSize)` — Parse and validate input size
6. Business logic delegation to `backend/services/*`
7. `toHttpResponse(err)` — Consistent error formatting
8. `applySecurityHeaders(res)` — Security headers on all responses
9. `NextResponse.json()` or `Response(stream)` for AI streaming

### AI Integration Architecture
- **ModelRouter** pattern: Groq primary, Anthropic fallback, labelled mock
- **Centralized AI provider configuration** in `backend/ai/`
- **Replaceable model identifiers** — model names come from config, not hardcoded
- **Structured output validation** using Zod schemas
- **Token usage tracking** via `AIUsage` model
- **Retry policies** with exponential backoff
- **Graceful fallback** to mock when API keys unavailable or rate-limited

**AI Endpoints:**
- `POST /api/ai/solver` — Step-by-step question solver
- `POST /api/ai/tutor` — Streaming AI tutor
- `POST /api/ai/conversations` — Conversation management
- `POST /api/ai/agent` — Agent foundation (Phase 1)

### Exam Engine Architecture
- **Idempotent attempt lifecycle**: `registerExamAttempt` → write attempt row → `submitExamAttempt` → upsert result
- **AttemptId** (UUID) minted at exam start, reused on retries for dedup
- **QuestionSetHash** (SHA-256) verifies submission corresponds to built exam
- **ExamAttempt** table: THE single source of truth for submission status
- **ExamAttemptResult** (one-to-one with MockTestResult) for history integration
- **Timer enforcement** on server side — client cannot extend timed exam

**Exam API Routes:**
- `POST /api/exam/start` — Register attempt, validate questionIds (1-200), durationSec (0-21600)
- `POST /api/exam/submit` — Submit answers, validate against questionIds, compute score
- `POST /api/exams/:attemptId/submit` — Live client path (deprecated shim at `/api/exam/submit`)

### Question Bank Architecture
- **Hierarchical taxonomy**: Subject → Topic (tree with parent/children) → Question
- **Question model** supports SINGLE_CHOICE and MULTIPLE_CHOICE types
- **Multi-type answering fields**: `correctAnswer` (legacy/authoritative for single), `correctAnswers` (array for multiple), `statements` (I/II/III stems), `media` (images)
- **Import pipeline**: Multi-line MCQ imports must preserve question-option-answer-explanation association
- **Uniqueness constraint**: `@@unique([subjectId, sourceKey])` prevents duplicate source keys per subject
- **Topic path**: Full path from subject root (e.g., "04_আন্তর্জাতিক_বিষয়াবলি/০২_নিরাপ্তা_ও_ক্ষমতা/আন্তর্জাতিক_নিরাপ্তা")

**Content API Routes:**
- `GET /api/questions` — Search/filter with 20+ query parameters
- `GET /api/questions/[id]` — Get single question by ID
- Question type validation, option validation, answer key validation

### Database Schema Key Models
| Model | Purpose |
|-------|---------|
| `User` | User account with auth provider, onboarding state, exam target |
| `ExamEcosystem` | BCS, Bangladesh Bank, Teacher — content isolation boundaries |
| `Subject` | Academic subject (Bangla, English, Mathematics, etc.) |
| `Topic` | Hierarchical taxonomy node (tree structure) |
| `Question` | MCQ with options, correct answer, explanation, media |
| `Exam` | Examination configuration (stage, duration, total questions) |
| `ExamCategory` → `Exam` → `ExamPaper` | Hierarchical exam library |
| `UserQuestionProgress` | Per-user mastery/mistake tracking (SRS) |
| `Flashcard` / `FlashcardUserState` | Spaced-repetition system |
| `MockTest` / `MockTestResult` | Practice test history |
| `DailyQuiz` / `DailyQuizParticipation` | Daily quiz participation |
| `StudyPlanDay` / `StudyTask` / `StudyTaskCompletion` | Adaptive study planner |
| `UserBadge` / `UserCustomizedNote` | Gamification and personal notes |
| `AuditLog` | Security event trail (best-effort writes) |

### Rate Limiting Architecture
- **Per-user minute quota** — Store-backed with daily backstop
- **Per-user daily quota** — Same mechanism
- **Endpoints have named quotas**: "solver", "tutor", "exam-start", etc.
- `enforceAiQuotas(request, endpoint, userId)` middleware handles the logic

### Storage Architecture
- **Google Drive BYOS** (Bring Your Own Storage) via `StorageConnection`, `StorageFile`, `SyncJob` models
- **Sync operations**: UPSERT, DELETE, MIGRATE, RESTORE
- **Per-entity type**: bookmarks, flashcard state, vocab progress, mistake notes
- **Idempotency keys** prevent duplicate sync operations

### Middleware
- Single middleware at `app/_middleware.ts` handling:
  - Request ID generation
  - Timing metrics
  - CORS headers
  - Security headers
  - Cache control
  - JSON body reading with size limits
  - Origin assertion

### Key Infrastructure
- **Prisma** as ORM — schema pushed directly (`npm run db:push`), no migrations
- **PostgreSQL** via Neon (production) with `sslmode=require`
- **Vercel** for deployment
- **OpenCode** for AI-assisted development (MCP servers for GitHub, Context7, Playwright, Postgres)
- **Sentry** for error monitoring (needs auth)
- **Playwright** for E2E testing

---

## Strengths (What Works Well)

1. **Clear architectural boundaries** — Well-separated concerns with explicit imports
2. **JWT auth with session table** — Concurrency control + tokenVersion revocation = strong auth
3. **Exam idempotency** — AttemptId + QuestionSetHash prevents double-submission
4. **AI quota enforcement** — Per-user quotas with daily backstop
5. **Comprehensive Prisma schema** — Rich data model with proper constraints
6. **Type-safe API routes** — Input validation via Zod-like schemas in `validation.ts`
7. **Security headers on all responses** — `applySecurityHeaders` middleware
8. **OAuth Google sign-in** — Working social authentication
9. **Comprehensive question search** — 20+ filter parameters
10. **Comprehensive script tooling** — 50+ npm scripts for DB, QA, math audits

## Weaknesses (What Needs Improvement)

1. **`{env:...}` MCP variable substitution broken** — Fixed by removing explicit github config
2. **AUTH_SECRET in production** — Dev generates temp secret; prod must set it
3. **AI provider key exposure risk** — Must verify no keys in client bundles
4. **Question data integrity** — No automated duplicate/invalid answer detection
5. **Limited test coverage** — Need E2E critical journeys
6. **No bundle size monitoring** — Next.js Analyze not integrated into CI
7. **Cron job error handling** — Background jobs lack monitoring
8. **Accessibility gaps** — Incomplete a11y audit across all components
9. **Responsive edge cases** — Some dashboard sections not tested on mobile
10. **Bangla Unicode pipeline** — Need verification throughout import → display

## Critical External Integrations Status

| Integration | Status | Notes |
|-------------|--------|-------|
| Groq AI API | ✓ Configured | Primary AI provider |
| Anthropic AI API | ✓ Configured | Fallback provider |
| Tavily search | ✓ Configured | For current affairs |
| Google OAuth 2.0 | ✓ Working | Social sign-in |
| PostgreSQL (Neon) | ✓ Working | Production database |
| GitHub MCP (OpenCode) | ✓ Working | After config fix |
| Context7 MCP | ✓ Connected | Documentation |
| Playwright MCP | ✓ Connected | E2E testing |

## Requires Human Approval / External Credentials

| Item | Blocker | Action Required |
|------|---------|-----------------|
| `AUTH_SECRET` production value | ⛔ Not set | Set in `.env.local` production |
| `GROQ_API_KEY` | ⛔ Not verified | Verify in `.env.local` |
| `TAVILY_API_KEY` | ⛔ Not verified | Verify in `.env.local` |
| `VERCEL_OIDC_TOKEN` | ⛔ Paid infrastructure | Only if deploying to Vercel production |
| Live deployment | ⛔ Requires approval | Staging/preview only without explicit auth |

---

*Generated during Phase Two: Complete Repository Investigation*