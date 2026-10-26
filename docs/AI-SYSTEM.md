# AI System

The AI system is a real, authenticated, provider-abstracted layer behind the Tutor, Solver, Assistant, and the autonomous Daily Current Affairs agent. All business logic lives in `backend/ai/` (the domain seam); route handlers in `app/api/ai/*` stay thin.

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
| `POST /api/ai/explain` | required | Post-exam MCQ explanation (`{ correctAnswerExplanation, whyOthersWrong[], keyDefinitions[], relatedConcepts, examTip }`). The system prompt carries an episodic topic-history block (attempts/accuracy/open mistakes on that exact topic from `UserQuestionProgress`, fail-open) so repeat struggles get misconception-level teaching |
| `POST /api/ai/explain-v2` | required | **Independent, evidence-audited** MCQ verification (`MCQExplanation`). The client sends only `questionId`, its own selection, and the display order; the stored key is read server-side after the finding exists and is audited, never solved from. Falls back to the legacy explanation when disabled or unavailable (see below) |
| `POST /api/ai/assistant` | required | Structured study guidance (`{ reply, suggestedActions }`) |
| `POST /api/ai/evaluate` | required | Answer evaluator: grade a learner's written answer (`{ score, verdict, strengths[], gaps[], modelAnswer, improvementTips[] }`), grounded on the curated question bank when `questionId` is supplied |
| `POST /api/ai/mock-test` | required | AI mock-test generator: produce N multiple-choice questions (`{ title, questions:[{ id, question, options[], answer, explanation, topic, difficulty }] }`) for a subject/exam. Accepts optional `topics` (max 5 `"Subject → Topic"` labels, e.g. from `/api/weak-topics`) — at least half the questions focus on those weak topics; included in the response-cache key |
| `POST /api/ai/advisor` | required | Career/exam advisor: personalized target + study plan (`{ summary, recommendedExam, focusAreas[], timelineWeeks, weeklyPlan[], tips[] }`) from the learner profile |
| `GET /api/ai/student-model` | required | Long-term student model: aggregated goals, language, weak/strong topics (from `AIMemory`) + usage counts |
| `GET /api/ai/usage/summary` | required | Observability: per-caller AI usage (`totalCalls`, `totalCostUsd`, `successRate`, `avgLatencyMs`, `byProvider`, `byDay`) — no prompt content stored |
| `GET/POST /api/ai/conversations` | required | List / create conversation threads |
| `GET/PATCH/DELETE /api/ai/conversations/:id` | required | Read / rename / pin / delete one conversation (ownership-checked) |
| `POST /api/ai/agent` | required | **Study coach** — bounded, tool-using agent loop. SSE events: `agent.started`, `agent.status`, `tool.started`, `tool.completed`, `message.delta`, `block.created`, `agent.completed` (with `latencyMs`), `agent.error` |
| `POST /api/ai/feedback` | required | Record HELPFUL / NOT_HELPFUL feedback on a message |
| `GET /api/cron/daily-current-affairs` | cron secret | Triggers the Daily Current Affairs agent (see below) — not a user endpoint |

Response headers: `X-AI-Source` (`groq` | `anthropic` | `mock`), `X-Conversation-Id`, `X-AI-Intent`, `X-AI-Model`.


## Independent MCQ verification (`explain-v2`)

`frontend/components/dashboard/AIExplanationButton.tsx` tries `POST /api/ai/explain-v2` after a practice answer is submitted. Every failure is recoverable: the UI falls back to the legacy `/api/ai/explain` response, rendered with a visible **“যাচাইকৃত নয় · unverified”** banner. The v2 response renders through `frontend/components/dashboard/ai/VerifiedExplanation.tsx`.

### Trust boundary (staged)

```
server snapshot (no key) → evidence (untrusted) → solver (no key)
  → second-pass verifier (no key) → database-key audit (key read HERE) → contract
```

1. **Snapshot** (`backend/ai/explain-engine/canonical-snapshot.ts`) — loads only non-answer-revealing Prisma columns (`id`, question, options, context). Option IDs are server-derived and stable (`q{id}_o{index}`); `questionVersion` and `contentHash` are content-addressed. The client's `displayOptions` must be a permutation of the stored options (session shuffling is allowed; substituted text is rejected). Bangla/English/Unicode/math text is preserved exactly; NFC is used only for comparisons and NFKC is never applied.
2. **Evidence** (`evidence/`) — Tavily structured search. URLs are validated syntactically (`url-policy.ts`) and never fetched server-side, so there is no SSRF surface; reachability is never claimed. Snippets are fenced and instruction-like text is defanged. Search failure (`FAILED`), no results (`NO_RESULTS`) and unavailability (`UNAVAILABLE`) are operational states, never evidence against an option.
3. **Solver** (`solver/independent-solver.ts`) — receives a strict allowlist payload: question, options, non-answer context, validated evidence. It never receives `correctAnswer`, `correctAnswers`, the stored explanation, the student's answer, or prior AI output. Zod + semantic validation require exactly one verdict per original option and bounded repair (max 2 attempts, 25 s).
4. **Verifier** (`verify/verifier.ts`) — a second, preferably different, provider checks the finding. Agreement raises confidence; disagreement forces `INCONCLUSIVE` rather than picking a winner. A second LLM pass is a contradiction detector, not ground truth.
5. **Audit** (`audit/database-audit.ts`) — reads the stored key only after the finding exists, maps key text/label/index to canonical option IDs without guessing, and records overlapping findings. It never mutates the question, the completed attempt, or a historical score.

### Response contract

`backend/ai/explain-engine/schema/types.ts` is the single Zod contract used by the solver, verifier, cache validation, API response, and UI. Key fields:

- `questionValidity`: `VALID_SINGLE_ANSWER | VALID_MULTIPLE_ANSWERS | NO_CORRECT_OPTION | AMBIGUOUS | INCOMPLETE_OR_MALFORMED | OUTDATED_OR_CONTEXT_DEPENDENT | INCONCLUSIVE`.
- `verificationStatus`: `EVIDENCE_VERIFIED | INDEPENDENTLY_VERIFIED | PARTIALLY_VERIFIED | INCONCLUSIVE | NOT_VERIFIED | PROVIDER_FAILED`. `EVIDENCE_VERIFIED` is accepted only with a successful search and at least one validated source.
- `databaseAuditStatus`: `NOT_AUDITED | AGREES | KEY_MISMATCH | INVALID_QUESTION | MULTIPLE_ANSWERS | AMBIGUOUS_QUESTION | CONTEXT_OR_DATE_MISMATCH | INCONCLUSIVE`.
- `studentResult` is **always** computed against the original stored key (all-or-nothing set equality, matching the exam engine) with `studentResultBasis: "DATABASE_KEY"`. `independentStudentResult` is a separate counterfactual.
- `acceptedOptionIds`, `optionsAnalysis` (exactly four for a structurally valid MCQ), `correctedAnswer` (only on a discrepancy), `evidence.records` (IDs only; citations must exist), `limitations`, and provenance metadata.
- Every evidence reference in `optionsAnalysis` must exist in `evidence.records`; unknown IDs are dropped by the orchestrator and reported as limitations.

### Cache, dedup, rollout

- Findings are cached by content version + policy + schema + prompt version + provider set + search mode. Question-level findings contain no student data; per-student results are recomputed. Evidence searches have their own short TTL (45 min current affairs, 6 h general).
- Logical freshness is carried in `expiresAt`; the physical cache TTL is 24 h.
- Concurrent identical requests are deduplicated per user.
- Audit findings are persisted best-effort to `AuditLog` with `action: "mcq_verification_audit"`; the stored key is represented only by `keyHash` (SHA-256), never as text.
- Feature flag: `AI_EXPLAIN_V2_ENABLED` defaults **on**; set `0`/`false`/`off`/`no`/`disabled` to disable. Disabled or failed v2 responses fall back to the legacy, explicitly unverified explanation.
- Operational failures return `502 AI_VERIFICATION_UNAVAILABLE`; malformed requests return `400 VALIDATION_ERROR`; unauthenticated requests return `401`. The route is auth- and quota-gated and rejects cross-origin POSTs.

### Known limitations

- Semantic answer accuracy is not measured by unit tests; tests assert the trust boundary, schema invariants, audit mapping, score immutability, Unicode preservation, URL policy, and failure modes.
- Practice attempts are client-persisted, so `attemptId` is informational; there is no server-side attempt-ownership check.
- Without a configured search key, results are `PARTIALLY_VERIFIED`/`INDEPENDENTLY_VERIFIED` at best, never `EVIDENCE_VERIFIED`.
- No automatic key correction is performed. Discrepancies require human review.

Tests: `tests/ai/explain-engine.test.ts` (engine, audit, evidence, Unicode, contract) and `tests/ai/explain-v2.route.test.ts` (auth, flag, validation, CSRF, headers, provider failure).

## Daily Current Affairs Agent (`backend/ai/current-affairs.ts`)

Autonomous, zero-hallucination pipeline behind the dashboard's Current Affairs tab, published idempotently once per day by `GET /api/cron/daily-current-affairs` (CRON_SECRET-gated, `?date=YYYY-MM-DD` override).

1. **Search** — `searchNews(query)` queries Tavily's REST API (`TAVILY_API_KEY`, news topic, past-week `time_range`, 3 results per beat across 4 English + 2 Bangla queries covering Bangladesh affairs, economy/policy, appointments/awards/sports/sci-tech, and international impact), capped at 12 total hits with 500-char snippets so input + output stays inside Groq's per-minute token budget (the old 6×6×900 grounding 413'd every generation). When Tavily is unconfigured or returns nothing, `fetchRssHits()` falls back to keyless news RSS feeds (Daily Star, Dhaka Tribune, Al Jazeera, BBC World Asia), filtered to Bangladesh/exam-relevant beats — every fallback hit carries its real article URL so citation grounding works unchanged.
2. **Generate** — `generateDailyCurrentAffairs(date)` calls Groq via Vercel AI SDK `generateObject` with a strict `CurrentAffairsSchema` (zod): 5–10 MCQs (exactly 4 options, `correctOption` 0–3, Bengali explanations), 5–8 key facts each bound to a search-result citation index, and a long-form Bangla note with `[n]` citation markers. Model: `AI_CURRENT_AFFAIRS_MODEL` (default `openai/gpt-oss-120b`) with fallback to `openai/gpt-oss-20b` when the pinned model is retired/throttled server-side, temperature 0.3, `maxTokens: 6000` (output counts toward the TPM budget).
3. **Ground** — `enforceGrounding()` is the anti-hallucination guardrail: citations whose URL was not returned by the live search are stripped, facts bound to stripped citations are dropped, remaining citations are re-indexed and note markers renumbered, sections left empty are removed, and if the model fabricated every citation the raw search hits are used as the citation set instead. The model can never invent sources.
4. **Publish** — `backend/services/current-affairs.ts` persists `DailyCurrentAffairsNote` + `SourceCitation` + `ExamMcq` rows in a transaction (`publishDailyNote`); a duplicate-day publish returns `{ generated: false }` (unique `date` key).

Failures (missing `GROQ_API_KEY` → `CA_NO_PROVIDER`, both web-research paths empty → `CA_NO_RESEARCH`, all models failing → `CA_GENERATION_FAILED`) throw operational `AppError(503)`s with user-safe messages, and both the cron and generate routes map any unexpected error to an honest 503 (`CA_CRON_UNAVAILABLE` / `CA_GENERATE_UNAVAILABLE`) instead of a bare 500; the UI shows an honest error state with a rate-limited **Generate today's note** self-heal button (`POST /api/current-affairs/generate`, 3/hour, 120s client timeout) — no mock fallback, since fabricated current affairs would be actively harmful. The generate route serves an already-published day as `{ generated: false }` before consuming rate-limit quota, so re-clicks never lock users out. The tab's MCQ widget offers a timed exam mode (60s/question, auto-submit) persisted via `POST /api/current-affairs/mcq-attempt` into `QuestionAttempt` rows (`source: "current-affairs"`) so scores feed progress, accuracy, streaks, and activity.

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
- **Intent → slices** (`context/resolver.ts`): each `AIIntent` declares the live data slices its turn needs (pure, unit-tested). The Home command bar uses the `home_brief` intent, grounded on `todayPlan` + `exam` + `mistakes` + `revision` + `mockPerformance` — the full at-a-glance state. Suggested chips are built client-side from deterministic aggregates; the model narrates, never invents numbers.
- **Memory store** (`memory/memory-store.ts`): `AIMemory` rows keyed by `[userId, type, key]`; only the AI application layer writes memory (never raw model output). Stores preferred language, topic signals, exam goals.
- **Conversation persistence** (`persistence/conversations.ts`): every turn is stored in `AIConversation`/`AIMessage`; history is scoped to the authenticated user on every read.

## Validation

- **Input** (`backend/ai/schemas.ts`): dependency-free validators. Chat requests need ≥1 user message, valid roles (`user`/`assistant`/`system`), length caps (`MAX_AI_INPUT_CHARS`), solver needs `text` or `imageBase64` (image ≤ 5MB → `413`). The tutor route accepts an optional `imageBase64` too: an image-only question is still valid (placeholder `[Image question]` body), the payload is attached under `images[]` with `provider.supportsVision`, and the image flag forces a vision-capable provider via `withFailover(task, { image: true })`.
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

- Unit tests: `tests/unit/backend/ai.test.ts` (schemas, output validation, intent, prompts, rate limits), `tests/unit/backend/ai-opening.test.ts` (intent → context-slice plans, incl. `home_brief`), `tests/unit/backend/ai-feedback.test.ts` (ledger aggregation).
- Component tests: `tests/unit/frontend/ai-workspace.test.tsx` (AI workspace UI), `tests/unit/frontend/home-hero.test.tsx` (Home command bar: chips, `home_brief` intent, streaming, error states).
- Web-search module tests: `tests/unit/backend/web-search.test.ts`.
- Live-traffic eval loop (AI6): `POST /api/ai/feedback` rows aggregate via `getFeedbackSummary`
  (bounded 5000, pure `summarizeFeedback`) into helpful-rates per intent/provider/model + complaint
  categories. Read it with `npx tsx scripts/ai-feedback-report.ts [--days N]` and use it to drive
  prompt-version/model-routing decisions. Pure aggregation lives in `backend/ai/feedback-summary.ts`
  (no `server-only`, CLI-safe).

## Response Rendering & Formatting

- **Client Markdown renderer**: AI replies are rendered by the dependency-free renderer in
  `frontend/components/chat/Markdown.tsx` — bold/italic, inline code, fenced code blocks (with a copy
  button), headings, bullet/numbered lists, blockquotes, links and dividers. It also strips the
  decorative asterisk noise models occasionally emit (stray `**`, `****` separators, empty emphasis)
  so responses never show raw `*`/`**` characters.
- **Formatting guidance in prompts**: tutor, assistant and agent prompts all pull the same
  `FORMATTING_RULES` constant in `backend/ai/prompts/formatting.ts` (minimal Markdown — `-` bullets,
  numbered steps, brief headings — no asterisk-heavy or decoration-only lines). A single source of
  truth keeps output style consistent across every mode.
- **Temperature default**: `backend/ai/router/config.ts` exposes `resolveTemperature()`; the Groq and
  Anthropic providers apply it whenever a request does not specify its own temperature, honoring
  `AI_TEMPERATURE` (clamped to 0–2) with a default of 0.4 for predictable exam-prep answers.
- **Chat UI**: `frontend/components/dashboard/VoiceAITutor.tsx` is a responsive,
  ChatGPT/Gemini-inspired shell (mobile bottom sheet + slide-over conversation drawer; desktop
  centered panel with an always-visible sidebar). Message bubbles live in
  `frontend/components/chat/ChatMessage.tsx`; the solver applies the same renderer to its solution
  output (`frontend/components/dashboard/AISolverTab.tsx`).
- **Voice out (TTS)**: the workspace speaks AI replies back through the browser's `speechSynthesis`
  (Bangla `bn-BD` vs English `en-US` auto-detected per reply). A workspace-level "Auto-read" toggle is
  on by default; every speak path guards on `speechSynthesis` existing, and the streaming caret /
  composer show an animated equalizer while a reply is being read. STT (voice input) is unchanged.
- **Coach persistence & continuity**: agent turns persist as `COACH`-kind conversations (distinct
  from `ASSISTANT`), rendered with a `Target` icon in the rail. Each completed agent turn writes its
  structured payload back into the assistant message `metadata` under `{ kind: "agent", runId, blocks,
  tools }` — the tool-activity log included — so reloading a thread re-renders the coach cards, the
  "Coach tool steps" activity timeline, and the meta-action follow-up chips exactly as streamed.
  `agent.completed` carries real end-to-end `latencyMs`, surfaced in the workspace meta line and in
  the home-tab coach card (no more hardcoded "Latency ~240ms").
- **Suggested-action cards**: assistant/coach suggested actions render as two-column action cards
  (Bengali label + English hint + arrow) that re-enter the current mode with a fresh turn.
- **Conversation titles**: when a new tutor/assistant conversation completes its first turn,
  `backend/ai/application/title.ts` summarizes the WHOLE chat transcript into a short title via the
  model (`backend/ai/prompts/title.ts`), falling back to the first learner message when no model or
  no output is available. Solver conversations keep their first-question snippet title.