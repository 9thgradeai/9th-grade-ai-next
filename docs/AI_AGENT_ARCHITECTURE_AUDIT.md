# AI Agent Architecture Audit

Status: baseline audit (Phase 0) — reflects the repo at the start of the AI-agent build.
Audited: 2026-09-05. Read-only audit; nothing below implies a code change was made.

## 1. What already exists

The platform is **not** a greenfield chatbot. It already ships a layered, security-hardened
Next.js 16 (App Router) application with an AI subsystem. The AI-agent work extends these
seams rather than replacing them.

### Provider abstraction & model routing (already present)
- `backend/ai/providers/types.ts` — `LLMProvider` interface: `generate()`, `stream()`,
  `supportsVision`, `name`, `model`. The application depends on this interface, never on
  Groq/Anthropic directly.
- `backend/ai/providers/registry.ts` — `resolveModelCandidates(task, {image})` returns an
  **ordered** candidate list (Groq → Anthropic → mock) with runtime failover in
  `backend/ai/application/services.ts` (`withFailover`).
- Providers: `groq.ts` (`openai/gpt-oss-120b`, env-overridable via `AI_GROQ_MODEL`),
  `anthropic.ts` (`claude-sonnet-4-6`, `AI_ANTHROPIC_MODEL`), `mock.ts` (clearly-labelled,
  `source: "mock"`).
- Tasks: `tutor` / `solver` / `assistant` (see `backend/ai/types.ts`). Intent detection is
  keyword-based (`detectIntent`) with a small `AIIntent` vocabulary.

### What is missing for full provider-neutrality
- Model **task routing** (fast vs. primary tiers). Today every task uses the same ordered
  candidate chain; there is no `ModelTask` → tier mapping and no `AI_MODEL_PRIMARY` /
  `AI_MODEL_FAST` unified configuration.
- A dedicated `Router` seam that the orchestration layer can depend on (today the registry
  is a thin helper; routes/services call it directly).
- An OpenAI-compatible provider implementation (for self-hosting / local inference) and a
  `MockProvider` that can synthesize **agent-shaped** replies (currently it emits tutor/
  solver prose only).

## 2. Student intelligence

- DB-driven mastery engine: `backend/services/mastery.ts` (pure functions,
  `computeMasteryStatus/Score`, thresholds, mistake priority scoring) persisted in
  `UserQuestionProgress` (per-user, per-question) and updated atomically by
  `recordQuestionAttempt` in `backend/services/question-progress.ts`.
- Wrong-answer notebook: `getWrongAnswerNotebook`, mistake stats/exam builders in
  `question-progress.ts` + `backend/services/mistake-exam.ts`.
- Analytics: `backend/services/analytics.ts` (`getSubjectReports`, `getWeakTopics`) over
  `QuestionAttempt` aggregates; the streak is server-derived.
- AI-side student model: `backend/ai/student-model.ts` (`getStudentModel`) reads DB + memory.

### Gaps
- **No persisted learning-event stream.** The event bus (`backend/events/`) is in-memory and
  used only for badge awards (5 events). Nothing records a replayable
  `SESSION_STARTED / QUESTION_WRONG / AI_TUTOR_SESSION / MOCK_EXAM_COMPLETED` timeline.
- `QuestionAttempt` does not store `selectedAnswer`, `durationSec`, `confidence`, or an
  **error classification** — so the wrong-answer subsystem cannot answer "why did they get
  it wrong?" beyond correct/incorrect.
- No `AgentRun` / `AgentToolCall` persistence (the agent loop, when added, must be
  observable).

## 3. Knowledge & retrieval

- Content taxonomy: `Subject → Topic → Question` (with `path`, `subtopic`, `difficulty`,
  `year`, `sourceExam`, `sourceKey`). Exam library: `ExamCategory → Exam → ExamPaper`.
- Retrieval: `backend/ai/retrieval/` (domain RAG over the question bank, keyword scoring,
  bounded candidates) + `backend/ai/tools/search.ts` (Tavily web search for
  freshness-sensitive intents). Embedding seam exists (`EmbeddingProvider`) but only a
  dev `HashingEmbedder`; pgvector is flag-off.

### Gaps
- The agent has **one** tool today (`search`). There is no typed tool registry, no
  per-tool authorization, no input/output schemas, no tool timeouts, and no way for the
  model to request the many read capabilities the platform already exposes
  (mastery, weak topics, mistakes, syllabus, current affairs, readiness).

## 4. Agent orchestration

- `backend/ai/application/services.ts` composes context + memory + a single LLM call per
  request: `createTutorTurn`, `solveQuestion`, `assistantTurn`, `evaluateAnswer`,
  `generateMockTest`, `getCareerAdvice`. Streaming with a 30s timeout guard, persistence
  via `runAfterResponse`, usage ledger (`AIUsage`), AI response cache.
- Assistant responses are structured JSON (`{reply, actions}`) validated server-side and
  rendered as action chips client-side.

### Gaps
- **No bounded agent loop.** No iterative tool selection, no multi-step reasoning, no
  `MAX_AGENT_STEPS` / cancellation / step accounting.
- Structured output is a single flat object; there is no typed block model
  (`study_recommendation` / `weakness` / `practice_action` / …) that the frontend renders
  as native cards from **real data**.
- Tool execution is not authorized per tool, and a future agent loop must not hand the
  model arbitrary DB handles.

## 5. API surface (AI)

| Endpoint | Streams | Notes |
|---|---|---|
| `POST /api/ai/tutor` | yes | tutor turn, persists conversation |
| `POST /api/ai/assistant` | yes | guidance + suggested actions |
| `POST /api/ai/solver` | yes | text/image solve |
| `POST /api/ai/evaluate` | no | answer evaluation |
| `POST /api/ai/mock-test` | no | generated mock test |
| `POST /api/ai/advisor` | no | career advice |
| `POST /api/ai/feedback` | no | feedback ingestion |
| `GET  /api/ai/student-model` | no | student model read |
| `GET  /api/ai/usage/summary` | no | usage/cost |
| `GET/POST /api/ai/conversations(/:id)` | no | conversation CRUD |

Every route: `assertSameOrigin` (CSRF), `getUserIdFromRequest` (401), `enforceAiQuotas`,
`applySecurityHeaders`, request-id/response-time headers, `maxDuration`.

### Gaps
- No agent endpoint/SSE event protocol (`agent.started`, `tool.started`, `message.delta`,
  `block.created`, `agent.completed`, `agent.error`).
- No wrong-answer query with error-type / subject / topic / date filters.

## 6. Frontend AI surface

- `VoiceAITutor` (`frontend/components/dashboard/VoiceAITutor.tsx`) — the AI workspace:
  streaming tutor + assistant, conversation sidebar, voice in/out, feedback, quick actions,
  responsive shell (bottom-sheet mobile / centered desktop panel).
- Per-tab AI surfaces: `AISolverTab`, `AdvisorTab`, `AnswerEvaluatorTab`, `AIMockTestTab`,
  `StudentModelTab`, `UsageTab`.
- Client layer: `frontend/lib/services/ai/*` — `streamChat()` + `aiJson()`, per-feature
  wrappers, `parseStreamedJson`.
- Design system: Tailwind v4 + CSS custom properties; dashboard scoped light/dark;
  dashboard store via `useSyncExternalStore` (`frontend/lib/store-ctx/dashboard.tsx`).
  No Zustand / TanStack Query anywhere — a deliberate, documented choice.

### Gaps
- No structured-block renderer (recommendation/weakness/practice/exam cards).
- No agent mode or SSE-status UX in the composer.
- No wrong-answer error-type filters in the notebook UI.

## 7. Cross-cutting seams already present

Caching (`backend/infrastructure/cache/`), Redis rate-limit store
(`rate-limit-redis.ts`), QueueDriver (`queue/`), ObjectStorage (`storage/`), structured
logging (`observability/`), Sentry, AI usage ledger (`AIUsage`), AI memory (`AIMemory`,
90-day expiry), conversation persistence (`AIConversation/ AIMessage`).

CI (`node_modules` not needed): typecheck → lint → test (Postgres-backed) → build → perf
budget. Coverage gates: lines 38 / functions 34 / branches 32.

## 8. Gaps summary (feeds the implementation plan)

| # | Gap | Impact |
|---|---|---|
| G1 | No model **task router** (`fast` vs `primary`) or unified model env config | Provider swap requires code edits; cost not controlled per-task |
| G2 | No typed **tool registry** with authz/schemas/timeouts | Agent cannot operate the platform; unsafe ad-hoc tool calls likely |
| G3 | No **bounded agent loop** / step accounting | No multi-step reasoning; not observable |
| G4 | Responses are prose+actions, not **typed blocks** | Frontend can't render real recommended actions as cards |
| G5 | No **learning-event stream** / `AgentRun` persistence | Cannot reconstruct or audit learning over time |
| G6 | Wrong answers lack **error classification** context | "Why did they get it wrong?" is unanswerable from data |
| G7 | No agent **SSE protocol** or agent endpoint | No status/step UX; no cancellation observability |

## 9. Guardrails respected by the audit

- No production mock data surfaced to authenticated flows (mock provider is labelled).
- No business logic in route handlers; routes delegate to `backend/services` / `backend/ai`.
- Security headers, CSRF, quotas, and validation are consistently applied to AI routes.
- Schema additions must be additive (`db push`, non-destructive) and documented in
  `docs/DATABASE.md` and `docs/AI_AGENT_DATA_MODEL.md`.