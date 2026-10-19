# Error Handling & Debugging

> How errors flow through 9Th-Grade AI, what tooling exists, and a playbook for the failures you will actually hit. Companion to `RUNBOOK.md` (production incidents) and `PITFALL_REGISTER.md` (known traps).

---

## 1. The Error Model

### 1.1 Server: typed errors only

All server-side errors derive from `AppError` in `backend/errors.ts`:

| Class | Status | Code |
|-------|--------|------|
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` |
| `InternalServerError` | 500 | `INTERNAL_ERROR` |

Rules:
- **Services throw** typed errors; they never build HTTP responses.
- **Route handlers catch and translate** to the standard JSON error shape (see `API.md` §Error Shapes) via `NextResponse.json()`.
- `isOperational` distinguishes expected failures (safe to show) from bugs (never leak internals).
- `backend/services/error-classifier.ts` classifies third-party/AI failures for retry vs. fallback decisions.

### 1.2 Client: graceful degradation

| Mechanism | Location | Behavior |
|-----------|----------|----------|
| Error boundary | `app/error.tsx` + `frontend/components/ui/ErrorBoundary.tsx` | Catches render crashes; shows recovery UI instead of a white page |
| Per-tab states | every dashboard tab | Loading / empty / error states per fetch — one failed endpoint never blanks the dashboard |
| Toaster | `frontend/lib/` toaster | Non-blocking failure notifications |
| Mock provenance | AI surfaces | AI failures degrade to clearly-labelled mock output (`source: "mock"`), never silent |

### 1.3 AI-specific errors

- Empty provider output → bounded retry (tutor).
- Unparseable solver JSON → fall back to raw text.
- No API key / budget exhausted → labelled mock or 429 via rate limiter.
- Every response carries `source` / `X-AI-Source` — **start AI debugging by reading that label.**

## 2. Observability Toolkit

| Tool | Where | Notes |
|------|-------|-------|
| **pino logger** | `backend/infrastructure/observability/logger.ts` | JSON lines in prod, pretty one-liners in dev, **no-op in tests**. Auto-redacts `password|secret|token|authorization|cookie|apikey`. Level via `LOG_LEVEL`, format via `LOG_FORMAT`. |
| **Sentry** | `instrumentation.ts`, `backend/infrastructure/observability/sentry.ts`, `frontend/lib/sentry.tsx` | Enabled only in production; client is **error-only** (no replay/browser tracing, ADR-0013). No-op without `SENTRY_DSN`. |
| **`X-Request-ID`** | set on every response (`proxy.ts`) | Correlate a user report with server logs |
| **`/api/health`** | `app/api/health` | Post-deploy and uptime checks |
| **Runbook** | `RUNBOOK.md` | Incident response, escalation, backups |

## 3. Debugging Playbook

### 3.1 First moves

```bash
npm run typecheck        # contract breaks show up here first
npm run lint             # includes UI lint + design-token check
npm run test             # fast unit/component feedback
npm run dev              # reproduce with live logs
```

For AI/agent behavior, check the `source` label; for data questions, `npm run db:studio`; for content corruption, `qb:forensics` (see `TESTING.md`).

### 3.2 Common failure modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401` on endpoints you're logged into | JWT invalid — `AUTH_SECRET` changed or differs between processes | Keep one `AUTH_SECRET`; changing it logs everyone out (by design) |
| `P1001` / can't reach DB | Wrong `DATABASE_URL`, or using the **pooled** Neon URL for migrations | App → pooled URL; migrations/push → `DIRECT_DATABASE_URL` (see `db:deploy-sync`) |
| Migrations fail on deploy | Destructive schema change — `db:deploy-sync` fails closed on purpose | Make the change additive, or run an explicit, reviewed destructive push |
| `429` in dev or E2E | Rate limiter (e.g. parallel E2E workers tripping `RL_REGISTER_PER_MIN`) | Raise the specific `RL_*` var locally/in test (Playwright's webServer already sets `RL_REGISTER_PER_MIN=60`) |
| `429`/independent limits in prod | `REDIS_URL` unset — each serverless instance counts alone | Set `REDIS_URL` (required in prod, ADR-0009) |
| AI answers are mocks | Key missing, or `AI_DAILY_BUDGET_USD` exhausted | Set the right key; check `/api/ai/usage/summary` |
| One AI key drains another's quota | Explanation traffic sharing the main key | Set `GROQ_API_KEY_EXPLAIN` (dedicated explanation key) |
| Duplicate seed content | Seed ran with a different DB than expected | Seeds are idempotent — check `DATABASE_URL`; use `db:reset` for a clean slate |
| Cron routes return 503/401 | `CRON_SECRET` unset in the deployment | Set `CRON_SECRET`; Vercel Cron sends it as a Bearer token |
| Build fails after UI change | Design-token lint (`lint:tokens`) or UI lint | `npm run lint:tokens` / `npm run lint:ui` locally; fix token usage |
| Perf job fails in CI | Client JS over the committed budget | `npm run perf:check`; trim bundles or re-baseline via ADR (ADR-0063) |
| E2E can't log in | DB not seeded | `npm run db:seed` first (E2E logs in as the seeded demo user) |
| Test hits "server-only" | Module imported in a Vitest jsdom context | Use the `server-only` stub in `tests/mocks/`; some tests opt into per-file Node mode |
| Prisma double out of sync | Schema changed but test double didn't | Update the hand-maintained Prisma double in `tests/setup.ts` alongside `schema.prisma` |
| Bengali name lookups fail | Unicode composed/decomposed mismatch | Normalize to NFC (all seed/matching paths already do — don't bypass) |
| Math renders corrupted | Question text bypassed the math pipeline | Run `npm run math:audit`; writers must pass the normalizer (ADR-030) |

### 3.3 Debugging the AI layer

1. Read the `source` label / `X-AI-Source` header — it tells you which provider (or mock) actually answered.
2. Check provider env keys and `AI_GROQ_MODEL` / `AI_ANTHROPIC_MODEL` overrides.
3. For the agent loop: `AgentRun` / `AgentToolCall` rows persist each run — inspect via `db:studio`; loop bound is `AI_AGENT_MAX_STEPS` (default 8).
4. Mock mode is a feature: run keyless to isolate app bugs from provider bugs.

### 3.4 Debugging data/content issues

```bash
npm run qa:audit          # question-bank integrity audit (report: qa:audit:report)
npm run qb:forensics      # deep inspection of suspect question rows
npm run math:audit        # LaTeX/math artifact scan (heal: math:heal:apply)
npm run db:reconcile-progress   # repair derived progress vs. raw attempts
```

Derived stats can be rebuilt from source-of-truth attempts — never hand-edit aggregates (`UserProgress`); run the reconcile/prune scripts instead (`RUNBOOK.md` §Common Operations).

## 4. Reproducing Like CI

```bash
npm run typecheck && npm run lint && npm run test -- --run --coverage
npm run build
npm run test:e2e          # needs seeded DB
npm run perf:check        # budget gate
```

CI runs these against a real Postgres 16 (`.github/workflows/ci.yml`) — if it passes locally but fails in CI, diff the environment (Node 22, `DATABASE_URL`, seeded vs. fresh DB) before diffing the code.

## 5. Known Traps

The project keeps a living **`PITFALL_REGISTER.md`** — check it before diagnosing anything recurring. Historical remediation notes live in `FRONTEND-REMEDIATION.md`, `DASHBOARD_ARCHITECTURE_AUDIT.md`, and the `docs/backend/*-audit.md` files.

## 6. Production Incidents

This document covers *development* debugging. For production response — severity, escalation, rollback, backups, data-repair jobs — follow `RUNBOOK.md`.
