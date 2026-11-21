# Adaptive Exam V2.0 — Phase 05 Historical Ingestion

**Status:** Phase 05 deliverable (server-side ingestion, repository and descriptive analytics;
no API route or UI).
**Scope:** explicit source discovery, parsing of repository-local historical files, preview →
approval → import → rollback lifecycle, strict read repository, and honest analytics.
**Out of scope:** independent answer verification, PYQ eligibility, API routes, UI, generation,
blueprints, sessions, scoring, answer-key release.

---

## 1. Why this phase exists

Phase 02 established that the repository contains historical source files but no trustworthy
verified answer store. Phase 03/04 created the schema and profile registry. This phase builds
the missing corpus layer without claiming facts the sources do not contain.

The governing rule is unchanged: a source answer letter is a **claim**, not a verified answer.
Automated code can preserve, classify and deduplicate claims, but it cannot promote them.

---

## 2. Source catalogue

`backend/services/adaptive-exam/historical-sources.ts` is the only discovery surface.

| Source id | File | Review scope | Source-claimed year |
|-----------|------|--------------|---------------------|
| `uttoron:bcs-preliminary` | `database/data/question_bank/bcs/uttoron/bcs_preliminary_question_bank.json` | `DISCOVERY_ONLY` | 10th–50th (from metadata/exam labels) |
| `bb-so-general:2019` | `Senior Officer (General) 2019 [MCQ].txt` | `PENDING_VERIFICATION` | 2019 |
| `bb-so-general:2021` | `Senior Officer(General)_2021 (2).txt` | `PENDING_VERIFICATION` | 2021 |
| `bb-so-general:2022` | `Senior Officer (General) 2022 [MCQ].txt` | `PENDING_VERIFICATION` | 2022 |
| `bb-so-general:2023` | `Senior Officer (General) 2023.txt` | `PENDING_VERIFICATION` | 2023 |
| `bb-so-general:2023-ii` | `_Senior Officer (General)-II-2023.txt` | `PENDING_VERIFICATION` | 2023 (set II) |
| `bb-so-general:2025` | `SeniorOfficer(General)_2025.txt` | `PENDING_VERIFICATION` | **omitted**: filename claims 2025, header claims 15 May 2026 |

Safety properties:

- `discover(sourceRef)` accepts only an exact catalogue id. Paths, URLs and traversal strings
  return no sources.
- The filesystem reader resolves `filePath` inside a configured root and rejects `..` escape.
- The reader computes SHA-256 over the exact bytes; metadata row counts are never trusted.
- BCS Uttoron can be listed, but `createPreviewBatch()` refuses it while it is
  `DISCOVERY_ONLY`. This preserves the Phase 02 working assumption that BCS remains an
  unparsed source until the maintainer approves a verified treatment.
- Subject mappings are curated source-to-config translations, not official allocation claims.

---

## 3. Parsing rules

### 3.1 BCS Uttoron JSON

- Re-derives counts from the `questions` array; `metadata.total_questions` is only a claim.
- Maps `subject_id` through the curated BCS subject map; unknown values become `bcs.unclassified`.
- Derives `examYear` from the exam's `date` string only when that string parses.
- Preserves a non-empty `correct_answer` as `claimedAnswer`; blank letters stay `UNVERIFIED`.
- `solve_note` becomes an explanation with origin `historical`.
- Rows with missing question text or any missing A–D option are skipped with a preserved
  `recordRef`, never guessed.
- Images are not resolved or OCR'd in this phase; rows with image-only prompts keep their
  source reference and are reported as exceptions by the existing source notes.

### 3.2 Bangladesh Bank Senior Officer (General) text

- Handles single-line records (2019, 2025) and multi-line blocks (2021, 2022, 2023, II-2023)
  with Latin or Bengali question numbers and A–D / ক–ঘ option keys.
- Uses explicit `■ … Section` headers only when the source file contains them (2025); all other
  rows stay `bank.unclassified` rather than receiving keyword-inferred subjects.
- Maps `Ans.`, `উত্তর:` and `Answer:` letters to `claimedAnswer`.
- Preserves caveats such as `Note mismatch in source text`, `Key অনুযায়ী`, `marked as` and
  `সঠিক উত্তর নেই` as `DISPUTED` or `UNVERIFIED`; it never guesses a replacement option.
- Keeps the full original block in `originalSourceText` and a derived NFC/whitespace form in
  `normalizedText`.

### 3.3 Universal non-fabrication rules

| Absent fact | What the parser stores |
|-------------|------------------------|
| Difficulty | `classification.status = "unclassified"`, no `difficulty` |
| Verified answer | `verifiedAnswer = undefined`, `eligibleForPyq = false` |
| Question type | not stored; analytics emits an explicit gap |
| Subject | explicit `*.unclassified` subject, never a heuristic guess |
| Year (conflicting claim) | `examYear` omitted (2025 Bank file) |

---

## 4. Ingestion lifecycle

```
discover(sourceRef) → source ids
createPreviewBatch(sourceId, ctx) → batchId
preview(batchId) → ImportReport
approve(batchId, ctx) → APPROVED (authenticated)
importBatch(batchId, ctx) → IMPORTED (authenticated)
rollback(batchId, ctx) → ROLLED_BACK (authenticated)
```

- A `PREVIEW` batch writes staging rows attached to that batch. They are visible in
  `HistoricalImportBatch`/`HistoricalQuestion` for audit but are filtered out of every
  repository read until the batch status is `IMPORTED` (ADR-076).
- `approve()` is the only explicit human gate available from code today. It records
  `HISTORICAL_IMPORT_APPROVED` with counts, not answers.
- `importBatch()` is idempotent for an already-imported batch and rejected from any other
  state except `APPROVED`.
- `rollback()` deletes that batch's rows and records `HISTORICAL_IMPORT_ROLLED_BACK`.
- Audit metadata uses batch ids, source ids and counts. Question text, claimed answers and
  explanations are never written to audit metadata.

---

## 5. Read repository gate

`HistoricalAnalyticsRepository.findAll()` is for analytics/audit and includes source-claimed
rows. `findEligible()`, `count()` and `getByIds()` additionally require:

1. `importBatch.status = IMPORTED` (Prisma adapter),
2. `eligibleForPyq = true`,
3. `verification ∈ {CROSS_CHECKED, HUMAN_VERIFIED}`, and
4. a non-null `verifiedAnswer`.

After this phase no parsed row satisfies (2)–(4), so adaptive paper selection still has an
empty verified pool. That is the honest state.

---

## 6. Analytics

`createHistoricalAnalyticsService()` produces a `HistoricalAnalyticsReport` with:

- observed `yearWise`, `subjectWise`, topic counts and distinct-year `recurrenceRate`;
- `recurrenceRate = distinctYears / comparableYears × 100`, documented as **observed
  frequency, not a future-appearance probability**;
- recency weighting with an explicit `decayParameter` (default `0.08`), a configuration choice
  rather than a historical fact;
- `coverage.insufficientEvidence` and `gaps` from disclosed governance thresholds
  (`minSampleSize = 30`, `minComparableYears = 2`, `minVerifiedShare = 0.8`);
- `questionTypeDistribution = {}` and `duplicates.near = 0` with explicit gaps because the
  corpus does not record those facts;
- content-hashed snapshots keyed by profile/filter; `invalidate(reason)` clears them.

No "predicted score", "most likely topic" or official-yield claim is computed.

---

## 7. Storage mapping notes

- `HistoricalQuestion.contentHash` stores the normalised-text + language fingerprint because
  ADR-075 has no dedicated fingerprint column. This is deliberate and documented; it supports
  `duplicateGroupId` and `findDuplicateGroup()` without inventing a schema change.
- `provenance` JSON keeps the source file, reference, batch id and fingerprint. Contract
  `QuestionProvenance` has no `sourceClaim` field, so long-form source claims remain in the
  catalogue and phase docs rather than being smuggled into a typed DTO.
- No `Question` or `ExamAttempt` row is read or written by this phase.

---

## 8. Files

| File | Purpose |
|------|---------|
| `backend/services/adaptive-exam/historical-sources.ts` | Explicit, frozen source catalogue and subject maps |
| `backend/services/adaptive-exam/historical-content.ts` | Pure parsing, normalisation and dedupe helpers |
| `backend/services/adaptive-exam/historical-source-reader.ts` | Path-safe filesystem reader + SHA-256 |
| `backend/services/adaptive-exam/historical-import-store.ts` | Batch/issue/question ports + in-memory and Prisma adapters |
| `backend/services/adaptive-exam/historical-ingestion.ts` | Pipeline, lifecycle, approval gate and audit |
| `backend/services/adaptive-exam/historical-repository.ts` | Strict eligibility gate + in-memory/Prisma repositories |
| `backend/services/adaptive-exam/historical-analytics.ts` | Descriptive analytics + snapshot store |
| `tests/unit/backend/adaptive-historical-ingestion.test.ts` | Catalogue, parser, lifecycle and reader tests |
| `tests/unit/backend/adaptive-historical-analytics.test.ts` | Repository gate and analytics tests |
| `docs/adaptive-exam/05-HISTORICAL-INGESTION.md` | This document |

---

## 9. Verification

```bash
npx vitest run tests/unit/backend/adaptive-historical-ingestion.test.ts \
  tests/unit/backend/adaptive-historical-analytics.test.ts
npm run typecheck
npm run typecheck:tests
npm run lint
npm run test
```

`npm run build` remains deferred until adaptive API routes and UI exist.
