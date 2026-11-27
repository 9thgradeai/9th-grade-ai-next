# Adaptive Exam — Full Implementation Plan

**Status:** Phases 0–6 implemented; Phase 7 unit/API/frontend coverage added. Environment-dependent exit checks still tracked separately below.
**Based on:** `docs/audits/ADAPTIVE_EXAM_MASTER_AUDIT_REPORT.md`, `docs/audits/adaptive-exam-master-audit-summary.json`, and codebase research across backend, frontend, AI, DB, and test infrastructure.
**Date:** 2026-11-27
**Implementation status (2026-11-28):** catalog/profiles, live-bank bridge and verification, AI generation/verification/dedupe/job, durable session/scoring/reporting, full API seam, standalone dashboard tab, publication/library and crash-safe submission are implemented. `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` pass locally. `npm run db:push` succeeded against the configured Neon database, including the additive `AdaptiveGenerationJob.telemetry` column. The `adaptive-exam` row was added to the 20-tab Playwright baseline after its touch target was fixed; the shared `HeaderActions` `color-contrast` finding is baselined, not fixed globally. The real-provider 5×200 BCS / 5×100 SO / 3×100 AD exit runs and production/live Vercel verification remain environment-dependent and are not claimed as complete by this document.

---

## 1. Product definition (target state)

Adaptive Exam must become a complete, trustworthy mock-examination platform for Bangladeshi government/bank recruitment preparation:

1. A candidate selects **Exam Family → Organization → Post → Examination Type → Profile version**.
2. The system uses a **versioned, authoritative profile** for syllabus, subjects, marks, duration, language, marking, and source policy.
3. The system retrieves **verified historical questions** from a central repository and analyzes real frequency/recurrence evidence.
4. The system builds an evidence-based **blueprint**, generates new questions with an **AI generation port**, validates them with **independent checks**, and applies a **global duplicate gate**.
5. The candidate takes the paper through a **persisted, idempotent, server-authoritative exam session**.
6. Scores, reports, and answer keys are **immutable**, with answer keys released only after authorized conditions.
7. Candidate performance changes subsequent blueprints in a **measured, explainable** way.
8. Published and upcoming mocks live in a **shared library** with strict separation between public papers and private attempts.
9. The feature is a standalone **Adaptive Exam** dashboard tab, not a hidden panel inside Real Exam.

---

## 2. Guiding principles

- **Profile is law.** The AI never invents syllabus, marks, duration, marking rules, or exam identity.
- **Never fabricate authority.** `Question.correctAnswer` and AI `correctOption` are claims until verified.
- **Fail loud.** Missing paper/key/profile/verification must produce an error, never a zero score or guessed `"A"`.
- **Immutable after publish.** Paper content, profile version, score report, and answer key are write-once with audit trail.
- **Evidence, not prediction.** Historical frequency is observation with coverage; never "guaranteed" questions.
- **Global dedupe.** Duplicate checking spans all users, all published/finalized papers, and internal private papers for checking only.
- **Thin routes, fat services.** API routes validate/auth/delegate only; no business logic in `app/api`.
- **Reuse existing seams.** Do not invent parallel sessions, scoring, AI providers, or persistence.
- **Server-only boundaries.** `server-only` in backend; client talks only through `frontend/lib/services/api.ts`.

---

## 3. Target architecture

```text
[Adaptive Exam Tab]
  profile picker → config wizard → blueprint preview → generation job → exam runner → report → library
        │
        ▼
[API routes: prepare, generate, session, answers, flags, submit, report, library, admin]
        │  auth + same-origin + strict DTO + rate limit + idempotency
        ▼
[Orchestrator]
  profile registry → candidate performance → historical analytics → blueprint
  → question selection → AI generation → independent validation → duplicate gate
  → paper/key persistence → session → scoring → recommendation
        │
        ▼
[Prisma adapters]
  AdaptiveExamProfile / Catalog / Blueprint / Paper / AnswerKey / Session / ScoreReport
  HistoricalQuestion / HistoricalImportBatch / HistoricalAnalyticsSnapshot
  AdaptiveQuestionExposure / AdaptiveMockPublication / AdaptiveGenerationJob / AdaptiveAuditEvent
        │
        ▼
[AI infrastructure]
  provider registry + failover + circuit breaker + retry + token budget + usage ledger
  generation prompt (structured JSON) → independent verifier → deterministic checks
        │
        ▼
[Historical intelligence]
  live Question bank (51k) → preview batch → verification → IMPORTED HistoricalQuestion
  → frequency/recurrence analytics → blueprint evidence
```

---

## 4. Open decisions and recommended defaults

These need your explicit approval before implementation. Defaults are recommended so work can proceed.

| # | Decision | Recommended default | Why |
|---|---|---|---|
| D1 | Use supplied BCS/Bank marks tables as authoritative? | Treat as **project-supplied baseline**, seed as `reviewed`, keep `approved=false` until official evidence attached | Matches audit honesty contract |
| D2 | BCS Special / Bank AD / Officer ICT / Cash / Assistant Manager profiles | Seed with supplied distributions as **`provisionally configured`**, no official simulation until verified | Unblocks testing without claiming official truth |
| D3 | "Others" organizations (Petrobangla, BEPZA, BEZA, BIDA, NSI, etc.) | Add catalog tables + admin API; seed no unverified syllabus | Extensible without fabrication |
| D4 | Live `Question.correctAnswer` as verified answer? | **No.** Map to `claimedAnswer` only; require verification workflow | Prevents false PYQ authority |
| D5 | Difficulty from live bank? | Keep `unclassified`; hide difficulty control until sourced | Importer defaults everything to MEDIUM |
| D6 | AI answer authority | Independent verifier required before answer key is written | Valid JSON ≠ correct answer |
| D7 | Generation concurrency | Batch 5–10 questions/call through a durable generation job; no 200 synchronous calls | Serverless timeout/quota safety |
| D8 | UI first or backend first? | **Backend/integrity first, then standalone tab** | A tab over a broken pipeline would repeat the current problem |
| D9 | Global duplicate policy | Reject exact/near/template; allow concept overlap with per-paper caps | Matches your requirement |
| D10 | Publication of mocks | Published papers public; upcoming papers metadata-only until `availableFrom` | Prevents answer-key leakage |

---

## 5. Phase 0 — Governance, feature flag, and documentation skeleton

**Goal:** Safe, reversible rollout groundwork. No behavior change yet.

| Item | Files | Detail |
|---|---|---|
| Feature flag | `frontend/lib/flags.ts` or existing flag module; `docs/DECISIONS.md` | Add `adaptiveExamV2` with default off in production, on in dev/test |
| Env | `.env.local.example`, `docs/AI-SYSTEM.md` | Document `AI_ADAPTIVE_MODEL`, generation budget, queue driver, no new secrets required |
| Docs | `docs/API.md`, `docs/DATABASE.md`, `docs/AI-SYSTEM.md`, `docs/DECISIONS.md`, `docs/DASHBOARD.md` | Reserve sections for new endpoints/models/AI flow/tab |
| Audit baseline | `docs/audits/adaptive-exam-master-audit-summary.json` | Keep immutable audit record; remediation tracked separately |

**Exit criteria:** flag exists; docs placeholders reviewed; no runtime change.

---

## 6. Phase 1 — Exam hierarchy and versioned profiles

**Goal:** Replace the 6-ID hardcoded union with an extensible, versioned catalog while preserving current IDs.

### 6.1 Schema additions (`database/prisma/schema.prisma` + `docs/DATABASE.md`)

Add small catalog tables:

- `AdaptiveExamOrganization`: `id`, `code`, `nameBn`, `nameEn`, `family`, `active`.
- `AdaptiveExamPost`: `id`, `organizationId`, `code`, `nameBn`, `nameEn`.
- `AdaptiveExamType`: `id`, `postId`, `code`, `nameBn`, `nameEn`, `profileId?` (nullable).
- Add to `AdaptiveExamProfile`: `organizationId?`, `postId?`, `typeId?`, `hierarchyPath` (materialized string), `sourceEvidence` JSON, `reviewedBy`, `approvedBy`, `approvedAt`.
- Keep `profileId` string but remove code-level dependency on a closed union in the registry; `contracts.ts` exported known IDs as constants, not as the only possible values.

Alternative if you prefer zero new tables: store hierarchy in `AdaptiveExamProfile` JSON fields. Recommended: normalized tables because filtering, admin management, and "Others" extensibility are explicit requirements.

### 6.2 Profile seeds (`backend/services/adaptive-exam/profile-seeds.ts`, `exam-config/*`)

- BCS: add `BCS_GENERAL` and `BCS_SPECIAL` identities. General uses supplied 200-mark table; Special stays `provisionally configured` until syllabus evidence is attached.
- Bank: add all supplied profiles:
  - `BB_ASSISTANT_DIRECTOR_GENERAL`
  - `BB_SENIOR_OFFICER_GENERAL`
  - `BB_OFFICER_GENERAL`
  - `BB_OFFICER_CASH`
  - `BB_ASSISTANT_MANAGER`
  - `BB_OFFICER_IT`
- Keep each profile's own subject distribution, scoring, language policy, taxonomy paths, and profile version.
- Enforce: `reviewed != approved`; official simulation remains disabled unless `verificationStatus=approved`, duration sourced, difficulty sourced, strict PYQ policy.
- Add admin/editorial service for creating a new profile version without mutating old versions (`addRevision` already exists in registry).

### 6.3 Frontend config wizard data

- `frontend/lib/types/index.ts`: DTOs for catalog tree and profile summary.
- `frontend/lib/services/api.ts`: `adaptiveCatalog()`, `adaptiveProfiles(filters)`.
- New tab UI uses these instead of hardcoded `"BCS"` / `"BCS_PRELIMINARY"`.

**Exit criteria:** all supplied profiles exist as versioned records; old profiles remain immutable; "Others" can be added through catalog/admin path; no profile has guessed official status.

---

## 7. Phase 2 — Central historical intelligence and question bank bridge

**Goal:** Make real PYQs available to Adaptive Exam with verified provenance.

### 7.1 Live bank bridge (new files under `backend/services/adaptive-exam/`)

- `live-question-binding.ts`: map ecosystem → family, numeric subject → config subject ID, taxonomy paths → config prefixes.
- `live-question-bridge.ts`: paginated Prisma reader + pure row mapper.
  - `claimedAnswer` from resolved option text; `verifiedAnswer` never set.
  - `verification = SOURCE_CLAIMED | UNVERIFIED`.
  - `eligibleForPyq = false`.
  - skip multi-answer/statement questions with import issues.
  - preserve `rawMath`; no display normalization.
- `live-question-import.ts`: PREVIEW batch through existing `HistoricalImportStore`.
- `answer-verification.ts`: `AnswerVerificationPort`; only human/cross-source decisions set `verifiedAnswer` and `CROSS_CHECKED/HUMAN_VERIFIED`.
- `question-identity.ts`: shared normalization, exact/near fingerprint helpers (reuse `scripts/qb-audit/duplicate-detect.ts`, `scripts/qb-forensics/import-gate.ts`, `hash.ts`).

### 7.2 Fix retrieval semantics

- `question-selection.ts`: replace exact `topicPaths.includes(record.topicPath)` with prefix matching via `pathMatchesPrefixes()` from `backend/services/exam-inventory.ts`; align `explainShortage()`.
- `historical-repository.ts`: implement currently-ignored `sourceType` filter; keep strict gate (`IMPORTED`, `eligibleForPyq`, verified status, A–D answer).
- `historical-sources.ts`: replace config-ID topic paths with taxonomy paths.
- `orchestrator-factory.ts`: use `createPrismaHistoricalRepository(prisma)` in production; keep in-memory factory for tests only.

### 7.3 Analytics

- Extend `historical-analytics.ts` with:
  - topic/subtopic appearance count, distinct paper count, distinct year count,
  - recent recurrence (last N years) and long-term recurrence,
  - question-type distribution where available,
  - explicit `coverage` object: corpus size, years, profiles, missing areas,
  - warnings when coverage is insufficient.
- Blueprint uses analytics as **soft evidence**; official marks remain hard constraints.
- No predictive language in UI.

### 7.4 Enablement

- Set `historicalDataEligible=true` only after verified coverage meets a documented threshold (e.g., ≥80% topics have ≥1 verified item and ≥70% verified answer share for the profile).
- Keep `minVerifiedShare=1` for PYQ slots.

**Exit criteria:** DB inventory report shows non-zero verified PYQs by family/profile/subject/year; selection returns them; analytics outputs coverage and recurrence; no source-claimed row is treated as verified.

---

## 8. Phase 3 — AI generation, independent validation, and global duplicate gate

**Goal:** Generate diverse, exam-standard questions safely.

### 8.1 AI adapter

New: `backend/services/adaptive-exam/ai-generation-adapter.ts` implementing `AiGenerationPort`.

Reuse:
- `backend/ai/providers/*` (Groq/Anthropic/mock), `resolveCandidatesForModelTask("question_generation")`, `withRetry()`, circuit breaker, `reportProviderOutcome()`.
- `backend/ai/validation/outputs.ts` style parsing + Zod strict schema.
- `backend/ai/explain-engine/solver/independent-solver.ts` bounded repair pattern.
- `backend/ai/current-affairs.ts` grounding/citation pattern for `evidence[]`.
- `backend/ai/infrastructure/token-budget.ts`, `ai-cache.ts`, `dedup.ts`, `metrics.ts`, `tracing.ts`.

Adapter behavior:
- One request generates **batch** of N questions (5–10) with strict JSON schema: exactly 4 options, exactly one `correctOption`, topic/subtopic, difficulty, language, provenance.
- Prompt includes: profile identity/version, subject, topic paths, subtopic, language, difficulty, instructions, evidence snippets, forbidden repeated fingerprints, and output schema.
- Populate `provider`, `model`, `promptVersion`, `usage`, and `provenance.generation`.
- Mock provider gains an adaptive-generation JSON shape labelled `source: "mock"`.

### 8.2 Independent answer verification

New: `backend/services/adaptive-exam/answer-verification-engine.ts`.

Pipeline per generated question:
1. Structural validation (`question-validation.ts`).
2. Independent solver model answers **without seeing the generator's key**.
3. Second model or deterministic rule checks agreement.
4. Math: independent recomputation/step check; reject if no defensible single answer.
5. Factual/current-affairs: require dated evidence; strip unsupported citations.
6. Bangla/English: grammar/Unicode checks where deterministic.
7. Only then write `SecureAnswerKeyEntry`.

Remove:
- `correctOption: "A"` fallback in `orchestrator.ts`.
- `verifiedAnswer ?? "A"` fallback in `question-generation.ts`.

### 8.3 Global duplicate gate

New schema:
- `AdaptiveQuestionExposure`: `fingerprint`, `exactHash`, `nearHash`, `templateHash`, `profileId`, `subjectId`, `topicPath`, `paperId?`, `source`, `visibility`, `firstSeenAt`.
- `AdaptiveMockPublication`: `paperId`, `status` (`DRAFT|UPCOMING|PUBLISHED|ARCHIVED`), `scheduledAt`, `availableFrom`, `availableTo`, `visibility`, `contentHash`, `immutable=true`, `createdBy`.

New service: `backend/services/adaptive-exam/global-duplicate-service.ts`.

Levels:
- L1 exact normalized text + option-aware hash → reject.
- L2 near duplicate (token/Jaccard/MinHash) → reject or review.
- L3 template duplicate (number/entity-normalized structure) → reject.
- L4 concept overlap → allow with per-topic/per-paper cap.
- L5 deliberate PYQ revision → allow only in explicit revision mode.

Scope: historical PYQs, imported banks, generated questions from all users, published/archived/upcoming finalized papers, current paper. Internal checks can read private finalized papers via service port without exposing them.

Generation gate: paper cannot be published unless exact/near/template checks pass; if replacements fail, job reports `PARTIAL`/`FAILED`, never silently lowers threshold.

### 8.4 Generation job

New: `AdaptiveGenerationJob` model + `backend/services/adaptive-exam/generation-job.ts`.

- Enqueue via existing `QueueDriver` seam; register a worker; durable state in DB for serverless recovery.
- Stages: `prepare`, `select`, `generate`, `verify`, `dedupe`, `assemble`, `persist`.
- Progress API for UI; retry/backoff; idempotency key; provider quota/budget checks; partial batch recovery.

**Exit criteria:** 5 BCS papers ×200 and 5 SO papers ×100 generated through real provider adapter, each with answer key verified by independent path, distinct fingerprints, and no exact/near/template duplicates.

---

## 9. Phase 4 — Persistence, session lifecycle, scoring, answer-key release

**Goal:** Make a generated paper takeable and immutable.

### 9.1 Prisma adapters (new files)

- `prisma-session-store.ts` implementing `ExamSessionStore` with `putPaperSnapshot`.
- `prisma-paper-store.ts` for `AdaptivePaperSnapshot`.
- `prisma-answer-key-store.ts` for `AdaptiveAnswerKey`; `releaseForReview(attemptId)` resolves attempt → paper → key.
- `prisma-score-report-store.ts` for `AdaptiveScoreReport`.
- `prisma-audit-service.ts` for `AdaptiveAuditEvent`.

### 9.2 Session semantics (`exam-session.ts`)

- `create()` idempotent on `(userId, idempotencyKey)`; never overwrite an existing session.
- `recordAnswer()`/`setFlag()`: check ownership, `IN_PROGRESS`, `expiresAt`, and `version` precondition; stale writes → conflict.
- `expire()` sets `EXPIRED`, not `COMPLETED`.
- `submit()` enforces expiry; terminal transition `IN_PROGRESS → SUBMITTING → COMPLETED`.
- Add `getPaperSnapshot` write path and `resume` support.

### 9.3 Scoring (`exam-scoring.ts`)

- Validate `key.paperId === paper.id`, hash match, key covers all positions, unique positions, valid `OptionKey`.
- Missing/corrupt key throws `ADAPTIVE_ANSWER_KEY_*`; no silent wrong/zero.
- Derive elapsed time server-side from `startsAt`/`submittedAt`; client `durationSec` is advisory only.
- Align accuracy definition with legacy (`correct / attempted`) or document difference explicitly.
- Validate/round negative marking consistently per profile.

### 9.4 Orchestrator

- Resolve paper/key/profile **before** marking session terminal.
- Compute score once; persist `ScoreReport` in same transaction as session finalization.
- `report()` must check `session.userId === ctx.userId` and read persisted report, never re-score live state.
- Remove zero-score fallback.
- Wire `answerKeyEntitlement` + audit events.

### 9.5 API routes (`app/api/adaptive-exam/`)

Add:

- `POST /generate-paper`
- `GET /generation-job/[jobId]`
- `GET /catalog`, `GET /profiles`
- `GET /session/[attemptId]`
- `POST /session/[attemptId]/answers`
- `POST /session/[attemptId]/flags`
- `POST /session/[attemptId]/submit`
- `GET /session/[attemptId]/submission-status`
- `GET /session/[attemptId]/report`
- `GET /answer-key/[attemptId]` (replace 404 seam)
- `GET /library`, `GET /library/[paperId]`
- Admin: preview/verify/import batch, publish/schedule/archive paper

All routes: auth, same-origin, rate limit, strict DTO validation, no body `userId`, unified headers, `NextResponse.json()`, thin delegation.

**Exit criteria:** server-authoritative exam can start, autosave, expire, submit idempotently, score independently, release answer key only post-submit, and resume after timeout.

---

## 10. Phase 5 — Standalone Adaptive Exam tab and exam UX

**Goal:** Remove the feature from Real Exam and give it a real section.

### 10.1 Registration

- `frontend/lib/data/index.ts`: add `TabId = ... | "adaptive-exam"`, append `TABS` entry, add to `NAV_GROUPS` under Assess.
- `frontend/lib/exam-ui.ts`: add icon to `TAB_ICONS`.
- `frontend/components/dashboard/DashboardTabClient.tsx`: add lazy `TAB_COMPONENTS` entry.
- No new `app/dashboard/adaptive-exam/page.tsx`; existing `[tab]` route handles it.
- `frontend/lib/services/api.ts` + `frontend/lib/types/index.ts`: typed wrappers/DTOs.

### 10.2 New component

New: `frontend/components/dashboard/AdaptiveExamTab.tsx`.

Screens/states:
1. **Select exam**: family → organization → post → type → profile version.
2. **Configure**: subjects, chapters, topics, subtopics, question count, duration, difficulty, language, source mix, candidate-adaptation toggle.
3. **Blueprint preview**: subject/topic allocation, marks, warnings, historical coverage, duplicate exclusions, sufficiency notice.
4. **Generation progress**: job stages/progress, cancel/retry, provider/model metadata (no secrets).
5. **Exam runner**: timer from server `expiresAt`, navigation, mark-for-review, autosave, unanswered confirmation, auto-submit.
6. **Report**: score, subject/topic/difficulty/source slices, limitations, weak areas, revision priorities.
7. **Answer key review**: post-submit only, entitlement enforced.
8. **Library/Upcoming**: published mocks, scheduled mocks metadata-only, archived mocks.

Remove from `RealExamTab.tsx`:
- state lines ~101–104, handler ~279–310, panel ~758–787.
- Optional: replace with a CTA “Open Adaptive Exam” that routes to `/dashboard/adaptive-exam`. Do not duplicate logic.

### 10.3 Client submission stack

Extend `frontend/lib/services/exam-submission.ts` or create `adaptive-exam-submission.ts` with:
- UUID attempt token, versioned snapshot in `exam-persist.ts` (`ADAPTIVE_EXAM_KEY`).
- per-attempt in-flight rendezvous.
- pending submit persistence before network call.
- timeout/network reconciliation via submission-status.
- crash recovery on mount.
- clear only after authoritative result.

### 10.4 Adaptive intelligence UX

- Show why the next blueprint changed: weak subjects/topics, evidence count, confidence, limitations.
- Distinguish insufficient data from weakness.
- Show revision vs new-question mode; PYQ revision deliberately allowed only when chosen.
- Measure improvement on previously unseen questions.

**Exit criteria:** no adaptive UI in Real Exam; standalone tab passes nav/i18n/e2e baselines; full flow works with real provider and persisted session.

---

## 11. Phase 6 — Shared library, publication, and privacy

- Implement `AdaptiveMockPublication` lifecycle:
  - `UPCOMING` → metadata visible, paper/answer key hidden.
  - `PUBLISHED` at `availableFrom`; `ARCHIVED` immutable.
  - corrections create new version + audit trail; never mutate original.
- Shared library filters: family, organization, post, type, subject, topic, year, difficulty, publication status, generation date.
- All-user exposure tracking via `AdaptiveQuestionExposure`.
- Private data separation:
  - public: paper metadata/content after release;
  - private: answers, scores, weaknesses, attempts, unpublished papers;
  - internal-only: duplicate-check access to finalized private papers, no content exposure.
- Add admin/editorial controls only after authz review.

---

## 12. Phase 7 — Testing strategy

### 12.1 Unit

Extend/add under `tests/unit/backend/`:
- `adaptive-question-bank-bridge.test.ts`: mapping, `claimedAnswer` only, path prefix, 4-option enforcement, rawMath preservation.
- `adaptive-answer-verification.test.ts`: independent agreement, math recomputation, evidence gating, fail-loud.
- `adaptive-global-duplicate.test.ts`: exact/near/template/concept/revision modes, cross-user scope.
- `adaptive-generation-adapter.test.ts`: schema validation, retries/failover, mock labelled, usage/promptVersion.
- `adaptive-historical-analytics.test.ts`: year/paper/topic counts, coverage warnings.
- `adaptive-exam-session.test.ts`: idempotent create, version conflicts, expiry, flag locks.
- `adaptive-exam-scoring-integrity.test.ts`: corrupt key, hash mismatch, duplicate positions, server-derived time.
- `adaptive-recommendation.test.ts`: insufficient evidence, weak/strong candidate simulations.

### 12.2 API/integration

`tests/api/adaptive-exam.*.test.ts`:
- auth, same-origin, strict validation, no body userId.
- prepare → generate → start → answers → submit → report → answer key.
- idempotent submit, concurrent submit (50 requests) → one score report.
- reconciliation after simulated timeout.
- library/upcoming privacy and publication gating.

### 12.3 Frontend

- `tests/AdaptiveExamTab.test.tsx`: config, loading, error, empty, summary, exam runner, report states; bilingual copy.
- Extend `tests/dashboard-ai-tabs.test.ts` or tab-registry test with `adaptive-exam`.
- `tests/e2e/dashboard-audit-helpers.ts`: add slug, update 19→20 tabs.
- Harvest/merge baseline per `docs/TESTING.md`; zero overflow.

### 12.4 Real provider generation tests

Staged, as you required:
1. BCS 1 ×200, SO 1 ×100, AD 1 ×100.
2. Evaluate completeness, answer agreement, duplicates, syllabus compliance.
3. Only then run 5 BCS + 5 SO + 3 AD.
4. Subject/topic/difficulty/source-mix/cross-user/upcoming tests.
5. Record provider/model/duration/usage; never fabricate results.

### 12.5 Gates

`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, targeted Playwright audit. No bypass.

---

## 13. File-by-file change map (high level)

### New backend files

- `ai-generation-adapter.ts`
- `answer-verification-engine.ts`
- `global-duplicate-service.ts`
- `generation-job.ts`
- `live-question-binding.ts`
- `live-question-bridge.ts`
- `live-question-import.ts`
- `answer-verification.ts`
- `question-identity.ts`
- `prisma-session-store.ts`
- `prisma-paper-store.ts`
- `prisma-answer-key-store.ts`
- `prisma-score-report-store.ts`
- `prisma-audit-service.ts`
- `adaptive-catalog-service.ts`
- `adaptive-library-service.ts`

All under `backend/services/adaptive-exam/` with `import "server-only"`.

### Modified backend files

- `contracts.ts` (catalog IDs as constants, job types, publication types, exposure types)
- `orchestrator.ts` (real wiring, fail-loud, persistence, report ownership)
- `orchestrator-factory.ts` (Prisma-backed ports)
- `exam-session.ts` (lifecycle fixes)
- `exam-scoring.ts` (integrity checks)
- `question-selection.ts` (prefix matching, sourceType, difficulty policy)
- `question-generation.ts` (batch adapter, record-first handling, no `"A"` fallback)
- `question-validation.ts` (semantic validation hooks)
- `historical-repository.ts` (sourceType filter)
- `historical-sources.ts` (taxonomy paths)
- `historical-analytics.ts` (frequency/recurrence/coverage)
- `profile-registry.ts`, `profile-seeds.ts` (catalog/version/approval)
- `answer-key-entitlement.ts`, `answer-key-store.ts` (wire to Prisma)
- `errors.ts` (new codes if needed)

### Schema/docs

- `database/prisma/schema.prisma` (new models/fields)
- `docs/DATABASE.md`, `docs/API.md`, `docs/AI-SYSTEM.md`, `docs/DECISIONS.md`, `docs/DASHBOARD.md`, `docs/TESTING.md`

### Frontend

- `frontend/lib/data/index.ts`, `frontend/lib/exam-ui.ts`, `frontend/components/dashboard/DashboardTabClient.tsx`
- `frontend/lib/services/api.ts`, `frontend/lib/types/index.ts`, `frontend/lib/exam-persist.ts`
- `frontend/components/dashboard/AdaptiveExamTab.tsx` (new)
- `frontend/components/dashboard/RealExamTab.tsx` (remove adaptive panel)
- optional `frontend/lib/navigation.ts`, `AgentBlocks.tsx`

---

## 14. Dependencies and sequencing

```text
Phase 0 ──► Phase 1 (hierarchy/profiles)
                │
                ▼
          Phase 2 (historical bridge + analytics)
                │
                ▼
          Phase 3 (AI generation + verification + duplicate gate)
                │
                ▼
          Phase 4 (persistence + delivery + routes)
                │
                ▼
          Phase 5 (standalone tab + exam UX)
                │
                ▼
          Phase 6 (shared library + upcoming)
                │
                ▼
          Phase 7 (tests, real generation, rollout)
```

Critical path: **Phase 1 → 2 → 3 → 4**. Phase 5 UI can start once Phase 4 APIs are stable, but must not ship before real generation works.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Wrong official syllabus/marks | Use supplied baselines as project config, mark provisional, require evidence for `approved` |
| False PYQ claims | Verification port is sole writer of `verifiedAnswer`; strict repository gate |
| AI answers wrong | Independent solver/verifier, math recomputation, evidence gating, fail-loud |
| Repetitive papers | Global duplicate store + generation gate + per-topic caps |
| Serverless timeouts | Batch generation, durable job model, queue worker, progress API |
| Answer key leakage | Separate table/port, post-submit entitlement, no key in paper DTO, audit |
| Cross-user privacy | Explicit visibility fields, internal-only duplicate access, ownership checks everywhere |
| Mobile/UI regressions | Reuse dashboard tokens, update e2e baseline, zero overflow |
| Test suite drift | Add tests with every phase; run full gates before merge |
| Scope explosion | Feature flag; phase PRs; no new dependencies unless justified in `DECISIONS.md` |

---

## 16. Definition of done / acceptance criteria

1. **Hierarchy:** family → organization → post → type → profile version selectable; "Others" extensible; no hardcoded 6-ID limit at runtime.
2. **Profiles:** all supplied BCS/Bank distributions represented with independent versions, scoring, language, and evidence status.
3. **Historical:** non-zero verified PYQ corpus; counts by profile/subject/year; strict provenance; prefix-based topic matching.
4. **Generation:** 5 BCS ×200, 5 SO ×100, 3 AD ×100 generated through a real provider; complete counts; distinct papers; answer keys independently verified.
5. **Duplicates:** exact/near/template rejected globally, including other users' finalized papers; concept overlap allowed within caps; revision mode explicit.
6. **Delivery:** start, autosave, resume, mark-for-review, timer, expiry, manual/auto submit, idempotency, immutable score all pass independently verified tests.
7. **Adaptive:** synthetic Candidate A–E simulations show justified blueprint changes with sufficient-evidence guards.
8. **Library:** published/upcoming/archived mocks visible per policy; answer keys and private candidate data hidden.
9. **UI:** standalone Adaptive Exam tab; no adaptive panel in Real Exam; i18n/a11y/e2e baselines pass.
10. **Docs/tests:** all new endpoints/models/AI behavior documented; typecheck/lint/test/build green; audit summary updated only after verification.

---

## 17. Estimated complexity

| Phase | Complexity | Main effort |
|---|---|---|
| 0 | Small | flag + docs |
| 1 | Medium | schema + seeds + admin config |
| 2 | Large | bridge, verification, analytics, repository fixes |
| 3 | Large | AI adapter, verification engine, duplicate gate, job system |
| 4 | Large | Prisma adapters + lifecycle + routes |
| 5 | Medium/Large | new tab + exam runner + client recovery |
| 6 | Medium | publication/library/privacy |
| 7 | Large | staged real generation + full test/docs |

---

## 18. What I need from you before starting

Please approve or adjust:

1. **D1–D10** decisions in section 4.
2. Whether to prioritize **backend integrity first** (recommended) or ship the standalone tab first as a visible placeholder.
3. Whether to seed the supplied Bank profiles as **`provisionally configured`** now or wait for official evidence.
4. Whether the global duplicate gate should **reject** near/template duplicates outright (recommended) or route them to review.
5. Whether to add the proposed catalog/publication/exposure/job tables now, or phase them minimally.

Once approved, I will start with Phase 0 + Phase 1 as isolated commits, run gates after each, and keep the audit report immutable as evidence of the starting state.
