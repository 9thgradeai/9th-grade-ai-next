# 9Th-Grade AI

**Free, open-source AI-powered exam preparation for Bangladeshi job aspirants.**
Built for competitive government recruitment exams — **BCS Preliminary**, **Bangladesh Bank**, **Assistant Director**, and other **9th-grade (pay-scale) government posts**.

> This is a free product. There is no pricing, no paid tier, no premium gating — every feature is available to everyone.

---

## Why this exists

Preparing for Bangladesh's competitive exams is hard: fragmented syllabus, scattered previous-year papers, and limited personalized guidance. 9Th-Grade AI brings it together — syllabus explorer, question banks, mock tests, spaced-repetition flashcards, an adaptive study planner, and a bilingual AI tutor — in one free, open platform.

## Features

- **Syllabus Explorer** — subject-by-subject breakdown with per-topic question counts and progress.
- **Question Bank** — searchable, category-filtered question bank sourced from the database.
- **Exam Practice** — daily quiz, mock tests, and a full previous-year archive.
- **AI Tutor & Solver** — ask questions in Bangla/English (typed or by image); get step-by-step solutions. Powered by Anthropic Claude, with a built-in mock fallback for local dev.
- **Smart Study Planner** — day-by-day plan with completable tasks.
- **Spaced-Repetition Flashcards** — SRS-backed revision decks.
- **Progress & Streaks** — accuracy, points, and streak tracking.
- **Offline packs & Documents** — syllabus PDFs, circulars, and guides.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **Framer Motion**
- **Prisma** + **SQLite** (dev) → **PostgreSQL** (prod, drop-in)
- **Anthropic Claude** via the **Vercel AI SDK** (`@ai-sdk/anthropic`)
- **JWT auth** (`jose`) with HttpOnly cookies
- **Storybook** for the component/design-system reference

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.local.example .env.local
#   AUTH_SECRET:      openssl rand -base64 32
#   DATABASE_URL:     file:./dev.db  (default — no DB server needed)
#   ANTHROPIC_API_KEY: leave empty to use the mock AI during dev

# 3. Create + seed the database
npm run db:push
npm run db:seed

# 4. Run
npm run dev
```

Open http://localhost:3000. A demo account is created on seed:
**`demo@9thgrade.ai` / `demo12345`**.

> Without `ANTHROPIC_API_KEY`, the AI Tutor and Question Solver return clearly-labelled mock responses, so the whole app runs with zero external dependencies.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run db:push` | Sync Prisma schema to the DB |
| `npm run db:seed` | Seed content into the DB |
| `npm run db:reset` | Reset + reseed the DB |
| `npm run storybook` | Component / design-system reference |

## Architecture

```
Browser (React client)
   │  fetch() via frontend/lib/services/api.ts
   ▼
app/api/*/route.ts        ← Next.js Route Handlers
   │  backend/services/* (data access)
   ▼
Prisma ──▶ SQLite (dev) / PostgreSQL (prod)
```

**All content is served from the database**, never hardcoded in the client. The
`/api/*` route handlers and the Prisma models in `database/prisma/schema.prisma` are the
integration seam — when you build the production backend, you extend these
rather than adding static files.

## Project structure

```
/
├── app/                    # Next.js App Router (pages, layouts, API routes, metadata)
├── backend/                # Server-only code (Prisma, auth, services)
│   ├── auth.ts
│   ├── db.ts
│   ├── middleware.ts
│   └── services/
├── frontend/               # Client-side code (components, lib, contexts)
│   ├── components/
│   │   ├── ui/             # Design-system primitives + Storybook stories
│   │   └── dashboard/      # Dashboard tab components
│   └── lib/
├── database/               # Prisma schema, seed script, raw data
│   ├── prisma/
│   └── data/
├── tests/                  # Vitest tests
├── scripts/                # Maintenance scripts
├── docs/                   # Canonical documentation
├── public/                 # Static assets
└── package.json
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE) — free for anyone to use, modify, and distribute.
