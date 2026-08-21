# Migration Plan — Railway/Postgres → Neon & Production Hardening (Phase 0)

> Execution plan for phases 0–27 tailored to this repository.
> Order is deliberate: **harden app+data first, migrate second, distribute third, test last**.
> Every phase ends with green `typecheck + lint + vitest` (protocol step 5).

## 0. Current Infrastructure Facts

| Fact | Value |
|---|---|
| App host | Vercel (zero-config, linked project `9th-grade-ai`) |
| DB host | Railway Postgres via `DATABASE_URL` (schema comment + DEPLOYMENT.md) |
| Migrations | **none** — `prisma db push` only; no history exists |
| Deploy hook | `prebuild` runs `db:sync` (clean→push→seed) when `VERCEL=1` |
| Queue/cache/workers/storage | none |
| Rollback story today | Vercel instant rollback (code only); DB has none |

## 1. Immediate Pre-Phase Action (before Phase 1): Stop the Bleeding

The deploy pipeline wipes production content tables on every build
(database-audit.md §5): bookmarks cascade-deleted, attempt↔question links severed,
ids renumbered. Any migration that copies this data bakes the damage in.

**Action P0.1** — change `prebuild` to a no-op-safe sequence:
`db:push --accept-data-loss` removal from prod path; replace `db:sync` on Vercel with
seed-only idempotent upserts once content identity is stable. Exact mechanics land with
Phase 2's schema changes (stable slugs/natural keys so reseeds are true upserts).

This is flagged now because it is a prerequisite for every later phase, not a rewrite.

## 2. Phase Map (repo-specific work items)

### Phase 1 — Target architecture doc (`docs/backend/target-architecture.md`)
**Status: DONE.** Module boundaries, request-flow contract, ownership map, and the
documented-temporary exceptions list are frozen there. No code moved.

### Phase 2 — Schema domain hardening (first schema change)
**Status: IN PROGRESS — increments A + B1 complete (2026-08-22).**
1. ✅ Migration baseline (`000000000000_init`) + `000000000001_daily_quiz_participation`
   (additive) + `000000000002_seed_source_keys` (additive columns, md5 backfills,
   safe natural-key dedupes, unique indexes). Full chain verified on scratch Postgres,
   including backfill parity with the TS `sourceKey()` helper and dedupe paths.
2. ✅ **DailyQuizParticipation shipped** (the critical fix): per-user `(userId,quizId)`
   unique state; `getDailyQuiz(userId?)` maps requester participation onto the existing
   DTO; `submitDailyQuiz` commits attempts + progress + participation atomically.
3. ✅ **P0.1 deploy-wipe KILLED**:
   - `prebuild` no longer runs destructive `db:sync`; it runs tolerant
     `prisma migrate deploy` (warning-only until baseline is resolved once on prod).
   - Seed pipeline fully rewritten to upsert-by-natural-key/sourceKey; zero deleteMany
     on content paths. Verified LIVE: double-seed run preserved a Bookmark's exact
     questionId, NotificationRead row, and produced zero catalog duplication.
   - Intra-batch duplicate questions in source files collapse deterministically.
4. ✅ **Per-user state models shipped (increment B2, 2026-08-22)** — migration
   `000000000003_per_user_state` (additive, verified on scratch DB):
   - `FlashcardUserState` (unique `[userId, flashcardId]`, SM-2 fields) + real
     review write path: `POST /api/flashcards/review` grades via pure `gradeSm2()`,
     upserts per-user state and appends the previously-dead FlashcardReview audit
     row inside one transaction. `GET /api/flashcards` overlays the caller's
     `srs` field (additive DTO change).
   - `StudyTaskCompletion` (unique `[userId, taskId]`): template tasks now visible
     to everyone with per-user completion; toggle writes completion rows, never
     the shared flag (fixes G3: templates were untoggleable/invisible before).
   - `UserBadge` (unique `[userId, badgeId]`): earned-state table; unlock engine
     ships in a later phase.
   - Shared-row scheduling/completion/badge flags marked DEPRECATED in schema + docs.
5. ⏳ Remaining in this phase: dual-read removal of legacy DailyQuiz flags after
   one seed cycle.

### Phase 3 — Integrity pass
Composite indexes matched to audit §2 gaps (points for rank, subjectName reporting path,
notifications feed), CHECK constraints via Prisma raw migration SQL where supported,
timestamp consistency (String dates → DateTime where feasible without breaking API DTOs),
partition-ready PKs on QuestionAttempt/AIUsage/AIMessage (uuid v7 or bigint + time key — decide in phase).

### Phase 3 — Integrity pass
**Status: DONE (2026-08-22).**
- Migration `000000000004_integrity_constraints`: `UserProgress.points` index (kills the
  rank seq-scan, U5) + 12 domain CHECK constraints mirroring app-layer bounds
  (accuracy/score/confidence ranges, SRS bounds, attempt-source enum, AIUsage
  non-negatives). Verified on scratch DB: chain applies clean; violating probes rejected;
  valid rows accepted.
- Documented decisions instead of churn: date-label columns intentionally String;
  no premature partitioning (see DATABASE.md "Integrity Constraints").
- Remaining audit gaps U2–U4 (per-request full-history reads) are Phase 6 query-scalability
  work — indexes alone can't fix over-fetch.

### Phase 4–5 — Services/Repositories + Transactions
**Status: DONE (2026-08-22).**
- Repository seam established: `backend/repositories/analytics.repository.ts`
  (DB-side per-subject aggregation via parameterized `$queryRaw` — replaces the
  load-all-attempts pattern for reports) and `progress.repository.ts` whose
  `recomputeAndAward()` is a SINGLE atomic upsert statement deriving totals from
  the attempt log (eliminates the lost-update window entirely, not just wraps it).
- Both violating handlers now thin delegates: `/api/subject-reports` →
  `services/analytics.getSubjectReports()`, `/api/badges` →
  `services/content.getBadgeCatalog()`. Response shapes byte-identical.
- Transaction sweep: practice submit, daily-quiz submit and exam submit all commit
  attempts + progress (+ participation / exam counter) through one shared
  `recordAttemptsAtomically()` inside `$transaction`; registration commits user +
  initial progress atomically with concurrent-email races mapped to 409 CONFLICT.
- AI conversation persistence remains intentionally best-effort/non-atomic by design
  (documented; provider calls never sit inside transactions).

### Phase 6 — Pagination
Notifications → keyset cursor `(timestamp,id)`; dashboard stats → SQL aggregate queries;
context-engine performance → single GROUP BY query; add `take` ceilings everywhere.

### Phase 6 — Pagination
**Status: DONE (2026-08-22).**
- **U1 notifications**: replaced fetch-all + in-memory slice with keyset pagination —
  Prisma `cursor` on the last-seen id within `(timestamp desc, id desc)` ordering,
  `limit` clamped 1–50, `total` via indexed count, `nextCursor` null on final page.
  API stays backward-compatible (first-page callers need no params; `page` field
  retired — no in-repo consumer).
- **U2 dashboard stats**: the per-request full-history attempt load is gone;
  7-day activity now comes from a DB-side grouped query (`aggregateDailyActivity`)
  zero-filled via the pure, unit-tested `buildActivityWindow`. Accuracy/answered
  counters read from UserProgress (kept honest by the Phase-5 atomic recompute).
- **U3 context engine**: `loadPerformance` previously loaded every attempt row
  twice *per AI turn*; now two grouped queries (`aggregateAttemptsByTopic`,
  `aggregateRecentAccuracy`) — weak/strong derivation unchanged.
- **Message feed bounded**: conversation history returns the latest 200 messages
  (chronological order preserved) instead of unbounded growth.
- U4 subject-reports resolved in Phase 4; U5 rank scan resolved by the Phase-3
  points index. U6 study-plan remains bounded-by-static-seed (documented).

### Phase 7 — Validation unification
**Status: DONE (2026-08-22).**
- `backend/validation.ts` is now THE single authority, staying dependency-free:
  every failure throws `ValidationError` → **400 VALIDATION_ERROR**. This fixes a
  real defect: shared validators used to throw plain `Error`, which
  `toHttpResponse` mapped to **500** for client mistakes (login/register/profile/
  change-password/questions/bookmarks all affected).
- Strict-mode policy enforced via `assertNoUnknownFields()`: auth + submission
  bodies REJECT undeclared fields (`admin:true` in a register body is now a 400,
  not silently stripped). AI chat endpoints remain lenient-tolerant by documented
  exception (provider payload surface evolves); their schemas already follow the
  same error contract.
- Register divergence eliminated: the route now consumes `validateRegisterInput`
  (name ≥2, strict email regex post-normalization, password ≥8). Email is
  normalized (trim+lowercase) BEFORE validation.
- New shared primitives: `validateBoundedInt` (defaults + clamping),
  `validateEnumValue` (closed sets), `requirePositiveInteger`. Notifications and
  flashcards-review routes ported onto them; question-search now validates
  difficulty against the stored enum spelling and rejects unknown query params.
- progress PATCH upgraded from silent-drop to reject-unknown-fields with bounds
  mirroring the DB CHECK constraints.

### Phase 8 — Rate-limit abstraction
**Status: DONE (2026-08-22).**
- `RateLimitStore` interface shipped (`infrastructure/cache/rate-limit-store.ts`);
  policy layer (`backend/rate-limit.ts`) now depends on the interface, never on
  process memory. Default = in-memory store, semantics byte-compatible with the
  legacy limiter (existing ai.test.ts expectations preserved, now async).
- Redis store PREPARED with an injected minimal client (`incr`+`pexpire`) — zero
  vendor dependency until adoption; factory refuses (loud CONFIGURATION_ERROR)
  to run with REDIS_URL while unadopted, instead of silently diverging per
  instance. Activation documented in DECISIONS.md ADR-0007.
- All limits env-configurable via live getters (`RL_*`), defaults equal to the
  previous hardcoded values.
- **Per-account login throttle** added: SHA-256(email)-keyed hourly bucket defeats
  IP-cycling brute force (security-audit §5); message stays enumeration-safe.
- `TRUST_CLIENT_IP=false` collapses anonymous keys to one opaque bucket;
  authenticated AI users remain strictly user-keyed.
- **DB-authoritative daily AI backstop wired**: on memory stores,
  `enforceAiQuotas` verifies real daily spend from the AIUsage ledger
  (`countUsageToday`), closing the counters-die-on-deploy gap.

### Phase 9 — AuthN/AuthZ
Map auth-identity vs application-user split (prepares optional Neon Auth adoption later);
absolute session-age cap on refresh; decide ADMIN surface (implement role checks or park);
exam/build auth decision (recommend: require auth, keep public read endpoints public).

### Phase 10 — Dead models
`UserSession`: implement as revocation list **or** drop with migration + tests (decision memo required either way). Remove/justify other dead fields flagged in database-audit §6.

### Phase 11–12 — Events + Analytics
Lightweight `DomainEvent` emitter (in-proc, queue-shaped interface). Event table optional.
Precompute user aggregates (daily activity, subject/topic accuracy, streak) consumed by
dashboard/context-engine, replacing U2–U4 scans.

### Phase 13–15 — AI reorg, cost control, RAG
Reorganize ai/ into orchestration/providers/retrieval/memory/prompts/evaluation subpackage
(barrel-compatible, no route changes); store provider-reported usage where SDK exposes it;
tiered model routing table; pgvector schema (`knowledge_documents/chunks`) behind feature flag,
embedding job async from day one.

### Phase 16–17 — Queue + Storage interfaces
In-process driver for dev/tests; Redis-compatible (BullMQ-class) driver later.
ObjectStorage iface (S3-compatible, R2-first for $0 egress); solver image flow migrates base64-in-JSON → object refs when enabled.

### Phase 18–20 — Observability, security fixes, tests
Structured logger w/ requestId propagation; Sentry DSN optional-by-env; remediate
security-audit queue items 2–6; add the full IDOR/concurrency/idempotency/quota test matrix.
**Gate: this is the "hardened" bar required before any infra migration.**

### Phase 21–22 — Neon migration (only after gate)
Environments: `dev(local) / staging / prod` branches in Neon (branch-per-env is native).

Runbook:
1. Snapshot Railway (`pg_dump` custom format).
2. Provision Neon staging (pooled connection string noted for serverless).
3. Apply migrations (now real files) + extensions (`pgvector`, `pg_trgm` when needed).
4. Import data; reconcile row counts per table; FK orphan check queries.
5. Index/constraint diff vs schema.
6. Point staging app at Neon; run integration suite + manual AI flows.
7. Load test staging (Phase 25 script, 100→1000 users).
8. Freeze writes window (low-traffic), final Railway dump, cutover `DATABASE_URL`, smoke tests.
9. Keep Railway live ≥2 weeks as rollback target; monitor error/latency budgets.
10. Only then decommission planning for Railway (never immediate delete).

Seed/deploy changes: prebuild becomes `migrate deploy` (+ optional guarded seed), never clean.

### Phase 23–24 — Redis + Workers (post-migration)
Upstash/Railway Redis for rate-limit store + catalog cache + short-lived state;
BullMQ workers for embeddings/title-generation/analytics rolls/cleanup; idempotency keys,
retry/backoff/DLQ contracts defined at Phase 16 interface level.

### Phase 25–27 — Evidence
k6 scripts committed (`tests/load/*`); P50/95/99 per endpoint at 100/500/1K/5K concurrencies;
failure drills (DB down, Redis down, provider 5xx, Tavily timeout, worker kill) with documented
degradations; final architecture docs updated with measured numbers only.

## 3. Risk Register

| Risk | Mitigation |
|---|---|
| Schema changes break seeded-content consumers | Dual-read shims during Phase 2 transition; API DTOs unchanged |
| No migration history exists today | Baseline migration created against current prod snapshot BEFORE any drift |
| Serverless post-response persistence losses | Move critical persistence before stream close where possible; queue the rest (Phase 16) |
| Neon cold-start latency on free tier | Pooler endpoint + keep-alive probe; measure in Phase 25 |
| Vendor lock-in creep | Interfaces mandated for rate-limit/queue/storage/provider; Postgres-native choices (pgvector) over SaaS |
| $0 budget overrun | Neon free branch limits monitored; Upstash free tier for Redis; R2 zero-egress storage; Groq free-tier primary model retained |

## 4. Definition of Done (program-level)

- [ ] No destructive deploy hooks; migrations versioned and reversible-per-step
- [ ] All multi-write paths transactional; submissions idempotent
- [ ] Zero unbounded request-path queries; feeds cursor-paginated
- [ ] Rate limiting distributed-safe via interface; AI quotas DB-authoritative
- [ ] IDOR/security suite green; structured logs + error tracking live
- [ ] Neon prod serving traffic ≥14 days with Railway rollback untested-but-available
- [ ] Load-test report with measured targets, no aspirational claims

*Phase 0 complete upon commit of these five documents. Next: Phase 1 deliverable.*

---

## FINAL STATUS LEDGER (program close-out)

Phases 9–27 executed per `FINAL-REPORT.md` §3 ledger: ✅ code+tests for
9–11, 13–20, 26; 🟡 runbook/gated for 12-rollups(→P24), 15-RAG(neon ext),
21–24(infra), 25(k6 needs staging). Full deliverable mapping + verification
record: **docs/backend/FINAL-REPORT.md** · Architecture: **final-architecture.md**.
