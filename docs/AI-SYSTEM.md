# AI System

## Providers

- **Groq** — `openai/gpt-oss-120b` via Vercel AI SDK (`@ai-sdk/groq`) for the AI Tutor. Requires `GROQ_API_KEY`.
- **Anthropic** — Claude Sonnet 4 (`claude-sonnet-4-6`) via Vercel AI SDK (`@ai-sdk/anthropic`) for the solver. Requires `ANTHROPIC_API_KEY` (falls back to mock when unset).

## Models

| Endpoint | Model | Purpose |
|----------|-------|---------|
| `/api/ai/tutor` | `openai/gpt-oss-120b` (Groq) | Streaming global AI assistant (exam-focused, no KB grounding) |
| `/api/ai/solver` | `claude-sonnet-4-6` (Anthropic) | Step-by-step question solver |

## Global assistant (no knowledge-base grounding)

The tutor is a **global AI assistant**: it answers from the model's own knowledge, focused on BCS / bank / teacher-recruitment / govt-job exam preparation but not limited to a fixed syllabus.

- The curated knowledge base at `frontend/lib/data/knowledge-base.ts` (`KNOWLEDGE_BASE` + `retrieveKnowledge()`) exists as a **tested reference data module** but is **not injected** into the tutor system prompt (a previous KB-grounding design caused the model to anchor to weak/irrelevant retrieved entries and answer incorrectly on simple factual questions).
- Per-request accuracy on general facts comes from the model itself (`openai/gpt-oss-120b`, a strong reasoning model). The persona instructs the model to be accurate first and to say so when unsure.
- Web search grounding is **not** used — Groq is inference-only and does not provide a search API. Live, verifiable answers would require integrating a separate search/retrieval provider (Tavily, Exa, Brave, Bing) whose results are injected into the prompt.

Tutor pipeline per request:
1. Take the incoming `messages` array.
2. System prompt = the `TUTOR_PERSONA` (global, exam-focused, accuracy-first) — no retrieved KB block.
3. Stream the reply from Groq (`openai/gpt-oss-120b`, `maxTokens: 2048`).
4. Response headers expose `X-AI-Source`: `groq` / `mock`.

## Agents / Tools

There are no autonomous agent loops. The AI is used via two direct endpoints:

1. **AI Tutor** (`POST /api/ai/tutor`)
   - Input: `{ messages: [{ role: "user" | "assistant", content: string }] }`
   - Output: Streaming text response.
   - System prompt: friendly, encouraging, exam-focused tutor + retrieved knowledge-base block.

2. **AI Solver** (`POST /api/ai/solver`)
   - Input: `{ text?: string, imageBase64?: string, subject?: string }`
   - Output: JSON `{ solution, steps, source }`.
   - System prompt: patient, expert tutor; returns final answer + numbered steps.

## Orchestration

- No agent orchestration framework (no LangChain, no CrewAI).
- Direct SDK calls in Next.js route handlers.
- Client components call endpoints via `frontend/lib/services/api.ts` (currently no AI client wrapper — calls are made inline in components).

## Context Management

- **Tutor**: Full conversation history is sent in the `messages` array; the latest user message drives knowledge-base retrieval.
- **Solver**: Single-turn; no conversation history.
- Context limit: `maxTokens: 1024` for both endpoints.

## Structured Outputs

- **Solver** requests JSON output via system prompt. Falls back to raw text if JSON parse fails.
- **Tutor** returns plain text stream.

## Validation

- Input validation is basic: check required fields (`messages` array for tutor, `text`/`imageBase64` for solver).
- No PII redaction or content filtering beyond Groq/Anthropic's built-in safety.

## Fallback

- When `GROQ_API_KEY` is unset, the tutor returns a mock stream with a clearly-labelled mock message.
- When `ANTHROPIC_API_KEY` is unset, the solver returns a static mock JSON with `source: "mock"` and a `note` explaining how to enable real AI.

## Retries

- No retry logic. Failures return `500`.

## Rate Limits

- Application-level rate limit: 10 requests / 60 s per client for both AI endpoints (`checkRateLimit`).

## Evaluation

- Unit tests for knowledge-base retrieval in `tests/unit/backend/knowledge-base.test.ts`.

## Prompt Versioning

- Prompts are defined inline in route handlers.
- No versioning or prompt registry.

## Failure Modes

- **Missing API key**: Mock fallback activates (clearly labelled).
- **JSON parse failure (solver)**: Returns raw text as solution with a single step.
- **Model unavailable/fails**: Returns `500`.
- **Invalid input**: Returns `400` with error message.
- **Model unsure of a fact**: Persona instructs the model to state uncertainty rather than guess.

## AI Security

- LLM output is never used for authorization, validation, or security decisions.
- Mock responses are clearly labelled.
- No prompt injection mitigation beyond standard system prompt framing.
- No PII is sent to the LLM beyond what the user provides in chat.
- API keys come from `process.env` only (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`).
