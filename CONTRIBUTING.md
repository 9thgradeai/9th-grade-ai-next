# Contributing to 9Th-Grade AI

First off — thank you for considering contributing! This is a **free, open-source** project built to help Bangladeshi job aspirants prepare for competitive exams (BCS, Bangladesh Bank, Assistant Director, and other 9th-grade government posts).

## Code of Conduct

By participating, you agree to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md). Be respectful, inclusive, and constructive.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
#   - Generate AUTH_SECRET:  openssl rand -base64 32
#   - Leave ANTHROPIC_API_KEY empty to use the built-in mock AI
#   - DATABASE_URL defaults to a local SQLite file (no setup needed)

# 3. Create the database + seed with content
npm run db:push
npm run db:seed

# 4. Run the dev server
npm run dev
```

> The app runs fully offline-friendly: with no `ANTHROPIC_API_KEY` it falls back to a mock AI tutor/solver, so you can develop without any external accounts.

## Project structure

| Path | What it is |
|------|-----------|
| `src/app` | Next.js App Router pages, layouts, and `/api` route handlers |
| `src/components` | UI components (landing + dashboard) |
| `src/components/ui` | Design-system primitives (Button, Badge, Card, Input) + Storybook stories |
| `src/lib/services` | Data-access layer + browser fetch helpers (the backend seam) |
| `src/lib/store` | Client-side React state (dashboard) |
| `prisma/schema.prisma` | Database schema (SQLite dev → Postgres prod) |
| `prisma/seed.ts` | Idempotent seed that ports all content into the DB |

## Architecture note (important)

All content — questions, question banks, exam archives, flashcards, study plans, daily quizzes, news, recommendations — is served from the **database** via `/api/*` route handlers. The frontend never imports static data directly. If you are building the production backend, you replace/extend the Prisma models and the route handlers in `src/app/api`.

## How to contribute

1. Fork the repo and create a branch: `git checkout -b fix/short-description`.
2. Make your change. Keep it focused.
3. Run the quality gates before pushing:
   ```bash
   npm run typecheck
   npm run lint
   npm run test
   ```
4. Open a Pull Request describing the *why* and the *what*. Link any related issue.

## Adding content (questions, syllabus, etc.)

Add it to the database, not to static files. For one-off bulk loads, extend `prisma/seed.ts` or add an admin route. Do not reintroduce `localStorage`-only data stores in the dashboard.

## Reporting bugs / suggesting features

Open a GitHub Issue using the templates in `.github/`. For security issues, please email the maintainers privately rather than opening a public issue.

---

Made with ❤️ for Bangladeshi exam aspirants.
