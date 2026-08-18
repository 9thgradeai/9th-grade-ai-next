# AI System

## Providers

- **Groq** — Llama 3.3 70B (`llama-3.3-70b-versatile`) via Vercel AI SDK (`@ai-sdk/groq`) for the AI Tutor. Requires `GROQ_API_KEY`.
- **Anthropic** — Claude Sonnet 4 (`claude-sonnet-4-6`) via Vercel AI SDK (`@ai-sdk/anthropic`) for the solver. Requires `ANTHROPIC_API_KEY` (falls back to mock when unset).

## Models

| Endpoint | Model | Purpose |
|----------|-------|---------|
| `/api/ai/tutor` | `llama-3.3-70b-versatile` (Groq) | Streaming chat tutor grounded in the knowledge base |
| `/api/ai/solver` | `claude-sonnet-4-6` (Anthropic) | Step-by-step question solver |

## Knowledge Base (AI Tutor grounding)

The tutor answers from a curated, exam-focused knowledge base at `frontend/lib/data/knowledge-base.ts` (`KNOWLEDGE_BASE`):

- ~70 entries covering all 10 BCS Preliminary subjects (Bangla, English, Bangladesh Affairs, International Affairs, Geography/Environment, General Science, Computer & IT, Mathematical Reasoning, Mental Ability, Ethics & Good Governance) plus exam-system and current-affairs sheets.
- Each entry: `{ id, subject, subjectEn, topic, keywords[], content, source }` — bilingual (Bangla primary, English keywords).
- **Retrieval**: `retrieveKnowledge(query, limit = 8)` in the same file — deterministic, dependency-free keyword scoring (tokenizes Bangla + Latin text, scores keyword substring hits and token overlap). No embeddings/vector store.

Tutor pipeline per request:
1. Take the latest user message.
2. `retrieveKnowledge()` → top 8 matching entries.
3. Inject them into the system prompt as the grounding block (`=== Retrieved knowledge base entries ===`).
4. Instruct the model to answer from the KB first, and to state when a question is outside the KB.
5. Stream the reply from Groq (`llama-3.3-70b-versatile`).
6. Response headers expose `X-AI-Source`: `groq+kb` / `groq` / `mock`.

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
- **Stream failure (tutor)**: Returns `500`.
- **Invalid input**: Returns `400` with error message.
- **No KB match**: Tutor answers from general knowledge and states it is outside the KB.

## AI Security

- LLM output is never used for authorization, validation, or security decisions.
- Mock responses are clearly labelled.
- No prompt injection mitigation beyond standard system prompt framing.
- No PII is sent to the LLM beyond what the user provides in chat.
- API keys come from `process.env` only (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`).
