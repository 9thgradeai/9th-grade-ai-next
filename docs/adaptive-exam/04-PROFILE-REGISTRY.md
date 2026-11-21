# Adaptive Exam V2.0 — Phase 04 Profile Registry

**Status:** Phase 04 deliverable (module 2 of the domain architecture).
**Implements:** `ExamProfileRegistry` in `backend/services/adaptive-exam/contracts.ts`.
**Persistence:** ADR-075 (`AdaptiveExamProfile` table); port + Prisma adapter included.
**No API route, UI or seed-script wiring ships in this phase.**

---

## 1. Files delivered

| File | Role |
|------|------|
| `backend/services/adaptive-exam/profile-seeds.ts` | Code-registry → `ExamProfile` seeds; explicit unavailable declarations |
| `backend/services/adaptive-exam/profile-registry.ts` | Validation, resolution, approval gate, revisions, `ensureSeeded()`, in-memory store |
| `backend/services/adaptive-exam/profile-snapshot-store.ts` | Prisma adapter for the `ProfileSnapshotStore` port |
| `backend/services/adaptive-exam/hash.ts` | Deterministic canonical JSON + SHA-256 snapshot hashing |
| `tests/unit/backend/adaptive-profile-registry.test.ts` | 22 focused tests |
| `docs/adaptive-exam/04-PROFILE-REGISTRY.md` | This document |

`contracts.ts`, `errors.ts`, the Phase 03 schema, `docs/DECISIONS.md` and
`docs/DATABASE.md` were not changed by this phase.

## 2. Authority model

The reviewed **code registry seeds** profiles; the **DB snapshot becomes
authoritative** once a version is committed. A blueprint pins one profile
version + hash, so a later profile edit cannot rewrite a historical paper or
result. `list()` merges both sources, with committed DB snapshots winning on
`(profileId, version)`.

`ensureSeeded()` is idempotent: it inserts only missing versions, verifies the
hash of any already-committed snapshot, and refuses to overwrite drift. Seed
timestamps are fixed (`2026-11-22T00:00:00.000Z`) so hashes are stable across
deploys and instances.

## 3. What is seeded — and what is explicitly not

| Profile id | Seeded? | Source | Gaps disclosed |
|------------|---------|--------|----------------|
| `BCS_PRELIMINARY` | Yes, v1 | `BCS_PRELIMINARY_CONFIG` (OFFICIAL, reviewed) | No verified difficulty distribution; no asserted effective date |
| `BB_SENIOR_OFFICER_GENERAL` | Yes, v1 | `BANK_PRELIMINARY_CONFIG` (CURATED, reviewed) | No verified difficulty distribution; **no sourced duration**; post-level mapping is a Phase 02 working assumption |
| `BB_ASSISTANT_DIRECTOR_GENERAL` | **No** | — | No reviewed post-level config; `resolve()` → `null` with reason |
| `BANK_OFFICER_GENERAL` | **No** | — | No reviewed post-level config; `resolve()` → `null` with reason |
| `BANK_OFFICER_CASH` | **No** | — | No reviewed post-level config; `resolve()` → `null` with reason |
| `BANK_OFFICER_IT` | **No** | — | No reviewed post-level config; `resolve()` → `null` with reason |

Unavailable profiles are **never** filled with another post's paper shape,
guessed marks, guessed years or guessed answers. `unavailabilityReason(id)`
returns the disclosure so an API/UI can explain the absence.

### Seed fidelity

- Subject counts come from the configs' official marks; both configs use
  1 mark per question, so counts equal marks:
  - BCS `30/30/25/25/10/15/15/20/15/15` = **200 questions / 200 marks / 120 min**.
  - Bank `20/20/20/10/20/10` = **100 questions / 100 marks**.
- Scoring is copied verbatim: BCS `+1 / −0.5 / 0`, Bank `+1 / −0.25 / 0`.
- Topic trees are flattened without double-counting: a grouping node whose
  children carry its full mark total keeps `paths`/`subtopicPaths` but no
  `count`; a node with official marks but unmarked children (BCS PART-I, 15)
  keeps its `count`. Inferred topics carry no count, exactly as in the config.
- `verificationStatus` mirrors the source `reviewStatus` = **`reviewed`**, not
  `approved`. No seed claims verification it does not have.

### Explicit unsourced sentinels

- `difficultyDistribution = { EASY: 0, MEDIUM: 0, HARD: 0 }` means *no verified
  distribution exists*, not "100% unknown band". Validation emits a warning
  (`DIFFICULTY_UNSOURCED`); official simulation refuses it.
- `durationMin = 0` (Bank) means *no sourced duration*, not a zero-length exam.
  Validation emits `DURATION_UNSOURCED`; official simulation refuses it.
- `historicalDataEligible = false` until a verified historical corpus is
  imported and approved — no historical question is seeded by this phase.
- `allowedOverrides = []` — no user override is authorised on a `reviewed`
  profile.

## 4. Validation and approval gate

`validateProfile()` is pure and returns `ValidationIssue[]` (the existing
exam-config issue type). **Errors block use; warnings disclose gaps.** Checks:
profile id, version, family ↔ id, ecosystem code, required labels, subject and
topic ids/counts/languages, subject-count total, scoring policy,
`totalQuestions × marksPerQuestion = totalMarks`, duration, difficulty sentinel
vs 100% split, strict PYQ policy, minimum verified share, override keys, source,
verification status, revision history and notes.

`officialSimulationEnabled(profile)` returns `true` only when **all** hold:

1. `verificationStatus === "approved"`;
2. `durationMin > 0` (a real sourced duration);
3. difficulty distribution is sourced and sums to 100;
4. PYQ policy accepts only verified answers (`minVerifiedShare === 1`, both
   permissive booleans false);
5. the full validation passes.

Both seeds are therefore blocked on four independent grounds — exactly the
intended default. An approved profile with all gaps supplied is covered by a
test.

## 5. Revisions and conflict safety

`addRevision(previous, next)` requires:

- the same `profileId`;
- `next.version === previous.version + 1` (no skips);
- no committed row at that version and no newer committed version;
- a valid snapshot after normalising the revision head.

A caller should pass a real actor in `revisionHistory`; when omitted, the
registry appends an explicit `{ changedBy: "registry" }` system marker — never
a claimed human approver. Revisions are inserted, never updated. Content hashes
are recomputed from canonical JSON (key-order independent), so a committed
snapshot is reproducible and tamper-evident.

Version conflicts throw `AdaptiveExamError` with code
`ADAPTIVE_PROFILE_INVALID`, stage `configuration`, and a requestId. Metadata is
passed through `sanitizeAdaptiveMetadata()` before it can be logged.

## 6. Store port

`ProfileSnapshotStore` (`find`, `latest`, `list`, `insert`) keeps the registry
free of Prisma. `createPrismaProfileSnapshotStore(client)` maps the ADR-075
`AdaptiveExamProfile` JSON columns back to typed contracts; `insert` relies on
the `@@unique([profileId, version])` constraint as the final conflict guard.
`createInMemoryProfileSnapshotStore()` is provided for unit tests and local
development, not for production.

## 7. Verification

```bash
npx vitest run tests/unit/backend/adaptive-*.test.ts
npm run typecheck
npm run typecheck:tests
npm run lint
npm run test
```

See the delivery message for the actual results of each command. `npm run
db:push` is still intentionally not run in this phase; no seed script is wired
to a database, so `ensureSeeded()` has no production caller yet.

## 8. Carry-forward / not in scope

- No API route exposes `resolve`/`list`; no UI reads profile availability.
- No blueprint, historical ingestion, candidate snapshot or scoring service
  consumes the registry yet.
- The four unavailable profiles remain unavailable until a maintainer supplies
  a reviewed post-level config — that is a source-data task, not a code task.
- The BB Senior Officer (General) ↔ Bank Preliminary mapping stays a stated
  working assumption until the maintainer confirms or overrides it.
