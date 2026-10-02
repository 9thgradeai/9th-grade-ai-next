# Dashboard Architecture Audit — 9Th-Grade AI

Layering: client services → thin routes (auth+validate+delegate) → services + repositories →
Postgres singleton. Rule "repositories only call Prisma" is aspirational — services call Prisma
directly. Evidence paths below.

## Frontend architecture

- Strengths: tab code-splitting (`dynamic()`), `useSyncExternalStore` store (no attempt-metric
  mirroring), API gateway (15s LRU-100, dedupe, GET-only retries, envelope guard), per-scope
  skeletons, motion tiering, Bengali-first copy.
- **F1 (Medium):** no React Query — hand-rolled `cachedGet` lacks background refetch semantics;
  acceptable now, adopt only when invalidation pain is proven.
- **F2 (Medium):** Quick/Mock/Custom/RealExam duplicate session machines (~4× answer/timer/submit
  logic). Extract a `useExamSession` hook when next touching timers.
- **F3 (Low):** `ecosystem` vs `examContext` dual concepts; `NextBestAction` dead; static
  `SAMPLE_QUESTIONS`/`STUDY_PLAN` fallbacks can mask API outages (log fallback usage).

## Data flow

Reads are parallelized (`findMany+count`), aggregates DB-side (`$queryRaw GROUP BY/DISTINCT ON`).
Write path (practice submit → `createMany` + per-Q `recordQuestionAttempt` + `recomputeAndAward` txn)
is sound. Gaps: Bangla-union adds 1–2 taxonomy queries per question fetch (cache 60s);
`getQuestionBankExams` 3-level include (fine at current cardinality); client `cachedGet` 15s can
serve stale counts post-submit (mutation invalidation is prefix-scoped — verify submit paths call it).

## Backend

- Auth: HS256 JWT (jose), HttpOnly Lax, 7d/30d, 5-session cap, `tokenVersion` revocation, BANNED
  rejection, dummy-hash login, per-IP+account throttles. Edge `proxy.ts` does signature-only check;
  deep checks per route. Sound.
- Validation: single-source `backend/validation.ts` (unknown-field rejection, bounded ints, ≤200 caps).
  Dual exam-submit validators diverge (strict vs lenient) — unify (D1).
- Idempotency: exam submit exemplary (`unique(userId,idempotencyKey)`, `resumed`, P2002/P2034
  recovery, `Serializable` txn). Legacy `submitCustomExam` non-idempotent — delete after proving
  unrouted (D2; grep shows zero imports outside `exam.ts`).
- Caching: Redis-or-memory fail-open; exam-tree 5m, questions 2m, leaderboard 30s **(setters exist but
  `getLeaderboard` never reads — wire it)**; dashboard-stats 15s likewise unused at read time.

## Performance (risks, all bounded)

- **P1 (Medium):** leaderboard fan-out — N `computeStreak` queries per fetch (limit 20). Fix: read
  the 30s cache + compute streaks only for visible slice.
- **P2 (Medium):** exam-submit mastery loop: ~2 writes/Q inside a `Serializable` txn (200 Q ≈ 400
  writes) → abort risk under load. Fix: batch upsert outside the critical section.
- **P3 (Low):** `q`-search `contains` with no trigram/FTS; `path startsWith/in OR` btree-unfriendly
  at scale. Add `pg_trgm` when question table 10×es.
- No classic N+1 found; aggregates are DB-side. Bundle: tabs split; AIWorkspace heaviest — verify
  with `next build` analyzer before optimizing blindly.

## Database

Indexing is exemplary on hot paths (`UserQuestionProgress` per-pattern indexes, attempt composites,
idempotency uniques). Notes:
- **DB1 (Low):** exam submissions write `MockTestResult(mockTestId=null)` mixing graded-exam and
  real-mock rows; only separable via `ExamAttempt.result`. Consider a `kind` discriminator.
- **DB2 (Low):** `User.sessions` JSON caps at 5 with transactional prune — fine; revisit if SSO/device
  lists grow.
- Missing: FTS index (P3); audit timestamps exist (`createdAt` broadly). No orphan risk found
  (cascades explicit; SetNull where history must survive).

## Security

- Ownership: bookmarks/vocab/flashcards/study-plan/AI-conversations/exam-history all caller-scoped. ✅
- **S1 (Critical — fix immediately):** `DELETE /api/notifications/[id]` → `deleteNotification(id)`
  with no `userId` — any session can delete any (incl. global broadcast) notification. Fix: route to
  existing `deleteUserNotification(userId, id)` (hides global as read, deletes own).
- **S2 (High):** `POST /api/ai/vocab` has no `enforceAiQuotas` — unbounded LLM spend per account.
  Fix: quota guard (`solver` bucket or new `vocab` bucket).
- **S3 (Low):** notification read-existence oracle (`findUnique` before ownership) — 404-vs-200 probe.
  Accept or scope the lookup.
- Rate limits: login per-IP+account, submits 30/min/user, AI 10/min + 60/day + $0.50/day ledger-backed.
  `exam/build` unthrottled (Low — read-only, add to submit bucket opportunistically).
- Prompt injection: user content travels as user-role turns, never concatenated into system prompts;
  web context carries an explicit UNTRUSTED trust-boundary banner. Correct posture.

## Analytics / observability

- `AIUsage` ledger (tokens, cost, latency, by task/provider/day) + `LearningEvent` stream + request-ID
  tracing + slow-query logs. Product analytics gap: no funnel events (activation, rec acceptance,
  drill completion, revision effectiveness) — add 6–8 named events before building the decision
  engine (see roadmap Phase 2).

## Maturity scorecard (technical strand)

- Frontend Architecture: strong — splitting, store hygiene, gateway; needs session-hook consolidation.
- Backend Architecture: strong — thin routes, validation, idempotency exemplar; needs validator unification.
- Data Architecture: strong — composites, DB-side aggregates; needs FTS at scale.
- Security: good posture, two holes (S1 now, S2 now).
- Reliability: strong — resume paths, retry/idempotency, fail-open caches.
- Performance: good — bounded risks P1–P3, no fires.
- Observability: AI-side strong, product-analytics weak.
- Scalability: fine to ~10× content; exam-submit txn is the first ceiling.
