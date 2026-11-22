# Adaptive Exam V2.0 — Phase 06 Candidate Performance

**Status:** Phase 06 deliverable (server-side candidate evidence snapshot; no API route or UI).
**Scope:** `CandidatePerformanceService` implementation with in-memory and Prisma evidence readers.
**Out of scope:** blueprint, selection, generation, validation, session, scoring, recommendation, API/UI.

## 1. What it does

`createCandidatePerformanceService({ reader, clock, ... })` implements the contract
`CandidatePerformanceService`:

- `snapshot(userId, profileId)` → `CandidateSnapshot` with per-topic `TopicEvidence`,
  overall accuracy/confidence, warnings and a reproducible `hash`.
- `indicators(userId, topicPaths)` → the matching `TopicEvidence[]`.

Evidence comes from `QuestionAttempt` only in this phase (exam results, flashcard
reviews and learning events are later enrichment sources). The Prisma reader
aggregates in the database by `(subjectName, topic)`; it never loads every row.

## 2. Honesty rules

- `confidence` is capped (≤ 95) and stays ≤ 30 when evidence is insufficient.
- `sufficientEvidence` is false below `minEvidenceAttempts` (default 5).
- Small samples can never be classified as `STRONG_TOPIC` or `WEAK_CONCEPT`; they
  return `INSUFFICIENT_EVIDENCE`.
- `repeatedMistakes` counts only questions answered wrong more than once; it is
  never inflated from a single wrong answer.
- `avgTimeSec` is omitted (not zero) when no attempt recorded a duration.
- Unanswered attempts are counted separately and surfaced as a warning.

## 3. Files

| File | Purpose |
|------|---------|
| `backend/services/adaptive-exam/candidate-performance.ts` | Service + in-memory + Prisma evidence readers |
| `tests/unit/backend/adaptive-candidate-performance.test.ts` | 6 unit tests |
| `docs/adaptive-exam/06-CANDIDATE-PERFORMANCE.md` | This document |
