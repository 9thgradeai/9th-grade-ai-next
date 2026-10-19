# Implementation Guide

> How 9Th-Grade AI is implemented, end to end. Companion to `ARCHITECTURE.md` (structure), `INTEGRATION.md` (seams), and `FEATURES.md` (per-feature map).

---

## 1. Implementation Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js **16** App Router | RSC, route handlers, `proxy.ts` (Next 16 middleware) |
| UI | React **19** | Client components in `frontend/components/` |
| Language | TypeScript **5**, strict | Path aliases: `@/*`→`frontend/*`, `~backend/*`→`backend/*`, `~tests/*`→`tests/*` |
| Styling | Tailwind CSS **v4** (CSS-first) | Design tokens via CSS variables in `app/globals.css` |
| Animation | Framer Motion | Global `MotionConfig reducedMotion="user"` |
| ORM/DB | Prisma **6** + PostgreSQL | Schema **pushed** (`db push`), no migration files |
| Auth | jose JWT in HttpOnly cookies | bcryptjs cost 10; Google OAuth (PKCE) optional |
| AI | Vercel AI SDK + Groq/Anthropic + Tavily | Mock fallback always available |
| Observability | pino + Sentry | JSON logs in prod; error-only Sentry client |
| Testing | Vitest 3 + Testing Library + Playwright | Coverage ratchet, E2E in CI, k6 load tests |

## 2. Layered Implementation

```
Presentation   frontend/components/**            (client React, "use client")
Application    app/**                            (pages, layouts, thin route handlers)
Domain         backend/services/** + frontend/lib/types/**   (business logic + DTOs)
Infrastructure backend/db.ts, backend/infrastructure/**, database/**  (Prisma, cache, queue, observability, storage)
```

Enforced invariants:

- `backend/**` imports `"server-only"` — it can never leak into a client bundle.
- Route handlers contain **no business logic**: parse → validate → delegate to a service → `NextResponse.json()`.
- The client reaches the server only through `frontend/lib/services/api.ts` typed fetch wrappers (`cache: "no-store"`).
- Shared DTOs live in `frontend/lib/types/` — the single client/server contract.

### Infrastructure modules (`backend/infrastructure/`)

| Module | Contents | Purpose |
|--------|----------|---------|
| `cache/` | `rate-limit-store.ts`, `rate-limit-memory.ts`, `rate-limit-redis.ts`, `redis-client.ts`, `query-cache.ts` | Interface-first rate limiting (memory dev / Redis prod), optional query cache |
| `observability/` | `logger.ts` (pino, redaction, no-op in test), `sentry.ts` | Structured logging + error reporting |
| `storage/` | `local-disk.ts` + `types.ts` | Pluggable file storage (`STORAGE_DRIVER`, local-disk default) |
| `queue/` | `in-memory.ts` + `types.ts` | Simple work queue for background jobs (e.g. storage worker) |

Supporting server modules: `backend/errors.ts` (typed `AppError` hierarchy), `backend/rate-limit.ts`, `backend/validation.ts`, `backend/auth.ts` (JWT sessions), `backend/session-verify.ts`, `backend/auth/google.ts`, `backend/schedule.ts`, `backend/events/` (in-process event bus with subscribers), `backend/repositories/` (data-access for analytics/progress).

## 3. Anatomy of a Feature Slice

Every feature is a vertical slice through the same five files:

```
frontend/components/dashboard/XxxTab.tsx      1. UI — fetches via api.ts, renders states
frontend/lib/services/api.ts                  2. Typed fetch wrapper (add the call here)
frontend/lib/types/…                          3. DTO types shared by client + server
app/api/<endpoint>/route.ts                   4. Thin handler: validate → auth → service
backend/services/<domain>.ts                  5. Business logic → Prisma
database/prisma/schema.prisma                 6. (If new data) model + relations
```

Worked example — **bookmark toggle**:

1. `frontend/components/dashboard/QuestionBankTab.tsx` calls `api.toggleBookmark`.
2. `frontend/lib/services/api.ts` → `fetch("/api/bookmarks", { method: "POST", … })`.
3. Route `app/api/bookmarks/route.ts` calls `getUserIdFromRequest()` (401 if absent), validates `{ questionId }`, delegates.
4. `backend/services/user.ts` upserts/deletes the `Bookmark` row.
5. Response returns the new state; the client updates optimistically.

**Adding a new slice (checklist):**

- [ ] Types first (`frontend/lib/types/`) — the contract.
- [ ] Service in `backend/services/` with Prisma access; throw typed `AppError`s.
- [ ] Route handler in `app/api/` — auth check, validation, delegate, `NextResponse.json()`.
- [ ] Fetch wrapper in `frontend/lib/services/api.ts`.
- [ ] UI component in `frontend/components/dashboard/` with loading/empty/error states.
- [ ] Tests: service unit test (`tests/unit/backend/`) + route test (`tests/api/routes.test.ts`) + component test.
- [ ] Docs: `API.md` (endpoint), `DATABASE.md` (model), `FEATURES.md` (feature map).

## 4. Data Layer Implementation

- **Schema:** `database/prisma/schema.prisma` is the single source of truth (20+ models). No migration files — schema is pushed directly.
- **Local sync:** `npm run db:push && npm run db:seed` (or `npm run db:sync`).
- **Production:** the Vercel `prebuild` hook runs `npm run db:deploy-sync` — a **non-destructive** push (destructive changes fail the deploy loudly) followed by the idempotent seed.
- **Seeding:** `database/prisma/seed.ts` (idempotent, NFC-normalised Bengali matching, demo user in dev only) + `scripts/seed-questions.ts` (folder-structured + flat question import, taxonomy rebuild).
- **Content QA:** `qa:audit` / `qa:validate` / `qb:forensics` / `math:audit` / `math:heal` gate question content (see `TESTING.md`).
- **Maintenance scripts:** `db:clean`, `db:prune-activity`, `db:reconcile-progress`, `db:reset`, `db:studio`.

## 5. AI Implementation

```
app/api/ai/*  →  backend/ai/  →  providers (groq | anthropic | mock)
                    │
                    ├── router/       tier → model selection (AI_MODEL_PRIMARY / AI_MODEL_FAST)
                    ├── prompts/      prompt assembly (server-side only)
                    ├── agent/        study-coach loop: loop + checkpoint + persistence
                    ├── orchestration/ task sequencing
                    ├── tools/, memory/, retrieval/, verification/, security/
                    └── usage/        per-user usage tracking + spend guard
```

- Providers are registered in `backend/ai/providers/registry.ts` — swapping the inference backend is a registry/router change, not a call-site change (Groq exposes an OpenAI-compatible API; `AI_GROQ_BASE_URL` is the swap point).
- **Every** path falls back to a clearly-labelled mock when keys are absent — local dev and CI run with zero AI dependencies.
- Rate/spend guards live in `backend/rate-limit.ts` (`RL_AI_PER_MIN`, `RL_AI_DAILY`, `AI_DAILY_BUDGET_USD`).
- Web grounding via Tavily (`app/api/ai/_search.ts`-level helper); tutor retries empty output.

## 6. Frontend Implementation

- **State:** React Context (`auth-ctx/`, `theme-ctx/`) + `useSyncExternalStore` dashboard store (`store-ctx/`) — no Redux/Zustand.
- **Data:** every tab fetches its own endpoints on mount (`cache: "no-store"`); `frontend/lib/hooks` provides a declarative fetch hook (ADR-062) instead of adding SWR.
- **Design system:** tokens in `app/globals.css` (`--font-*`, surfaces `glass`/`glass-card`, `cosmic-bg`, `noise`, `text-gradient`, `glow-border`); primitives in `frontend/components/ui/` (ErrorBoundary, Reveal, SpotlightCard, AnimatedList, StatusPill, SectionHeading, ScrollProgress).
- **Motion:** Framer Motion presets in `frontend/lib/transitions/`; GPU-only properties; `viewport={{ once: true }}` reveals.
- **Dashboard:** one tab component per feature in `frontend/components/dashboard/`, composed by `DashboardTabClient` with `AnimatePresence` transitions and side/bottom nav (`SideNav`, `BottomNav`, `NavRows`).
- **Offline:** hand-rolled service worker (`scripts/copy-sw.mjs` copies it at build; ADR-061 replaced `next-pwa`).

## 7. Background & Scheduled Work

| Work | Mechanism |
|------|-----------|
| Daily current-affairs generation | Vercel Cron → `app/api/cron/daily-current-affairs` (Bearer `CRON_SECRET`) |
| Google Drive sync/import (BYOS) | `app/api/storage/worker` (+ `WORKER_SECRET`), backed by the in-memory queue |
| Event fan-out (notifications, learning events) | `backend/events/bus.ts` with subscribers |

## 8. Build, Verification & Release

```
npm run typecheck        # tsc --noEmit  (+ typecheck:tests)
npm run lint             # ESLint + UI lint + design-token check
npm run test             # Vitest, coverage thresholds enforced
npm run build            # next build (+ service worker copy)
npm run perf:check       # webpack analyze build + client-JS budget gate
npm run test:e2e         # Playwright (needs seeded DB)
```

CI (`.github/workflows/ci.yml`, Node 22) runs three parallel jobs on every push/PR to `main`:

1. **test** — typecheck, lint, coverage-enforced tests, build, against a real Postgres 16 service container.
2. **e2e** — Playwright against `next dev` with a seeded DB.
3. **perf** — bundle-analysis build with the committed client-JS budget (ADR-0012/0014/0063).

Release = push to `main` → Vercel auto-deploy → `prebuild` runs `db:deploy-sync` → post-deploy check hits `/api/health`. Rollback via Vercel instant rollback or `git revert` (see `RUNBOOK.md`, `DEPLOYMENT.md`).

## 9. Conventions That Must Hold

| Rule | Why |
|------|-----|
| Route handlers stay thin | Business logic belongs in `backend/services/` (testable without HTTP) |
| No business logic in components | Components fetch + render only |
| Typed errors only (`backend/errors.ts`) | Consistent API error shapes, correct status codes |
| Zod-validate every external input | Route payloads, AI outputs, env-derived config |
| New dependency ⇒ ADR in `DECISIONS.md` | Dependency discipline |
| Coverage ratchets up only | Prevents silent quality decay |
| Content enters via the DB/seed path | Never hardcode questions in the client |

## 10. Where to Look

| Question | Document |
|----------|----------|
| What does the product promise? | `REQUIREMENTS.md`, `PRODUCT.md` |
| How is it structured? | `ARCHITECTURE.md`, `AGENTS.md` §7 |
| How do pieces connect? | `INTEGRATION.md` |
| What does each feature do? | `FEATURES.md` |
| How is X tested? | `TESTING.md` |
| How do I debug a failure? | `DEBUGGING.md` |
| Which decisions were made and why? | `DECISIONS.md` |
