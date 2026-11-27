# Adaptive Exam — Master Audit Report

**Date:** 2026-11-27
**Branch:** `main` (HEAD `d1270c8`)
**Scope:** Audit only — no implementation changes made.
**Artifacts:** `docs/audits/adaptive-exam/`, `docs/audits/adaptive-exam-master-audit-summary.json`

> Evidence rule: statements below are labelled **VERIFIED** (source/DB/test evidence),
> **SIMULATED** (isolated deterministic stub), or **BLOCKED** (no real provider/real data).
> No fabricated generation results, no real provider calls, no production mutations.

---

## A. Executive Summary

**Verdict: NOT READY. The Adaptive Exam is a partially wired blueprint generator, not a functioning mock-examination platform.**

Key conclusions:

1. **Cannot generate real exam papers end-to-end.** No `AiGenerationPort` implementation exists anywhere in the repository (`AiGenerationPort` appears only in `contracts.ts` and `question-generation.ts`). The API routes pass `ports: {} as any` (`app/api/adaptive-exam/prepare/route.ts:18`, `session/start/route.ts:18`). `generatePaper()` would dereference `ctx.ports.ai` and fail on any real request.
2. **Real historical corpus is empty.** `HistoricalQuestion` = 0 rows; `HistoricalImportBatch` = 0. All adaptive persistence tables are empty. Consequence: `historicalDataEligible: false` → `pyqCount = 0` → **100% of paper slots are ORIGINAL/AI** (`adaptive-blueprint.ts:222-224`).
3. **The feature is disconnected from the 51,272-question live `Question` table.** Adaptive code uses only `HistoricalQuestion`; no adapter exists between them. So a large, classified bank exists but Adaptive Exam cannot see it.
4. **The UI only calls `prepare`.** `RealExamTab.tsx:279-308` posts to `/api/adaptive-exam/prepare` and renders a question count + warnings. There is no `generatePaper`, `startSession`, `submit`, or `report` API route. Candidates never receive an adaptive paper.
5. **No global duplicate prevention exists.** Selection uses exact `topicPath` equality and an in-paper `usedIds` set (`question-selection.ts:36, 71-74`). There is no cross-paper, cross-user, near-duplicate, template-duplicate, or shared-library check. This directly explains your observation of repeated questions.
6. **Simulated 5-paper run produced 1,000 questions but only 54 distinct stems (94.6% exact repetition)** — see `docs/audits/adaptive-exam/generation-simulated.json`. This is **SIMULATED** with a deterministic stub, but it proves the pipeline has no mechanism that could prevent repetition.
7. **Tests pass (2,078/2,078), typecheck clean** — but no test covers adaptive API routes, real generation, duplicate detection, or cross-user isolation.
8. **Exam hierarchy and shared mock library are absent.** Only 2 of 6 profile IDs are seeded; BCS Special, AD, Officer General/ICT/Cash, Assistant Manager, and all "Others" organizations have no verified profile. `ExamSchedule` = 0 rows; no publication/archival/upcoming-paper workflow.

**Critical blockers:** no AI port implementation, empty historical corpus, no paper-delivery route, no duplicate gate, incomplete profiles.

---

## B. Examination Hierarchy Audit

| Required level | Actual implementation | Evidence | Status |
|---|---|---|---|
| Exam Family | `ExamFamily = "BCS" \| "BANK"` only | `contracts.ts` | PARTIALLY IMPLEMENTED |
| Organization / Recruitment Authority | Stored as free strings on `HistoricalQuestion` (`organization`, `recruitmentPost`); not a navigable hierarchy | `schema.prisma:1682-1683` | PLACEHOLDER |
| Examination / Post | `AdaptiveExamProfileId` union of 6 IDs; 4 explicitly unavailable | `contracts.ts:129-135`, `profile-seeds.ts:222-247` | PARTIALLY IMPLEMENTED |
| Examination Type (General/Special/ICT/Cash) | No BCS General vs Special distinction; no ICT/Cash profiles | `profile-seeds.ts` | MISSING |
| Subject | 10 BCS + 6 Bank subjects, correct IDs | `bcs.ts`, `bank.ts` | IMPLEMENTED AND VERIFIED |
| Chapter / Topic | Prefix-complete against taxonomy (54/54 BCS, 22/22 Bank paths; 355/355 + 142/142 leaves reachable) | `taxonomy.json`, `bb-taxonomy.json`, `bcs.ts`, `bank.ts` | IMPLEMENTED (config) / NOT WIRED (selection exact-match only) |
| Subtopic | `subtopicPaths` metadata emitted but never consumed; 10 BCS entries, 0 Bank | `profile-seeds.ts:74-90`, no downstream consumers | PLACEHOLDER |
| Question | Two separate stores: live `Question` (51,272 rows) and empty `HistoricalQuestion` (0) | DB counts | BROKEN / DISCONNECTED |

**Unresolved hierarchy ambiguity:** `O (General)`, `O (Cash)`, and `General/ICT` branches are not represented; `BANK_OFFICER_IT` is an unavailable ID, not a specialization under an Officer profile. `BCS Special` does not exist as a profile. No "Others" organization support (Petrobangla, BEPZA, BEZA, BIDA, NSI) — no profile, syllabus, taxonomy, or generation path. The architecture's `ExamFamily` union cannot express them without a type change.

---

## C. Syllabus and Profile Audit

| Profile | Status | Subjects / marks | Questions | Duration | Language | Marking | Official sim |
|---|---|---|---|---|---|---|---|
| `BCS_PRELIMINARY` | seeded, `reviewed` | 30/30/25/25/10/15/15/20/15/15 = 200 | 200 | 120 min | bn (English = en) | +1 / −0.5 / 0 | **disabled** |
| `BB_SENIOR_OFFICER_GENERAL` | seeded, `reviewed` | 20/20/20/20/10/10 = 100 | 100 | **0 (unsourced)** | bn (English = en) | +1 / −0.25 / 0 | **disabled** |
| `BB_ASSISTANT_DIRECTOR_GENERAL` | unavailable | — | — | — | — | — | — |
| `BANK_OFFICER_GENERAL` | unavailable | — | — | — | — | — | — |
| `BANK_OFFICER_CASH` | unavailable | — | — | — | — | — | — |
| `BANK_OFFICER_IT` | unavailable | — | — | — | — | — | — |

Evidence: `profile-seeds.ts:160-247`, `bcs.ts:282-313`, `bank.ts:124-141`, `adaptive-profile-registry.test.ts:61-103`.

Findings:
- BCS baseline matches supplied values exactly. **VERIFIED**.
- Bank SO General matches the supplied SO General column (20/20/20/20/10/10), but the config is `CURATED` and the post mapping is a documented "Phase 02 working assumption" (`profile-seeds.ts:194`). Not independently verified as official.
- Specified Bank baseline expects **English as the general language**; implementation derives language mechanically (`subjectId.includes("english") ? "en" : "bn"`) so all non-English subjects are Bangla. **CONFLICT** with your brief.
- Difficulty distribution is an all-zero sentinel for both profiles → every topic allocates 0 EASY, all questions forced to MEDIUM, and `question-selection.ts:103-112,119-128` hardcodes `"MEDIUM"`. Difficulty configuration is therefore cosmetic.
- `allowedOverrides: []` yet blueprint honours `command.languageOverride` (`adaptive-blueprint.ts:230-231`) — policy inconsistency.
- `officialSimulationEnabled()` is false for both seeds (approval + duration + difficulty gates), so full exam simulation is correctly blocked.

---

## D. Historical Question Bank Audit

Live DB counts (`scripts/query-historical.ts`, re-run 2026-11-27):

| Metric | Count |
|---|---:|
| `HistoricalQuestion` total | **0** |
| Imported batches | **0** |
| Verified PYQs | 0 |
| Unverified / source-claimed / AI-generated / human-authored | 0 |
| Questions with verified answers / explanations / taxonomy / year | 0 |
| Duplicate / near-duplicate records | 0 |
| `AdaptiveExamProfile`, `AdaptiveBlueprint`, `AdaptivePaperSnapshot`, `AdaptiveAnswerKey`, `AdaptiveExamSession`, `AdaptiveScoreReport` | all **0** |

Contrast (same DB): `Question` = **51,272**, `Subject` = 18, `Topic` = 650, `Exam` = 5, `ExamPaper` = 53, `MockTestResult` = 143.

**Conclusion:** the "central historical intelligence" requirement has **no data** behind it. Ingestion code exists (`historical-ingestion.ts`, `historical-content.ts`) but has never been run against this DB. The 51k live bank is not connected to adaptive retrieval. Historical frequency analytics run on an empty repository and return empty/zero results.

Additional mapping defect: `historical-sources.ts:50-84` assigns `topicPath` values like `"bcs.bangla"` (config IDs), while blueprint topics use taxonomy paths like `"bcs.bangla.literature.ancient-medieval"`; selection compares with exact equality (`question-selection.ts:71-74`). Even after ingestion, PYQ retrieval would match **zero** rows unless this namespace mismatch is fixed.

---

## E. Historical Pattern / Frequency Audit

`HistoricalAnalyticsService` computes frequencies, year coverage, exact duplicates (normalized text only), and carries explicit coverage warnings (`historical-analytics.ts:306,361`). With 0 input records, all outputs are empty. It is structural code, **IMPLEMENTED BUT NOT VERIFIED** with data.

- No near-duplicate classification (explicitly disclosed at `historical-analytics.ts:306`).
- No trend/recent-vs-long-term weighting, no question-type distribution, no difficulty estimation from history.
- No code connects analytics output to blueprint topic weighting except a candidate-based `adaptationWeight` (`adaptive-blueprint.ts:234-237`) that is applied only when candidate evidence is sufficient.
- No unsupported "will definitely appear" claims were found — good.

---

## F. Global Mock Repository Audit

| Requirement | Actual | Status |
|---|---|---|
| Shared published/archived paper repository | `AdaptivePaperSnapshot` table exists; 0 rows; no service writes it | PLACEHOLDER |
| Upcoming scheduled mocks | `ExamSchedule` table, 0 rows; no adaptive use | MISSING |
| Public discovery/filtering by family/post/subject/year/difficulty | No endpoint or UI | MISSING |
| Global question exposure across users | No implementation | MISSING |
| Cross-user duplicate detection | No implementation | MISSING |
| Access control separating shared papers from private attempts | `releaseForReview()` is the only answer-key authorization path (`answer-key-store.ts:18`) | PARTIALLY IMPLEMENTED |
| Immutability of published papers | `PaperSnapshot` is assembled in memory; no persistence write | PLACEHOLDER |

---

## G. AI Pipeline Audit

**Actual flow that exists:**

`prepare` → profile resolve → candidate snapshot → historical analytics (empty) → blueprint build/validate/commit → HTTP response containing only blueprint metadata.

`generatePaper` (orchestrator-internal, **no route**) → selection (empty repo → 0 PYQ) → `generateWithKeys` → structural validation → bounded repair → answer key → in-memory `PaperSnapshot`.

Findings:
- **No provider adapter exists.** `AiGenerationPort` has no implementation. No model selection, no prompt template beyond `subject-specialist.ts:27-37` (a 7-part instruction string), no JSON schema enforcement, no retry/rate-limit/quota handling, no background job.
- `question-generation.ts` calls `ctx.ports.ai.generate()` once per ORIGINAL slot — 200 sequential calls for a BCS paper. Synchronous, timeout-prone, quota-prone.
- Answer correctness is **never independently verified**. The AI's `correctOption` and `explanation` are written straight into the answer key (`question-generation.ts:113-116`).
- Validation is structural only (`question-validation.ts`): non-empty text/options, duplicate options, subject/topic presence, blueprint conformance. `repair()` only trims whitespace, max 2 attempts.
- No math recomputation, no Bangla/English grammar check, no banking-fact verification, no date-aware current-affairs check.
- No retrieval, context budgeting, or PYQ examples are passed to generation.
- **`GROQ_API_KEY` is present in `.env.local`, but nothing in adaptive code uses it.** Presence of a key is not a working pipeline.

---

## H. Multiple Examination Generation Results

No real provider generation was possible (no adapter, no route, no data). Per your instruction, expensive batches were not run.

### Staged execution attempted

| Batch | Requested | Status |
|---|---|---|
| BCS General ×1 | 200 Q | BLOCKED — no real AI port; blueprint prepare succeeded (via isolated harness) |
| Bank SO General ×1 | 100 Q | BLOCKED — profile seeded but no delivery route / AI port |
| Bank AD ×1 | 100 Q | BLOCKED — no profile |
| BCS Special ×3 | 300 Q | BLOCKED — no profile |
| Officer General / ICT / Cash, Assistant Manager | — | BLOCKED — no profiles |
| Subject-specific ×8 | — | BLOCKED — no selection/generation route; taxonomy exact-match defect |
| Topic/subtopic ×10 | — | BLOCKED — subtopic metadata unused |

### SIMULATED deterministic-stub run (isolated harness)

Command: `npx tsx --conditions=react-server docs/audits/adaptive-exam/audit-generation.ts`
Artifact: `docs/audits/adaptive-exam/generation-simulated.json`

| Paper | Profile | Questions | Unique within paper | Subjects | Sources | Validation | Answer-key entries |
|---:|---|---:|---:|---:|---|---|---:|
| 1–5 | BCS_PRELIMINARY | 200 each | 54 each | 10 | 100% ORIGINAL | PASS | 200 each |

- Total: **1,000 questions; 54 unique; 94.6% exact duplicate rate.**
- AI stub calls: 1,000 (one per slot).
- **Interpretation:** the stub is intentionally deterministic, so identical output is expected. What this proves is that the pipeline has **no cross-paper or intra-paper semantic/template duplicate gate** — it marks the paper `PASS` with 146 repeated stems per paper. It does **not** prove a real model repeats; your real-world observation is the evidence for that, and the missing gate explains why nothing stops it.

**Per-paper fields such as provider/model, generation duration, rejected questions, quality score, factual errors, source-mix compliance:** unavailable — no real generation occurred. Not estimated.

---

## I. Question Quality Report

| Criterion | Finding |
|---|---|
| Factual/answer accuracy | **NOT VERIFIED** — AI answer key trusted as-is; no independent check |
| Syllabus relevance | Structural topic conformance only; no semantic coverage check |
| Exam-standard relevance | No question-type or historical-style evidence used |
| Clarity / options / distractors | Only non-empty and duplicate-option checks |
| Explanation quality | AI/historical strings copied; not evaluated |
| Difficulty | Assigned metadata only; all MEDIUM due to zero distribution and hardcoded selection |
| Language | Instruction string only; no grammar/Unicode validation |
| Originality | No detection beyond exact normalized text in analytics (not applied to generated papers) |

Weighted 100-point quality scoring was **not performed** — there are no real generated questions to score. Reporting a score would be fabrication.

---

## J. Paper Differentiation Report

Mechanism-level findings (not model-output measurements):

- Blueprint hashes differ across papers (5 distinct IDs in simulated run).
- Selection seed = `hash(blueprint.hash + candidate.hash)` (`question-selection.ts:26`) — deterministic per blueprint/candidate, but **no global exclusion list** is populated (`duplicateExclusions: []` at `adaptive-blueprint.ts:378`).
- `excludeIds` comes only from the current candidate snapshot's attempted IDs, which is empty for new users.
- No exact/near/template/concept overlap computation between papers exists.
- All PYQ slots are 0, so no PYQ repetition control is exercised.

Result: **no guarantee of differentiation**. The simulated stub demonstrated 94.6% exact overlap passing validation as `PASS`.

---

## K. Adaptive Intelligence Report

Implemented pieces:
- `candidate-performance.ts` builds per-subject/topic accuracy, confidence, `sufficientEvidence` flags.
- `adaptive-blueprint.ts:234-237` applies an `adaptationWeight` to weak topics.
- `adaptive-recommendation.ts` builds reports and applies to profile.

Not implemented:
- No weak-topic blueprint is delivered as a paper (no generate/start route).
- No knowledge-gap vs careless-mistake vs calculation-error classification.
- No time-per-question signal in blueprint adaptation.
- No exposure-based mastery measurement (memorization vs mastery).
- No controlled candidate simulation was run because paper delivery is blocked.

Verdict: **PARTIALLY IMPLEMENTED / NOT VERIFIED** — not genuinely adaptive end-to-end.

---

## L. Exam Delivery and Scoring Report

- `exam-session.ts` store includes `getPaperSnapshot()` but the in-memory store never writes a snapshot (`paperSnapshots` map is never populated) — `resolvePaper` in `orchestrator.ts:86-89` returns `null`.
- `submit()` falls back to a zero-score report when paper/key are missing (working-tree change), which could mislead if wired incompletely.
- `report()` reconstructs a submit command from session answers and re-scores.
- `exam-scoring.ts` implements deterministic scoring; unit tests pass (`adaptive-session-scoring.test.ts`).
- No `submit` or `report` API route. No timer/autosave/resume/idempotency test at HTTP level.
- **Negative marking rules exist in profile config** (+1/−0.5 BCS, +1/−0.25 Bank) and are carried into scoring; not independently verified through a delivered exam.

Verdict: **PARTIALLY IMPLEMENTED / NOT VERIFIED**.

---

## M. Security and Scalability Report

- Auth is enforced on the two existing adaptive routes (`getUserIdFromRequest`, 401). Answer-key store separates scoring access from `releaseForReview` authorization.
- API routes cast `ports: {} as any` — a latent runtime crash and a type-safety hole.
- No background job system for generation; 200 sequential provider calls on one HTTP request would be fragile.
- `Question` table has useful indexes; `HistoricalQuestion` has appropriate indexes but no data.
- Global duplicate queries would scan an empty/small table today; no scaling design (no vector index, no fuzzy/template index).
- No cross-user private-paper exposure path exists because no shared/private paper store is implemented.
- Credentials were not printed in this report.

---

## N. Bugs and Risks

| ID | Severity | Finding | Evidence | Expected → Actual | Fix |
|---|---|---|---|---|---|
| P0-1 | Critical | No `AiGenerationPort` implementation; real generation impossible | grep across repo; API `ports: {} as any` | Generate paper → `ctx.ports.ai` undefined | Implement and wire a real adapter (e.g., Groq) |
| P0-2 | Critical | No paper-generation/submit/report API route | `find app/api/adaptive-exam` | Candidate receives a paper → only blueprint count shown | Add routes with auth and validation |
| P0-3 | Critical | Historical corpus empty; 100% AI-generated papers | DB count 0; `historicalDataEligible: false` | Use verified PYQs → all ORIGINAL | Run ingestion; wire Prisma repository in factory |
| P0-4 | Critical | No duplicate gate across papers/users | `duplicateExclusions: []`; no global check | Reject repeats → repeats pass `PASS` | Implement exact/near/template + global store |
| P1-1 | High | 51k live questions invisible to adaptive | Two disconnected stores | Reuse bank → 0 eligible | Add adapter or migrate relevant rows |
| P1-2 | High | Topic namespace mismatch makes PYQ retrieval impossible after ingest | `historical-sources.ts:50-84` vs `question-selection.ts:71` | PYQ selected → 0 rows | Normalize paths |
| P1-3 | High | Difficulty always MEDIUM | zero distribution + hardcoded selection | Difficulty control → ignored | Source distribution or remove control |
| P1-4 | High | Bank general language conflict with supplied baseline | `profile-seeds.ts:92-95` | English default → Bangla | Confirm official policy, encode per profile |
| P2-1 | Medium | 4 of 6 profiles unavailable; BCS Special / Others missing | `profile-seeds.ts:222-247` | Full hierarchy → 2 profiles | Add verified configs |
| P2-2 | Medium | `subtopicPaths` dead metadata | no consumers | Subtopic tests → unsupported | Wire into blueprint/selection |
| P2-3 | Medium | UI feature lives inside Real Exam tab | `RealExamTab.tsx:758-788` | Own section → embedded | New tab (pending your approval) |
| P2-4 | Medium | No adaptive API documentation or API tests | `docs/API.md`, `tests/api/` | Documented endpoints → absent | Add docs + integration tests |
| P3-1 | Low | Blueprint `profileSnapshotId` placeholder | `adaptive-blueprint.ts:53` | Real snapshot id → blueprint id | Wire snapshot id |

---

## O. Final Readiness Scores (0–100)

| Category | Score | Evidence |
|---|---:|---|
| 1. Feature completeness | 20 | prepare only; no generation/delivery routes |
| 2. Examination hierarchy | 15 | family + subjects only; no org/post/type/others |
| 3. Syllabus and profile accuracy | 55 | BCS exact; Bank curated/assumed; 4 missing |
| 4. Historical question coverage | 0 | 0 rows |
| 5. Historical provenance | 25 | schema supports it; no data |
| 6. Historical frequency intelligence | 15 | code exists, empty input |
| 7. Pattern-aware blueprint generation | 20 | candidate weight only; no historical weighting |
| 8. AI question-generation quality | 10 | no adapter; structural-only validation |
| 9. Factual accuracy | 0 | no independent verification |
| 10. Mathematical accuracy | 0 | no recomputation |
| 11. Global duplicate prevention | 0 | no implementation |
| 12. Multi-paper differentiation | 5 | hashes differ; no content gate |
| 13. Shared mock repository | 0 | tables empty, no service |
| 14. Upcoming mock management | 0 | `ExamSchedule` unused |
| 15. Exam delivery and scoring | 20 | scoring unit-tested; no delivery path |
| 16. Adaptive intelligence | 25 | candidate snapshot + weight; no delivered loop |
| 17. Privacy and security | 65 | auth + answer-key separation; ports cast weakens |
| 18. Reliability and scalability | 15 | synchronous per-question calls; no jobs |
| 19. **Overall examination readiness** | **12** | not usable by real candidates |

---

## 20. Prioritized Remediation Roadmap (NOT STARTED)

1. **P0 — Exam integrity:** implement and wire `AiGenerationPort`; add `generatePaper`, `startSession`, `submit`, `report` routes. Remove fallback zero-score on missing data.
2. **P0 — Historical data:** run ingestion into `HistoricalQuestion`; switch factory to `createPrismaHistoricalRepository`; fix `topicPath` namespace; set `historicalDataEligible` only with verified coverage.
3. **P0 — Duplicate gate:** exact/near/template detection with global paper store; reject or replace before publishing; expose `duplicateExclusions` in blueprint.
4. **P1 — Profiles and hierarchy:** add verified BCS Special, AD, Officer General/ICT/Cash, Assistant Manager; model organization/post/type; extensibility for "Others".
5. **P1 — Quality validation:** independent reviewer model for answers/explanations; math recomputation; language checks; date-aware current-affairs checks; schema validation of provider output.
6. **P1 — Delivery:** immutable persisted `PaperSnapshot`, timer/autosave/resume/idempotency, answer-key protection, independently verified scoring tests.
7. **P2 — Adaptive intelligence:** time-per-question and error-type signals, exposure-based mastery, controlled candidate simulations.
8. **P2 — Shared library:** published/upcoming/archived mock repository with access control and filtering.
9. **P2 — Reliability:** background jobs with recovery, batching, quota handling.
10. **P3 — UX:** move adaptive panel out of Real Exam into a dedicated **Adaptive Exam** tab (your earlier request — held pending your explicit approval per this audit directive).

**No remediation code has been written. Waiting for your approval.**

---

## Final Acceptance Answers

1. Required hierarchy? **No.**
2. Profiles/syllabi connected to adaptive? **Only 2, partially.**
3. Each profile correct syllabus/marks? **BCS yes; Bank SO assumed; others absent.**
4. Retrieve all relevant PYQs? **No — zero PYQs.**
5. PYQs mapped to taxonomy? **No — namespace mismatch.**
6. Analyse historical patterns/frequencies? **Code exists, no data.**
7. Blueprint respects history + syllabus? **Syllabus yes; history no.**
8. Multiple genuinely different papers? **Not demonstrated; no gate.**
9. Every paper globally duplicate-checked? **No.**
10. Other users' papers included? **No.**
11. Shared library? **No.**
12. Upcoming mocks protected? **No.**
13. Candidate records private? **No shared-paper path exists; answer keys protected.**
14. Answers independently validated? **No.**
15. Candidates take/submit reliably? **No delivery route.**
16. Performance influences subsequent exams? **Not end-to-end.**
17. Architecture extensible? **Not without type/config changes.**
18. Must fix before trust: **P0-1..P0-4 at minimum.**
