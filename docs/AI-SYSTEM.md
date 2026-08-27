# AI System

The AI system is a real, authenticated, provider-abstracted layer behind the Tutor, Solver, and Assistant. All business logic lives in `backend/ai/` (the domain seam); route handlers in `app/api/ai/*` stay thin.

## Architecture

```
frontend/lib/services/ai/*   ← typed client service layer (tutorTurn, solve, askAssistant, conversations)
  →  app/api/ai/*            ← thin route handlers (auth + rate limit + validation + streaming)
        →  backend/ai/*      ← domain: providers, prompts, context, memory, persistence, usage, tools
              →  Prisma      ← AIConversation, AIMessage, AIMemory, AIUsage, AIFeedback
```

## Providers (`backend/ai/providers/`)

Model resolution is task-driven via `resolveModel(task, { image })`:

| Task | Preferred | Fallback | Last resort |
|------|-----------|----------|-------------|
| Tutor | Groq `openai/gpt-oss-120b` (`AI_GROQ_MODEL`) | Anthropic | Mock |
| Assistant | Groq `openai/gpt-oss-120b` | Anthropic | Mock |
| Solver (text) | Anthropic `claude-sonnet-4-6` (`AI_ANTHROPIC_MODEL`) | Groq | Mock |
| Solver (image/vision) | Anthropic | — | Mock |

- **Groq** (`@ai-sdk/groq`) — fast, free-tier, open-source models. Requires `GROQ_API_KEY`.
- **Anthropic** (`@ai-sdk/anthropic`) — reasoning + vision. Requires `ANTHROPIC_API_KEY`.
- **Mock** — deterministic, clearly-labelled (`source: "mock"`) fallback when no key is set. Never fakes live data.
- Model names are env-overridable: `AI_GROQ_MODEL`, `AI_ANTHROPIC_MODEL`.

## Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/ai/tutor` | required | **Streaming** teaching turn (SSE-style text stream + headers) |
| `POST /api/ai/solver` | required | Structured step-by-step solver (`{ solution, steps, explanation, relatedConcept }`) |
| `POST /api/ai/assistant` | required | Structured study guidance (`{ reply, suggestedActions }`) |
| `POST /api/ai/evaluate` | required | Answer evaluator: grade a learner's written answer (`{ score, verdict, strengths[], gaps[], modelAnswer, improvementTips[] }`), grounded on the curated question bank when `questionId` is supplied |
| `POST /api/ai/mock-test` | required | AI mock-test generator: produce N multiple-choice questions (`{ title, questions:[{ id, question, options[], answer, explanation, topic, difficulty }] }`) for a subject/exam |
| `POST /api/ai/advisor` | required | Career/exam advisor: personalized target + study plan (`{ summary, recommendedExam, focusAreas[], timelineWeeks, weeklyPlan[], tips[] }`) from the learner profile |
| `GET /api/ai/student-model` | required | Long-term student model: aggregated goals, language, weak/strong topics (from `AIMemory`) + usage counts |
| `GET /api/ai/usage/summary` | required | Observability: per-caller AI usage (`totalCalls`, `totalCostUsd`, `successRate`, `avgLatencyMs`, `byProvider`, `byDay`) — no prompt content stored |
| `GET/POST /api/ai/conversations` | required | List / create conversation threads |
| `GET/PATCH/DELETE /api/ai/conversations/:id` | required | Read / rename / pin / delete one conversation (ownership-checked) |
| `POST /api/ai/feedback` | required | Record HELPFUL / NOT_HELPFUL feedback on a message |

Response headers: `X-AI-Source` (`groq` | `anthropic` | `mock`), `X-Conversation-Id`, `X-AI-Intent`, `X-AI-Model`.

## Tutor streaming flow

1. Validate request (`validateChatRequest`), detect intent (`detectIntent`, keyword-based + optional override).
2. Resolve subject/topic/question ids; build learner context (`buildContext`) from progress, subject, topic, question, memories.
3. Ensure or create the conversation; persist the user message.
4. Run intent-driven web search (`tools/search.ts`, Tavily, safe fallback to empty block).
5. Build system prompt (`buildTutorSystem` = persona + learner context + memory + optional web grounding).
6. `provider.stream()` → real token streaming to the client; assistant message + usage are persisted when the stream completes (`done` + `getFullText`).
7. Memory side-effects: `notePreferredLanguage`, topic weak/strong signals.

## Context & Memory

- **Context engine** (`context/context-engine.ts`): assembles `AIContext` — exam target, subject, topic, question, learning profile (from `UserProgress`/attempts), and persisted memories.
- **Memory store** (`memory/memory-store.ts`): `AIMemory` rows keyed by `[userId, type, key]`; only the AI application layer writes memory (never raw model output). Stores preferred language, topic signals, exam goals.
- **Conversation persistence** (`persistence/conversations.ts`): every turn is stored in `AIConversation`/`AIMessage`; history is scoped to the authenticated user on every read.

## Validation

- **Input** (`backend/ai/schemas.ts`): dependency-free validators. Chat requests need ≥1 user message, valid roles (`user`/`assistant`/`system`), length caps (`MAX_AI_INPUT_CHARS`), solver needs `text` or `imageBase64` (image ≤ 5MB → `413`).
- **Output** (`backend/ai/validation/outputs.ts`): model output is never trusted blindly. JSON is parsed + normalized (`parseJsonObject`, `validateSolverOutput`); assistant actions are validated against a whitelist; replies are sanitized and clamped.
- **AI Safety**: LLM output is never used for authorization, validation, or security decisions.

## Rate Limits (`backend/rate-limit.ts`)

- Per-user (authenticated) or per-client (IP-derived) buckets, 10 requests / 60 s per endpoint, plus a per-user daily quota.
- In-memory store — single-instance deployments only; swap for a shared store (Redis/Upstash) behind the same `checkRateLimit`/`checkDailyQuota` surface for multi-instance serverless.
- `resetRateLimitStore()` is exported for tests.

## Usage & Cost (`backend/ai/usage/`)

Every AI call records an `AIUsage` row (tokens, latency, success, estimated cost). No prompt content is stored. `bumpAIQuestions` increments `UserProgress.aiQuestionsAsked`.

## Prompt Versioning

- Prompts live in `backend/ai/prompts/` (`tutor.ts`, `solver.ts`, `assistant.ts`) with versioned constants (`tutor-v1`, etc.). System prompts are defined server-side only — never in client code.

## Fallbacks & Failure Modes

- **Missing API key**: Mock provider activates, clearly labelled (`source: "mock"`).
- **Provider failure**: usage row records the error; tutor stream degrades, solver returns a structured error (`AppError` → JSON error via `toHttpResponse`).
- **Empty model output**: assistant message persisted as `FAILED`; client shows a friendly Bengali message with a retry action.
- **Invalid input**: `400` with a human-readable `AppError` message.

## Evaluation

- Unit tests: `tests/unit/backend/ai.test.ts` (schemas, output validation, intent, prompts, rate limits).
- Component tests: `tests/unit/frontend/ai-workspace.test.tsx` (AI workspace UI).
- Web-search module tests: `tests/unit/backend/web-search.test.ts`.

## Response Rendering & Formatting

- **Client Markdown renderer**: AI replies are rendered by the dependency-free renderer in
  `frontend/components/chat/Markdown.tsx` — bold/italic, inline code, fenced code blocks (with a copy
  button), headings, bullet/numbered lists, blockquotes, links and dividers. It also strips the
  decorative asterisk noise models occasionally emit (stray `**`, `****` separators, empty emphasis)
  so responses never show raw `*`/`**` characters.
- **Formatting guidance in prompts**: `tutor.ts` and `assistant.ts` include a `FORMATTING` block that
  tells the model to use minimal Markdown (`-` bullets, numbered steps, brief headings) and to avoid
  asterisk-heavy or decoration-only lines, which break on small screens.
- **Chat UI**: `frontend/components/dashboard/VoiceAITutor.tsx` is a responsive,
  ChatGPT/Gemini-inspired shell (mobile bottom sheet + slide-over conversation drawer; desktop
  centered panel with an always-visible sidebar). Message bubbles live in
  `frontend/components/chat/ChatMessage.tsx`; the solver applies the same renderer to its solution
  output (`frontend/components/dashboard/AISolverTab.tsx`).
- **Text-to-speech is disabled**: the workspace accepts voice input (STT) but never speaks responses
  aloud (no auto-TTS after generation).
- **Conversation titles**: when a new tutor/assistant conversation completes its first turn,
  `backend/ai/application/title.ts` summarizes the WHOLE chat transcript into a short title via the
  model (`backend/ai/prompts/title.ts`), falling back to the first learner message when no model or
  no output is available. Solver conversations keep their first-question snippet title.