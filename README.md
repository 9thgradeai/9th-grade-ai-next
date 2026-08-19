# 9Th-Grade AI

**Free, open-source, AI-powered exam preparation for Bangladeshi government job aspirants.**

Built for competitive recruitment exams — **BCS Preliminary**, **Bangladesh Bank**, **Assistant Director**, and other **9th-grade (pay-scale) government posts** — 9Th-Grade AI unifies a syllabus explorer, a real-data question bank, a BCS-style custom exam engine, mock tests, spaced-repetition flashcards, an adaptive study planner, and a bilingual AI tutor in one open platform.

> This is a free product. There is no pricing, no paid tier, no premium gating — every feature is available to everyone.

**Live demo:** [https://9-delta-ten.vercel.app](https://9-delta-ten.vercel.app)

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Content & Taxonomy](#content--taxonomy)
- [AI System](#ai-system)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Project Structure](#project-structure)
- [Testing & Quality](#testing--quality)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## The Problem

Preparing for Bangladesh's competitive exams is hard:

- **Fragmented syllabus** — the official BCS syllabus spans 10+ subjects with a deeply nested topic structure that is rarely presented clearly.
- **Scattered previous-year papers** — questions are spread across forums, PDFs, and print guides with no structured, searchable home.
- **No personalization** — generic study plans ignore what each candidate actually knows, and nobody tracks gaps across subjects, topics, or subtopics.
- **Unaffordable AI tools** — most AI study aids are paid and rarely tailored to the Bangladeshi public-sector exam pattern.

9Th-Grade AI addresses each of these with a database-driven, exam-accurate platform that runs with zero external dependencies in development and fully AI-powered in production.

## The Solution

9Th-Grade AI is a full-stack Next.js application that treats **content as data** and **progress as truth**:

- Every question, topic, flashcard, and syllabus node is **seeded into a relational database** and served through typed API routes — nothing is hardcoded in the client.
- A **recursive topic taxonomy** mirrors the real BCS syllabus (10 subjects, 348 nodes, 284 leaves, up to 4 levels deep), letting candidates drill from subject → topic → subtopic and build exams from exactly the areas they want.
- A **BCS-accurate exam engine** grades the same way the real exam does (**+1** correct, **−0.5** wrong, **0** unanswered), persists every attempt, and recomputes accuracy, streaks, and per-subject reports from real activity.
- An **AI tutor and solver** answer in Bangla/English (typed or by photo), grounded in live web search, with a clearly-labelled offline mock fallback.

## Features

### Exam Practice
| Feature | Description |
|---------|-------------|
| **Custom Exam Engine** | Build a BCS-style exam from any combination of subjects, topics, and subtopics (multi-select across the taxonomy), with per-subject question counts, a config review modal, wall-clock timer, localStorage resume, and full answer review. |
| **Mock Tests** | Timed mock sessions built from the same subtopic picker, with auto-submit on time expiry and graded results. |
| **Daily Quiz** | A fresh daily set with real grading and points on submit. |
| **Exam Archive** | Previous-year papers organized by category (BCS, Bank, Teacher, etc.). |
| **Question Bank** | Searchable, category-filtered bank of 330+ questions served from the database, with bookmarking. |

### Learning Tools
| Feature | Description |
|---------|-------------|
| **Syllabus Explorer** | Subject-by-subject breakdown with per-topic question counts and progress. |
| **Spaced-Repetition Flashcards** | SM-2 algorithm (ease factor, interval, repetitions) with per-user review logs and due-deck scheduling. |
| **Smart Study Planner** | Day-by-day plan with completable, priority-ranked tasks. |
| **Bookmarks** | Save and revisit any question. |

### AI
| Feature | Description |
|---------|-------------|
| **AI Tutor** | Streaming bilingual (Bangla/English) chat assistant, focused on BCS / Bank / Teacher-recruitment / govt-job preparation, grounded in live web search when available. |
| **AI Solver** | Step-by-step question solver supporting text **and image** input, returning a solution plus numbered steps as structured JSON. |
| **Voice AI Tutor** | Voice-based doubt-solving in Bengali. |

### Motivation & Awareness
| Feature | Description |
|---------|-------------|
| **Progress & Streaks** | Points, accuracy, streak, rank, and a 7-day activity history derived from real attempts. |
| **Badges & Gamification** | Achievement badges and a leaderboard. |
| **Recommendations** | Performance-driven study recommendations based on per-subject accuracy. |
| **Flash News** | Exam news and updates feed with read-state tracking. |
| **Notifications** | In-app notification center with read receipts. |
| **Offline Packs & Documents** | Syllabus PDFs, circulars, and guides. |

## Tech Stack

### Core

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16** (App Router) | React Server Components, route handlers, middleware |
| UI Library | **React 19** | Client components in `frontend/components/` |
| Language | **TypeScript 5** | Strict mode enabled |
| Styling | **Tailwind CSS v4** | CSS-first configuration, design tokens via `--font-*` variables |
| Animation | **Framer Motion** | Page transitions, micro-interactions |
| Icons | **Lucide React** | Consistent SVG icon set |

### Backend

| Component | Technology | Notes |
|-----------|-----------|-------|
| ORM | **Prisma 6** | Type-safe queries, schema pushed directly (no migration files) |
| Database | **SQLite** (dev) / **PostgreSQL** (prod) | Drop-in swap via `DATABASE_URL` |
| Auth | **jose** (JWT) | HttpOnly, SameSite=Lax cookies, 7-day sessions, `auth_token` |
| Password hashing | **bcryptjs** | Cost 10 |

### AI

| Component | Technology | Notes |
|-----------|-----------|-------|
| Tutor provider | **Groq** (`openai/gpt-oss-120b`) | Streaming `generateText`, retry-on-empty, `X-AI-Source` header |
| Solver provider | **Anthropic** (Claude Sonnet 4) | Step-by-step structured JSON solutions |
| Web grounding | **Tavily** | Live search snippets injected as the primary factual source |
| SDK | **Vercel AI SDK** (`ai`) | `@ai-sdk/groq`, `@ai-sdk/anthropic` |
| Fallback | **Mock responses** | Clearly labelled `source: "mock"` when keys are unset |

### Testing & Tooling

| Component | Technology |
|-----------|-----------|
| Test runner | **Vitest 3** + **Testing Library** (jsdom) |
| Linting | **ESLint 9** (`eslint-config-next`) |
| Formatting | **Prettier 3** |
| Type checking | `tsc --noEmit` |
| Dev server | Next.js dev (Turbopack) |

**Deliberately not used:** no Redux/Zustand (React Context + `useSyncExternalStore`), no CSS-in-JS (Tailwind only), no third-party component library (custom UI primitives), no form library (native HTML forms), no agent-orchestration framework (direct SDK calls).

## Architecture

### System Boundaries

```
┌─────────────┐   fetch()    ┌──────────────────┐   Prisma   ┌──────────────┐
│   Browser   │ ───────────► │  Next.js App     │ ─────────► │  SQLite /    │
│  (React 19) │              │  Router (app/)   │            │  PostgreSQL  │
│             │ ◄─────────── │                  │ ◄───────── │              │
└─────────────┘  JSON (API)  └──────────────────┘   JSON     └──────────────┘
                                  │        │
                        ┌─────────▼──┐  ┌──▼─────────┐
                        │  backend/  │  │  frontend/ │
                        │ services/  │  │ components │
                        └────────────┘  └────────────┘
```

### Layered design

The codebase enforces strict layer ownership so the frontend never touches the database and the backend never ships to the client:

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Presentation** | `frontend/components/` | Client React components ("use client"), design-system primitives, dashboard tabs |
| **Application** | `app/` | Pages, layouts, and thin `app/api/*/route.ts` controllers |
| **Domain** | `backend/services/` + `frontend/lib/types/` | Business logic and shared DTOs (the integration seam) |
| **Infrastructure** | `backend/db.ts`, `database/` | Prisma client singleton, schema, seed scripts, raw data |

### Data flow

```
Client components
   │  frontend/lib/services/api.ts  (typed fetch wrappers)
   ▼
Next.js API routes  (app/api/*)     — validate input, call services
   │  backend/services/*            — business logic only, no controllers
   ▼
Prisma  →  SQLite (dev) / PostgreSQL (prod)
```

- **Path aliases:** `@/*` → `frontend/*`, `~backend/*` → `backend/*`, `~tests/*` → `tests/*`.
- **Server-only enforcement:** `backend/` imports `"server-only"` so its code can never leak into client bundles.
- **Auth:** middleware (`middleware.ts`) guards `/dashboard` and `/login`; protected API routes call `getUserIdFromRequest()` and return `401` when there is no valid session.
- **No business logic in route handlers** — they parse, validate, delegate, and respond.

### Security model

- JWT sessions (`jose`) in **HttpOnly** cookies — no client-side token storage, no XSS token theft.
- Passwords hashed with `bcryptjs` (cost 10); secrets come from `process.env` only.
- Prisma parameterizes all queries — no raw SQL concatenation.
- AI output is **never** used for authorization, validation, or security decisions; all AI responses are clearly labelled (`source: "mock"` / `X-AI-Source` header).
- Rate limiting on AI endpoints (10 req / 60 s per client).
- Production hardening: security headers, `secure` cookies in production.

## Content & Taxonomy

All content is **seeded from `database/data/`** into the database — the syllabus explorer, question bank, mock tests, flashcards, and news feeds render live data, never hardcoded fixtures.

- **Taxonomy:** 10 subjects, 348 nodes, 284 leaves mirroring the official BCS syllabus structure, encoded in `database/data/taxonomy.json` and persisted as a recursive `Topic` tree (`parentId`, `slug`, `path`, `depth`, `sortOrder`). A node with children is a group; a leaf node is a question bucket. English extends to depth 4.
- **Question sourcing (330+ questions):**
  - **Folder-structured import** — files under `database/data/ques/<Subject>/<Node>/…/*.txt` are tagged with the exact leaf path from their folder hierarchy (the folder path *is* the taxonomy).
  - **Flat import** — `questions_database.txt` is distributed round-robin across taxonomy leaves by `scripts/seed-questions.ts`.
  - Every question carries its full content `path` and a `topicId` FK to its leaf topic, enabling path-based filtering and per-topic aggregated `questionCount`s.
- **Unicode hardening:** all Bengali name matching is **NFC-normalised**, so composed/decomposed forms always resolve.
- **Seeding is idempotent** — safe to run repeatedly. `npm run db:sync` (the Vercel prebuild) clears seed-managed tables, pushes the schema, and reseeds so every production deploy stays in sync.

### The exam selection model

The custom exam engine (`backend/services/exam.ts`) serves a recursive selection tree via `POST /api/exam/config`. Clients select any combination of subject / topic / subtopic nodes:

- `paths: []` selects a whole subject; otherwise questions are drawn from the **union of the selected nodes' subtrees** (selecting a group includes all its descendants).
- Each selected subject carries its own `count` (clamped to availability); the total is the sum, with largest-remainder allocation when counts are omitted.
- `GET /api/questions?paths=…` exposes the same path-eligibility semantics for the question bank and quick practice, so every exam mode shares one selection model — implemented in the shared `TopicTreePicker` component.
- The engine is **deterministic** (seeded random), never leaks `correctAnswer`/`explanation` in the build response, and reports `shortfall` when a selection cannot be fully sourced.

## AI System

Two direct endpoints — no agent loops, no orchestration frameworks.

| Endpoint | Model | Behaviour |
|----------|-------|-----------|
| `POST /api/ai/tutor` | `openai/gpt-oss-120b` (Groq) | Streaming global assistant; `searchWeb()` (Tavily, top-5) grounds factual claims when `TAVILY_API_KEY` is set; retries on empty output; exposes `X-AI-Source: groq+web / groq / mock` |
| `POST /api/ai/solver` | `claude-sonnet-4-6` (Anthropic) | Returns `{ solution, steps, source }` for text or base64 image input; falls back to raw text if JSON parsing fails |

- **No knowledge-base grounding** for the tutor: a prior KB-injection design anchored the model to weak matches and caused factual slips, so the tutor answers from its own knowledge, optionally grounded in live web snippets, with a persona that says so when unsure. `frontend/lib/data/knowledge-base.ts` remains as a tested reference data module.
- **Mock fallbacks** are clearly labelled and let the whole app run with zero external dependencies for local dev and CI.
- Prompts live inline in the route handlers; full details in `docs/AI-SYSTEM.md`.

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- SQLite (bundled with the dev database file — no server needed locally)

### Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.local.example .env.local
#   AUTH_SECRET:  openssl rand -base64 32
#   DATABASE_URL: file:./dev.db  (default — no DB server needed)

# 3. Create + seed the database
npm run db:push
npm run db:seed

# 4. Run
npm run dev
```

Open http://localhost:3000. A demo account is created on seed:
**`demo@9thgrade.ai` / `demo12345`**.

> Without AI keys, the Tutor and Solver return clearly-labelled mock responses — the app runs end-to-end with zero external dependencies.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | Yes | — | JWT signing secret (`openssl rand -base64 32`) |
| `DATABASE_URL` | Yes | `file:./dev.db` | Prisma database URL (PostgreSQL in production) |
| `ANTHROPIC_API_KEY` | No | — | Enables the AI Solver (mock fallback if unset) |
| `GROQ_API_KEY` | No | — | Enables the AI Tutor (mock fallback if unset) |
| `TAVILY_API_KEY` | No | — | Web-search grounding for the tutor |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public app origin |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3000` | Public API origin |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Per-window request ceiling |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window |

### Deployment

Deployed to **Vercel** at [https://9-delta-ten.vercel.app](https://9-delta-ten.vercel.app). The production build runs `npm run db:sync` (`VERCEL=1`) so the schema and seed content stay in sync on every deploy. Full instructions in `docs/DEPLOYMENT.md`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run test:watch` | Vitest watch mode |
| `npm run format` | Prettier write |
| `npm run db:push` | Sync Prisma schema to the DB |
| `npm run db:seed` | Idempotent content seed |
| `npm run db:seed-questions` | Import questions + rebuild the topic tree |
| `npm run db:sync` | Clean content, push schema, reseed (used by Vercel) |
| `npm run db:reset` | Force-reset + reseed with fresh users |
| `npm run db:studio` | Open Prisma Studio |

## Project Structure

```
/
├── app/                    # Next.js App Router (pages, layouts, API routes, metadata)
│   ├── api/                # Route handlers — the backend seam
│   │   ├── ai/             # /api/ai/tutor, /api/ai/solver
│   │   ├── exam/           # /api/exam/config, /api/exam/build, /api/exam/submit
│   │   └── ...             # auth, practice, questions, mock-test, flashcards, …
│   ├── (auth)/             # Login group
│   ├── (dashboard)/        # Protected dashboard group
│   └── ...
├── backend/                # Server-only code (imports "server-only")
│   ├── auth.ts             # JWT session management (jose)
│   ├── db.ts               # PrismaClient singleton
│   └── services/           # content.ts, exam.ts, user.ts, activity.ts
├── frontend/               # Client-side code
│   ├── components/
│   │   ├── ui/             # ErrorBoundary + AnimatedList
│   │   └── dashboard/      # Dashboard tab components (+ TopicTreePicker)
│   └── lib/
│       ├── services/       # api.ts fetch wrappers
│       ├── data/           # Static/mock data + seed-derived constants
│       ├── auth-ctx/       # React context for auth state
│       ├── store-ctx/      # Dashboard state (useSyncExternalStore)
│       ├── theme-ctx/      # Theme context
│       └── types/          # Shared TypeScript types (client + server DTOs)
├── database/               # Prisma schema, seed script, raw data
│   ├── prisma/             # schema.prisma, seed.ts
│   └── data/               # taxonomy.json, ques/ (folder-structured), …
├── tests/                  # Vitest tests (unit + component)
├── scripts/                # Maintenance (seed-questions.ts, taxonomy.ts)
├── docs/                   # Canonical documentation
├── public/                 # Static assets
└── package.json
```

## Testing & Quality

- **61 tests across 8 files** — backend unit tests (exam engine, `paths`-filtered question queries, web search, knowledge base) and component tests (custom exam builder, mock test builder, flash news modal, dashboard features).
- Every change must pass `npm run lint` (0 errors), `npm run typecheck`, `npm run test`, and `npm run build`.
- CI is green on every push (Node 22, platform-complete lockfile).
- The design system enforces a dark terminal/emerald aesthetic with a strict accessibility bar: semantic HTML, focus-visible rings, ARIA-labelled icon buttons, dialog focus traps, WCAG 2.2 pointer targets, iOS safe-area handling, and `prefers-reduced-motion` support. See `docs/DESIGN-SYSTEM.md`.

## Documentation

The `docs/` directory is the canonical reference:

- `ARCHITECTURE.md` — system boundaries, layers, auth flow
- `TECH-STACK.md` — full technology inventory
- `DATABASE.md` — every Prisma model and relationship
- `API.md` — all endpoints, request/response shapes
- `AI-SYSTEM.md` — providers, models, prompts, failure modes
- `PRODUCT.md` — feature matrix and target users
- `DECISIONS.md` — architecture decision records
- `DESIGN-SYSTEM.md` — design tokens, components, accessibility
- `TESTING.md`, `SECURITY.md`, `DEPLOYMENT.md`, `DEVELOPMENT.md`

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md). Before adding a dependency or a new architecture piece, check `docs/DECISIONS.md` — the project prefers extending existing seams over inventing new ones.

## License

[MIT](./LICENSE) — free for anyone to use, modify, and distribute.
