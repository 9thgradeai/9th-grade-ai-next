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

## ADR-010: Real-data dashboard redesign (no mock/filler data)

- **Date**: 2026
- **Status**: Accepted
- **Context**: The dashboard (Home, Progress, NotificationCenter) rendered hard-coded, static data (fake 91.6 points, fake rank/exams, fabricated subject trends, `+0%` trends, static notifications/badges, a hard-coded exam banner). The user requires that all dashboard data come from the real database and reflect the user's actual progress.
- **Decision**: The dashboard is rebuilt as a "mission control" surface fed exclusively by real endpoints: `/api/dashboard-stats` (now includes real 7-day `activity` from `QuestionAttempt`, plus `flashcardsReviewed` and `aiQuestionsAsked`), `/api/subject-reports` (fake `trend` field removed), `/api/exam-schedule` (new public route backed by a new `ExamSchedule` model seeded from real published dates, e.g. BCS Preliminary 51st on 2026-11-15), `/api/mock-test/results` (new auth route returning real `MockTestResult` history), `/api/study-plan`, `/api/daily-quiz` and `/api/notifications` + `/api/notifications/:id/read` + `/api/badges`. DailyQuizWidget now submits to `/api/daily-quiz/submit` (real grading + points) instead of computing fake XP locally. The store's fake `totalPoints: 91.6` default was removed and the storage key versioned (`9th_grade_ai_store_v2`) to discard stale persisted values.
- **Rationale**: Progress should be measured by what the user actually did; fabricated numbers destroy trust in an exam-prep product and make the product non-demoable against real data.
- **Consequences**: Dashboard sections render graceful empty states when a user has no data yet. `ExamSchedule` is a new model — see `docs/DATABASE.md`; new endpoints are documented in `docs/API.md`.

## ADR-011: Production-grade AI architecture (authenticated, provider-abstracted, persistent)

- **Date**: 2026
- **Status**: Accepted
- **Context**: The AI surface had drifted from production standards: the tutor UI was a hard-coded keyword mock that never called the real API, `_search.ts` was an orphaned Tavily module, the app was the only client of the solver route, `aiQuestionsAsked` was dead in `UserProgress`, there was no rate limiting per user, and no persistence, memory, usage tracking, or evaluation loop existed. The spec (46 parts) required real streaming, model abstraction, learning memory, and modern UX.
- **Decision**: Build a **real AI domain layer** at `backend/ai/` (providers, prompts, context engine, memory store, conversation persistence, usage ledger, tools, validation) behind thin, authenticated `app/api/ai/*` route handlers. Key choices:
  - **Provider abstraction** (`backend/ai/providers/`): a `ModelRouter` (`resolveModel`/`resolveModelCandidates`) maps task → ordered provider candidates. Groq `openai/gpt-oss-120b` primary for tutor/assistant (fast, free-tier), Anthropic `claude-sonnet-4-6` for solver (+ vision), clearly-labelled `MockProvider` last resort. `withFailover` tries each candidate per-request on provider error, so a single-provider outage degrades gracefully instead of erroring. A best-effort response cache (`backend/ai/infrastructure/ai-cache`, in-memory or Redis) serves repeated questions as `source: "cache"`. No component knows the provider.
  - **Authenticated + persistent**: AI endpoints require a session; every conversation is owned by a user and stored in `AIConversation`/`AIMessage`. Streaming persists the assistant message + usage after `done`.
  - **Learning memory** (`AIMemory`): written only by the application layer (never raw model output), keyed `[userId, type, key]`.
  - **Intent routing** (`detectIntent`): deterministic keyword routing (quiz/plan/explain/…) with client override — no LLM-in-the-loop for routing.
  - **Structured output validation** for solver/assistant JSON; system prompts versioned in `backend/ai/prompts/`.
  - **Typed client service layer** (`frontend/lib/services/ai/*`) + a launcher (`frontend/lib/ai-launcher.ts`) so any surface can hand off to the tutor.
  - **User-aware rate limiting** (per-user + daily quota, `backend/rate-limit.ts`).
- **Rationale**: Extends the repo's existing seams (App Router routes → `backend/services` → Prisma, `AppError`, `toHttpResponse`, security headers) rather than inventing a parallel architecture. Additive DB models keep the schema compatible. Real streaming + persistence make the product demoable and give an evaluation loop via `AIUsage` + `AIFeedback`.
- **Consequences**: No isolated AI database — AI tables reference the existing `User`/`Subject`/`Topic`. In-memory rate limit is single-instance; multi-instance serverless must swap for a shared store behind the same surface. Schema additions must be pushed (`npm run db:push`). Legacy hard-coded mock tutor UI is replaced by the real workspace.

## ADR-0012: Hero black hole — raw WebGL, no 3D dependency

- **Date**: 2026-08
- **Status**: Accepted
- **Context**: The landing hero needed to read as a "next-level AI product": a realistic 3D black hole with a lensed accretion disk and a true event horizon. Initial request also named "UI/UX pro" (not a real npm package) and a UI component kit.
- **Decision**: Render the black hole with **raw WebGL** (a hand-written vertex/fragment shader in `frontend/components/landing/BlackholeCanvas.tsx`) — no `three`, `@react-three/fiber`, or `@react-three/drei`. Photon paths are integrated with the standard bending acceleration `a = -1.5·h²·p/r⁵`; the event horizon swallows captured rays, disk crossings emit temperature-graded + Doppler-beamed light, and surviving rays sample a procedural starfield (producing the Einstein-ring arcs). Quality is governed by the existing `useVisualQuality` / `useMotionCapabilities` hooks: reduced/low tiers render a single static frame at low resolution and never loop. A WebGL-unavailable fallback paints a calm radial void.
- **Rationale**: A realistic black hole is a shader problem, not a Framer Motion problem; `framer-motion` is already installed (v13) and still drives the copy entrance + Magnetic CTAs, but cannot bend light. Three.js would add ~150 kB+ for a single fullscreen shader we fully control by hand. This honors the repo's "no dependency without justification" rule (see ADR-0007/0009) and keeps the client bundle lean.
- **Consequences**: Must be maintained as GLSL, not a scene-graph. If richer 3D surfaces (interactive 3D subjects, orbit controls) are needed later, revisit `three` + `react-three-fiber` behind a measured ADR. `KnowledgeField.tsx` is now unused by the hero but retained as a tested canvas utility.

## ADR-0013: Hero UI — keep the bespoke component system (no shadcn/Radix migration)

- **Date**: 2026-08
- **Status**: Accepted
- **Context**: The same request asked for "a UI component kit (e.g. shadcn/ui, Radix)". The repo already ships a bespoke, token-driven system (`Button`, `MotionText`, `Magnetic`, `AuroraOrb`, `KnowledgeField`) under `frontend/components/{ui,landing}` with Tailwind v4 tokens.
- **Decision**: Do **not** install shadcn/ui or a sweeping Radix migration. The black hole hero is built entirely from existing primitives. If a specific accessible primitive is later required (e.g. a focus-trapped dialog/popover the hero does not need), add the single `@radix-ui/react-*` package behind a targeted ADR rather than forking the whole system.
- **Rationale**: A full component-kit migration would duplicate the existing design language, risk breaking the established test contracts (`tests/LandingExperience.test.tsx`, etc.), and contradict the dependency-minimization rule. The chosen "raw WebGL, no deps" path already signals a preference for minimal dependencies.
- **Consequences**: Visual cohesion stays in one system; future primitive needs are incremental and justified.

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

## ADR-008: Dependency-Free Markdown Renderer for AI Responses

- **Date**: 2026-08
- **Status**: Accepted
- **Context**: AI chat replies contained raw Markdown asterisks (`**`, `****`) that rendered as broken
  text; a renderer was needed without adding a runtime dependency.
- **Decision**: A small custom renderer in `frontend/components/chat/Markdown.tsx` handles the
  Markdown subset models actually emit (bold, italic, code, fenced blocks, headings, lists,
  blockquotes, links, dividers) and strips decorative asterisk noise. `react-markdown`/`remark-gfm`
  were considered and rejected.
- **Rationale**: Keeps the client bundle lean (no ~40 kB dependency), full control over noise
  cleanup and theming, and avoids depending on an ecosystem package for a small, fixed feature set.
- **Consequences**: If richer Markdown (tables, task lists, footnotes) is ever required, migrate to
  `react-markdown` + `remark-gfm` behind the same `Markdown` component API.

## ADR-0007 — Rate limiting: interface-first, Redis prepared not installed (Phase 8)

**Decision.** Rate-limit state lives behind `RateLimitStore`
(`backend/infrastructure/cache/rate-limit-store.ts`). Default implementation is
in-process fixed-window (`rate-limit-memory.ts`), byte-compatible with the legacy
limiter. A Redis-compatible store (`rate-limit-redis.ts`) ships with an INJECTED
minimal client (`incr` + `pexpire`) — no vendor SDK dependency exists until adoption.

**Activation path** when distributed limits are required:
1. `npm i ioredis` (justified at that moment by a real multi-instance deployment).
2. In `infrastructure/cache/index.ts`, construct
   `new RedisRateLimitStore(new Redis(process.env.REDIS_URL))` when `REDIS_URL` is set.
3. Until then, setting `REDIS_URL` without the package throws a loud
   `CONFIGURATION_ERROR` — silent fallback to per-instance memory would make
   instances enforce different limits.

**Consequences.** Zero unused dependencies today; one-file activation tomorrow;
misconfiguration fails loudly instead of degrading silently. Daily AI quotas gain a
DB-authoritative backstop (`AIUsage` ledger) on memory stores, closing the
counters-die-on-deploy gap flagged in the scalability audit (B1).

## ADR-0009 — Distributed rate limiting activated (ioredis installed)

**Date**: 2026-08
**Status**: Accepted (supersedes the activation path in ADR-0007)
**Context**: Pre-launch audit found that per-process in-memory counters are
effectively unenforced on serverless (Vercel): every warm instance keeps its own
map, multiplying login brute-force and AI budgets by the instance count. The
Redis store existed behind an injected-client interface but was deliberately
unwired.
**Decision**: `ioredis` is now a runtime dependency. When `REDIS_URL` is set,
`infrastructure/cache/index.ts` constructs `RedisRateLimitStore` and wraps it in
a fail-open decorator: if Redis is unreachable, requests are allowed and the
failure is logged (`rate_limit_store_unavailable`) rather than 500-ing every
auth/AI endpoint. Without `REDIS_URL`, behavior is unchanged (in-memory store).
**Rationale**: Shared counters are required for limits to mean anything on a
multi-instance platform; failing open preserves availability during cache blips
while bcrypt cost, token revocation, and the DB-backed AI usage ledger still
protect the endpoints.
**Consequences**: One new runtime dependency, justified by launch security.
Operators MUST set `REDIS_URL` in production (e.g., Upstash) for rate limits to
be enforced across instances; the `.env.local.example` documents this. The
in-memory map remains for dev/test and single-instance self-hosting.
