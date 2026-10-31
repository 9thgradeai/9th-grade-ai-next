# 9Th-Grade AI — First Release Notes

## Version 0.2.2

### Release Date
2026-10-31

### Summary
This is the first public production release of 9Th-Grade AI, a free, open-source AI-powered exam preparation platform for Bangladeshi government job aspirants preparing for BCS, Bank, and Teacher Recruitment examinations.

### ✅ What's New in This Release

#### Core Platform
- **Next.js 16.4.3 App Router** — Full server-rendered experience with client components where needed
- **PostgreSQL (Neon)** — Production database with connection pooling, SSL, and autoscaling
- **Prisma ORM** — Type-safe database access with 45+ models covering the full examination ecosystem
- **JWT Authentication** — HttpOnly cookies, 7-day session expiry, tokenVersion revocation, session concurrency limit (5)
- **Google OAuth 2.0** — Social sign-in with profile data import and onboarding

#### Examination Engine
- **Custom examination creation** — Select subjects, topics, difficulty, question count, and duration
- **Timed and untimed exams** — durationSec 0 (unlimited) to 21600 (6 hours)
- **Idempotent submissions** — AttemptId + QuestionSetHash prevents double-counting on network retries
- **Negative marking** — Configurable per examination type (BCS, Bangladesh Bank)
- **Exam history** — View past attempts with scores and detailed results
- **Bangladesh Bank question pipelines** — Separate configurations for AD, Senior Officer, Officer, Cash Officer with verified subject distributions

#### Question Bank
- **14331 questions** across 14 subjects and hierarchical topic taxonomy
- **Multi-type MCQ support** — SINGLE_CHOICE, MULTI_CHOICE, STATEMENT_COMBINATION, MEDIA_ATTACHMENT
- **Bangla and English** — Full bilingual support throughout
- **Mathematical expressions** — LaTeX-aware rendering pipeline
- **Import pipeline** — Multi-line MCQ files with validation (source key uniqueness, option completeness, answer-exoption alignment)

#### AI Integrations
- **Groq primary provider** — `GROQ_API_KEY` configured
- **Anthropic fallback** — `ANTHROPIC_API_KEY` configured (optional)
- **Mock fallback** — Clearly labelled with `source: "mock"` when no API keys available
- **Structured output validation** — Zod schemas validate all AI outputs
- **Quota enforcement** — Per-user minute + daily quotas with store-backed ledger
- **Retry with exponential backoff** — Automatic retry on provider transient failures
- **Circuit breaker** — Prevents cascading failures on provider outages

#### Learning Intelligence
- **Spaced-repetition flashcards** — SM-2 scheduling in `FlashcardUserState`
- **Mistake practice** — `UserQuestionProgress` powers review prioritization
- **Study planner** — Adaptive `StudyPlanDay` + `StudyTask` with per-user completions
- **Daily quizzes** — `DailyQuiz` + `DailyQuizParticipation` with per-user status
- **Progress tracking** — Points, streaks, accuracy, questions answered
- **Badges** — `UserBadge` system with rarity tiers (COMMON, RARE, EPIC)

#### Frontend (Next.js 16)
- **Dashboard** — 30+ tab components (practice, mistakes, progress, planner, flashcards, exam history, etc.)
- **Responsive design** — Desktop, tablet, mobile layouts
- **Light/dark themes** — Full support with CSS variables
- **Accessibility** — Focus-visible rings, aria labels, reduced-motion support, keyboard navigation
- **Tailwind CSS v4** — Utility-first styling with design tokens (`--font-*, --color-*, --spacing-*`)
- **Framer Motion** — Subtle micro-interactions with `prefers-reduced-motion` respect

#### Developer Experience
- **TypeScript strict mode** — End-to-end type safety
- **ESLint + Prettier** — Enforced code quality
- **Vitest** — Unit and integration tests
- **Playwright** — E2E test framework
- **OpenCode** — AI-assisted development with MCP servers (GitHub, Context7, Playwright, Postgres)
- **50+ npm scripts** — DB operations, QA, math audits, imports, exports

#### Infrastructure
- **Vercel** — Deployment platform with Preview Deployments
- **PostgreSQL (Neon)** — Serverless Postgres with connection pooling, autoscaling, branch cloning
- **Environment variables** — All secrets from `process.env` only
- **Sentry** — Error monitoring (configured)
- **CI/CD** — npm scripts for build, test, db push, seed, reset

### 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/9thgradeai/9th-grade-ai-next.git
   cd 9th-grade-ai-next
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Copy `.env.local.example` to `.env.local` and set:
   ```bash
   # Required
   AUTH_SECRET=$(openssl rand -base64 32)
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
   # Then fill in the remaining required keys (Google OAuth, Tavily, Groq,
   # CRON secret) from `.env.local.example`. Never commit real values.
   
   # Optional
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   VERCEL_OIDC_TOKEN="..."  # Only needed for Vercel production
   ```

4. **Initialize the database**
   ```bash
   npm run postinstall
   # Or manually:
   npx prisma generate
   npm run db:seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```
   
   Visit `http://localhost:3000` to access the platform.

### 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (`next dev`) |
| `npm run build` | Production build (`next build`) |
| `npm run start` | Start production server (`next start`) |
| `npm run test` | Run all tests (`vitest run`) |
| `npm run test:e2e` | Run E2E tests (`playwright test`) |
| `npm run lint` | Lint + UI lint check |
| `npm run typecheck` | TypeScript strict check |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:reset` | Reset and re-seed database |
| `npm run ai:eval` | Run AI evaluation harness |
| `npm run qa:audit` | Question bank quality audit |
| `npm run math:audit` | LaTeX/mathematical expression audit |
| `npm run secret-scan` | Scan for leaked secrets |

### 📋 First Release Acceptance Gates

#### Gate A — Build and Code Quality ✅ PASSED
- `next build` succeeds without errors
- `tsc --noEmit` passes (strict TypeScript mode)
- `npm run lint` passes (warnings only, no errors)
- No broken imports or unresolved runtime errors

#### Gate B — Security ✅ PASSED
- `AUTH_SECRET` set in `.env.local` production-ready value
- All API route inputs validated (type checks, required fields)
- No secrets exposed in client bundles (verified: `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_URL` only from `process.env`)
- Input validation enforced on all API routes
- Security headers on all responses (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`)
- Rate limiting per endpoint ("solver", "tutor", "exam-start", etc.)
- Ban enforcement via role check + tokenVersion + session table

#### Gate C — Functional Correctness ⚠️ CONDITIONAL
- **Authentication**: ✅ Login, logout, protected routes work
- **Dashboard**: ✅ All 30+ tabs functional
- **Examination engine**: ✅ Start → Submit flow works with idempotency
- **Question search**: ✅ 20+ filter parameters work
- **AI solver/tutor**: ⚠️ Works when API keys provided; graceful `source: "mock"` fallback when keys absent
- **Bangla/English**: ✅ Both languages functional throughout
- **Negative marking**: ✅ Implemented per examination config
- **Bangla Bank exams**: ✅ Verified distributions for AD, Senior Officer, Officer, Cash Officer

#### Gate D — Data Integrity ⚠️ CONDITIONAL
- **Question imports**: ✅ Pipeline validated via `scanMca` import gate
- **Duplicate questions**: 2577 duplicate groups identified from source files
- **Unicode normalization**: 10350 issues in source files; 6088 auto-fixable via NFC normalization
- **Structure issues**: 4901 issues in source files; auto-fixable through normalization pipeline
- **DB question quality**: ✅ Sample of 200 random DB questions all pass `scanMca` import gate (ACCEPT, 0 fatal, 0 issues)
- **Recommendation**: Run full normalization cleanup on source files; deduplicate database

#### Gate E — UI/UX ⚠️ CONDITIONAL
- **Light/dark themes**: ✅ Both working fully
- **Responsive design**: ✅ Desktop, tablet, mobile layouts working
- **Accessibility**: ⚠️ Focus-visible rings present; reduced-motion CSS present; full WCAG AA audit not yet completed
- **Micro-interactions**: ✅ Framer Motion animations with `prefers-reduced-motion` respect
- **Bangla typography**: ✅ Bangla script rendering functional
- **Empty/loading/error states**: ✅ Present on most pages

#### Gate F — Testing ❌ BLOCKING
- **Unit tests (vitest)**: ⚠️ Minimal coverage; critical business logic not yet tested
- **Integration tests**: ⚠️ Some API route tests exist
- **E2E tests (playwright)**: ❌ None written for critical user journeys
- **Test coverage**: ❌ Not measured or reported

#### Gate G — Deployment ⚠️ CONDITIONAL
- **Vercel deployment**: ✅ Configuration present
- **Production database**: ✅ Neon PostgreSQL connected and functional
- **Environment variables**: ✅ All critical vars set in `.env.local`
- **Health checks**: ❌ Not implemented
- **Monitoring/alerting**: ⚠️ Sentry configured, not fully operational
- **Backup strategy**: ❌ Not documented
- **Rollback procedure**: ❌ Not documented

### 📦 Known Issues (Pre-Release)

1. **Question data normalization** — Source files contain 10350 Unicode issues and 4901 structure issues; 6088 auto-fixable via NFC normalization. DB questions from sampled verification pass import gate.

2. **Duplicate questions** — 2577 duplicate groups identified across source files; some questions appear in multiple subjects. DB deduplication recommended.

3. **Accessibility completeness** — WCAG AA audit not fully completed; focus-visible rings present, reduced-motion supported, but contrast and keyboard navigation flow not fully verified.

4. **No E2E tests** — Critical user journeys (register → login → create exam → submit → view results) not automated tested.

5. **Cron job monitoring** — Background jobs (daily quiz, current affairs) lack uptime monitoring and error alerts.

6. **Backup/restore procedures** — Not documented for PostgreSQL Neon database.

### 🚀 Upgrading from Previous Version

This is the first public release (v0.2.2). There are no previous production versions to upgrade from. The platform is freshly released with all the features described in this notes.

### 📞 Support

- **GitHub Issues**: https://github.com/9thgradeai/9th-grade-ai-next/issues
- **Documentation**: https://9thgrade.ai/docs
- **Contact**: Team@9thGrade.ai

### 🙏 Acknowledgments

- Built by the 9Th-Grade AI community
- AI powered by Groq and Anthropic
- Database hosted on Neon PostgreSQL
- Deployed on Vercel
- Inspired by the needs of Bangladeshi government job aspirants

---

*"Don't just show the candidate their preparation. Tell them how to improve it."*