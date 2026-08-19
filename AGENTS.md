<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 9Th-Grade AI — Agent Development Contract

## Project Purpose
9Th-Grade AI is a free, open-source AI-powered exam preparation platform for Bangladeshi government job aspirants (BCS, Bank, Teacher Recruitment, 9th-grade pay-scale posts). It provides a syllabus explorer, question bank, mock tests, spaced-repetition flashcards, an adaptive study planner, and a bilingual AI tutor.

## Repository Structure

```
/
├── app/                    # Next.js App Router (pages, layouts, API routes, metadata)
│   ├── api/               # Route handlers — the backend seam
│   ├── (auth)/            # Auth group (login)
│   ├── (dashboard)/       # Dashboard group (protected)
│   └── ...
├── backend/               # Server-only code (Prisma, auth, services)
│   ├── auth.ts            # JWT session management (jose)
│   ├── db.ts              # PrismaClient singleton
│   └── services/          # Data-access layer
│       ├── content.ts     # Read operations for questions, quizzes, news, etc.
│       └── user.ts        # User CRUD, progress, bookmarks, auth helpers
├── frontend/              # Client-side code (components, lib, contexts)
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # Shared primitives (ErrorBoundary, AnimatedContainer, AnimatedList)
│   │   └── dashboard/     # Dashboard tab components
│   └── lib/               # Client utilities
│       ├── auth-ctx/      # React context for auth state
│       ├── data/          # Static/mock data + seed-derived constants
│       ├── services/      # Browser-side fetch wrappers
│       ├── store-ctx/     # Dashboard state (useSyncExternalStore)
│       ├── theme-ctx/     # Theme context
│       └── types/         # Shared TypeScript types (client + server DTOs)
├── database/              # Prisma schema, seed script, raw data
│   ├── prisma/
│   │   ├── schema.prisma  # Single source of truth for DB schema
│   │   └── seed.ts        # Idempotent seed
│   └── data/              # Raw seed data (JSON, TXT, MD)
├── tests/                 # Vitest tests
├── scripts/               # Maintenance scripts (seed-questions.ts)
├── docs/                  # Canonical documentation
├── public/                # Static assets
└── package.json           # Scripts, dependencies, prisma seed config
```

## Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/*` | `./frontend/*` |
| `~backend/*` | `./backend/*` |
| `~tests/*` | `./tests/*` |

## Coding Conventions

- **TypeScript strict mode** enabled (`tsconfig.json`).
- **Server-only**: Backend files (`backend/`) must import `"server-only"` and never leak into client bundles.
- **Client components**: Components in `frontend/components/` are client components (`"use client"`).
- **Naming**: `camelCase` for variables/functions, `PascalCase` for components/types, `UPPER_SNAKE_CASE` for constants.
- **Styling**: Tailwind CSS v4 utility classes. Design tokens use `--font-*` CSS variables.
- **Data flow**: Client components call `frontend/lib/services/api.ts` → Next.js API routes (`app/api/*`) → `backend/services/*` → Prisma.

## Architectural Boundaries

- **Presentation** = `frontend/components/`
- **Application** = `app/` (pages, layouts, route handlers)
- **Domain** = `backend/services/` + `frontend/lib/types/`
- **Infrastructure** = `backend/db.ts`, `database/prisma/`, `database/data/`
- **AI** = `app/api/ai/*`, `frontend/lib/data/ai.ts`

## Security Rules

- **Never expose secrets**: `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_URL` must only come from `process.env`.
- **Auth**: JWT sessions via `jose`, HttpOnly cookies, 7-day expiry. No client-side token storage.
- **Validation**: All API route inputs must be validated (type checks, required fields).
- **AI Safety**: Never use LLM output for authorization. All AI responses are clearly labelled as `source: "mock"` when no API key is set.
- **SQL Injection**: Prisma parameterizes queries — never concatenate raw SQL.
- **Passwords**: Must be hashed with `bcryptjs` (cost 10).

## Testing Requirements

- All new features require at least a component test in `tests/`.
- API routes should have integration tests in `tests/api/`.
- Run `npm run test` before committing.
- Run `npm run lint` and `npm run typecheck` before committing.

## Documentation Requirements

- All new public APIs must be documented in `docs/API.md`.
- New database models must be documented in `docs/DATABASE.md`.
- New AI features must be documented in `docs/AI-SYSTEM.md`.

## Database Rules

- Schema changes go in `database/prisma/schema.prisma` only.
- Migrations are not used — schema is pushed directly (`npm run db:push`).
- Seed data lives in `database/prisma/seed.ts` and `database/data/`.
- Never hardcode DB queries in client components.

## API Rules

- All endpoints live under `/api/*`.
- Use `NextResponse.json()` for all JSON responses.
- Auth-protected routes must call `getUserIdFromRequest()` and return `401` if missing.
- Route handlers must not contain business logic — delegate to `backend/services/*`.

## AI Rules

- AI endpoints: `/api/ai/solver`, `/api/ai/tutor`.
- Mock fallback must be clearly labelled and return `source: "mock"`.
- System prompts are defined inline in the route handlers — do not move them to client code.
- Never trust AI output for authorization, validation, or security decisions.

## Dependency Rules

- Before adding a new dependency, check if it can be done with existing deps.
- New dependencies must be justified in `docs/DECISIONS.md`.
- Remove unused dependencies immediately.

## File Organization

- Do not create new top-level directories without discussion.
- Do not place client code in `backend/`.
- Do not place server code in `frontend/`.
- Do not place API routes outside `app/api/`.
- Do not place tests outside `tests/` unless there is a framework constraint.

## Prohibited Actions

- Do not delete files you did not create without verifying they are unused.
- Do not modify `database/prisma/schema.prisma` without updating `docs/DATABASE.md`.
- Do not move framework-required files (`app/`, `package.json`, etc.).
- Do not bypass lint, typecheck, or tests.
- Do not commit secrets or `.env.local`.
- Do not invent architecture — extend the existing seam.

## Change Workflow

```
UNDERSTAND
  ↓  Read the relevant code + docs
INSPECT
  ↓  Check tests, types, and existing patterns
PLAN
  ↓  Make a minimal, reversible change
IMPLEMENT
  ↓  Follow conventions exactly
TEST
  ↓  Run relevant tests + lint + typecheck
VERIFY
  ↓  Confirm the app still builds and runs
DOCUMENT
  ↓  Update docs if behavior changed
```
