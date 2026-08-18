# 9Th-Grade AI — AI Agent Development Contract

## Project Purpose
9Th-Grade AI is a free, open-source AI-powered exam preparation platform for Bangladeshi government job aspirants (BCS, Bank, Teacher Recruitment, 9th-grade pay-scale posts). It provides a syllabus explorer, question bank, mock tests, spaced-repetition flashcards, an adaptive study planner, and a bilingual AI tutor.

## Architecture Overview

### Application Layer
- **Next.js 16 App Router** (`app/`): pages, layouts, error/loading boundaries, API routes.
- **Route handlers** (`app/api/*`): thin controllers that delegate to `backend/services/*`.
- **Middleware** (`backend/middleware.ts`): guards `/dashboard` and `/login` routes.

### Domain Layer
- **Backend services** (`backend/services/`): Prisma data-access functions.
  - `content.ts`: read operations for subjects, topics, questions, quizzes, etc.
  - `user.ts`: user CRUD, progress, bookmarks, auth helpers.
- **Shared types** (`frontend/lib/types/`): DTOs used by both client and server.

### Infrastructure Layer
- **Prisma** (`database/prisma/schema.prisma`): SQLite (dev) / PostgreSQL (prod).
- **Auth** (`backend/auth.ts`): JWT sessions via `jose`, HttpOnly cookies, 7-day expiry.
- **Database singleton** (`backend/db.ts`): PrismaClient with hot-reload protection.

### Presentation Layer
- **Client components** (`frontend/components/`): dashboard tabs, modals, UI primitives.
- **Contexts** (`frontend/lib/`): auth, theme, dashboard state.
- **Data layer** (`frontend/lib/data/`): static/mock data, seed-derived constants.
- **API client** (`frontend/lib/services/api.ts`): browser-side fetch wrappers.

## AI System

### Endpoints
- `POST /api/ai/solver`: Step-by-step question solver (text + optional image). Uses Anthropic Claude via Vercel AI SDK. Falls back to `source: "mock"` when `ANTHROPIC_API_KEY` is unset.
- `POST /api/ai/tutor`: Streaming chat tutor. Uses `streamText` from `ai`. Falls back to mock streaming when no API key.

### Model
- `claude-sonnet-4-6` via `@ai-sdk/anthropic`.

### Safety
- System prompts are defined inline in route handlers only.
- Mock responses are clearly labelled with `source: "mock"`.
- Never trust AI output for authorization, validation, or security decisions.

## Data Flow
```
Browser (React client)
   │  fetch() via frontend/lib/services/api.ts
   ▼
app/api/*/route.ts        ← Next.js Route Handlers
   │  backend/services/* (data access)
   ▼
Prisma ──▶ SQLite (dev) / PostgreSQL (prod)
```

## Coding Conventions

- **TypeScript strict mode** enabled.
- **Server-only**: `backend/` files import `"server-only"`.
- **Client components**: `frontend/components/` use `"use client"`.
- **Naming**: `camelCase` for variables/functions, `PascalCase` for components/types, `UPPER_SNAKE_CASE` for constants.
- **Styling**: Tailwind CSS v4 utility classes. Design tokens use `--font-*` CSS variables.

## Security Rules

- Never expose `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_URL`.
- JWT sessions via `jose`, HttpOnly cookies, 7-day expiry. No client-side token storage.
- All API route inputs must be validated.
- Prisma parameterizes queries — never concatenate raw SQL.
- Passwords hashed with `bcryptjs` (cost 10).

## Database Rules

- Schema changes go in `database/prisma/schema.prisma` only.
- No migrations — schema pushed directly (`npm run db:push`).
- Seed data in `database/prisma/seed.ts` and `database/data/`.
- Never hardcode DB queries in client components.

## API Rules

- All endpoints under `/api/*`.
- Use `NextResponse.json()` for JSON responses.
- Auth-protected routes call `getUserIdFromRequest()` and return `401` if missing.
- Route handlers must not contain business logic — delegate to `backend/services/*`.

## File Organization

- `app/` — Next.js App Router (pages, layouts, route handlers)
- `backend/` — Server-only code (Prisma, auth, services)
- `frontend/` — Client-side code (components, lib, contexts)
- `database/` — Prisma schema, seed, raw data
- `tests/` — Vitest tests
- `scripts/` — Maintenance scripts
- `docs/` — Canonical documentation

## Prohibited Actions

- Do not delete files without verifying they are unused.
- Do not modify `database/prisma/schema.prisma` without updating `docs/DATABASE.md`.
- Do not move framework-required files (`app/`, `package.json`, etc.).
- Do not bypass lint, typecheck, or tests.
- Do not commit secrets or `.env.local`.
- Do not invent architecture — extend the existing seam.

## Change Workflow

1. UNDERSTAND — Read the relevant code + docs
2. INSPECT — Check tests, types, and existing patterns
3. PLAN — Make a minimal, reversible change
4. IMPLEMENT — Follow conventions exactly
5. TEST — Run relevant tests + lint + typecheck
6. VERIFY — Confirm the app still builds and runs
7. DOCUMENT — Update docs if behavior changed
