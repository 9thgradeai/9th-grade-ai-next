# AI Agent Implementation Plan

Companion to `AI_AGENT_ARCHITECTURE_AUDIT.md`. Maps the audit gaps (G1–G7) to concrete,
phased, reversible work. Every phase is gated on `npm run typecheck && npm run lint &&
npm run test && npm run build`.

## Principles

- **Extend existing seams** — the provider interface, the services layer, the route
  conventions, the streaming client. No parallel architecture.
- **Provider-neutral** — the orchestration depends on the `LLMProvider` interface and the
  `ModelRouter`; swapping Groq for a self-hosted OpenAI-compatible server is a
  configuration change, not a rewrite.
- **The model is not the product** — the agent operates *real* student intelligence
  (mastery engine, mistake book, analytics) through *allowlisted, authorized* tools. The
  backend remains authoritative for metrics; the LLM only interprets.
- **No destructive schema changes** — new models are added; existing tables are only
  extended with nullable/default columns. `db push` is safe.
- **Typed, validated, observable** — tool I/O validated server-side, agent runs persisted,
  no chain-of-thought stored or streamed.

## Status

All four phases are **complete and shipped** (commits `83785f9` and the Phase 2–4 work that
follows). Each phase passed the full gate sequence (`npm run typecheck && npm run lint &&
npm run test && npm run build`). Components that were deliberately **not built** (guarded
question auto-generation) are documented in `AI_AGENT_FINAL_AUDIT.md`.

## Phase 1 — Agent foundation

Status: shipped in `83785f9`.

| Gap | Work | Artifacts |
|---|---|---|
| G1 | Model router: `ModelTask` enum, tier defaults, unified `AI_MODEL_PRIMARY/_FAST` env | `backend/ai/router/` |
| G1 | Providers read model names from unified config (keeps current env-name fallbacks) | `providers/*.ts` (edit) |
| G2 | Typed tool registry: definition, zod-free validators, authz, timeout, result model | `backend/ai/tools/` |
| G2 | Read-only tools over existing data (profile, goals, mastery, activity, mistakes, questions, syllabus, weightage, readiness, current affairs) | `backend/ai/tools/*.ts` |
| G3 | Bounded agent loop (`MAX_AGENT_STEPS=8`), JSON tool-call protocol, graceful failure | `backend/ai/agent/loop.ts` |
| G4 | Typed `AgentResponse` block model + validation + action allowlist | `backend/ai/agent/response.ts` |
| G5 | `AgentRun` + `AgentToolCall` persistence | Prisma models + `backend/ai/agent/persistence.ts` |
| G6 | Wrong-answer classification schema (columns + enum) without changing write path | Prisma schema |
| G5 | New `LearningEvent` model (emission in Phase 2) | Prisma schema |
| G7 | `POST /api/ai/agent` SSE endpoint + frontend client + block renderer | `app/api/ai/agent/route.ts`, `frontend/lib/services/ai/agent.ts`, `frontend/components/dashboard/ai/AgentBlocks.tsx` |

Gates: unit tests for router/tools/loop/response; integration test for the agent endpoint;
`docs/AI_AGENT_DATA_MODEL.md`, `docs/AI_AGENT_API_CONTRACT.md`,
`docs/AI_AGENT_TOOL_REGISTRY.md`, `docs/AI_AGENT_FRONTEND_ARCHITECTURE.md` written.

## Phase 2 — Student intelligence & structured action surface

Status: shipped.

- Learning-events pipeline (`backend/events/learning-events.ts` + `backend/services/learning-events.ts`):
  replayed, last-write-wins anomaly fix, produced-vs-consumed bookkeeping.
- Wrong-answer classification: `classifyErrorType` (rules engine over difficulty/variance/
  timing/history, source-aware), `errorType` persisted on attempts by examine-answer, and
  `selectedAnswer`/`durationSec`/`confidence`/`errorType` captured on practice + daily-quiz
  submissions. `durationSec` travels from QuestionDrill → client API → route validation →
  attempts.
- Error-type filters in the notebook API (`GET /api/mistakes?errorType=`) and UI
  (`WrongAnswerNotebookTab` chip filter + `latestErrorType` badges). `docs/API.md` updated.
- Recommended-action blocks wired into real builders via the agent tools
  (`START_PRACTICE`, `START_MOCK_EXAM`, `OPEN_WRONG_ANSWERS`, `OPEN_TAB`).
- AI coach on the dashboard home tab (`HomeCoach.tsx`) driving `recommend_next_action`,
  with deterministic question-set wiring for the practice/mock-exam action blocks.

## Phase 3 — Knowledge retrieval & adaptive practice

Status: shipped (auto-generation deliberately deferred).

- `search_current_affairs` grounded in verified `FlashNews`.
- `create_practice_session` / `create_mock_exam` mint deterministic question ids via the
  existing builders; the loop injects them into the action blocks and the client dispatches
  `ai:start-practice` to `PracticeDrillOverlay`.
- Guarded question-generation pipeline **not implemented** — design + guardrails captured in
  `AI_AGENT_FINAL_AUDIT.md`; awaiting product sign-off.

## Phase 4 — Hardening & provider-swap proof

Status: shipped.

- Perf budget re-baselined; SSE streaming verified over the mock provider.
- OpenAI-compatible provider seam (`AI_PROVIDER`); `.env.local.example` documents
  `AI_PROVIDER`, `AI_MODEL_PRIMARY`, `AI_MODEL_FAST`, `AI_TEMPERATURE`,
  `AI_MAX_OUTPUT_TOKENS`, `AI_AGENT_MAX_STEPS`.
- `docs/AI_AGENT_FINAL_AUDIT.md` written (implemented / not implemented / limits / risks).
- Accessibility + responsive pass on the AI workspace (VoiceAITutor + AI coach).

## Sequencing within Phase 1 (dependency order)

1. Router config + providers edit (no behavior change to existing endpoints).
2. Prisma schema additions → `prisma validate` → `db push` → `docs/DATABASE.md` update.
3. Tool registry + tools (pure reads).
4. Agent response model + validators.
5. Agent loop + persistence.
6. `runAgentTurn` service + exports.
7. `POST /api/ai/agent` SSE route.
8. Frontend types + client + AgentBlocks renderer + VoiceAITutor agent mode.
9. Tests + gates + remaining docs.

No existing endpoint is altered in Phase 1; the agent surface is purely additive. Existing
tutor/assistant/solver behavior is preserved and remains the primary path until the agent
surface proves out in practice.