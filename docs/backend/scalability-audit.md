# Scalability Audit — 9Th-Grade AI (Phase 0)

> Question answered here: *what breaks first, and in what order, as concurrency and
> data volume grow?* Evidence keyed to file:line where practical.

## 1. Horizontal-Scale Blockers (ordered by first-breakage)

| Rank | Blocker | Location | Failure mode at scale |
|---|---|---|---|
| B1 | In-memory rate-limit store | `backend/rate-limit.ts` Map | N instances ⇒ limits multiplied ×N; every deploy resets counters (burst window after each Vercel deploy) |
| B2 | Deploy-time content wipe + reseed | `package.json#prebuild` → db:sync | Not a scale issue per se, but makes content ids unstable — blocks caching strategies (CDN keys, cursor stability) |
| B3 | Per-request full-history reads | see §2 U1–U4 | Latency grows linearly with user activity; DB CPU burns on repeated aggregation |
| B4 | Connection-per-serverless-instance | `db.ts` singleton per isolate; no pgbouncer/pooler URL documented | Neon/Railway max-connections exhausted under serverless fan-out |
| B5 | Fire-and-forget post-stream work in serverless | tutor turn persistence (`application/services.ts:232`) | Platform may freeze isolate after response flush → lost assistant messages/usage rows intermittently |

Not blockers today: PrismaClient memoization, provider cache, JOSE secret memo, stateless JWT.

## 2. Unbounded / Expensive Query Inventory

| ID | Query | Cost model | Growth driver |
|---|---|---|---|
| U1 | `getNotifications` fetches **all** AppNotification rows then slices in memory (`app/api/notifications/route.ts:29-31`) | O(total announcements) per request | announcements × users-read join rows |
| U2 | `getDashboardStats` loads **all** of a user's attempts to build a 7-day chart (`content.ts:354`) | O(user lifetime attempts) per dashboard view | activity history |
| U3 | context-engine `loadPerformance` loads **all** attempts twice-ish: recent-30d slice + full-history byTopic (`context-engine.ts:59-72`) — executed on **every AI turn** | worst offender: O(lifetime) per AI message | AI usage × history |
| U4 | subject-reports loads all user attempts (`subject-reports/route.ts:22`) | O(lifetime) per report view | activity history |
| U5 | rank = `count(UserProgress where points > mine)` (`content.ts:360`) | O(all users) scan, no index on points | user count |
| U6 | `getStudyPlan` joins all days × their tasks every call (`content.ts:154`) | O(plan size); static seed data so bounded-by-data today | plan growth if dynamic plans land |

Bounded-OK: questions ≤200/page; conversations ≤50; messages unbounded but conversation-scoped (cursor needed eventually); mock results take 10; catalogs small.

## 3. Memory Pagination

Exactly one instance: notifications (U1). Everything else paginates in DB or is naturally bounded.
Keyset/cursor pagination required for: notifications feed, AI messages (conversation-scoped),
and any future attempt/analytics feed.

## 4. Synchronous Work That Will Need Queues

1. Auto-title model call — currently fire-and-forget inline; fine until volume makes provider spend unpredictable.
2. Future embeddings/knowledge ingestion (Phase 15) — must be async by construction.
3. Analytics aggregation (Phase 12) — must move off request path (see U2–U4).
4. Notification fan-out (none exists yet).
5. Cleanup jobs (expired AIMemory has no sweeper — expiry only filters reads).

## 5. Concurrency Hazards

| Hazard | Location | Window |
|---|---|---|
| Lost-update on accuracy/answered counts | `activity.ts#recomputeProgress` read-counts then updates | two concurrent submissions interleave counts |
| Double-submit exam/practice | no idempotency key anywhere | client retry duplicates attempts + points |
| Daily quiz completion race | G1 global flags + submit path | trivially corruptable |
| Rate-limit counter races | Map increment non-atomic across isolates only (single-isolate JS is fine) | multi-instance only |
| Bookmark toggle | findUnique→delete/create (no unique-violation catch-and-retry) | rare duplicate-key 500 possible |

## 6. Capacity Sketch (order-of-magnitude, to be replaced by Phase 25 measurements)

Assumptions: 10K MAU, 50 answers/user/day, 10% use AI with 10 turns/day.

| Table | Rows/month | Notes |
|---|---|---|
| QuestionAttempt | ~15M/yr | partitioning candidate ≥100M |
| AIMessage + AIUsage | ~7M+7M/yr | conversation-scoped reads OK; ledger grows forever |
| FlashcardReview | 0 (dead) | would be large once wired |
| Content tables | static thousands | cacheable wholesale |

Postgres vertical headroom is far away; the binding constraints are the request-path scans (U2–U5)
and connection count (B4), not row volume.

## 7. Caching Posture

None. No HTTP cache except flash-news `max-age=300`. No application cache.
Catalog endpoints (badges/documents/recs/schedule/questions-meta) are ideal CDN/Redis candidates
**after** B2 (deploy wipe) is fixed, since cache invalidation requires stable content identity.

## 8. What "100K-ready" Requires From This Audit

1. Shared rate-limit store (interface now, Redis later).
2. DB-side aggregation or precomputed aggregates replacing U2–U5.
3. Keyset pagination on feeds.
4. Pooled connections via Neon pooler string.
5. Idempotency on submission endpoints.
6. Stable content identity (kill deploy-wipe) before any caching layer.

*Each item maps to phases 6, 8, 11, 12, 16, 23 in migration-plan.md.*
