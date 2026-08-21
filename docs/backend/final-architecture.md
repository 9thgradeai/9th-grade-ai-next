# Final Backend Architecture — 9Th-Grade AI

> Deliverable 1–12 of the transformation program. Companion documents:
> `FINAL-REPORT.md` (verification record + deliverable checklist),
> `neon-migration-runbook.md`, plus the frozen Phase-0 audits in this folder.

## 1. Topology (current → target markers)

```
Cloudflare (future: edge cache/TLS)                    [Phase 27 target]
        │
Vercel — stateless Next.js 16 API + UI                 ✅ live
   ├── edge middleware: cookie gate, security headers, request-id
   │
   ├── Route handlers app/api/**                       thin: auth→limit→validate→delegate
   │      └── backend/services/*                       application services
   │             ├── backend/repositories/*            ONLY Prisma access (+db.ts)   [P4+]
   │             ├── backend/events/bus.ts             domain events (fire-forget)   [P11]
   │             └── infrastructure/
   │                    ├── cache/rate-limit-*         RateLimitStore iface          [P8]
   │                    ├── queue/in-memory            QueueDriver iface             [P16]
   │                    ├── storage/local-disk         ObjectStorage iface           [P17]
   │                    └── observability/logger       structured JSON logs          [P18]
   │
   ├── backend/ai/                                     AI domain
   │      ├── orchestration|providers|retrieval|
   │      │   memory|persistence|prompts|evaluation    [P13 barrels]
   │      └── ModelRouter: Groq → Anthropic → Mock                                   ✅
   │
   └── Neon PostgreSQL (branch-per-env)                SOURCE OF TRUTH               [P21/22 runbook]
          pgvector extension enabled (RAG-ready)       [P15 flag-off]

External: Groq · Anthropic · Tavily (grounding) · Redis-compatible store (prepared, ADR-0007)
Workers: separate deployment behind QueueDriver interface (Phase 24 gate)
```

**Core principle enforced:** Postgres = truth · Redis = temporary acceleration ·
Queue = async coordination · Object storage = binaries · AI = replaceable inference.

## 2. ER / Domain overview

```
User ─┬─ UserProgress (1:1, atomic recompute via progress.repository)
      ├─ Bookmark ──── Question ─── Subject ── Topic(tree) 
      ├─ QuestionAttempt (raw activity log; sources: practice|daily|exam|mock)
      ├─ MockTestResult ─ MockTest ─ MockTestQuestion(snapshots)
      ├─ DailyQuizParticipation (unique user+quiz) ─ DailyQuiz ─ QuizQuestion
      ├─ FlashcardUserState (SM-2, unique user+card) ─ Flashcard ─ FlashcardReview(log)
      ├─ StudyTaskCompletion (unique user+task) ─ StudyTask ─ StudyPlanDay
      ├─ NotificationRead (unique) ─ AppNotification
      ├─ UserBadge (unique) ─ Badge
      └─ AIConversation ─ AIMessage ─ AIFeedback
         AIMemory (typed learner memory) · AIUsage (cost ledger)

Content identity: natural keys or sourceKey=md5(...) on every seed-managed row ⇒
idempotent upsert seeding; ids stable across deploys.
```

Migrations 000–005 applied as a verified chain; CHECK constraints (Phase 3) ride
in migration 004 outside Prisma's model.

## 3. API architecture

41 handlers, uniform skeleton (`_middleware.ts`): requestId → timing → auth →
rate limit → **shared validation** (`backend/validation.ts`, 400-only contract,
strict unknown-fields) → service → repository. Keyset pagination on feeds;
DB-side aggregation for stats/reports/performance. New endpoints this program:
`POST /api/flashcards/review` (SM-2), notifications cursor params.

## 4. AI architecture

```
AI routes (thin) → orchestration (tutor stream / solver JSON / assistant actions)
  → ContextEngine (grouped perf queries + memories) → Retrieval (Tavily intent-gated;
     pgvector seam ready) → ModelRouter (Groq→Anthropic→Mock) → Output validation
  → Persistence (ownership-scoped conversations) → Usage ledger (provider-reported
     tokens w/ estimate fallback) → Domain events
Provider-specific code never leaves providers/. Mock is labelled and default-safe.
```

## 5. Redis architecture

Interface-first (ADR-0007): `RateLimitStore` with memory driver active; Redis
adapter complete behind injected client; `REDIS_URL` without adoption throws
CONFIGURATION_ERROR (no silent divergence). Redis holds counters only — loss is
non-corrupting; DB remains authority; AI daily spend double-checked against the
AIUsage ledger.

## 6. Queue / Worker architecture

`QueueDriver` (enqueue/start/stop) + InProcess driver (retries ×3 linear backoff,
dead-letter log). Workers = registered async handlers per job name. Vendor swap
(BullMQ/pg-boss) touches one factory function. Phase-24 deployment gate documented.

## 7. Security architecture

Layers: edge headers → per-route JWT+live-user check → store-backed limits
(user-scoped; account-hashed login throttle; IP trust toggle) → strict validation
→ ownership scoping (every WHERE carries userId; proven by isolation tests) →
output hygiene (hash stripped; AI output schema-capped) → transport hardening.
Absolute session cap 30d (origIat claim). Prompt-injection surface fenced:
retrieved web block is delimited + "treat as data" instruction.

## 8. Observability architecture

Structured logger (JSON in prod, redaction contract, test-silent) adopted at
infra seams; X-Request-Id/X-Response-Time on all substantive routes; DB slow-query
warns; AIUsage ledger = per-call cost/latency/error telemetry. Sentry = drop-in
via DSN env when budget allows (no dep forced).

## 9–12. Migration / Deployment / Backup

See `neon-migration-runbook.md` §0–5 (snapshot→staging rehearsal→cutover→rollback
window→decommission) and connection-handling rules. Backups: Neon point-in-time +
scheduled dumps to cold storage (two copies) once prod cutover lands.

## 13. Load testing

Harness committed: `tests/load/k6-smoke.js` (ramp to 100 VUs; thresholds encode
SLOs). Execution is gated on a deployed staging target (post-cutover). Local
verification of correctness only — no aspirational numbers claimed anywhere.

## Environment variable matrix

| Var | Required | Phase | Notes |
|---|---|---|---|
| DATABASE_URL | ✅ | — | Neon **pooled** URL at runtime |
| AUTH_SECRET | ✅ | — | HS256; rotate via dual-key later |
| GROQ_API_KEY / ANTHROPIC_API_KEY | opt | — | ModelRouter fallback chain |
| TAVILY_API_KEY | opt | — | Grounding; soft-fail |
| AI_GROQ_MODEL / AI_ANTHROPIC_MODEL / AI_TARGET_EXAM | opt | — | Overrides |
| RL_LOGIN_PER_MIN … RL_AI_DAILY | opt | P8 | Live getters, defaults preserved |
| TRUST_CLIENT_IP | opt | P8 | `false` ⇒ opaque anonymous bucket |
| REDIS_URL | opt | P8/P23 | Requires adapter adoption first |
| STORAGE_DRIVER / STORAGE_LOCAL_DIR | opt | P17 | local-disk default |
| LOG_FORMAT | opt | P18 | `json` forces structured lines |
| EMBEDDINGS_ENABLED | opt | P15 | Gate for RAG pipeline |

## 15. Known limitations & future scaling path

Limitations: single-region Vercel functions; notifications `total` counts whole
table; exam/build unauthenticated-by-design pending product decision (documented);
AI streaming usage tokens still estimated until stream-level usage wired;
k6 numbers pending staging execution.

Scaling path to 100K+: Neon autoscale branch + pooler → Redis adoption (limits+
catalog cache) → queue workers (titles/embeddings/rolls) → RAG activation on
pgvector → CDN catalog caching → partition QuestionAttempt/AIUsage by month when
>100M rows → read replicas for analytics if dashboards saturate.
