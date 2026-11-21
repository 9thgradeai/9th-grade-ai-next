# Adaptive Exam V2.0 — Phase 02 Domain Architecture

**Status:** Phase 02 deliverable (domain architecture only — no runtime behaviour changed).
**Scope:** typed domain contracts, error taxonomy, module boundaries, dependency graph,
integration map and test strategy for the existing Real Exam experience.
**Out of scope for this phase:** database migrations/models, API routes, UI, LLM prompts,
seed data, and any historical claims not already verifiable in this repository.

---

## 1. Verified starting point

These facts were confirmed directly during Prompt 01 (forensic audit); they are the
constraints this architecture must respect, not assumptions.

| Seam | Verified fact |
|------|---------------|
| `backend/services/exam-config/types.ts`, `registry.ts` | `ExamEcosystemCode` covers only `BCS` / `BANGLADESH_BANK`. Registered configs are `BCS_PRELIMINARY` v1 and `BANK_PRELIMINARY` v1. |
| `backend/services/exam-config/bank.ts` | Bank allocation is already `20/20/20/10/20/10` (English, General Knowledge, Mathematics, Reasoning, General Science, Bangladesh & Current Affairs). |
| `backend/services/exam-config/bcs.ts` | BCS scoring is `+1 / −0.5 / 0`; Bank scoring is `+1 / −0.25 / 0`. |
| `backend/services/exam-submission.ts` | Canonical `submitExamAttempt` is idempotent on `idempotencyKey`, derives penalty from question ecosystem (`BANGLADESH_BANK` → 0.25, otherwise 0.5), and never consumes a profile `ScoringPolicy`. |
| `backend/services/exam-paper.ts` | `buildConfiguredPaper` + `getPaperReadiness` already provide allocation and capacity DTOs. |
| `app/api/real-exam/*`, `app/api/exam-papers/[paperId]` | Paper/export routes exist; answer-key access via `includeAnswers` / paper detail has no entitlement check today. |
| `frontend/components/dashboard/RealExamTab.tsx` | Client-local/offline exam flow; no server-side attempt registry. |
| `frontend/components/dashboard/CustomExamTab.tsx`, `MockTestTab.tsx` | Already use the server-authoritative attempt + submit seam; reuse their patterns. |
| `frontend/components/dashboard/AIMockTestTab.tsx` | LLM generation with local scoring and effectively no persistence — do not copy as the authoritative path. |
| `backend/errors.ts`, `backend/infrastructure/observability/logger.ts` | Canonical `AppError` → `toHttpResponse()` mapping and Pino structured logging (redacts secret-like keys). |
| `database/prisma/schema.prisma` | `ExamAttempt` has `idempotencyKey`, `questionSetHash`, `status`, `examDurationSec`, `summaryJson`; no config/profile/paper snapshot or per-answer FK. `Question` has one `correctAnswer`, no verified-answer, provenance, duplicate-group or import-batch fields. |
| Historical sources | 10th–50th BCS Uttoron data (`5,350` rows), Bank Senior Officer General 2019–2025 files, QA artifacts (`14,331` source questions, `2,577` duplicate groups, `DB Records: 0`). Live DB counts are **not** provable from the repository alone. |

**Consequence:** the platform can reuse the exam-config registry, paper builder, submission
core, auth, logging and error mapping, but it has **no** trustworthy historical/verified
answer store yet. Any design that assumes one would fabricate data. This is why the
historical domain below separates *source claims* from *verified answers* and why an
explicit data-sufficiency gate exists before a "real exam" paper is produced.

---

## 2. Bounded contexts and aggregates

```
CONFIGURATION          HISTORICAL DATA          CANDIDATE PERFORMANCE
ExamProfile (v)        HistoricalQuestion       CandidateSnapshot (hash)
ProfileRevision        ImportBatch / Report     TopicEvidence
                       AnalyticsReport (hash)
          \                   |                        /
           \                  |                       /
            +--------- BlueprintDraft ---------------+
                             |
                     ExamBlueprint (immutable, hashed)
                             |
                     PaperSnapshot (candidate-safe)
                             |
                  SecureAnswerKey (separate store)
                             |
              ExamSession -> ScoreReport (immutable)
                             |
                    PerformanceReport
```

Aggregate roots and invariants:

| Aggregate | Root invariant |
|-----------|----------------|
| `ExamProfile` | Versioned, never mutated in place. `verificationStatus !== "approved"` ⇒ `officialSimulationEnabled()` is false. Subject counts must sum to `totalQuestions`; difficulty distribution must sum to 100; scoring comes from the profile, not from the question ecosystem. |
| `HistoricalQuestionRecord` | `claimedAnswer` (source assertion) is always distinct from `verifiedAnswer` (independent check). Both are preserved. `originalSourceText` is retained verbatim; `normalizedText` is derived. `verification` drives eligibility — never the other way around. |
| `ExamBlueprint` | Hash covers profile id/version, scoring, allocations, adaptation weights and snapshot hash. `status` moves `draft → committed → superseded`; a committed blueprint is never edited. |
| `PaperSnapshot` | Contains **no** answer field anywhere in its type graph. `contentHash` binds the exact ordered question set produced from a committed blueprint. |
| `SecureAnswerKey` | Keyed by `paperId` + `contentHash`. Scoring access is internal; `releaseForReview()` requires an authorized context and a completed attempt. |
| `ExamSession` | Server-owned `expiresAt`, monotonic `version` for optimistic concurrency, and a bounded status machine. Client cannot set duration, marks or question ids. |
| `ScoreReport` | `immutable: true` in the type. Derived only from a committed paper, its secure key, the profile's `ScoringPolicy` and the submitted positions. |

Cross-context rule: no module may reach into another context's persistence. All access
goes through the ports defined in `contracts.ts`.

---

## 3. Module responsibilities

All interfaces below are declared in `backend/services/adaptive-exam/contracts.ts`.

| # | Module (interface) | Input → Output | Responsibility |
|---|--------------------|----------------|----------------|
| 1 | `AdaptiveExamOrchestrator` | `PrepareAdaptiveExamCommand`, `StartAdaptiveExamCommand`, `SubmitAdaptiveExamCommand` → `PreparedExam`, `PaperSnapshot`, `ExamSession`, `ScoreReport`, `PerformanceReport` | Orders the pipeline, enforces idempotency and ownership at each boundary, opens transactions, delegates all logic. The only module route handlers call. |
| 2 | `ExamProfileRegistry` | `profileId`(+version) → `ExamProfile` | Six profile ids, version snapshots, validation, approval gate, revision history. Existing registry is the seed source; snapshots become DB-backed in a later phase. |
| 3 | `HistoricalQuestionRepository` | filter → records/counts | Eligible historical records by profile scope, year, subject, topic, verification status and duplicate exclusion. |
| 4 | `HistoricalDataIngestionService` | source ref → `ImportReport` | Twelve stages: discover → extract → normalize → parse → classify → extract answer → verify → dedupe → preview → approve → import → audit. Preserves originals and exceptions; supports rollback. |
| 5 | `HistoricalAnalyticsService` | `HistoricalAnalyticsFilter` → `HistoricalAnalyticsReport` | Year/subject/topic frequencies, recurrence and recency weighting, quality/duplicate counts, explicit coverage and `insufficientEvidence`. Frequencies are observations, never predictions. |
| 6 | `CandidatePerformanceService` | `userId` + `profileId` → `CandidateSnapshot` | Windowed evidence from existing attempts/mistakes/learning events; confidence and sufficiency flags; hashed snapshot for reproducibility. |
| 7 | `AdaptiveBlueprintService` | command + profile + snapshot + analytics → `BlueprintDraft`/`ExamBlueprint` | Converts profile × mode × evidence into per-subject/topic counts, difficulty/source/language splits, explicit shortage warnings; commits immutable hash. |
| 8 | `QuestionSelectionService` | `SelectionSpec` → `SelectedQuestion[]` | Deterministic, seeded selection from eligible historical records; duplicate exclusion; transparent `explainShortage()` instead of silent substitution. |
| 9 | `SubjectSpecialistService` | subject/language/difficulty/profile → instructions | Per-subject generation guidance and supported-subject list. Instructions only — never an answer authority. |
| 10 | `QuestionGenerationService` | `SelectedQuestion[]` → `CandidatePaperQuestion[]` | Fills shortfalls through `AiGenerationPort`; bounded `maxRepairAttempts()`; provenance with provider/model/promptVersion. |
| 11 | `QuestionValidationService` | question/paper + blueprint → `ValidationReport` | Structural validation (4 options, single answer, non-empty text, topic/language/difficulty conformance, no duplication); `repair()` is bounded and never bypasses validation. |
| 12 | `ExamSessionService` | start/get/answer/flag/expire/submit → `ExamSession` | Server-authoritative timer, optimistic concurrency, ownership checks, terminal-state enforcement. |
| 13 | `ExamScoringService` | paper + key + profile + answers → `ScoreReport` | Uses the profile's `ScoringPolicy`; all marks derived server-side; deterministic and immutable. |
| 14 | `AdaptiveRecommendationService` | `ScoreReport` + snapshot + paper → `PerformanceReport` | Indicators, revision priorities, time efficiency, historical-vs-generated comparison, explicit limitations; writes back only through existing mastery/LearningEvent services. |
| 15 | `ExamAuditService` | `AuditEvent` → stored/queried events | Append-only decision trail with request/correlation ids and redacted metadata. |

Supporting ports: `AdaptiveExamClock`, `AdaptiveExamLogger`, `AdaptiveExamCache`,
`AdaptiveExamDb`, `AiGenerationPort`, `AnswerKeyStore`, `LegacyExamPorts`. Every port is
injected via `AdaptiveExecutionContext`, so no module imports Prisma, Next.js or an AI
SDK directly.

---

## 4. Dependency graph

```
                    app/api/*  (thin routes: auth → validate → orchestrator → respond)
                              |
                              v
                  AdaptiveExamOrchestrator  (7, 12, 13, 14)
                    |        |         |          |
        +-----------+        |         |          +-----------+
        v                    v         v                      v
ExamProfileRegistry   AdaptiveBlueprintService        ExamSessionService
   (2)                    (7)                              (12)
        |                    |         |
        |          +---------+---------+----------+
        |          v                    v         v
        |   CandidatePerformance   HistoricalAnalytics  QuestionSelection
        |        (6)                  (5)               (8)
        |          |                    |                 |
        |          v                    v                 v
        |     [existing attempt/   HistoricalQuestion   HistoricalQuestion
        |      mistake services]      Repository (3)      Repository (3)
        |
        v
   QuestionGeneration (10) ──> SubjectSpecialist (9) ──> AiGenerationPort
        |
        v
   QuestionValidation (11) ──> PaperSnapshot + SecureAnswerKey (AnswerKeyStore)
                                      |
                                      v
                              ExamScoring (13) ──> AdaptiveRecommendation (14)
                                                          |
                                                          v
                                              [existing mastery / LearningEvent]
                                                          |
                                                     ExamAudit (15)

Leaf dependencies (no inbound domain dependency):
  contracts.ts (pure types, no runtime imports)  ←  errors.ts (AppError + status map)
  HistoricalDataIngestion (4) feeds repository/analytics through approved batches only.
```

Rules enforced by this graph:

- **No cycles.** `contracts.ts` imports only type names from `exam-config/types.ts`.
  `errors.ts` imports `AppError` and the code union — nothing imports `errors.ts` back
  into `contracts.ts`.
- **One way across the answer boundary.** Candidate types flow toward the client;
  `SecureAnswerKey` flows only toward `ExamScoringService` and authorized review.
- **No direct legacy writes.** `LegacyExamPorts` is the only bridge to the existing
  attempt registry, and it is called by the orchestrator/session service, not by UI.
- **Client type boundary.** Browser code may import only the candidate-safe subset of
  `contracts.ts` (`CandidatePaperQuestion`, `PaperSnapshot`, commands, DTO enums) and must
  do so with `import type`. Server-only types (`SecureAnswerKey`, ports, orchestrator)
  are never imported by a client component; Prompt 04 adds an automated boundary check.

---

## 5. Execution flows

### 5.1 Prepare (pre-paper adaptation — current assumption)

1. Thin route authenticates, validates the command and calls `orchestrator.prepare()`.
2. `ExamProfileRegistry.resolve(id, version)` → reject unknown or unapproved profiles.
3. Server validates every override against `profile.allowedOverrides`; unsupported
   overrides are rejected, never silently ignored.
4. `CandidatePerformanceService.snapshot()` and `HistoricalAnalyticsService.analyze()`
   run in parallel. Both carry hashes/coverage in their output.
5. `DataSufficiency` is evaluated: insufficient verified history or thin candidate
   evidence ⇒ mode downgrades to a documented balanced/historical pattern with warnings,
   or fails with `ADAPTIVE_INSUFFICIENT_DATA`. It never invents a pattern.
6. `AdaptiveBlueprintService.build()` → `validate()` → `commit()` persists an immutable
   hashed `ExamBlueprint`. `PreparedExam` returns blueprint + estimates + warnings only.

### 5.2 Generate paper

7. `QuestionSelectionService.select()` chooses eligible, de-duplicated historical
   records against the committed blueprint.
8. Shortfalls are reported by `explainShortage()`; `QuestionGenerationService` fills only
   the declared shortfall, using `SubjectSpecialistService` instructions.
9. `QuestionValidationService.validatePaper()` must be `PASS` / `PASS_WITH_WARNING`.
   `REPAIR_REQUIRED` permits at most `maxRepairAttempts()` repairs; `REJECTED` ends in
   `PAPER_REJECTED` audit + `ADAPTIVE_PAPER_INVALID`. No unbounded regeneration.
10. `PaperSnapshot` (candidate-safe) and `SecureAnswerKey` (separate store) are written
    in one transaction, both bound by `contentHash`.

### 5.3 Start and submit

11. `ExamSessionService.create()` checks `paperId`/`blueprintId` ownership, resolves
    `expiresAt` from the blueprint, and returns a candidate-safe session view.
12. Answers are saved per position with optimistic concurrency (`version`); late writes
    after `expiresAt` are rejected with `ADAPTIVE_SESSION_EXPIRED`.
13. `submit()` is idempotent on `idempotencyKey`; the server maps positions → question ids
    from the immutable paper, reads the secure key, scores with the profile's
    `ScoringPolicy`, and finalizes the legacy attempt through `LegacyExamPorts`.
14. `AdaptiveRecommendationService.buildReport()` produces the post-submit report, then
    `applyToCandidateProfile()` writes back through existing services only. Answer key
    release to the UI requires both a completed attempt and an authorized context.

**Mid-exam per-question adaptation is deliberately absent.** It would let the server
change difficulty after observing an answer, which contaminates comparable scoring and
requires the client to trust a moving paper. Adding it later is a separate design decision.

---

## 6. Error-handling strategy

- All adaptive failures throw `AdaptiveExamError` (`backend/services/adaptive-exam/errors.ts`),
  a subclass of the canonical `AppError`. Existing `toHttpResponse()` needs no changes.
- `ADAPTIVE_ERROR_HTTP_STATUS: Record<AdaptiveExamErrorCode, number>` is the single
  status mapping; the `Record` type makes an unmapped new code a compile error.
- 4xx codes are operational (safe message exposed); 5xx codes are non-operational
  (`toHttpResponse` logs the cause server-side and returns a generic client message).
- Each error carries `adaptiveCode`, `stage`, `requestId`, optional `correlationId` and
  sanitized `metadata`. `sanitizeAdaptiveMetadata()` recursively redacts answer-bearing
  keys (`answer`, `correctOption`, `explanation`, `claimedAnswer`, `verifiedAnswer`,
  `selected`) with a bounded depth, so an error can never become an answer-leak channel.
- `clientFacingMessage()` is short, stable and free of timing, marks or answer detail.
- Ownership violations are `ADAPTIVE_OWNERSHIP_DENIED` (403); unknown ids are 404;
  lifecycle conflicts are 409; timer expiry is 410; insufficient evidence is 422.

---

## 7. Logging and audit strategy

- Runtime logs go through the existing Pino `log` (`backend/infrastructure/observability/logger.ts`)
  wrapped by the injected `AdaptiveExamLogger`. Reuse its `child()` for request-scoped
  bindings; do not create a second logger.
- Every domain event listed in `AdaptiveAuditEventName` is appended through
  `ExamAuditService.record()` with `requestId`, `correlationId`, `actorId`, `entityType`,
  `entityId` and redacted metadata.
- **Never log:** correct options, explanations, answer maps, candidate answers, raw
  question text in error paths, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_URL`,
  cookies or tokens. Log positions/counts/hashes instead.
- Hash-bearing events (`BLUEPRINT_COMMITTED`, `PAPER_SNAPSHOT_CREATED`, `SCORE_COMPUTED`,
  `CANDIDATE_SNAPSHOT_CREATED`) make later disputes reproducible without re-reading
  mutable tables.
- Ingestion approvals/rollbacks are audited with batch id, counts and exceptions only —
  original source text stays in the historical record, not in the log.

---

## 8. Integration map with existing Real Exam services

| Existing asset | Integration decision |
|----------------|----------------------|
| `exam-config` registry + `allocateScope` | Seed source for the six `ExamProfile` snapshots. Keep code registry pure; DB snapshots are added later so historical attempts keep the version that produced them. |
| `exam-paper.buildConfiguredPaper` / paper readiness | Reuse for capacity and allocation diagnostics; adaptive selection/validation is a new layer above it, not a rewrite. |
| `exam-submission.submitExamAttempt` | Reuse as the canonical, idempotent attempt writer. The adaptive scorer computes marks from the profile policy and passes server-derived answers; the legacy submit path remains the single writer of attempt state. **Gap to close later:** it currently infers penalty from question ecosystem, so the profile policy must be threaded through explicitly rather than duplicated. |
| Auth (`getUserIdFromRequest`) and `with-handler` | Reuse unchanged; every adaptive route calls the auth helper and returns 401 before any domain call. |
| `backend/errors.toHttpResponse` | Reuse unchanged via `AdaptiveExamError`. |
| Pino logger / query cache | Reuse through injected ports; no new infrastructure. |
| `RealExamTab` | Extend in place with a mode selector and candidate-safe paper view. Do **not** add a new top-level tab (see `docs/DO_NOT_BUILD.md` items 4, 11, 12). |
| `CustomExamTab` / `MockTestTab` | Copy the *pattern* (start → answer → submit → result via API), not their local scoring. |
| PDF export pipeline | Reuse `backend/services/pdf/exportPipeline.ts`; add entitlement checks before any answer key is included. No new export format. |
| Mastery / LearningEvent services | Only write-back path for recommendations. |
| Existing question bank | Historical records are imported as a separate, verified corpus first; do not silently overwrite `Question.correctAnswer`. |

---

## 9. Honesty and data-quality rules (encoded, not aspirational)

1. Never fabricate a historical question, source, year, paper set, answer, explanation,
   year-over-year pattern or "most repeated topic" statistic.
2. `claimedAnswer` and `verifiedAnswer` are separate fields; a source claim alone never
   satisfies `pyqPolicy.minVerifiedShare`.
3. `HistoricalAnalyticsReport.coverage` exposes sample size, years covered, verified
   share, gaps and `insufficientEvidence`. A result with thin evidence is labelled, not
   smoothed over.
4. `recurrenceRate` is documented as observed frequency / comparable years — explicitly
   **not** a future-appearance probability. Do not build a "predicted score" from it
   (`docs/DO_NOT_BUILD.md` item 2).
5. Generated questions carry provider/model/promptVersion provenance and are distinguishable
   from PYQ in every report (`historicalVsGenerated`).
6. Shortages surface through `explainShortage()` and blueprint `warnings`; a smaller paper
   is preferable to an invented one.
7. DB schema changes and seed/import data belong to later prompts and must update
   `docs/DATABASE.md` in the same change.

---

## 10. Working assumptions and open approval gates

The user approved continuing to Phase 02 but has **not** answered the six approval-gate
questions from the Prompt 01 audit. Phase 02 proceeds with these *working assumptions*,
which are design defaults rather than decisions:

| Gate | Working assumption | Decision needed before |
|------|--------------------|------------------------|
| Navigation | Adaptive mode lives inside the existing `RealExamTab`; no new tab. | Prompt 04 (UI) |
| Profile registry authority | Code registry is the seed; DB-backed versioned snapshots become authoritative. | Prompt 03 (persistence) |
| Historical scope | Only BB Senior Officer General 2019–2025 is initially eligible for verified treatment; BCS 10th–50th remains an unparsed source until verified. | Prompt 05 (ingestion) |
| Answer verification standard | `CROSS_CHECKED` or `HUMAN_VERIFIED` only; source claims alone are insufficient for PYQ use. | Prompt 05 (ingestion) |
| Adaptation timing | Pre-paper blueprint adaptation only; no mid-exam per-question adaptation. | Prompt 06 (orchestration) |
| PDF answer-key entitlement | Answer key released only post-submit to the candidate, or to an admin; never via the question paper alone. | Prompt 07 (PDF/export) |

**Before Prompt 03 the maintainer must confirm or override these assumptions**, because
the persistence schema and API shape depend directly on them.

---

## 11. Phase 02 file inventory and verification

| File | Purpose |
|------|---------|
| `backend/services/adaptive-exam/contracts.ts` | Pure typed domain model, commands, ports, 15 module interfaces, error-code union. No `server-only`, no Prisma, no runtime imports. |
| `backend/services/adaptive-exam/errors.ts` | `AdaptiveExamError`, complete status mapping, metadata redaction, candidate-facing messages. |
| `tests/unit/backend/adaptive-contracts.test.ts` | Error mapping/redaction tests plus compile-time no-leak assertions enforced by `npm run typecheck:tests`. |
| `docs/adaptive-exam/02-DOMAIN-ARCHITECTURE.md` | This document. |

Verification commands for this phase:

```bash
npx vitest run tests/unit/backend/adaptive-contracts.test.ts
npm run typecheck
npm run typecheck:tests
npm run lint
```

No production build is expected to be meaningful until routes/UI exist; a full
`npm run build` is deferred to the phase that adds them, and the result will be reported
honestly at that time.
