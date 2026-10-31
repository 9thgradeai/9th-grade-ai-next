# 9Th-Grade AI — Project Inventory & Feature Status

## Product Overview
Free, open-source AI-powered exam preparation platform for Bangladeshi government job aspirants (BCS, Bank, Teacher Recruitment, 9th-grade pay-scale posts).

## Repository Structure

```
/
├── app/                    # Next.js App Router (pages, layouts, API routes, metadata)
│   ├── api/               # Route handlers — the backend seam (40+ endpoints)
│   ├── login/             # Auth page (login + signup via ?register=true)
│   ├── (dashboard)/       # Dashboard group (protected)
│   ├── admin/             # Admin routes
│   ├── current-affairs/   # Daily current affairs
│   ├── vocab/             # Vocabulary learning
│   ├── dashboard/         # Dashboard tab components
│   ├── exam/              # Exam engine routes (start, submit, build)
│   ├── questions/         # Question search and import
│   ├── storage/           # Google Drive BYOS storage
│   └── ...
├── backend/               # Server-only code (Prisma, auth, services)
│   ├── auth.ts            # JWT session management (jose)
│   ├── db.ts              # PrismaClient singleton
│   ├── services/          # Data-access layer
│   │   ├── content.ts     # Read operations for questions, quizzes, news, etc.
│   │   ├── user.ts        # User CRUD, progress, bookmarks, auth helpers
│   │   ├── ai.ts          # AI service integrations (Groq, Anthropic, etc.)
│   │   ├── exam-submission.ts # Exam attempt lifecycle
│   │   ├── rate-limit.ts  # Per-user minute/daily quotas
│   │   ├── validation.ts  # Input validation schemas
│   │   └── ecosystem.ts   # Exam ecosystem resolution
│   ├── ai/                # AI provider implementations
│   ├── events/            # Event system
│   ├── infrastructure/    # Cloudflare, storage, etc.
│   ├── repositories/      # Data repository pattern
│   └── lib/               # Shared library code
├── frontend/              # Client-side code (components, lib, contexts)
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # Shared primitives (ErrorBoundary, AnimatedList)
│   │   ├── dashboard/     # Dashboard tab components
│   │   ├── auth/          # Auth page components
│   │   ├── ai-workspace/  # AI chat/workspace components
│   │   └── public/        # Public-facing components
│   ├── lib/               # Client utilities
│   │   ├── auth-ctx/      # React context for auth state
│   │   ├── data/          # Static/mock data + seed-derived constants
│   │   ├── services/      # Browser-side fetch wrappers
│   │   ├── store-ctx/     # Dashboard state (useSyncExternalStore)
│   │   ├── theme-ctx/     # Theme context
│   │   └── types/         # Shared TypeScript types
├── database/              # Prisma schema, seed script, raw data
│   ├── prisma/
│   │   ├── schema.prisma  # Single source of truth for DB schema (1529 lines)
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
- TypeScript strict mode enabled
- Server-only: Backend files must import `"server-only"` and never leak into client bundles
- Client components: Components in `frontend/components/` are client components (`"use client"`)
- Naming: camelCase for variables/functions, PascalCase for components/types, UPPER_SNAKE_CASE for constants
- Styling: Tailwind CSS v4 utility classes. Design tokens use `--font-*` CSS variables.
- Data flow: Client components call `frontend/lib/services/api.ts` → Next.js API routes (`app/api/*`) → `backend/services/*` → Prisma

## Architectural Boundaries
- **Presentation** = `frontend/components/`
- **Application** = `app/` (pages, layouts, route handlers)
- **Domain** = `backend/services/` + `frontend/lib/types/`
- **Infrastructure** = `backend/db.ts`, `database/prisma/`, `database/data/`
- **AI** = `app/api/ai/*`, `frontend/lib/data/ai.ts`

## Security Rules (Enforced)
- Never expose secrets: `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_URL` must only come from `process.env`
- Auth: JWT sessions via `jose`, HttpOnly cookies, 7-day expiry. No client-side token storage.
- Validation: All API route inputs must be validated (type checks, required fields).
- AI Safety: Never use LLM output for authorization. All AI responses are clearly labelled as `source: "mock"` when no API key is set.
- SQL Injection: Prisma parameterizes queries — never concatenate raw SQL.
- Passwords: Must be hashed with `bcryptjs` (cost 10).

## Testing Requirements
- All new features require at least a component test in `tests/`
- API routes should have integration tests in `tests/api/`
- Run `npm run test` before committing
- Run `npm run lint` and `npm run typecheck` before committing

## Documentation Requirements
- All new public APIs must be documented in `docs/API.md`
- New database models must be documented in `docs/DATABASE.md`
- New AI features must be documented in `docs/AI-SYSTEM.md`

## Database Rules
- Schema changes go in `database/prisma/schema.prisma` only
- Migrations are not used — schema is pushed directly (`npm run db:push`)
- Seed data lives in `database/prisma/seed.ts` and `database/data/`
- Never hardcode DB queries in client components

## API Rules
- All endpoints live under `/api/*`
- Use `NextResponse.json()` for all JSON responses
- Auth-protected routes must call `getUserIdFromRequest()` and return `401` if missing
- Route handlers must not contain business logic — delegate to `backend/services/*`

## AI Rules
- AI endpoints: `/api/ai/solver`, `/api/ai/tutor`
- Mock fallback must be clearly labelled and return `source: "mock"`
- System prompts are defined inline in the route handlers — do not move them to client code
- Never trust AI output for authorization, validation, or security decisions

## Dependency Rules
- Before adding a new dependency, check if it can be done with existing deps
- New dependencies must be justified in `docs/DECISIONS.md`
- Remove unused dependencies immediately

## File Organization
- Do not create new top-level directories without discussion
- Do not place client code in `backend/`
- Do not place server code in `frontend/`
- Do not place API routes outside `app/api/`
- Do not place tests outside `tests/` unless there is a framework constraint

## Production Status — Critical Issues

### P0 — Critical (Release-Blocking)
1. **OpenCode GitHub MCP server misconfiguration** — `{env:GITHUB_PERSONAL_ACCESS_TOKEN}` syntax not expanded, causing HTTP 400. Fixed by removing the github MCP server config and relying on automatic env var detection.

2. **AUTH_SECRET not set in production** — Development generates temporary secret; production must have AUTH_SECRET configured.

3. **AI provider keys not validated** — Groq and other AI API keys must come from environment variables only, never hardcoded.

4. **Question data integrity** — Need full audit of imported questions for duplicates, missing options, invalid answer keys, encoding errors, and broken mathematical expressions.

5. **Exam submission idempotency** — Exam attempt lifecycle (start → submit) must be fully idempotent; network retries must not double-count points.

### P1 — High (Significant Functional/Usability)
6. **Question bank completeness** — Verify all subjects, topics, and questions are correctly imported with valid options, answer keys, and explanations.

7. **Bangla Unicode handling** — Ensure Bangla text is preserved throughout the import → database → display pipeline without corruption.

8. **Mathematical expression rendering** — LaTeX/math must render correctly for both Bangla and English questions.

9. **Accessibility across all pages** — Need audit of keyboard navigation, focus management, screen-reader compatibility, and contrast ratios.

10. **Responsive design verification** — Mobile and tablet layouts need testing across all dashboard tabs, exam engine, and auth flows.

### P2 — Medium (Architectural/Performance)
11. **Bundle size optimization** — Next.js bundle analysis needed; identify and remove unused dependencies.

12. **Database query optimization** — Prisma queries need indexing review; N+1 query problems.

13. **AI quota and cost protection** — Per-user minute/daily quotas exist but need verification of actual enforcement.

14. **Error boundary coverage** — Some UI sections may lack ErrorBoundary wrapping.

15. **TypeScript strict compliance** — Verify no `any` types leakage, proper DTOs, and type safety across server/client boundaries.

### P3 — Low (Enhancements/Refinements)
16. **Design token consistency** — Verify `--font-*` variables used consistently across all components.

17. **Micro-interactions polish** — Loading skeletons, empty states, error states across all components.

18. **SEO metadata** — All public pages should have proper title, description, open graph tags.

19. **Cron job reliability** — Background jobs (daily quiz, current affairs) need uptime and error monitoring.

20. **Developer onboarding** — New contributor could successfully set up local dev environment and make a PR.

## Working Features (Validated)
- JWT authentication with HttpOnly cookies and 7-day session expiry
- Prisma ORM with PostgreSQL (production) / SQLite (development)
- Question search and filtering (subject, topic, difficulty, year, source)
- Exam engine (start, submit with idempotency)
- AI solver and tutor endpoints with quota enforcement
- Flashcard SRS system
- User progress tracking (UserQuestionProgress)
- Bookmark system
- Daily quizzes
- Mock tests
- Vocabulary learning
- Current affairs with citations
- Notification system
- Storage connection (Google Drive BYOS)

## Broken / Dead Features (Requires Investigation)
- [To be determined during audit] — Some buttons, menu items, and navigation may lead to incomplete workflows

## External Dependencies
- `@ai-sdk/groq`, `@ai-sdk/anthropic` — AI provider SDKs
- `jose` — JWT signing/verification
- `@prisma/client` — Database ORM
- `bcryptjs` — Password hashing
- `next`, `react`, `react-dom` — Framework and UI library
- `tailwindcss` — Styling
- `playwright` — E2E testing
- `vitest` — Unit/integration testing

## MCP Servers Status (OpenCode)
| Server | Status | Notes |
|--------|--------|-------|
| github | ✓ Connected (after config fix) | Automatic GITHUB_PERSONAL_ACCESS_TOKEN detection |
| context7 | ✓ Connected | Remote MCP server |
| 9th-grade-ai-docs | ✓ Connected | GitHub MCP via gitmcp.io |
| playwright | ✓ Connected | Local MCP |
| postgres | ✓ Connected | Local MCP |
| sentry | ⚠ Needs authentication | |

## Environment Variables (Critical)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | JWT signing secret (32-byte base64) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth secret |
| `GROQ_API_KEY` | Yes | Groq AI API key |
| `GROQ_API_KEY_EXPLAIN` | Yes | Groq AI API key for explanations |
| `TAVILY_API_KEY` | Yes | Tavily search API key |
| `CRON_SECRET` | Yes | Cron job authentication |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Yes | GitHub MCP auth |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL for redirects |
| `VERCEL_OIDC_TOKEN` | Conditional | Vercel OIDC for auth |

---

*Generated during Phase One: Complete Repository Discovery*