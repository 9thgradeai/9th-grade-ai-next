# Integration Guide

> How the parts of 9Th-Grade AI connect — the seams, the contracts, and the recipes for wiring new pieces in without inventing new architecture. Companion to `ARCHITECTURE.md` (structure) and `IMPLEMENTATION.md` (build process).

---

## 1. The Integration Seams

The codebase is split into four layers that meet at **explicit seams**. Every integration crosses one of them in the same direction:

```
Browser
  │  ① typed fetch:  frontend/lib/services/api.ts   (+ frontend/lib/types = shared DTO contract)
  ▼
Next.js route handler:  app/api/**/route.ts        ② parse → validate → auth → delegate
  │
  ▼
Domain services:  backend/services/**  (+ backend/ai/**)   ③ business logic only
  │
  ▼
Infrastructure:  backend/db.ts (Prisma), backend/infrastructure/**   ④ cache, queue, storage, observability
  │
  ▼
PostgreSQL (+ external providers)
```

| Seam | Contract | Rule |
|------|----------|------|
| ① Client → Server | `frontend/lib/types/` DTOs + `api.ts` wrappers | Client never calls raw `fetch` outside `api.ts`; never touches Prisma |
| ② HTTP | Route handlers | Thin controllers: validate input, call `getUserIdFromRequest()`, delegate, `NextResponse.json()` |
| ③ Logic | Service modules | Pure business logic; typed `AppError`s; no Next.js request objects |
| ④ Data | Prisma schema | Parameterised queries only; repositories for shared data access (`backend/repositories/`) |

Path aliases keep the seams visible: `@/*` → `frontend/*` (client), `~backend/*` → `backend/*` (server-only).

## 2. Cross-Cutting Server Integrations

These modules plug into features rather than living in one feature:

| Concern | Module | How features use it |
|---------|--------|---------------------|
| Sessions | `backend/auth.ts` (jose), `backend/session-verify.ts` | Route handlers verify the `auth_token` cookie; 401 when absent |
| Validation | `backend/validation.ts` + Zod schemas | Every external input (route payloads, AI outputs) is validated |
| Errors | `backend/errors.ts` (`AppError` hierarchy) | Services throw typed errors; handlers map to consistent JSON shapes (`API.md` §Error Shapes) |
| Rate limiting | `backend/rate-limit.ts` + `infrastructure/cache/` | Token-bucket policies per route class (login, register, AI, submit); memory store in dev, **Redis in prod** (`REDIS_URL`) |
| Caching | `infrastructure/cache/query-cache.ts` | Optional read caching; API responses themselves are never cached |
| Events | `backend/events/bus.ts` | Domain events fan out to subscribers (e.g. `notification-subscriber.ts` writes `AppNotification`s when learning events occur) |
| Queue | `infrastructure/queue/` | Background work (storage sync/import worker) |
| File storage | `infrastructure/storage/` | Pluggable driver (`STORAGE_DRIVER=local-disk` default) used by BYOS |
| Logging | `infrastructure/observability/logger.ts` (pino) | Structured JSON in prod, redaction of secrets, no-op in tests |
| Errors reporting | `instrumentation.ts` + Sentry | Production error capture; client is error-only (ADR-0013) |
| Scheduling | `backend/schedule.ts` + Vercel Cron | Cron routes protected by `CRON_SECRET` |

## 3. AI Integration

```
Feature route (app/api/ai/*)
      │  Zod-validated payload (backend/ai/schemas.ts)
      ▼
backend/ai/router/          tier → model  (AI_MODEL_PRIMARY / AI_MODEL_FAST, task tiers)
      ▼
backend/ai/providers/registry.ts     ← THE swap point: groq | anthropic | mock
      ▼
provider SDK (Vercel AI SDK)  ──optional──► Tavily search (grounding)
      ▼
typed result + `source` label (groq+web | groq | anthropic | mock)
```

**Adding an AI capability:**
1. Define the task in `backend/ai/router/tasks.ts` and the output schema in `backend/ai/schemas.ts`.
2. Implement prompt assembly in `backend/ai/prompts/` (server-side only — never in client code).
3. Call through the router/registry — never call a provider SDK directly from a route.
4. Guarantee a labelled mock fallback so CI/local dev run keyless.
5. Record usage for the spend guard (`backend/ai/usage/`).
6. Document in `AI-SYSTEM.md`.

**Adding a provider:** implement `backend/ai/providers/types.ts`, register in `registry.ts`, add its env var to `.env.local.example`. No call sites change.

## 4. Frontend Integration

| Piece | Role |
|-------|------|
| `frontend/lib/services/api.ts` | The only client→server gateway; typed wrappers per endpoint |
| `frontend/lib/types/` | Shared DTOs — the compile-time contract on both sides |
| `auth-ctx/`, `theme-ctx/` | React contexts for session and theme |
| `store-ctx/` | Dashboard state via `useSyncExternalStore` (no Redux/Zustand) |
| Declarative fetch hook (ADR-062) | Client data fetching without adding SWR/React Query |
| `app/globals.css` tokens | Design system shared by every component (see `DESIGN-SYSTEM.md`) |
| `frontend/components/ui/` | Primitives reused across landing + dashboard |

Dashboard tabs integrate by composing: fetch via `api.ts` → loading/empty/error states → render from DTOs → mutate → refetch or optimistic update.

## 5. Third-Party Integration Inventory

| Integration | Direction | Config | Failure behavior |
|-------------|-----------|--------|------------------|
| Groq (tutor/assistant/explain) | outbound | `GROQ_API_KEY`, `GROQ_API_KEY_EXPLAIN` | labelled mock |
| Anthropic (solver/vision) | outbound | `ANTHROPIC_API_KEY` | labelled mock |
| Tavily (web grounding) | outbound | `TAVILY_API_KEY` | model knowledge, no web label |
| Google OAuth (sign-in) | inbound | `GOOGLE_CLIENT_ID/SECRET` | feature hidden |
| Google Drive (BYOS) | outbound | OAuth + `GOOGLE_OAUTH_ENCRYPTION_KEY` | local storage driver |
| Redis | outbound | `REDIS_URL` (prod required) | in-memory (dev); fail-open logged if briefly unreachable |
| Sentry | outbound | `SENTRY_DSN` | no-op |
| SMTP → Resend → SendGrid | outbound | see `EMAIL.md` | accounts auto-verify (dev) |
| Vercel Cron | inbound | `CRON_SECRET` | cron routes 503/401 without it |

## 6. Recipe: Wire a New Vertical Slice

1. **Contract** — add DTOs to `frontend/lib/types/`.
2. **Data** — add/extend the Prisma model; update `docs/DATABASE.md`; `npm run db:push`.
3. **Logic** — new/existing service in `backend/services/`; typed errors; validate with Zod.
4. **HTTP** — route handler in `app/api/<path>/route.ts`: auth → validate → delegate.
5. **Client** — wrapper in `frontend/lib/services/api.ts`.
6. **UI** — component in `frontend/components/dashboard/` with all four states.
7. **Cross-cutting** — apply rate limiting if the endpoint is expensive; emit domain events if other features react; log via pino.
8. **Tests** — unit (service), route (`tests/api/routes.test.ts`), component.
9. **Docs** — `API.md`, `DATABASE.md`, `FEATURES.md`, `REQUIREMENTS.md` (if new behavior).

## 7. Contract-Change Protocol

When an existing integration changes shape:

1. **Types first** — change `frontend/lib/types/`; let TypeScript find every consumer.
2. **Server** — update service + route to satisfy the new types.
3. **Client** — update `api.ts` wrapper + affected components.
4. **Tests** — update fixtures and expectations in the same PR.
5. **Docs** — update `API.md` response shapes and `FEATURES.md` map.
6. **Decisions** — if the change adds a dependency or shifts an architectural choice, record an ADR in `DECISIONS.md`.

> Breaking the client/server contract without updating types first is the most common source of integration bugs — the DTO layer exists to make those breaks compile-time visible.
