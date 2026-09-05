# AI Agent Final Audit

Status: **Phase 1–4 complete.** Gates passed: `npm run typecheck`, `npm run lint`
(0 errors), `npm run test` (610 tests), `npm run build`.

---

## What was built

### Phase 1 — Agent foundation (`83785f9`)

- **Model router** (`backend/ai/router/`): `ModelTask` enum (`tutor`/`solver`/`assistant`),
  tier defaults, `AI_MODEL_PRIMARY`/`AI_MODEL_FAST` env. Provider swap is a config
  change.
- **Tool registry** (`backend/ai/tools/registry.ts`): 16 typed tools, zod-free validators,
  authz via `ToolContext`, timeout-enforced execution (5 s default), `ToolResult` model.
  Success = `ok` absent; failure = `ok: false` with summary string.
- **Bounded agent loop** (`backend/ai/agent/loop.ts`): `MAX_AGENT_STEPS=8`, JSON
  tool-call protocol, graceful failure, last-write-wins thinking annotation.
- **Agent response model** (`backend/ai/agent/response.ts`): typed `AgentResponse` block
  model, action allowlist.
- **AgentRun / AgentToolCall persistence** (`backend/ai/agent/persistence.ts`): Prisma
  models written after each run.
- **LearningEvent model**: `SESSION_STARTED`/`QUESTION_WRONG`/`QUESTION_RIGHT`/
  `PRACTICE_SUBMITTED`/`DAILY_QUIZ_COMPLETED`/`MOCK_EXAM_COMPLETED`/`AI_TUTOR_SESSION`
  (schema + emission in Phase 2).
- **Wrong-answer classification schema**: Prisma schema additions (`errorType` enum,
  `selectedAnswer`, `durationSec`, `confidence` on `QuestionAttempt`) — columns added but
  not populated until Phase 2.
- **SSE endpoint**: `POST /api/ai/agent` + frontend client + `AgentBlocks.tsx` block
  renderer + `VoiceAITutor` agent mode.

### Phase 2 — Student intelligence & structured action surface

- **Learning-events pipeline** (`backend/events/learning-events.ts` + backend/services/learning-events.ts`):
  replayed over `AgentRun`, anomaly fix via `getReplayAnomalies`, produced-vs-consumed
  bookkeeping for list-quality diagnostics.
- **Error classification** (`backend/services/error-classifier.ts`): rules engine over
  difficulty, `durationSec`, prior progress, and variance. Classifies as `GUESSING` /
  `CONCEPTUAL_GAP` / `CARELESS` / `CORRECT`. Source-aware (`practice` vs `exam` vs
  `daily`). Exam defaults to `CONCEPTUAL_GAP` when `durationSec` is unavailable; daily
  quiz classifiers learn from response-time heuristics (`slow_incorrect` /
  `fast_incorrect`).
- **Attempt enrichment**: `selectedAnswer`, `durationSec`, `confidence`, `errorType` now
  captured on practice submissions (`submitPracticeAnswers`) and daily-quiz submissions
  (`submitDailyQuiz`), validated at the route layer. `durationSec` travels from
  `QuestionDrill` → `frontend/api.submitPractice` → route validation → attempts.
- **Notebook error-type filters**: `GET /api/mistakes?errorType=` (validated against the
  enum), `WrongAnswerNotebookTab` chip filter UI + `latestErrorType` badges per row.
  `docs/API.md` updated.
- **Action wiring**: `START_PRACTICE`, `START_MOCK_EXAM`, `OPEN_WRONG_ANSWERS`, `OPEN_TAB`
  blocks built server-side by `create_practice_session` / `create_mock_exam` / the planner.
  Client dispatches `ai:start-practice` from `useBlockDispatcher`.
- **AI coach card**: `HomeCoach.tsx` ("AI স্টাডি কোচ") on the dashboard home tab, calls
  `recommend_next_action`, renders streaming prose + action blocks, `ai:refresh-home`
  listener reloads stats after drill completion.

### Phase 3 — Knowledge retrieval & adaptive practice

- **`search_current_affairs`**: grounded in verified `FlashNews` rows.
- **`create_practice_session` / `create_mock_exam`**: mint deterministic question ids via
  the existing `getWrongAnswerQuestionIdsForUser` / `getCustomExamQuestionsForUser`
  builders (cross-subject fallback built in). LLM never guesses question sets; ids flow
  through `augmentActionsWithQuestionIds` → `useBlockDispatcher` → `PracticeDrillOverlay`
  → `QuestionDrill`.
- **Question auto-generation into the verified bank**: **not built** — see [deliberate
  exclusions](#deliberate-exclusions) below.

### Phase 4 — Hardening & provider-swap proof

- **Provider swap**: `AI_PROVIDER` env documented in `.env.local.example`; groq.ts reads
  `AI_MODEL_PRIMARY`/`AI_MODEL_FAST` config. No code changes required.
- **Mock label**: `provider === "mock"` surfaces a clear "AI Demo" badge on all mock
  responses in `AgentBlocks`, `HomeCoach`, and `VoiceAITutor`.
- **`QuestionDrill` timing**: wall-clock `durationSec` per question, capped at the
  `QUESTION_TIME_LIMIT` (30 s). Only the GUESSING classifier threshold (≤8 s) is
  reachable from drill submissions; the CONCEPTUAL_GAP threshold (≥90 s) is not — by
  design (drills are fast; exam submissions carry the real variance).

---

## Deliberate exclusions

### Guarded question auto-generation

The Phase 3 plan included a "guarded question-generation pipeline" (schema → dedupe →
consistency → quarantine → never auto-pollute the verified bank). This is **not built**
because:

1. **Risk/benefit ratio**: auto-generating content into the verified question bank without
   a human review step creates a live correctness risk — wrong answers or poorly phrased
   options directly harm exam preparation.
2. **No write-path seam**: the existing `Question.create` path does not have a quarantine
   queue or approval workflow. Building one that is safe requires product sign-off on the
   quarantine UI, moderation policy, and trust thresholds.
3. **Workaround exists**: the agent can still recommend *existing* verified questions via
   `create_practice_session` / `create_mock_exam`. The only gap is that it cannot generate
   brand-new questions for topics with thin coverage — a known limitation, not a blocker.

**If/when this is built**, the required guardrails are:

- Generated questions land in a `QuestionDraft` table (not `Question`), never visible to
  students.
- Each draft carries `source: "ai_generated"`, `generatedBy: modelId`, `generatedAt`,
  `generationSessionId` (FK to `AgentRun`).
- A moderation UI shows the draft with the source question/prompt, difficulty estimate, and
  a one-click approve/reject/delete flow.
- Approval moves the row to `Question` and sets `source: "ai_generated_approved"`.
- Rejection or deletion removes the draft row.
- A hard cap on drafts-per-day (e.g. 20) prevents unbounded generation.
- The agent's system prompt must never tell the user "I have created new questions" until
  the draft is approved.

This design is documented here for whenever product sign-off is obtained.

---

## Limits

- **No persistent memory**: the agent has no cross-session memory of prior conversations.
  Each SSE call rebuilds context from the DB (student model + tool reads). The `Session`
  model in Prisma is used only for conversation history within the current SSE run.
- **No streaming thinking**: thinking annotations are annotated in the loop but not
  streamed to the client. The client sees prose blocks and action blocks only.
- **`durationSec` cap on drills**: `QUESTION_TIME_LIMIT = 30` means the classifier's
  CONCEPTUAL_GAP rule (≥90 s) will never trigger from practice-drill submissions. This is
  correct behavior (drills are paced; full exams carry the real timing variance).
- **Mock provider fallback**: when no `ANTHROPIC_API_KEY` is set, every AI response is
  `source: "mock"` with deterministic, clearly-labelled text. The mock path is not
  content-genuine and should never be relied on for actual study recommendations.
- **`validateSubmittedAnswers` is loose**: it checks array shape and size only. Extra
  fields (`durationSec`, `confidence`) pass through — this is intentional (the service
  layer validates types via `toDurationSec`/`toConfidence`). It is not a security gap
  because all writes are on the authenticated user's own records.

---

## Risks

- **Learning-event anomalies**: the replayed timeline may show gaps or out-of-order events
  when the in-memory bus loses events between server restarts. The `producedVsConsumed`
  bookkeeping detects this but does not auto-repair — it is a diagnostic signal, not a
  hard error.
- **Classifier false positives**: the `GUESSING` rule (≤8 s + wrong) can fire on
  intentionally rapid submissions by advanced users. The classifier is heuristic, not
  authoritative — it feeds the wrong-answer notebook, not an access-control decision.
- **`priorProgress` reads are snapshot-based**: the classifier sees the state before the
  current submission. If two concurrent submissions from the same user arrive, the second
  may classify against stale prior state. This is acceptable for a single-user study tool
  but would need a locking strategy for a multi-device concurrent scenario.
- **Session tools pool exhaustion**: `create_practice_session` and `create_mock_exam` draw
  from a fixed pool of verified questions per user. When the pool is exhausted, the tool
  returns `reason: "pool_exhausted"` and the agent must recommend a different action. This
  is a correct fallback, not a bug — but the agent's planner prompt should guide it to
  surface this gracefully.

---

## Files referenced (Phase 2–4 work)

| Path | Purpose |
|---|---|
| `backend/ai/tools/session.ts` | `createPracticeSession`, `createMockExam` tools |
| `backend/ai/tools/planner.ts` | `recommendNextAction` tool |
| `backend/ai/agent/loop.ts` | Question-augmentation, thinking annotation, produced-vs-consumed |
| `backend/ai/agent/response.ts` | `augmentActionsWithQuestionIds` |
| `backend/ai/application/services.ts` | Agent run orchestration |
| `backend/events/learning-events.ts` | Learning-event pipeline (replay, anomaly fix, bookkeeping) |
| `backend/services/learning-events.ts` | Public `emitLearningEvent` helper |
| `backend/services/error-classifier.ts` | `classifyErrorType`, `ErrorType` enum |
| `backend/services/activity.ts` | Practice + daily-quiz submissions (enriched attempts) |
| `backend/services/exam-submission.ts` | Exam submission (enriched attempts, prior-progress read) |
| `app/api/mistakes/route.ts` | `?errorType=` filter support |
| `frontend/components/dashboard/ai/HomeCoach.tsx` | AI coach card (dashboard home) |
| `frontend/components/dashboard/ai/PracticeDrillOverlay.tsx` | Event-driven practice drill modal |
| `frontend/components/dashboard/ai/AgentBlocks.tsx` | `ai:start-practice` dispatch from practice/mock_exam blocks |
| `frontend/components/dashboard/QuestionDrill.tsx` | `durationSec` per-question tracking |
| `frontend/components/dashboard/HomeTab.tsx` | Coach mount + `ai:refresh-home` listener |
| `frontend/components/dashboard/WrongAnswerNotebookTab.tsx` | Error-type filter chips + badges |
| `.env.local.example` | `AI_PROVIDER`, `AI_MODEL_PRIMARY`, `AI_MODEL_FAST` documented |
