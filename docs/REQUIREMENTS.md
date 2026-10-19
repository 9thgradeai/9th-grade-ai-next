# Project Requirements — 9Th-Grade AI

> Version: 0.2.2 · Status: Living document · Last reconciled: October 2026
>
> This document is the canonical **requirements** reference. `PRODUCT.md` describes *what the product is*; this document describes *what the system must do*, the constraints it operates under, and how each requirement maps to the code that satisfies it.

---

## 1. Product Vision

9Th-Grade AI is a **free, open-source, AI-powered exam preparation platform** for Bangladeshi government job aspirants. It targets competitive recruitment exams — **BCS Preliminary**, **Bangladesh Bank**, **Assistant Director**, and other **9th-grade (pay-scale) government posts**.

**Core promise:** every candidate gets a single platform that unifies the official syllabus, a real previous-year question bank, a BCS-accurate exam engine, spaced-repetition revision, an adaptive study plan, and a bilingual (Bangla/English) AI tutor — at zero cost, forever.

## 2. Scope

### In Scope

| Domain | Summary |
|--------|---------|
| Accounts | Email/password signup with verification, Google OAuth, sessions, account export/deletion |
| Syllabus | Recursive topic taxonomy mirroring the official BCS syllabus (10 subjects, 348 nodes, 284 leaves, up to 4 levels) |
| Practice | Custom exams, mock tests, daily quiz, quick practice, real-exam papers, exam archive |
| Assessment | BCS-accurate grading (+1 / −0.5 / 0), per-subject reports, mistake notebook, weak-topic detection |
| Revision | SM-2 spaced-repetition flashcards, wrong-answer notebook, vocabulary decks |
| AI | Tutor, solver (text + image), study-coach agent, explanations, answer evaluation, current-affairs generation |
| Motivation | Points, streaks, rank, badges, leaderboard, recommendations, exam countdown, notifications |
| Content | Flash news, current affairs, syllabus documents/circulars, offline packs |
| Portability | BYOS — export/import/backup of user data via Google Drive |

### Out of Scope (Non-Goals)

- No paid tiers, premium gating, or monetization of any feature.
- No mobile-native apps (responsive web + PWA service worker only).
- No social features beyond the leaderboard.
- No real-time multi-user collaboration.
- No content authored in-app by students (content is seeded/admin-managed).

## 3. Users & Roles

| Role | Capabilities |
|------|-------------|
| **Guest (anonymous)** | Browse landing page, syllabus explorer, public tracks; register/login |
| **Student (default)** | Everything below the admin boundary: exams, flashcards, AI, progress, settings, data export |
| **Admin** | Student capabilities plus user management (`/api/admin/users`) and vocabulary administration (`/api/admin/vocab`) — gated by the `ADMIN` role on the `User` model |

## 4. Functional Requirements

Requirement IDs are stable; cite them in issues and PRs.

### 4.1 Accounts & Authentication (FR-AUTH)

| ID | Requirement |
|----|-------------|
| FR-AUTH-01 | The system shall register a user with name, email, and password, hash the password with bcryptjs (cost 10), and issue a session. |
| FR-AUTH-02 | The system shall authenticate via email/password and via Google OAuth 2.0 (Authorization Code + PKCE). |
| FR-AUTH-03 | Sessions shall be JWTs (jose) stored **only** in an HttpOnly `auth_token` cookie — 7-day expiry, SameSite=Lax, Secure in production. The client shall never persist the token. |
| FR-AUTH-04 | The system shall verify email via a mailed link; while SMTP/Resend are unconfigured, accounts shall auto-verify (dev mode). |
| FR-AUTH-05 | The system shall support password reset, password change, and revocation of all sessions. |
| FR-AUTH-06 | The system shall let the user export and delete their account data. |
| FR-AUTH-07 | `proxy.ts` (edge middleware) shall redirect unauthenticated users away from `/dashboard` and authenticated users away from `/login`. |
| FR-AUTH-08 | The system shall gate admin endpoints by role and return `403` for non-admins. |

### 4.2 Content & Taxonomy (FR-CONTENT)

| ID | Requirement |
|----|-------------|
| FR-CONTENT-01 | The syllabus shall be stored as a recursive `Topic` tree (`parentId`, `slug`, `path`, `depth`, `questionCount`) seeded from `database/data/taxonomy.json` — never hardcoded in the client. |
| FR-CONTENT-02 | Bengali names shall be NFC-normalised so composed/decomposed forms always resolve. |
| FR-CONTENT-03 | Questions shall be importable from folder-structured `.txt` files (folder path = taxonomy path) and from the flat `questions_database.txt`. |
| FR-CONTENT-04 | `Question.correctAnswer` shall hold the option **text**, not a letter (ADR-033). |
| FR-CONTENT-05 | All math content shall render book-exactly via the canonical KaTeX pipeline; `Question.rawMath` opts out (ADR-028, ADR-036). Every question-text writer shall be gated by the normalizer (ADR-030). |
| FR-CONTENT-06 | Seeding shall be **idempotent** — re-running `db:seed` must not duplicate or mutate user data; destructive schema changes must fail the deploy loudly (`db:deploy-sync`). |

### 4.3 Practice & Exams (FR-EXAM)

| ID | Requirement |
|----|-------------|
| FR-EXAM-01 | Users shall build a custom exam from any combination of subjects/topics/subtopics via a multi-select taxonomy picker, with per-subject question counts. |
| FR-EXAM-02 | Exam building shall be **deterministic** (seeded) and shall never leak `correctAnswer`/`explanation` in the build response. |
| FR-EXAM-03 | The engine shall grade BCS-style: **+1** correct, **−0.5** wrong, **0** unanswered. |
| FR-EXAM-04 | Custom exams shall run on a wall-clock timer and survive refreshes via `localStorage` resume. |
| FR-EXAM-05 | Mock tests shall auto-submit on time expiry and persist results as `MockTestResult` history. |
| FR-EXAM-06 | The system shall support a daily quiz graded for real points, quick practice with inline review, real-exam paper practice, and an exam archive by category. |
| FR-EXAM-07 | Every graded attempt shall be persisted (`QuestionAttempt` / `ExamAttempt`) and shall feed accuracy, streaks, subject reports, and recommendations. |
| FR-EXAM-08 | Submissions shall be bounded (200-answer cap) and CSRF-origin-checked. |

### 4.4 Revision & Learning Tools (FR-LEARN)

| ID | Requirement |
|----|-------------|
| FR-LEARN-01 | Flashcards shall use the SM-2 algorithm (ease factor, interval, repetitions, nextReview) with per-user `FlashcardReview` logs and due-deck scheduling. |
| FR-LEARN-02 | The system shall maintain a mistake notebook fed by wrong answers, with per-exam practice (`/api/mistakes/exam`), stats, and weak-topic detection (`/api/weak-topics`). |
| FR-LEARN-03 | The system shall provide vocabulary decks with review, quiz, analytics, daily words, and word-of-the-day. |
| FR-LEARN-04 | The study planner shall produce day-by-day completable, priority-ranked tasks. |
| FR-LEARN-05 | Users shall be able to bookmark any question and retrieve their bookmark set. |

### 4.5 AI Features (FR-AI)

| ID | Requirement |
|----|-------------|
| FR-AI-01 | The AI tutor shall stream bilingual (Bangla/English) responses grounded in live web search when `TAVILY_API_KEY` is set. |
| FR-AI-02 | The AI solver shall accept text **and** base64 image input and return a solution plus numbered steps as structured JSON. |
| FR-AI-03 | Every AI response shall carry an explicit provenance label (`source`: `groq+web` / `groq` / `anthropic` / `mock`, plus the `X-AI-Source` header). **When no API key is set, the app must run end-to-end on clearly-labelled mock responses.** |
| FR-AI-04 | The study-coach agent (`/api/ai/agent`) shall run a bounded loop (`AI_AGENT_MAX_STEPS`, default 8) with checkpointing and persistence, and shall fall back to mock when unkeyed. |
| FR-AI-05 | AI traffic shall be rate-limited per user (`RL_AI_PER_MIN`, `RL_AI_DAILY`) and guarded by a daily spend cap (`AI_DAILY_BUDGET_USD`). |
| FR-AI-06 | Model selection shall go through the model router (`AI_MODEL_PRIMARY`, `AI_MODEL_FAST`, tier routing) with the provider registry as the swap point (Groq/Anthropic/Mock). |
| FR-AI-07 | **LLM output shall never be used for authorization, validation, or security decisions.** |
| FR-AI-08 | Current affairs shall be generated on a schedule (Vercel Cron + `CRON_SECRET`) and exported (docx). |

### 4.6 Progress & Motivation (FR-PROG)

| ID | Requirement |
|----|-------------|
| FR-PROG-01 | Dashboard KPIs (points, accuracy, streak, rank, 7-day activity) shall be **computed from real attempts** — no fabricated or mock numbers on the dashboard (ADR-010). |
| FR-PROG-02 | The system shall award badges (COMMON → LEGENDARY), maintain a leaderboard, and drive recommendations from per-subject accuracy. |
| FR-PROG-03 | The system shall publish real exam dates with countdown timers. |
| FR-PROG-04 | The system shall deliver in-app notifications with per-user read state and preferences. |

### 4.7 Data Portability — BYOS (FR-BYOS)

| ID | Requirement |
|----|-------------|
| FR-BYOS-01 | Users shall export their data and import/restore backups. |
| FR-BYOS-02 | Users shall connect a Google Drive account for continuous sync; OAuth tokens shall be encrypted at rest with `GOOGLE_OAUTH_ENCRYPTION_KEY` (must differ from `AUTH_SECRET`). |
| FR-BYOS-03 | Sync/import work shall run through a worker (`/api/storage/worker`) rather than in the request path. |

## 5. Non-Functional Requirements (NFR)

### 5.1 Security (NFR-SEC)

| ID | Requirement | Enforcement |
|----|-------------|-------------|
| NFR-SEC-01 | Secrets only via `process.env`; `.env.local` gitignored | CI review, `.gitignore` |
| NFR-SEC-02 | SQL injection impossible — parameterised Prisma queries only, never string-concatenated SQL | Convention + code review |
| NFR-SEC-03 | Security headers on every response (nosniff, DENY framing, HSTS in prod, referrer/permissions policy) | `proxy.ts` + `next.config.ts` |
| NFR-SEC-04 | Rate limiting on auth, AI, and submission endpoints; production **requires** Redis (`REDIS_URL`) for distributed counters | `backend/rate-limit.ts`, ADR-0009 |
| NFR-SEC-05 | Server-only code (`backend/`) must never enter a client bundle | `server-only` import + build |
| NFR-SEC-06 | Logs must redact passwords/tokens/cookies/secrets | pino redaction config |

### 5.2 Performance (NFR-PERF)

| ID | Requirement | Enforcement |
|----|-------------|-------------|
| NFR-PERF-01 | Client JS shall stay under the committed perf budget | `npm run perf:check` gate in CI (ADR-0012, ADR-0014, ADR-0063) |
| NFR-PERF-02 | API responses shall not be server-cached; `fetch()` uses `cache: "no-store"` | Convention |
| NFR-PERF-03 | No server-side data fetching waterfall for dashboard tabs — each tab fetches its own endpoints on mount | Architecture |

### 5.3 Accessibility (NFR-A11Y)

| ID | Requirement |
|----|-------------|
| NFR-A11Y-01 | WCAG 2.2: semantic HTML, focus-visible rings, ARIA-labelled icon buttons, dialog focus traps. |
| NFR-A11Y-02 | Touch targets ≥44px on mobile; pointer targets ≥24px on web. |
| NFR-A11Y-03 | `prefers-reduced-motion` respected globally (`MotionConfig reducedMotion="user"`). |
| NFR-A11Y-04 | iOS safe areas supported (`viewport-fit=cover`, `pt-safe`/`pb-safe`). |

### 5.4 Reliability & Quality (NFR-REL)

| ID | Requirement | Enforcement |
|----|-------------|-------------|
| NFR-REL-01 | All four quality gates pass before merge: `typecheck`, `lint`, `test` (coverage-enforced), `build` | CI (`.github/workflows/ci.yml`) |
| NFR-REL-02 | Coverage thresholds are ratcheted **up only** — never lowered | `vitest.config.ts` |
| NFR-REL-03 | Critical flows covered by Playwright E2E (signup → onboarding → first mock test, storage flows) | `tests/e2e/*`, CI e2e job |
| NFR-REL-04 | Errors shall be typed (`AppError` hierarchy), reported to Sentry in production, and never leak internals to clients | `backend/errors.ts`, `instrumentation.ts` |
| NFR-REL-05 | Health endpoint `/api/health` available for post-deploy checks | `app/api/health` |

### 5.5 Internationalization (NFR-I18N)

| ID | Requirement |
|----|-------------|
| NFR-I18N-01 | The UI and AI surfaces shall be bilingual (Bangla/English); Bengali matching shall be Unicode NFC-safe. |

### 5.6 Platform & Compatibility (NFR-PLAT)

| ID | Requirement |
|----|-------------|
| NFR-PLAT-01 | Node.js 20+ (CI: Node 22); PostgreSQL is **required** in dev and prod (schema is `postgresql` — SQLite unsupported). |
| NFR-PLAT-02 | Primary deploy target Vercel (serverless); database Neon (pooled connection string for app, `DIRECT_DATABASE_URL` for migrations). |
| NFR-PLAT-03 | Works with **zero external services** for local dev/CI (DB aside): AI falls back to labelled mocks, email auto-verifies. |

## 6. Key Acceptance Criteria (Core Flows)

### AC-1: First-time candidate
> Given a visitor on `/`, when they register and verify, then they land on the dashboard, take the daily quiz, build one custom exam, submit it, and see weak areas — with every number derived from real activity.

### AC-2: BCS-accurate grading
> Given a 100-question custom exam with 60 correct, 20 wrong, 20 unanswered, the score shall be exactly `60 − 10 = 50` (50%), and the attempt shall be persisted and reflected in accuracy/streak/subject reports after refresh.

### AC-3: Zero-key AI fallback
> Given no AI keys configured, `/api/ai/tutor` and `/api/ai/solver` shall respond with clearly-labelled mock output (`source: "mock"`) and the UI shall display the mock provenance label.

### AC-4: Idempotent deploy
> Given a production deploy, `db:deploy-sync` shall push the schema non-destructively and run the idempotent seed; a destructive schema change shall fail the deploy loudly rather than silently drop data.

### AC-5: Session isolation
> Given a valid session cookie, the client JS shall have no access to the token (HttpOnly), and logout/revocation shall invalidate access within the request that follows.

## 7. Environmental Constraints

| Constraint | Detail |
|------------|--------|
| Database | PostgreSQL only; Neon pooled + direct URLs in production |
| Secrets | `AUTH_SECRET`, `GOOGLE_OAUTH_ENCRYPTION_KEY`, `CRON_SECRET` must be generated (`openssl rand`); encryption key must differ from auth secret |
| Production rate limiting | `REDIS_URL` required — without it each serverless instance counts independently |
| Cron | Vercel Cron requires `CRON_SECRET`; cron routes return 503/401 without it |
| AI budget | Daily spend guard `AI_DAILY_BUDGET_USD` (default $5) |
| License | MIT — requirements must never include paid/premium gating |

## 8. Requirements → Code Traceability

| Requirement group | Primary implementation | Reference doc |
|-------------------|------------------------|---------------|
| FR-AUTH | `backend/auth.ts`, `backend/session-verify.ts`, `backend/auth/google.ts`, `app/api/auth/*`, `proxy.ts` | `SECURITY.md`, `AUTH-2.0-EVOLUTION.md` |
| FR-CONTENT | `database/prisma/seed.ts`, `scripts/seed-questions.ts`, `backend/services/content.ts` | `DATABASE.md` |
| FR-EXAM | `backend/services/exam.ts`, `exam-submission.ts`, `app/api/exam/*`, `app/api/exams/*` | `API.md`, `FEATURES.md` |
| FR-LEARN | `backend/services/flashcards.ts`, `mistake-exam.ts`, `study-plan.ts`, `vocab*.ts` | `FEATURES.md` |
| FR-AI | `backend/ai/**` (providers, router, agent, orchestration), `app/api/ai/*` | `AI-SYSTEM.md`, `AI_AGENT_API_CONTRACT.md` |
| FR-PROG | `backend/services/activity.ts`, `badges.ts`, `analytics.ts`, `preparation-intelligence.ts` | `FEATURES.md` |
| FR-BYOS | `backend/services/storage/*`, `app/api/storage/*` | `BYOS.md` |
| NFR-SEC | `backend/rate-limit.ts`, `proxy.ts`, `next.config.ts`, `backend/infrastructure/observability/logger.ts` | `SECURITY.md` |
| NFR-PERF | `scripts/perf-budget.ts`, `perf` CI job | `PERFORMANCE-OPTIMIZATION.md` |
| NFR-REL | `tests/**`, `.github/workflows/ci.yml` | `TESTING.md` |

## 9. Change Control

- New requirements start as an issue/ADR discussion in `DECISIONS.md`.
- Requirements changes must update this document in the same PR as the implementation.
- Anything on the deliberate non-goals list requires updating `PRODUCT.md` first (see `DO_NOT_BUILD.md`).
