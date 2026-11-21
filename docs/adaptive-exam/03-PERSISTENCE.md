# Adaptive Exam V2.0 — Phase 03 Persistence

**Status:** Phase 03 deliverable (schema + docs + schema contract test only — no service,
API, seed or UI code).
**Decision record:** ADR-075 in `docs/DECISIONS.md`. Canonical model reference:
`docs/DATABASE.md` § Adaptive Exam V2.0 models.

---

## 1. Scope actually delivered

- 12 new Prisma models, appended as a clearly delimited section at the end of
  `database/prisma/schema.prisma`.
- 2 back-relation fields on `User` (`adaptiveExamSessions`, `candidateSnapshots`) — no
  new column on `User`, only relation declarations.
- No existing model changed semantics. `Question`, `ExamAttempt`, `ExamPaper`,
  `ExamAttemptStatus` and the exam-config registry are untouched.
- No migrations (the repo pushes schema directly), no seed, no data backfill.
  **All twelve tables start empty** — this phase asserts no historical facts.
- `npx prisma validate --schema database/prisma/schema.prisma` passes.

## 2. Why this supersedes ADR-064 narrowly

ADR-064 chose a code-based config registry and reused the existing question-set hash
for immutability, explicitly deferring a DB-backed snapshot option. Adaptive V2 needs
that option for real: versioned post profiles, immutable blueprint/paper content,
answer-key entitlement, a verified historical corpus and an audit trail. ADR-075
therefore supersedes ADR-064's *"no new DB tables"* scope **only for the adaptive
pipeline**. The syllabus-driven pipeline remains code-based and table-free; no
existing row is rewritten.

## 3. Model → contract mapping

| Prisma model | Contract type(s) | Immutability key |
|--------------|------------------|------------------|
| `AdaptiveExamProfile` | `ExamProfile`, `ProfileRevision`, `ProfileSource` | `@@unique([profileId, version])`, `contentHash` |
| `HistoricalImportBatch` | `ImportReport` | batch id; `fileHash` for re-run dedupe |
| `HistoricalImportIssue` | `ImportIssue` | `preservedRef` → verbatim source |
| `HistoricalQuestion` | `HistoricalQuestionRecord`, `QuestionProvenance` | `contentHash`; original + normalized text |
| `HistoricalAnalyticsSnapshot` | `HistoricalAnalyticsReport`, `TopicFrequency` | `contentHash` + coverage |
| `AdaptiveBlueprint` | `ExamBlueprint`, `BlueprintDraft` | `contentHash`, `Restrict` FK to profile |
| `AdaptivePaperSnapshot` | `PaperSnapshot`, `CandidatePaperQuestion[]` | `contentHash`, `Restrict` FK to blueprint |
| `AdaptiveAnswerKey` | `SecureAnswerKey`, `SecureAnswerKeyEntry[]` | `paperId @unique`, hash equality with paper |
| `CandidatePerformanceSnapshot` | `CandidateSnapshot`, `TopicEvidence` | `@@unique([userId, profileId, contentHash])` |
| `AdaptiveExamSession` | `ExamSession` | `version` (optimistic), `@@unique([userId, idempotencyKey])` |
| `AdaptiveScoreReport` | `ScoreReport`, `PerformanceReport` | `attemptId @unique`, `contentHash` |
| `AdaptiveAuditEvent` | `AuditEvent`, `AdaptiveAuditEventName` | append-only; indexed by request/entity/name |

## 4. Safety properties made structural

1. **No answer column on a paper.** `AdaptivePaperSnapshot` stores only
   `CandidatePaperQuestion[]` JSON; the answer key is a separate table behind
   `AnswerKeyStore`. A `SELECT` on the paper cannot return a correct option.
2. **Claim ≠ verification.** `claimedAnswer` and `verifiedAnswer` are distinct
   columns; a source claim cannot silently become a verified answer, and
   `eligibleForPyq` is a separate, explicit flag.
3. **Originals preserved.** `originalSourceText` is verbatim; `normalizedText` is
   derived. Import exceptions point at `preservedRef` instead of discarding text.
4. **History cannot be rewritten.** Profile and blueprint are versioned/hashed;
   paper, blueprint and answer-key FKs use `onDelete: Restrict`. Scoring pins the
   paper and profile version used at start time.
5. **Timer and marks are server-owned.** `expiresAt` lives on the session;
   `scoring` is snapshotted into the profile and score report, never accepted from
   a client payload.
6. **Idempotency and concurrency.** `(userId, idempotencyKey)` is unique on both
   `ExamAttempt` (existing) and `AdaptiveExamSession` (new); `version` supports
   optimistic answer-save updates.
7. **Audit without leakage.** `AdaptiveAuditEvent.metadata` is redacted in app code
   by `sanitizeAdaptiveMetadata()` before writing; hashes and counts are logged,
   answers never are.

## 5. Deliberate choices and their cost

- **`String` status columns instead of Postgres enums.** The TypeScript unions in
  `contracts.ts` stay the single authority; adding an enum would duplicate and drift.
  Cost: the DB will not reject an invalid status — every writer must validate.
- **Soft `legacyAttemptId Int?` instead of an FK.** Keeps the canonical
  `ExamAttempt` writer untouched (no back-relation on that model). Cost: no DB-level
  referential guarantee; reconciliation is a service concern and a later phase must
  verify the link.
- **No CHECK constraints in schema.** Prisma cannot express them and this repo pushes
  schema directly; numeric/format invariants (4 options, A–D, sums, hash equality)
  are enforced by the validation service in a later phase. A test in this phase only
  guards the *shape* of the schema, not data validity.
- **JSON columns for contract-shaped objects.** Matches existing usage (`Question.options`,
  `ExamAttempt.summaryJson`) and avoids 30+ narrow columns for versioned DTOs. Cost:
  no relational queries inside those objects — analytics reads the dedicated
  `HistoricalQuestion` columns and materialized `coverage` JSON instead.

## 6. What is intentionally NOT in this phase

- No API routes or DTO changes (Prompt 07+).
- No profile registry implementation or seed of the six profiles (next phase).
- No historical parsing, verification, dedupe or import (ingestion phase).
- No blueprint/generation/scoring/session services (orchestration phases).
- No UI, PDF or entitlement enforcement (UI/export phases).
- No retention job for `AdaptiveAuditEvent` / `HistoricalImportIssue` — to be defined
  with ingestion, alongside the existing `scripts/prune-activity.ts` policy.

## 7. Verification

```bash
npx prisma validate --schema database/prisma/schema.prisma
npx vitest run tests/unit/backend/adaptive-schema.test.ts
npm run typecheck
npm run lint
```

`prisma db push` is **not** run as part of this phase: there is no local database
guaranteed here, and the production workflow (ADR-065) applies schema before code.
The schema contract test reads `schema.prisma` as text, so it needs no database.
