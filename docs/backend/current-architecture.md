# Current Architecture — 9Th-Grade AI Backend (Baseline, Phase 0)

> Status: **as-audited snapshot**. This document describes the system exactly as it exists today
> (commit `bad2be4`, Aug 2026). It is the reference point for every subsequent phase.
> Nothing in this document is a recommendation — see `migration-plan.md` for that.

## 1. Runtime Topology

```
Browser (React 19 SPA-ish App Router client components)
   │  fetch + HttpOnly cookie (auth_token)
   ▼
Vercel (Next.js 16.3.1, zero-config deploy, .vercel/project.json linked)
   │
   ├── middleware.ts            edge runtime: /dashboard/*, /login/*, /api/*
   └── app/api/**/route.ts      41 handlers (Node runtime)
        │
        ▼
backend/ ("server-only" enforced)  →  PrismaClient singleton
        │
        ▼
PostgreSQL @ Railway (provider = postgresql, schema.prisma:10-13)
   DATABASE_URL env var; no migrations directory (db push only)

External:
   Groq API      (ai SDK, openai/gpt-oss-120b)     tutor/assistant primary
   Anthropic API (claude-sonnet-4-6)               solver primary + vision
   Tavily API    (plain REST)                      web grounding for AI
```

**Single logical deployment.** There is no worker process, no queue, no cache tier,
no object storage. Everything runs in the Next.js server process.

## 2. Request Flow (actual)

```
HTTP → middleware.ts (cookie gate, security headers, CORS preflight, X-Request-ID)
     → route handler (auth check → rate limit → validate → delegate)
     → backend/services/* or backend/ai/*
     → prisma (singleton)
     → Postgres
```

Standard handler skeleton (helpers from `app/api/_middleware.ts`):
`getRequestId()` → `startTiming()` → try { auth → limit → validate → service } catch { toHttpResponse() }.
Every substantive response carries `X-Request-Id`, `X-Response-Time`, and security headers.

### Deviations from the ideal flow (inventory)
| Location | Deviation | Severity |
|---|---|---|
| `app/api/subject-reports/route.ts:20-26` | Queries Prisma directly in handler | Medium (Phase 4 target) |
| `app/api/badges/route.ts:7` | Queries Prisma directly in handler | Medium |
| `app/api/exam/build/route.ts` | No auth check at all | Medium (see security audit) |
| `app/api/study-plan/tasks/[id]/toggle/route.ts` | Minimal style: no requestId/timing helpers, catch-all 404 | Low (consistency) |
| `daily-quiz`, `badges`, `documents`, `recommendations`, `question-bank/categories` routes | No observability headers at all | Low |

## 3. Module Map (backend/)

| Module | File(s) | Responsibility | State |
|---|---|---|---|
| DB core | `db.ts` | PrismaClient global singleton; connect retry ×3 exponential; dev slow-query log (>1s); SIGINT/SIGTERM disconnect | globalThis.prisma |
| Auth | `auth.ts` | JWT HS256 via jose (`{email}`, 7d); cookie set/clear; `getSessionUser` verifies token then loads live User row | lazy JOSE_SECRET memo |
| Errors | `errors.ts` | `AppError` hierarchy 400–500 + `toHttpResponse`; stack traces dev-only for non-operational errors | stateless |
| Rate limit | `rate-limit.ts` | In-memory Map fixed-window counters + daily UTC quotas; keys `route:user:<id>` or IP+host | **process-local Map** ⚠ |
| Validation | `validation.ts` | Hand-rolled validators: login/register/profile/change-password/question-search/pagination/positive-int | stateless |
| svc/user | `services/user.ts` | CRUD, password hash/verify (bcrypt 10), `getUserIdFromRequest`, progress patch, bookmarks, task toggle, account delete | stateless |
| svc/content | `services/content.ts` | Reads: questions (+filters), categories, flashcards, study plan, daily quiz, news, recs, notifications (fetch-all), documents, exam schedule, mock results, dashboard stats | stateless |
| svc/activity | `services/activity.ts` | Answer grading vs DB truth → bulk QuestionAttempt insert → `recomputeProgress` (count-then-update) | stateless |
| svc/exam | `services/exam.ts` | Selection tree (groupBy rollup), mulberry32 seeded shuffle, largest-remainder allocation, BCS scoring (+1/−0.5/0), submission persistence | stateless |
| ai/index | `ai/index.ts` | Public barrel; routes import only this | — |
| ai/types | `ai/types.ts` | Pure domain types; caps: 8K chars, 5MB image, 100 msgs | stateless |
| ai/schemas | `ai/schemas.ts` | Dependency-free request validators (chat/solver/feedback/message) | stateless |
| ai/orchestration | `application/services.ts` | Tutor streaming turn, solver structured turn, assistant JSON turn, intent regex router (11 bilingual intents) | provider cache Map (benign) |
| ai/title | `application/title.ts` | Fire-and-forget transcript→title model call; fallback first user message | stateless |
| ai/context | `context/context-engine.ts` | Task-scoped context: subject/topic/question lookups, performance agg (**loads ALL attempts**), memories | stateless |
| ai/memory | `memory/memory-store.ts` | AIMemory upserts; language inference (Bengali Unicode ratio ≥0.6/≤0.4); topic signals; 90-day expiry default | stateless |
| ai/persistence | `persistence/conversations.ts` | Ownership-scoped conversation/message CRUD; pinned ordering; ≤50 list | stateless |
| ai/providers | `providers/*` | LLMProvider iface; GroqProvider (retry×3 on empty), AnthropicProvider (vision), MockProvider (labelled); registry = ModelRouter with task-based resolution order | module-level provider cache |
| ai/tools | `tools/search.ts` | Intent-gated Tavily search; NEVER_SEARCH set of 8 intents; soft-fail | stateless |
| ai/usage | `usage/usage.ts` | AIUsage ledger writes; `bumpAIQuestions`; `countUsageToday` (DB-backed quota counting) | stateless |
| ai/validation | `validation/outputs.ts` | JSON parse w/ fence-strip + balanced-brace fallback; solver output normalize (8K/20-step caps); sanitizeReply | stateless |
| ai/prompts | `prompts/*` | Versioned builders: tutor-v1, solver-v1, assistant-v1, title-v1 | stateless |
| ai/feedback | `feedback.ts` | AIFeedback create after ownership check | stateless |

## 4. Authentication Model

- Stateless JWT (HS256, single secret, 7-day expiry). Payload `{ email }` only.
- Cookie `auth_token`: HttpOnly, SameSite=Lax, Secure in prod, path=/.
- **No session table consulted at runtime** (`UserSession` model exists but is dead code).
- Every protected route re-resolves email→user via unique-index lookup (revocation-safe against deletion).
- Sliding renewal via `/api/auth/refresh` (re-sign fresh 7d token, re-validates user existence).
- Roles exist (`UserRole STUDENT/ADMIN`, mapped to `"student"|"admin"` in `UserRecord`) but **no route ever consults role** — there is no authorization layer yet.

## 5. Rate Limiting (actual limits)

| Route | Limit |
|---|---|
| login | 5/min (per user-or-IP bucket) |
| register | 3/min |
| refresh | 20/min |
| change-password | 5/min |
| ai/tutor, ai/solver, ai/assistant | 10/min AND 60/day per user |

Store: per-instance Map (`stores`), fixed window, UTC day key for quotas.
Documented trade-off comment admits Redis swap requirement for multi-instance.
AI daily-quota *counting* also has a DB-backed variant (`countUsageToday`) that is exported but **not wired into any route** — enforcement relies solely on the memory store.

## 6. AI Pipeline (actual)

```
POST /api/ai/tutor (streaming)
  auth → 10/min + 60/day (memory store)
  validateChatRequest (schemas.ts)
  questionContextIds? → buildContext (subject/topic/question + performance + memories)
  ensureConversation → persistUserTurn → notePreferredLanguage
  buildModelMessages (persisted COMPLETE non-SYSTEM last 30 ∩ new turn slice(-4))
  resolveModel("tutor")           → groq → anthropic → mock
  searchForIntent(intent, query)  → Tavily or skip (8 never-search intents)
  buildTutorSystem(ctx, webBlock)
  provider.stream() → wrapped ReadableStream → Response(text/plain)
  post-drain (fire-and-forget async): sanitizeReply → addMessage(ASSISTANT) → bumpAIQuestions
    → auto-title if DEFAULT_TITLE → recordUsage(ledger row)
```

Solver/assistant are non-streaming JSON contracts with output validation
(`validateSolverOutput`, assistant actions whitelist ≤4). Solver misconception → weak-topic memory write.
Cost accounting: chars÷4 estimate both directions; Anthropic priced $3/$15 per M; Groq $0.

## 7. Error Handling Contract

`toHttpResponse` shape: `{ error: string, code: string }` (+ dev-only `stack` for non-operational).
Stable codes in production use: `VALIDATION_ERROR`, `AUTH_UNAUTHORIZED`, `AUTH_INVALID_CREDENTIALS`,
`INVALID_CURRENT_PASSWORD`, `USER_EMAIL_EXISTS`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`,
`RATE_LIMIT_EXCEEDED`, `MODEL_NO_VISION`, `AI_EMPTY_RESPONSE`, `INTERNAL_ERROR`, `UNKNOWN_ERROR`.
Known inconsistency: flash-news route's catch returns `{ error: { message, code } }` (nested) unlike everywhere else.

## 8. Deployment & CI (actual)

- **Vercel**, linked project `9th-grade-ai`. Zero-config (no vercel.json).
- `prebuild` script: `if [ "$VERCEL" = "1" ]; then npm run db:sync; fi`
  where `db:sync = db:clean && db:push && db:seed`.
  ⚠ **Every production deploy deletes all Question rows and reseeds** — consequences quantified in database-audit.md §5.
- CI (`.github/workflows/ci.yml`): node 22, `npm ci → typecheck → lint → vitest → next build`. No database service; tests are jsdom/unit only.
- No Dockerfile, no railway.toml, no containerization. "Railway" is the **database host only**
  (schema comment: "production uses Railway Postgres via DATABASE_URL").
- Vitest aliases `server-only` to a mock so backend modules import safely in tests.
  Coverage thresholds: 70% lines / 60% functions / 70% branches.

## 9. Single-Instance State Inventory (Phase 0 item 7)

| State | Location | Distributed-safe? |
|---|---|---|
| Rate-limit counters + daily quotas | `rate-limit.ts` Map | ❌ resets per instance/deploy |
| Provider instances cache | `providers/registry.ts` Map | ✅ rebuildable cache |
| JOSE secret memo | `auth.ts` | ✅ derived from env |
| PrismaClient memo | `db.ts` globalThis | ✅ standard pattern |
| Exam "paper identity" | `examId` UUID returned to client; **nothing persisted server-side** | ✅ but means no server-side session/answer-sheet state exists |

Everything else is database-backed. The only true distributed blocker is the rate-limit store.

## 10. Synchronous Operations That Should Eventually Be Asynchronous (item 6)

1. Conversation auto-title model call (inline post-stream, fire-and-forget already — queue candidate).
2. AIUsage ledger writes (post-stream, acceptable sync today).
3. Weak-topic memory writes inside solver turn (sync).
4. Dashboard stats / context-engine performance aggregation (heavy reads done synchronously per request — Phase 12 pipeline target).
5. Future: embeddings, document processing, notification fan-out (do not exist yet).

## 11. Test Baseline

Unit suites (`tests/unit/backend/`): ai, exam, questions, knowledge-base, title, web-search.
Frontend component tests: 10 files. No integration/API tests against a live DB.
No concurrency tests. No authorization/isolation tests. `tests/mocks/server-only.ts` unblocks backend imports.

---

*Sources: full read of `backend/**`, `app/api/**` (all 41 handlers), `database/prisma/schema.prisma`,
`scripts/*`, `middleware.ts`, `next.config.ts`, `package.json`, `.github/workflows/ci.yml`,
`.vercel/project.json`, `vitest.config.ts`, `tsconfig.json`, `docs/DEPLOYMENT.md`.*
