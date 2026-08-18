# AI System

## Providers

- **Anthropic** — Claude Sonnet 4 (`claude-sonnet-4-6`) via Vercel AI SDK (`@ai-sdk/anthropic`).

## Models

| Endpoint | Model | Purpose |
|----------|-------|---------|
| `/api/ai/tutor` | `claude-sonnet-4-6` | Streaming chat tutor |
| `/api/ai/solver` | `claude-sonnet-4-6` | Step-by-step question solver |

## Agents / Tools

There are no autonomous agent loops. The AI is used via two direct endpoints:

1. **AI Tutor** (`POST /api/ai/tutor`)
   - Input: `{ messages: [{ role: "user" | "assistant", content: string }] }`
   - Output: Streaming text response.
   - System prompt: friendly, encouraging, exam-focused tutor for Bangladesh competitive exams.

2. **AI Solver** (`POST /api/ai/solver`)
   - Input: `{ text?: string, imageBase64?: string, subject?: string }`
   - Output: JSON `{ solution, steps, source }`.
   - System prompt: patient, expert tutor; returns final answer + numbered steps.

## Orchestration

- No agent orchestration framework (no LangChain, no CrewAI).
- Direct SDK calls in Next.js route handlers.
- Client components call endpoints via `frontend/lib/services/api.ts` (currently no AI client wrapper — calls are made inline in components).

## Context Management

- **Tutor**: Full conversation history is sent in the `messages` array.
- **Solver**: Single-turn; no conversation history.
- Context limit: `maxTokens: 1024` for both endpoints.

## Structured Outputs

- **Solver** requests JSON output via system prompt. Falls back to raw text if JSON parse fails.
- **Tutor** returns plain text stream.

## Validation

- Input validation is basic: check required fields (`messages` array for tutor, `text`/`imageBase64` for solver).
- No PII redaction or content filtering beyond Anthropic's built-in safety.

## Fallback

- When `ANTHROPIC_API_KEY` is unset:
  - Tutor returns a mock stream with a clearly-labelled mock message.
  - Solver returns a static mock JSON with `source: "mock"` and a `note` explaining how to enable real AI.

## Retries

- No retry logic. Failures return `500`.

## Rate Limits

- No application-level rate limiting. Relies on Anthropic's API rate limits and Vercel AI SDK defaults.

## Evaluation

- No AI evaluation framework or benchmark tests.

## Prompt Versioning

- Prompts are defined inline in route handlers.
- No versioning or prompt registry.

## Failure Modes

- **Missing API key**: Mock fallback activates.
- **JSON parse failure (solver)**: Returns raw text as solution with a single step.
- **Stream failure (tutor)**: Returns `500`.
- **Invalid input**: Returns `400` with error message.

## AI Security

- LLM output is never used for authorization, validation, or security decisions.
- Mock responses are clearly labelled.
- No prompt injection mitigation beyond standard system prompt framing.
- No PII is sent to the LLM beyond what the user provides in chat.
