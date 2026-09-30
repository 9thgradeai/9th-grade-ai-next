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
- **Status**: Superseded (see ADR-0014)
- **Context**: The landing hero needed to read as a "next-level AI product": a realistic 3D black hole with a lensed accretion disk and a true event horizon. Initial request also named "UI/UX pro" (not a real npm package) and a UI component kit.
- **Decision**: Render the black hole with **raw WebGL** (a hand-written vertex/fragment shader in `frontend/components/landing/BlackholeCanvas.tsx`) — no `three`, `@react-three/fiber`, or `@react-three/drei`. Photon paths are integrated with the standard bending acceleration `a = -1.5·h²·p/r⁵`; the event horizon swallows captured rays, disk crossings emit temperature-graded + Doppler-beamed light, and surviving rays sample a procedural starfield (producing the Einstein-ring arcs). Quality is governed by the existing `useVisualQuality` / `useMotionCapabilities` hooks: reduced/low tiers render a single static frame at low resolution and never loop. A WebGL-unavailable fallback paints a calm radial void.
- **Rationale**: A realistic black hole is a shader problem, not a Framer Motion problem; `framer-motion` is already installed (v13) and still drives the copy entrance + Magnetic CTAs, but cannot bend light. Three.js would add ~150 kB+ for a single fullscreen shader we fully control by hand. This honors the repo's "no dependency without justification" rule (see ADR-0007/0009) and keeps the client bundle lean.
- **Consequences**: Must be maintained as GLSL, not a scene-graph. If richer 3D surfaces (interactive 3D subjects, orbit controls) are needed later, revisit `three` + `react-three-fiber` behind a measured ADR. `KnowledgeField.tsx` is now unused by the hero but retained as a tested canvas utility.

## ADR-0014: Living Milky Way galaxy — Canvas2D procedural barred spiral

- **Date**: 2026-09
- **Status**: Accepted
- **Context**: The black hole hero (ADR-0012) was visually impressive but semantically disconnected from the product's "knowledge universe" metaphor. The brief called for a cinematic, physically convincing barred spiral galaxy (Milky Way-inspired) that communicates: real galaxy → alive motion → intelligent learning system, with the metaphor hidden beneath realism. The existing `KnowledgeField.tsx` (a neural-mesh particle field) was the starting point but suffered from visible network topology, synthetic particle feel, and rigid rotation.
- **Decision**: Refactor the hero visual into a **living barred spiral galaxy** using **Canvas2D only** (no Three.js, no WebGL shaders beyond Canvas2D). Implementation:
  - Procedural generation: bulge (boxy/peanut), central bar (ansae), 4 density-wave arms, exponential old disk, sparse halo, star-forming clusters.
  - Stellar populations with astrophysically inspired colors (warm bulge/bar, blue-white arms, gray-blue halo), realistic brightness distribution (66% dim, 18% medium, 13% bright, <3% luminous).
  - Dust lanes as dark alpha blobs on trailing edges; emission nebulae at star-forming clusters.
  - True 3D depth via camera inclination (~22°), perspective projection, depth-based size/alpha shading.
  - Differential rotation (inner fast, outer slow), local turbulence, slow density-wave phase evolution — no rigid rotation.
  - Cinematic 6.5s intro revealing the galaxy from core → arms → dust → nebulae.
  - Weak-spot events (dim → blue star-formation bloom → settle) and slow luminosity riders replace the old "progress dot."
  - Adaptive quality tiers (ultra/high/medium/low/static) with FPS governor that demotes at runtime.
  - Static SVG fallback for reduced motion / WebGL-unavailable.
- **Rationale**: Canvas2D with precomputed typed arrays, instanced sprite draws (`drawImage`), and a single RAF loop delivers 60 FPS on desktop / 45+ on mid-range / 30+ on low-end with 1500 stars + dust + nebulae. Zero per-frame allocations, no React state in the render loop, clean React ↔ renderer seam. No new dependencies — honors the dependency-minimization rule. The galaxy reads as astronomical photography, not a particle system.
- **Consequences**: `KnowledgeField.tsx` is now the React wrapper around `GalaxyRenderer` (new modules: `GalaxyGenerator`, `GalaxyMotion`, `GalaxyQuality`, `GalaxyFallback`, `StarField`, `DustField`, `GalaxyTypes`, `GalaxyRandom`). The old neural-mesh code is removed. `BlackholeCanvas.tsx` remains in the repo but is no longer used by the hero.

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

## ADR-0010 — SMTP+Resend transactional email transport (nodemailer)

**Date**: 2026-08
**Status**: Accepted
**Context**: Email verification was non-functional in production because the
`9th-grade-ai` Vercel project had no `RESEND_API_KEY` and no SMTP config, so
`hasEmailTransport()` returned `false` and every account auto-verified without
ever receiving a real confirmation email. The product needs a genuine, working
verification email path.
**Decision**: `backend/lib/email.ts` now resolves a transport by priority —
SMTP (when `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` are set via `nodemailer`),
else Resend (`RESEND_API_KEY`), else none. `hasEmailTransport()` reflects the
resolved transport. SMTP is preferred because a free Gmail App Password (or any
free provider) delivers real mail at $0 with **no custom domain**, unlike Resend
which needs a verified sending domain for production use.
**Rationale**: Email delivery is a hard infrastructure requirement that no
library-free code can satisfy; a $0, no-domain transport is the only way to get
real verification mail flowing without a paid plan or a custom domain. `nodemailer`
is pure-JS, dependency-free, and the de-facto Node SMTP standard.
**Consequences**: One new runtime dependency (`nodemailer`) + dev types, justified
by the launch requirement for working email verification. When no transport is
configured, the app keeps the documented auto-verify fallback so accounts are never
locked out. Operators must set SMTP (or `RESEND_API_KEY`) env vars for real delivery
— see `docs/EMAIL.md`.

## ADR-0011 — Bundle analyzer for performance instrumentation

**Date**: 2026-09
**Status**: Accepted
**Context**: The audit (docs/PERFORMANCE-OPTIMIZATION.md) found several large
unprofiled shared client chunks (196–245 KB) whose contents are unknown. Before any
chunk trimming or dependency surgery we need a way to see *what* ships in each chunk.
Webpack tooling is required only during analysis, not at runtime.
**Decision**: Add `@next/bundle-analyzer` as a **devDependency** (16.3.4, matching
Next 16.3.1) and wrap the existing `withPWA(...)` config so treemaps emit only when
`ANALYZE=true` (the existing `npm run analyze` script). Opt-in only.
**Rationale**: It is dev-only, zero runtime cost, and its output ("client.html" /
"edge.html" / "nodejs.html") is the source of truth for the §3 Phase 0 chunk-profile
and the §5 baseline table. It composes cleanly with next-pwa because it wraps the
final config object. Tying it to the existing `ANALYZE=true` env flag means normal
CI/prod builds are byte-identical to before.
**Consequences**: One dev-only dependency added; `.next/analyze/*.html` artifacts
are generated on analysis builds (gitignored, see §5 note). Reject the Perf-budget
CI gate and all chunk trimming until the baseline treemaps are captured.

## ADR-0012 — Committed client-JS perf-budget gate

**Date**: 2026-09
**Status**: Accepted
**Context**: ADR-0011 gave us bundle treemaps, and the Phase 0 plan requires a CI
gate so the initial-JS footprint can't silently regress. Sentry client (~285 KB
parsed / 92 KB gzip) and Next runtime (~663 KB / 198 KB) dominate the base floor,
but chunk content-hashes rotate every build, so gating on chunk *names* is fragile.
**Decision**: Add `scripts/perf-budget.ts` + `npm run perf:baseline` /
`npm run perf:check`. The gate parses `window.chartData` from the analyzer output
and fails (exit 1) on: (a) any tracked namespace (Sentry, framer-motion,
next-runtime, first-party) regressing >5% parsed vs the committed baseline,
(b) any single asset exceeding the 90 KB gzip ceiling, or (c) aggregate Sentry
gzip exceeding its 92 KB ceiling. The baseline lives in **committed**
`docs/perf/client-baseline.json` (not `.next/`, which is gitignored) so CI can
diff a fresh build against a reviewed reference rather than whatever it just made.
**Rationale**: Bucketing by stable module namespace survives hash rotation, keeps
the working data in the committed doc tree, and gives actionable gzip numbers.
Absolute ceilings stop the baseline being silently re-baselined upward; the
relative namespace check catches smaller, subtler regressions.
**Consequences**: One dev-only script + two npm scripts + a committed JSON
baseline. Operators must re-run `npm run perf:baseline` only on a deliberate,
reviewed footprint change — never to hide a regression. CI should run
`npm run perf:check` on the analyze build.

## ADR-0013 — Sentry client: error-monitoring only (drop replay + browser tracing)

**Date**: 2026-09
**Status**: Accepted
**Context**: The perf-budget baseline showed Sentry client at ~285 KB parsed /
92 KB gzip across chunks `93` (SDK core) and `4a7b0c69` (`@sentry/replay`, 121 KB
parsed / 38 KB gzip). The replay chunk was verified in the **eager preload set of
every route** (served HTML test on a static page) because `SentryClientProvider`
runs in the root layout — so 100% of users downloaded the session-replay runtime
even though only 10% of sessions were recorded (`replaysSessionSampleRate: 0.1`).
`browserTracingIntegration` additionally shipped browser-tracing/metrics
instrumentation (`browserMetrics`, `webVitalSpans`).
**Decision**: Trim `frontend/lib/sentry.tsx` to error-monitoring only:
- Remove `replayIntegration` + `replaysSessionSampleRate` /
  `replaysOnErrorSampleRate` (deletes the 121 KB replay runtime).
- Remove `browserTracingIntegration` + `tracesSampleRate` (deletes the browser
  tracing/metrics instrumentation).
- Remove the unused `onRouterTransitionStart` export.
- Keep `@sentry/nextjs` `Sentry.init` for error events + breadcrumbs + context;
  keep the `beforeSend` dev-gating.
Server-side HTTP tracing in `instrumentation.ts` is untouched (it adds zero
client-bundle cost) and still provides backend latency visibility.
**Rationale**: Session replay was the single largest removable blob on the initial
payload of every page, and replay is masked (`maskAllText`, `blockAllMedia`) so its
diagnostic value on this text-heavy dashboard is limited. Removing it cut the
Sentry client to **~156 KB parsed / 50.3 KB gzip (~45%)**, and the replay code was
verified absent from the built chunks afterward. Chosen as the **max trim** via
review (option: drop replay + tracing).
**Consequences**: No more session replay or per-route browser performance tracing /
web-vitals spans. Error monitoring, breadcrumbs, and app context remain. Re-enable
either feature deliberately if observability needs outweigh the ~121 KB replay /
~25-35 KB tracing per-page cost. Re-captured `docs/perf/client-baseline.json` and
wired `npm run perf:check` into CI (`.github/workflows/ci.yml` `perf` job) so the
gate now guards Sentry regressions on every push/PR.

## ADR-0014 — Wire perf-budget gate into CI

**Date**: 2026-09
**Status**: Accepted
**Context**: ADR-0012 created the gate but it only ran manually; nothing stopped a
Sentry/bundle regression landing on `main`.
**Decision**: Add a `perf` job to `.github/workflows/ci.yml` that builds with
`ANALYZE=true` (`npm run perf:check`) and fails on regression; it runs in parallel
with the existing `test` job and uploads the analyzer treemaps as an artifact on
failure for triage.
**Rationale**: The gate is cheap (one build) and the whole point of a committed
baseline is CI enforcement; a parallel job keeps it off the critical path of the
slower integration suite.
**Consequences**: Every push/PR to `main` now enforces the Sentry ceiling and
namespace regression tolerances automatically.

## ADR-0015 — Question-bank import gate + one-time cleanup sweep

**Date**: 2026-09
**Status**: Accepted
**Context**: The application database held 2,700 MCQs, of which a material share
were unusable: broken Unicode (visual-order / cluster-split Bengali from OCR,
replacement chars, mojibake, control chars), structurally invalid rows (<4
options, empty options, answers matching no option), and ~279 rows with no
explanation. A forensic audit (`scripts/qb-forensics/index.ts`) finally
quantified the damage, but there was no single, enforced rule for "may this MCQ
enter the database?" — the seeder and the BCS importer both had weak ad-hoc
checks, so a clean sweep would have been undone by the next reseed.
**Decision**:
- Introduce **`scripts/qb-forensics/import-gate.ts`** — one pure, side-effect free
  gate (`scanMca`) that is the single source of truth for importability. FATAL
  reasons reject a record outright (replacement char / mojibake / double-encoding
  / control chars / visual-order Bengali / mangled header / option-markers in
  options / <4 options / empty question-option-answer / answer matches no option /
  empty explanation, an explicit question-bank policy). NON-FATAL issues (non-NFC
  composition, non-standard spaces, BOM) are auto-normalized and the record is
  imported using the normalized content. ZWJ/ZWNJ are preserved.
- **Wire the gate into every import path so reseeds can never re-add removed
  content**: `scripts/seed-questions.ts` (subject-wise corpus) and
  `scripts/import-bcs-exams.ts` (BCS JSON, which carries explanations on all
  120 records). Both also enforce a **GLOBAL duplicate identity** — normalized
  (question | correctAnswer | explanation) — across the whole database, skipping
  would-be INSERTs that collide while refreshing existing rows in place.
- **`scripts/clean-broken-questions.ts`** sweeps the live database with the same
  gate: dry-run by default (writes `scripts/qb-forensics/artifacts/cleanup-plan.*`),
  `--yes` = pg_dump backup (reuses `backupDatabase`) + transactional deleteMany,
  `--verify` = post-clean invariant check. Removal reasons: UNICODE_CORRUPTION,
  STRUCTURAL_BROKEN, EMPTY_EXPLANATION, DUPLICATE (oldest row kept). Deletes
  cascade to Bookmarks / UserQuestionProgress and SetNull on QuestionAttempt
  (both verified against `schema.prisma`).
- **Raw corpus stays untouched**: `database/data/ques/*.txt` and
  `bcs_questions.json` are sources, not sinks — the DB + seed guard is the
  authoritative, clean layer.
**Rationale**: The gate is deliberately shared so "forensic classification",
"cleanup decision", and "import policy" can never drift apart. Running the
corruption checks against fully *normalized* field values (BOM / NBSP /
composition applied first) means harmless file artifacts are salvaged while true
corruption still fails.
**Consequences**: Gate-on-reseed is idempotent with the cleanup: the sweep
removes 293 rows (2,700 → 2,407); future reseeds hold the line, rejecting any
returning broken MCQ and silently skipping global duplicates. `npm run db:seed`
/ `db:seed-questions` now log rejected counts per source. Also fixed a latent
bug: `hasNonStandardSpace` used a stateful `/g` regex, so boolean checks now use
a non-global copy in `scripts/qb-forensics/unicode.ts`.

Addendum (2026-09): two gate extensions made while importing the Bangla
Grammar **সমাস** folder file (`database/data/ques/বাংলা ভাষা ও সাহিত্য/ভাষা/সমাস/`):
- **`FOREIGN_SCRIPT`** (fatal): rejects glyphs from sibling Indic scripts
  (Devanagari/Gurmukhi/Tamil/etc.) smuggled into Bangla text — the OCR
  glyph-substitution mode that passes `VISUAL_ORDER_BANGLA` (e.g. Devanagari
  क ि inside "কোकिलकণ্ঠী" and Sinhala න substituting for Bangla ন). The shared
  daṇḍa "।" and script digits are excluded — they legitimately appear in Bangla.
- **English `Ans.` answer marker** + **strict letter resolution**: the shared
  parser now accepts `Ans.` alongside `উত্তর:` (case-insensitive), and a
  letter-answer only resolves to its option when it unambiguously points at one
  (bare letter, or a remainder that IS the option). Multi-answer / contradictory
  answers ("ক,গ (উভয়ই)", "খ বা ঘ. …") are kept raw and rejected by
  `ANSWER_MISMATCH` instead of silently forcing a wrong option.

## ADR-0xx: KaTeX for book-exact math rendering (Math MCQs)

- **Date**: 2026-09-28
- **Status**: Accepted
- **Context**: Math MCQs (BCS database/data/ques/Math/*.txt, Bank database/data/Bank/Math/*.docx with OMML equations) were linearized to Unicode plain text and rendered as plain text. Readable but not book-exact: stacked fractions, roots, superscripts lost print layout.
- **Decision**: Store real math as inline LaTeX ($...$) and render with katex. New MathText/RichText renders $...$ via katex.renderToString({ throwOnError: false }); OMML converts to LaTeX (m:f -> frac, m:sSup -> ^{}, m:rad -> sqrt); legacy Unicode math migrated by scripts/qb-forensics/unicode-math-to-latex.ts.
- **Rationale**: KaTeX is dependency-light, SSR-safe (string render), offline-capable, accessible, keeps questions searchable — unlike equation screenshots. Alternatives rejected: MathJax (heavier, slower), images (not searchable, blurry, manual work).
- **Consequences**: katex + katex.min.css ship to client bundle; LaTeX re-imports upsert by existing sourceKeys (reversible).

## ADR-0xx: Single canonical math pipeline (production math typesetting)

- **Date**: 2026-09-29
- **Status**: Accepted
- **Context**: The KaTeX ADR above left conversion logic scattered: the core
  converter lived in `scripts/qb-forensics/unicode-math-to-latex.ts` (imported
  ad-hoc by seed/import scripts), AI output passed through raw, `MathText`
  handled only `$...$`, and no validation or preservation checking existed.
- **Decision**: One canonical layer — `frontend/lib/math/canonical-math.ts`
  (pure, client+server safe) fronted server-side by `backend/services/math.ts`.
  Contract: `$...$` inline + `$$...$$` display LaTeX; Unicode accepted as input,
  never as storage. All ingestion (seed-math, import-bank-math-indices,
  upgrade-math-to-latex, AI validation in `backend/ai/validation/outputs.ts`,
  manual/admin) converges here. Strict rules: never auto-fraction ambiguous
  `a/b`, never store escaped/triple/nested delimiters, preservation failures
  (`LOST_*`) reject the row instead of persisting silently. No new dependencies
  (reuses `katex`, existing converter core).
- **Rationale**: A single boundary makes math idempotent, testable, and
  future-proof (DOCX/TXT/AI/manual all share normalize → validate → preserve →
  MCQ-check). Pure module avoids client/server duplication without leaking
  secrets (`backend/services/math.ts` intentionally omits `server-only` so tsx
  scripts can reuse it).
- **Consequences**: Migration dry-run on 2026-09-29: 2292 Math rows scanned,
  38 converted, 0 rejected. `MathText` renders `$$...$$` display blocks with
  `data-math-error` diagnostics; textbook KaTeX styling lives once in
  `app/globals.css`. Tests: `tests/math-canonical.test.ts` (44),
  `tests/math-visual-fixture.test.tsx` (19).

## ADR-0xx: Book-style fractions + corruption healing (math migration II)

- **Date**: 2026-09-29
- **Status**: Accepted
- **Context**: After the canonical pipeline, ~700 Math rows still showed inline
  `a/b` prose fractions and ~90 fields carried legacy span corruption
  (`($..$)^{n}$` splits, `√[..]` brackets, `log\_x`, vulgar `½`, `³ᐟ₂`,
  `textbackslash` artifacts), rendering as flat text instead of book equations.
- **Decision**: Extended the canonical layer with deterministic-only repairs:
  number/number and explicitly-grouped fractions stack to `\frac`
  (word/word alternatives, dates, fiscal years, `1/2x`, `a/b+c` never convert);
  frozen span splits fuse; `log` binding is preserved (`log 5/(…)` →
  `$\frac{\log 5}{…}$`, never `log·(…)`); Bengali-word/`π` bases wrap in
  equation context; preservation checker accounts consumed slashes/parens.
  Triage-driven: every new rule was proven by DB sampling; 10 over-eager rows
  were restored from backup and the rule narrowed (never delete `$`s).
- **Consequences**: 2292/2292 rows canonical and fixpoint-clean (re-run = 0
  changes), 0 rows rejected, 0 regressions introduced (backup-verified).
  Exactly 1 row (id 39242, nested `[$\log_{2}$(x - $2)]^{2}$`) remains for
  manual review — deleting `$`s there would destroy information. Practice tab
  and all surfaces render the healed equations via the shared
  RichText → MathText → KaTeX chain with no per-page changes.

## ADR-0xx: Algebraic fractions, logs, span-fractions (math migration III)

- **Date**: 2026-09-29
- **Status**: Accepted
- **Context**: Practice-tab equations still showed inline divisions
  (`(80 × 100) / 125`, `x / 19`, `($R^{2}$/100)%`, `$A_{4}$/$A_{2}$`,
  `1/$x^{3}$`, bare `log 5`) because the year guard counted total digits,
  letter operands needed `=`, span-adjacent slashes were unreachable after
  span splitting, and bare logs had no rules.
- **Decision**: Year guard matches only contiguous 19xx/20xx runs (bypassed
  when `= number` follows: `২০২৮/১৬৯ = ১২`); decimal tokens supported;
  equation letter/number (`x/19`), single-letter/number without `=`
  (`x / 19`), span-adjacent (`$x^{2}$/y`, `$A$/$B$`), and in-span `π`
  fractions stack; caret adjacency aborts (`x^2/y` via caret-then-span);
  bare `log`/`ln` upright with complete arguments only (`log table`,
  `log on`, `catalog`, `Mr./X`, `Q2/3` never match); quoted `'x/z'` left raw.
  Two live bugs fixed mid-pass: prose absorption into groups and nested-slash
  doubling (overlap guard), both proven by DB audit before apply.
- **Consequences**: +340 rows healed this pass; corpus-wide triage holds at
  exactly 1 manual-review row (id 39242) with 0 introduced regressions.
  Practice tab serves the healed text verbatim via `/api/questions`
  (2-minute query cache only) through RichText → MathText → KaTeX.

## ADR-0xx: Bare-equation wrapping (math migration IV)

- **Date**: 2026-09-29
- **Status**: Accepted
- **Context**: Topic audit showed 417 BCS rows with `=` but zero `$` spans —
  plain arithmetic (`৩x + ২x = ৯০`, `৫ = ৬(১)-১`) the pipeline decorated
  around but never wrapped, so KaTeX never typeset it. Practice tab showed a
  mix of textbook equations and flat prose arithmetic.
- **Decision**: Conservative `wrapMathExpressions` as the final pipeline
  stage: wrap chunks containing `=`/`⇒`/`∴` built only from math tokens
  (Bengali letters always break chunks, so pure-Bengali equalities stay
  prose); balanced brackets required with edge punctuation preserved outside
  (never split `৬(১)` juxtaposition, never drop `(`/`:`); both `=` sides
  non-empty with empty-left retry; KaTeX-safe symbol mapping
  (`=>`→`\Rightarrow`, `%`→`\%`, …); newlines folded (renderer treats them
  as span boundaries); trailing-dangling-`=` and incomplete-arrow guards.
  Two live defects fixed mid-pass from DB evidence: `$$`-merge mispairing
  (fuse directly instead) and `=>`-heavy rows tripping preservation (arrows
  counted as kept equality).
- **Consequences**: +1470 rows healed this pass; math-span coverage BCS
  1292→1728 of 1944, Bank 348 total → 298 with math. Corpus triage: exactly
  1 manual-review row (id 39242), 0 introduced, 0 rejected, fixpoint-clean.

## ADR-0xx: Bank Math + expression segmentation (math migration V)

- **Date**: 2026-09-29
- **Status**: Accepted
- **Context**: Bank `03_Mathematics` had 50 equation-bearing rows without spans
  (`2(6+x) = 20`, `x + (x+10)+... = ...`), blocked because English context
  words (`Now,`, `gain`, `price`) vetoed whole chunks; plus a contamination
  finding: most of the 148 `(no path)` Bank rows are non-math questions
  (poets, Nobel, idioms) misfiled under Mathematics.
- **Decision**: Segment prose on Bengali runs + 3+ Latin runs before chunking
  (words pass through, equations convert); stoplist for 2-letter words and
  titles (`of`, `Mr.`); `।?!` boundary punctuation; quoted/whole-part rules
  unchanged. Contaminated non-math rows left untouched (taxonomy fix is a
  separate task — no equations exist to convert).
- **Consequences**: Bank 306/348 with math (Indices 200/200); remaining 42
  verified trigger-free pure prose. Corpus: 1 manual row (id 39242),
  0 introduced, 0 rejected, fixpoint-clean.

## ADR-026: quickNormalize Lightweight Helper for New Inputs

- **Date**: 2026-09-29
- **Status**: Accepted
- **Context**: New BCS/Bank Math questions entered via admin forms, AI route
  responses, or file imports may contain Unicode math (x², √x, x₁) that the
  canonical pipeline (`normalizeMathContent`) would fully handle — but calling
  the full pipeline from every save path adds import complexity and testing
  surface. A lightweight helper that covers the most common cases is sufficient
  as a pre-validation pass-through before storage.
- **Decision**: Add `frontend/lib/math/quick-normalize.ts` — `quickNormalize()`
  — a pure, dependency-free function that converts Unicode superscripts (²–⁹, ⁿ),
  subscripts (₀–₉), and Unicode root characters (√, ∛, ∜) to `$...$`-wrapped
  LaTeX, while protecting already-canonical `$...$` / `$$...$$` spans and
  returning everything else byte-identical.
- **Rationale**:
  - Zero deps; safe to import in both client and server contexts.
  - Idempotent by design: `quickNormalize(quickNormalize(x)) === quickNormalize(x)`.
  - Does NOT replace `canonical-math.ts` for ingestion pipelines — it is a
    fast pre-pass that reduces obvious Unicode noise before the full pipeline.
- **Consequences**: Admins and import adapters gain a one-liner sanitizer.
  Any edge-case math not covered falls through to canonical-math (no regression risk).

## ADR-027: LLM-Powered One-Time Math Migration Script

- **Date**: 2026-09-29
- **Status**: Accepted
- **Context**: `upgrade-math-to-latex.ts` handles rule-based Unicode → LaTeX
  conversion, but cannot recover complex legacy cases like bare fractions,
  mixed notation, or corrupted OCR output. An LLM batch pass is the pragmatic
  80/20 solution for the remaining hard cases.
- **Decision**: Add `scripts/migrate-math-llm.ts` that:
  1. Fetches BCS and Bank Math question rows, skips already-canonical ones.
  2. Sends batches of 10 to Claude (claude-haiku-4-5) with a strict JSON-only
     system prompt to convert Unicode math to `$...$` LaTeX.
  3. Applies a preservation guard (Bengali + Latin word set must survive).
  4. Writes back only text fields (question/options/correctAnswer/explanation).
  5. Supports `--dry-run` and `--limit=N` for incremental testing.
- **Rationale**: Claude Haiku is cheap and accurate for this JSON transform.
  Preservation guard prevents silent data corruption. Existing rule-based
  `upgrade-math-to-latex.ts` remains the canonical path; this is supplementary.
- **Consequences**: Requires `ANTHROPIC_API_KEY` at run time (script-only,
  never in the client bundle). One-time operation; subsequent reseeds preserve
  migrated LaTeX via sourceKey matching.

## ADR-028: Book-exact math everywhere — heal, gate, render (screen + PDF)

- **Date**: 2026-09-30
- **Status**: Accepted
- **Context**: KaTeX typesetting existed (ADR-0xx series), but three gaps kept
  math from matching book quality: (1) legacy corpus rows still carried
  raw/Unicode TeX (`\%`, `🡆`, `log_(...)`, bare `\frac{}` outside math mode);
  (2) the import gate allowed literal LaTeX through with no math checks; (3)
  many surfaces (Markdown chat, mock-test/explanation tabs, PDF export) printed
  `$...$` as plain text.
- **Decision** — three coordinated layers:
  1. **Heal (one-time, reversible)** — `scripts/latex-heal/shared.ts`
     classifies every Question/Quiz/Mock row as CLEAN/HEALED/REVIEW with a row
     invariant (`correctAnswer ∈ options`); `repairLatexArtifacts` gained a
     `(1010)₂`-style subscript-paren rule. `scripts/audit-latex.ts` (read-only)
     and `scripts/heal-latex-artifacts.ts` (dry-run default, `--apply`) run
     under `npm run math:audit|math:heal|math:heal:apply`. Writes go through
     one transaction (10 min timeout) after a `pg_dump` ≥18 backup into
     gitignored `backups/`, then re-audit to a fixpoint (exit 1 if HEALED > 0).
     REVIEW rows are never modified. **Result: 1,243 rows / 2,850 fields healed
     to a fixpoint (`clean=13013, healed=0`); 33 REVIEW rows left for manual
     data fixes** (currency `$`, garbled OCR, invariant breaks).
  2. **Gate (every future import)** — `import-gate.ts` gained
     `MATH_LITERAL_LATEX`, `MATH_UNBALANCED_DOLLAR`, `MATH_KATEX_ERROR` codes;
     `normalizeMca` runs `normalizeMathContent` on every field so imports land
     canonical. Odd `$` is fatal only when LaTeX evidence exists (currency-safe,
     non-fatal warning otherwise). `katex`-validates every span.
  3. **Render (all surfaces)** — `Markdown` gained an atomic `$...$` handler
     (before `*`/`_`, so emphasis can never split a span); plain-text sites in
     AIMockTestTab, MockTestTab, CustomExamTab, DailyQuizWidget,
     WrongAnswerNotebookTab, AIExplanationButton, QuestionDrill and
     AISolverTab now render via `RichText`; truncation uses the new
     `truncateMathSafe()` (never cuts inside a span). PDF export renders
     server-side KaTeX (`backend/services/pdf/mathHtml.ts`) and inlines
     `katex.min.css` with woff2 fonts as data URIs — required because the
     renderer's `page.setContent` runs on about:blank where no relative
     assets load.
- **Rationale**: one repair stage + one gate + one renderer keeps math
  consistent between screen, import, and print; every layer degrades to escaped
  literal text instead of failing (`throwOnError: false`).
- **Consequences**: exports grow ~400 KB (inlined KaTeX fonts, cached per
  process). Corpus holds 33 known-broken REVIEW rows awaiting manual fix.
  Tests: `math-canonical` (129), `qb-import-gate` (48), `math-html` (16),
  `MarkdownMath` (6), `RichText` (12). Real-Chromium PDF tests remain
  excluded from CI (`@sparticuz/chromium` is Linux-only; the HTML pipeline is
  covered with a mocked Chromium instead).

## ADR-029: Math read-path safety net + root/fraction repair (Practice-Tab parity)

- **Date**: 2026-09-30
- **Status**: Accepted
- **Context**: After ADR-028, the Practice Tab still showed raw equations on
  math MCQs while the same content looked book-exact in source files. Root
  cause: one renderer (`RichText → MathSpans → KaTeX`) only typesets `$...$`
  spans, but ~70% of math rows stored raw Unicode with no `$`, and the
  canonical pipeline refused three systematic shapes: `√3/2` (fraction pass
  stranded `√` outside its own `$\frac$`), nested radicals (inner `$` spans
  split segments and froze outer roots), and `√দয়` etymology markers (false
  LOST_ROOT/RAW_UNICODE_MATH).
- **Decision** — two coordinated layers:
  1. **Repair (pipeline)** — `unicode-math-to-latex.ts` converts `√num/den`
     to frac-of-root before plain radicals and resolves `√(…)` groups with
     a balanced-paren scanner (arbitrary depth, one pass); `fracSegment`
     skips `/` glued to `√`; `fuseSpanSplits` repairs stored
     `√$\frac{a}{b}$`; validation/preservation exempt √+Bengali-letter
     prose and count `√(` openers for nesting. 5 further rows healed to a
     fixpoint (`clean=13010, healed=0`); 26 genuinely-broken REVIEW rows
     (currency `$`, double superscripts, shattered spans) stay manual.
  2. **Safety net (every read)** — `toQuestionDTO` maps all free-text fields
     through `normalizeFieldForDisplay`, which returns the normalized form
     only when validation + preservation + KaTeX-throwOnError all pass,
     else the source byte-identical. Deterministic per string, so
     answer-in-options survives; DB never written on read; query cache
     absorbs the per-field cost.
- **Consequences**: Practice Tab renders book-exact math even for rows no
  importer ever normalized; future imports remain gated (ADR-028).
  Tests: `math-canonical` (+7 root/fraction cases), new
  `display-normalization` (7: normalizer gates + DTO mapping).

## ADR-030: Gate every question-text writer (Phase 3)

- **Date**: 2026-09-30
- **Status**: Accepted
- **Context**: ADR-029 repaired the pipeline and the read path, but two
  writer scripts (`import-bank-ict.ts`, `import-bcs-mental.ts`) still wrote
  raw parsed text with no gate, and `migrate-math-llm.ts` wrote raw LLM
  output behind only a text-divergence guard. Any rerun could land
  un-normalized math back in the DB.
- **Decision**:
  1. Both importers now run each record through `scanMca` and write
     `gate.normalized` fields; REJECTs are skipped + warned (same contract
     as the Bank-math importers). `sourceKey` stays on the RAW stem so
     reruns still match existing rows (no duplicates). Offline validation:
     ICT 1395/1395 accept, Mental 985/995 (10 pre-existing
     DUPLICATE_OPTION rows now refused; their DB rows are left untouched).
  2. `migrate-math-llm.ts` runs every LLM record through `scanMca` before
     writing and stores `gate.normalized`; REJECTs join `needsReview`
     (AI output never trusted, per AI Rules).
  3. New `tests/qb-import-gate-coverage.test.ts`: every script writing
     Question text must reference a gate marker, else be allowlisted with a
     documented non-text reason (option reorder, taxonomy moves, bcsTerm
     metadata, fix-engine invariants, deletes).
- **Consequences**: no writer can introduce un-normalized math; the test
  fails loudly if a future script adds an ungated write.

## ADR-031: Bind a linear superscript to the fraction denominator

- **Date**: 2026-09-30
- **Status**: Accepted
- **Context**: `FRAC_TOKEN` (the `\frac` operand scanner) covered letters,
  digits and `π`, but not Unicode superscript glyphs. For `1/x²` the
  denominator scan therefore stopped at `x`, leaving the `²` outside the
  `\frac` span; `mergeAdjacentSpans` then re-absorbed it as
  `\frac{1}{x}^{2}`, which renders as `(1/x)²` instead of `1/(x²)`. Every
  reciprocal-power MCQ in the বীজগাণিতিক corpus was affected. The DB was
  already healed by hand, so the defect was invisible until a re-import
  regenerated the broken form.
- **Decision**:
  1. `fracRight` now absorbs a trailing true-superscript run into the
     operand, so `1/x²` becomes `\frac{1}{x²}` and `unicodeMathToLatex`
     renders `\frac{1}{x^{2}}`.
  2. Eligibility guards (`bothNumbers`, `yearGuard`, `piRule`, `mathRule`,
     `digitRule`) evaluate `rightBase` — the operand minus its exponent — so
     absorbing the run cannot change which divisions are considered
     unambiguous. Prose guards are untouched: `Mr./X`, `cats/dogs`,
     `2024/25` still never convert.
  3. Numerator-side superscripts already resolved correctly via a later
     pass (`x²/y²` -> `\frac{x^{2}}{y^{2}}`); that path is unchanged and
     pinned by tests.
- **Consequences**: reciprocal powers render book-exact and a future
  re-import no longer regenerates the broken form. Regression cases live in
  `tests/math-canonical.test.ts` (6 added), including a blanket assertion
  that no `\frac{…}` is ever followed by a stranded `^{`.

## ADR-032: Repair the বীজগাণিতিক corpus in place, never re-import

- **Date**: 2026-09-30
- **Status**: Accepted
- **Context**: `Questions(বীজগাণিতিক_সূত্রাবলি ও বহুপদী_উৎপাদক).txt` parsed
  to 201 blocks (Q70 and Q94 each appeared twice) and carried LLM
  self-talk, a wrong key for Q56 (99 instead of 63), an unsatisfiable Q94
  stem, and a Q125 key that pointed at a meta-option instead of a value.
  A delete-and-reimport was rejected: it would have dropped 42 rows whose
  stored LaTeX had been hand-healed, and destroyed 4 `QuestionAttempt`
  rows via cascade.
- **Decision**: fix the `.txt` source of truth (200 contiguous blocks,
  1–200, no duplicates) and repair only the affected DB rows, with
  `normalizeMcqFields` applied so stored text matches what a re-import
  would produce. Q70's broken duplicate (id 36008) was deleted; its
  corrected twin (36009) kept. IDs 29661 (AP) and 29662 (Pythagoras) were
  re-pointed to `Part_03_সূচক_ও_ধারা/সমান্তর_অনুক্রম_ও_ধারা` and
  `Part_04_জ্যামিতি/পিথাগোরাসের_উপপাদ্য` instead of being deleted, keeping
  their attempts. `sourceKey` was recomputed for the one row whose stem
  changed. Full pre-repair snapshot:
  `database/backups/bcj-alg-factorisation-pre-repair.json`.
- **Consequences**: 199 target rows, all 4 attempts preserved, zero
  key/option mismatches and zero stranded exponents in the target set.

## ADR-033: `correctAnswer` holds option TEXT, not a letter

- **Date**: 2026-09-30
- **Status**: Accepted
- **Context**: repair work nearly wrote letters (`"B"`) into
  `Question.correctAnswer`. The column stores the resolved option *string*
  (the seeder runs `resolveAnswerToOption(answerRaw, options)` first), so
  a letter would match nothing and silently mark every answer wrong.
- **Decision**: repairs always resolve the letter against the option list
  and assert post-normalization that the stored key still matches an option
  before writing; abort otherwise. Use `Question.correctAnswer`, never
  `Question.answer`, in any inspection or repair script.
- **Consequences**: the key/option invariant is checked, not assumed. One
  pre-existing violation remains in subject 608 — id 36163
  (`log_(b)(m)` vs option `$\log_{b}{(m)}$`), reproduced from
  `Questions(সূচক ও লগারিদম)_9Th-Grade AI.txt` and left untouched as
  out of scope; it needs a source fix, not a DB-only patch.
