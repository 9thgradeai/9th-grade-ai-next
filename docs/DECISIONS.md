# Architecture Decision Records

## ADR-001: Next.js App Router

- **Date**: 2024
- **Status**: Accepted
- **Context**: Choosing a React framework for a full-stack app with API routes.
- **Decision**: Use Next.js 16 App Router.
- **Rationale**: Native React Server Components, built-in API routes, excellent TypeScript support, strong ecosystem.
- **Consequences**: Requires learning App Router conventions; some client-side patterns differ from Pages Router.

## ADR-002: Prisma + SQLite (Dev) / PostgreSQL (Prod)

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need a database that works locally without setup and scales in production.
- **Decision**: Prisma ORM with SQLite for development and PostgreSQL for production.
- **Rationale**: Zero-config local dev with SQLite; PostgreSQL is the production standard. Prisma provides type-safe queries and easy schema migrations (push-based).
- **Consequences**: No migration files; schema is pushed directly. SQLite has limitations (no full PostgreSQL feature parity), but the schema is simple enough.

## ADR-003: JWT Auth with HttpOnly Cookies

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need server-side authentication without client-side token storage.
- **Decision**: JWT sessions via `jose`, stored in HttpOnly SameSite=Lax cookies.
- **Rationale**: Secure by default (no XSS token theft), no client-side storage, 7-day expiry.
- **Consequences**: No token refresh mechanism; 7-day sessions. No revocation list (stateless JWT).

## ADR-004: Vercel AI SDK for AI Features

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need streaming AI chat and structured output for exam prep.
- **Decision**: Use `ai` (Vercel AI SDK) + `@ai-sdk/anthropic`.
- **Rationale**: First-class Next.js integration, streaming support, structured output helpers.
- **Consequences**: Tied to Vercel AI SDK API; model changes require code updates.

## ADR-006: Groq as AI Tutor provider + grounding knowledge base

- **Date**: 2026
- **Status**: Accepted
- **Context**: The AI Tutor needs a fast, cost-effective LLM and must answer from a curated, exam-accurate knowledge base rather than free-form model knowledge.
- **Decision**: Use `@ai-sdk/groq` with `llama-3.3-70b-versatile` for `/api/ai/tutor`, grounded by keyword-retrieval over a curated knowledge base (`frontend/lib/data/knowledge-base.ts`).
- **Rationale**: Groq offers high-throughput, low-latency inference at low cost; the curated KB keeps answers aligned with the BCS/Bank syllabus and exam patterns. Retrieval is deterministic and dependency-free (no vector DB or embedding service needed at this stage).
- **Consequences**: Model quality is tied to Groq's Llama lineup; if grounding precision becomes a bottleneck, swap the retrieval layer for embeddings (e.g., pgvector on the Railway Postgres) without changing the route interface.

## ADR-008: Global AI assistant for the tutor (drop KB grounding)

- **Date**: 2026
- **Status**: Accepted (supersedes the KB-grounding part of ADR-006)
- **Context**: Live testing showed the tutor answered simple factual questions (e.g., "What is the capital of Bangladesh?", "What is the liberation date of the USA?") incorrectly. Root cause: the KB-grounding system prompt told the model to treat retrieved entries as its primary source, so it anchored to weak/irrelevant matches instead of its own knowledge. Additionally, `llama-3.3-70b-versatile` and `groq/compound` proved flaky/unavailable on the account; the account's curated model list includes `openai/gpt-oss-120b` (reliable, strong reasoning).
- **Decision**: `/api/ai/tutor` is now a **global assistant** — `openai/gpt-oss-120b`, exam-focused persona, no KB injection, `maxTokens: 2048`, `X-AI-Source: groq`/`mock`. The `knowledge-base.ts` module stays as a tested reference data module but is not used by the tutor.
- **Rationale**: The model already knows stable exam facts accurately (verified 5/5 on spot-checked questions without KB); removing the KB eliminates a source of systematic error with zero infrastructure cost.
- **Consequences**: Answers reflect model knowledge, not a curated syllabus. Groq is inference-only (no web search), so live/current facts would require a separate search provider (Tavily/Exa/Brave/Bing) later. No "no-mistakes" guarantee exists for any LLM; accuracy is best-effort.

## ADR-009: Web-search grounding via Tavily

- **Date**: 2026
- **Status**: Accepted
- **Context**: Groq is inference-only and cannot search the web; the user wants the tutor's factual answers grounded in live results to reduce factual slips (e.g., a hallucinated date).
- **Decision**: When `TAVILY_API_KEY` is set, `/api/ai/tutor` searches Tavily's REST API (`https://api.tavily.com/search`, basic depth, top 5 results) for the latest user message and injects the snippets into the system prompt as the primary source for factual claims (`X-AI-Source: groq+web`). `searchWeb()` lives in `app/api/ai/_search.ts`, returns an empty block on any failure/timeout, and uses a plain `fetch` — **no new npm dependency** (per dependency rules).
- **Rationale**: Live snippets are directly relevant to the user's question (unlike the curated KB), giving the model verifiable facts and source URLs. Graceful fallback keeps the endpoint reliable when the key is missing or Tavily is down.
- **Consequences**: Requires a free Tavily key and one external call per tutor request (adds latency, up to ~10s capped by `AbortSignal.timeout`). Free tier ≈ 1000 queries/month. Web grounding cannot guarantee zero errors, only materially fewer factual mistakes.

## ADR-005: Tailwind CSS v4

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need a utility-first CSS framework with design tokens.
- **Decision**: Tailwind CSS v4 with CSS variable design tokens.
- **Rationale**: Latest version, improved performance, CSS-first configuration.
- **Consequences**: Some v3 plugins may not be compatible; documentation may lag.

## ADR-006: Mock AI Fallback

- **Date**: 2024
- **Status**: Accepted
- **Context**: Developers need to run the app without an Anthropic API key.
- **Decision**: Return clearly-labelled mock responses (`source: "mock"`) when `ANTHROPIC_API_KEY` is unset.
- **Rationale**: Zero external dependencies for local dev and CI.
- **Consequences**: Mock responses are not realistic; developers may forget to set the API key.

## ADR-007: Path Aliases

- **Date**: 2024
- **Status**: Accepted
- **Context**: Clean imports across frontend, backend, and tests.
- **Decision**: `@/*` → `frontend/*`, `~backend/*` → `backend/*`, `~tests/*` → `tests/*`.
- **Rationale**: Clear ownership of code by layer; avoids deep relative imports.
- **Consequences**: Requires `tsconfig.json` paths configuration; some tools may not resolve aliases automatically.
