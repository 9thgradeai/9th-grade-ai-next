# 9Th-Grade AI — Complete AI Integration & Agentic Readiness Audit

> **Audit Date:** September 2026
> **Audit Type:** Read-only, production-grade technical audit
> **Status:** AUDIT COMPLETE — NO FILES MODIFIED

---

## A. Executive Summary

1. **Architecture**: Multi-provider AI platform built on Vercel AI SDK (`ai` v4.3.16) with Groq + Anthropic + Mock fallback, layered behind thin Next.js 16 App Router API routes, Prisma 6.5 on PostgreSQL (Neon), and a clean frontend/backend separation (`frontend/` + `backend/`).

2. **Current AI maturity**: **Tool-using assistant** — between "LLM assistant" and "single-step agent." The system has an agent loop with 18 tools, but tool calls use a custom JSON-envelope protocol (not native function calling), the agent loop is bounded at 8 steps, and there is no multi-agent orchestration, planning decomposition, or autonomous execution.

3. **Groq integration**: Real and production-connected via `@ai-sdk/groq`. Default model: `openai/gpt-oss-120b`. Used for tutor, assistant, and fast-tier tasks. Free tier ($0.00/1K tokens). Has 3-retry logic on non-streaming calls. Vision not supported.

4. **Anthropic integration**: Real. Default model: `claude-sonnet-4-6`. Primary for solver (vision support) and image tasks. $3/M input, $15/M output. No retry on generate, no retry on stream.

5. **Mock fallback**: Clearly labeled, deterministic, always appended as last provider. Activates only when no API keys are configured.

6. **Agent system**: Exists at `backend/ai/agent/` with loop, tools, persistence, and SSE streaming. Uses provider-neutral JSON-envelope tool calling (model emits `{"tool":"<name>","arguments":{...}}`). 18 registered tools across profile, performance, knowledge, session, analysis, and planning categories.

7. **RAG**: Domain RAG via keyword-overlap scoring over question bank (not embeddings). Embeddings implemented but disabled (`EMBEDDINGS_ENABLED` flag-off, HashingEmbedder is dev-only). No vector database in production.

8. **Web search**: Tavily REST API integration. Top-5 results, 10s timeout, 600-char snippets. Injected into tutor/assistant prompts as grounding data. Not available in solver/mock-test/evaluator.

9. **Memory**: Persistent `AIMemory` table with upsert and 90-day expiry. Stores weak/strong topics, exam goals, language preferences, difficulty preferences. Used by context engine for personalized prompts.

10. **Security**: Strong fundamentals — HttpOnly cookies, CSRF via `assertSameOrigin()`, `server-only` boundary, input validation, rate limiting (per-user + per-IP + per-account), bcrypt password hashing, HIBP breach check, structured error handling. No critical vulnerabilities found.

11. **Cost control**: Daily quota (60 requests), daily cost budget ($0.50/user/day), usage ledger per call. Groq is free; Anthropic costs are tracked.

12. **Current affairs**: Curated, seed-populated database feed. NOT AI-generated. Agent can access via tool; tutor can supplement via Tavily web search.

13. **Voice**: Browser-native Web Speech API (STT in `bn-BD`, TTS with auto-language detection). Connected to real AI tutor endpoint. No third-party voice SDK.

14. **Major gap**: No production embeddings/RAG, no multi-step planning, no code execution, no deterministic calculator, no web crawling/scraping, no citation verification, no self-correction loop, no evaluation harness beyond static prompt assertions.

---

## B. Current AI Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       User / Browser                         │
│  AIWorkspace │ AISolverTab │ VoiceInterviewTab │ HomeCoach  │
└──────────────────────────┬───────────────────────────────────┘
                           │ fetch() + credentials: "include"
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Edge Middleware (proxy.ts)                 │
│  JWT verify (jose) │ Security headers │ Session gate        │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              API Routes (app/api/ai/*)                       │
│  Auth │ Rate Limit │ Validation │ Delegate to backend/ai     │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Application Layer (backend/ai/application/)     │
│  services.ts: createTutorTurn, solveQuestion,               │
│               assistantTurn, evaluateAnswer,                │
│               generateMockTest, getCareerAdvice,            │
│               createAgentTurn                               │
│  detectIntent() → 17 regex patterns                         │
│  withFailover() → provider chain                            │
│  Banglish normalization                                     │
└──────┬──────────────┬──────────────┬────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌────────────┐ ┌───────────┐ ┌──────────────┐
│  Context   │ │   Tools   │ │   Agent      │
│  Engine    │ │   (18)    │ │   Loop       │
│  (slices,  │ │  (DB +    │ │  (max 8      │
│   render)  │ │  search)  │ │   steps)     │
└────────────┘ └───────────┘ └──────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│              Provider Layer (backend/ai/providers/)          │
│  candidateOrder(): Groq → Anthropic → Mock                  │
│  Registry: cached instances by name+model                   │
└──────┬──────────────┬──────────────┬────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌────────────┐ ┌───────────┐ ┌──────────────┐
│   Groq     │ │ Anthropic │ │    Mock      │
│ @ai-sdk/   │ │ @ai-sdk/  │ │  Deterministic│
│  groq      │ │ anthropic │ │  responses    │
│ 120b free  │ │ claude-4  │ │  labeled      │
│ no vision  │ │ vision ✓  │ │  "MOCK"       │
└────────────┘ └───────────┘ └──────────────┘
       │              │
       ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│              Infrastructure                                  │
│  AI Cache (Redis/Map, 24h TTL)                              │
│  Usage Ledger (AIUsage table)                               │
│  Memory Store (AIMemory, 90-day expiry)                     │
│  Conversation Persistence (AIConversation + AIMessage)      │
│  Agent Persistence (AgentRun + AgentToolCall)               │
│  Tavily Web Search (REST API)                               │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL via Prisma)                │
│  User │ QuestionAttempt │ FlashNews │ UserProgress │         │
│  AIConversation │ AIMessage │ AIMemory │ AIUsage │          │
│  AgentRun │ AgentToolCall │ AIFeedback │ MockTestResult     │
└──────────────────────────────────────────────────────────────┘
```

---

## C. AI Feature Inventory

| # | Feature | UI Component | Route/API | Backend Service | Provider | Model | Streaming | Tools | DB | Auth | Status |
|---|---------|-------------|-----------|----------------|----------|-------|-----------|-------|----|------|--------|
| 1 | AI Tutor | AIWorkspace, VoiceInterviewTab | POST /api/ai/tutor | createTutorTurn() | Groq primary | openai/gpt-oss-120b | Yes (text) | No | Conversations, memory, context | JWT | REAL |
| 2 | AI Solver | AISolverTab | POST /api/ai/solver | solveQuestion() | Anthropic primary | claude-sonnet-4-6 | Yes (JSON) | No | Conversations, cache, context | JWT | REAL |
| 3 | AI Assistant | AIWorkspace | POST /api/ai/assistant | assistantTurn() | Groq primary | openai/gpt-oss-120b | Yes (JSON) | No | Conversations, cache, context | JWT | REAL |
| 4 | AI Agent/Coach | AIWorkspace, HomeCoach | POST /api/ai/agent | createAgentTurn() | Provider chain | varies | Yes (SSE) | 18 tools | Runs, tool calls | JWT | REAL |
| 5 | Answer Evaluator | AnswerEvaluatorTab | POST /api/ai/evaluate | evaluateAnswer() | Solver chain | varies | No | No | Conversations, cache | JWT | REAL |
| 6 | Mock Test Generator | AIMockTestTab | POST /api/ai/mock-test | generateMockTest() | Solver chain | varies | No | No | Usage, cache | JWT | REAL |
| 7 | Career Advisor | AdvisorTab | POST /api/ai/advisor | getCareerAdvice() | Solver chain | varies | No | No | Usage, cache | JWT | REAL |
| 8 | Workspace Opening | AIWorkspace (EmptyState) | GET /api/ai/opening | getAIOpening() | NONE (deterministic) | N/A | No | No | User progress, study plan | JWT | REAL |
| 9 | Student Model | StudentModelTab | GET /api/ai/student-model | getStudentModel() | NONE (deterministic) | N/A | No | No | Memory, usage | JWT | REAL |
| 10 | Web Search | (integrated) | Tavily REST | searchWeb() | Tavily | N/A | N/A | N/A | N/A | API key | REAL |
| 11 | Domain RAG | (integrated) | keyword search | retrieveFromKnowledgeBase() | None | N/A | N/A | N/A | Question bank | N/A | REAL |
| 12 | Conversation CRUD | ConversationRail, ConversationList | /api/ai/conversations | persistence layer | None | N/A | N/A | N/A | AIConversation, AIMessage | JWT | REAL |
| 13 | AI Usage Dashboard | UsageTab | GET /api/ai/usage/summary | usage.ts | None | N/A | N/A | N/A | AIUsage | JWT | REAL |
| 14 | User Feedback | AIWorkspace | POST /api/ai/feedback | submitFeedback() | None | N/A | N/A | N/A | AIFeedback | JWT | REAL |
| 15 | Voice Interview | VoiceInterviewTab | (calls tutor) | createTutorTurn() | Groq primary | varies | Yes | No | Conversations | JWT | REAL |
| 16 | Mistake Analysis | (integrated) | Agent tool | analyze_my_mistakes | None (deterministic) | N/A | N/A | N/A | QuestionAttempt | N/A | REAL |
| 17 | Banglish Normalize | (integrated) | Dictionary | banglish.ts | None | N/A | N/A | N/A | N/A | N/A | REAL |
| 18 | Embeddings/RAG | (disabled) | HashingEmbedder | embeddings.ts | None | N/A | N/A | N/A | pgvector | N/A | DISABLED |

---

## D. Groq Integration — Complete Technical Analysis

### Provider

| Property | Value |
|----------|-------|
| SDK | `@ai-sdk/groq` v1.2.9 via Vercel AI SDK |
| API Style | SDK wrapper (not raw REST) |
| Init | `createGroq({ apiKey, baseURL? })` |
| API key env | `GROQ_API_KEY` |
| Server/client boundary | `backend/ai/providers/groq.ts` imports `"server-only"` |
| API key exposure risk | None — never leaves server |
| Timeout | 60s (route-level `maxDuration`); stream idle timeout configurable |
| Retry | 3 attempts on `generate()`, fixed 500ms delay; no retry on `stream()` |
| Error handling | Blanket catch → retry → `AI_EMPTY_RESPONSE` error |
| Logging | Usage logged to `AIUsage` table per call |

### Default Model

| Property | Value |
|----------|-------|
| Model ID | `openai/gpt-oss-120b` |
| Override | `AI_GROQ_MODEL` env var |
| Provider swap | `AI_GROQ_BASE_URL` (OpenAI-compatible gateway) |
| Temperature | `req.temperature ?? AI_TEMPERATURE ?? 0.4` |
| Max tokens | `req.maxTokens ?? 2048` |
| top_p | Not set (SDK default) |
| Vision | Not supported |
| Native tool calling | Not used — JSON-envelope protocol |
| Streaming | `streamText()` for tutor/assistant; `generateText()` for agent steps |

### Request Flow — AI Tutor

```
User types message in AIWorkspace
  ↓
tutorTurn() → POST /api/ai/tutor
  ↓
auth (getUserIdFromRequest) → rate limit (10/60s, 60/day)
  ↓
createTutorTurn() in application/services.ts
  ↓
detectIntent() → 17 regex patterns
  ↓
resolveContextPlan() → loads context slices (performance, memory, etc.)
  ↓
retrieveFromKnowledgeBase() → keyword-overlap question bank search
  ↓
Conditional Tavily web search (per intent)
  ↓
buildTutorSystemPrompt() → renders context into prompt
  ↓
withFailover() → candidateOrder() returns [groq, anthropic, mock]
  ↓
GroqProvider.stream()
  ↓
createGroq().streamText({ model, system, messages, temperature: 0.4 })
  ↓
textStreamToAccumulatingStream() → ReadableStream<Uint8Array>
  ↓
Response streaming to client with X-AI-Source, X-AI-Model headers
  ↓
Post-stream: recordUsage(), updateMemory(), generateTitle()
```

### Request Flow — Agent Loop

```
User sends message in Coach mode
  ↓
POST /api/ai/agent → auth → rate limit
  ↓
createAgentTurn()
  ↓
resolveCandidatesForModelTask() → [groq, anthropic, mock]
  ↓
Agent loop (max 8 steps):
  For each step:
    provider.generate() (non-streaming)
    ↓
    parseAgentTurn(raw) → check for tool call JSON
    ↓
    If tool call: findTool() → executeTool() (5s timeout) → append result to history → continue
    If no tool call: final output → validate → augment with question IDs → break
  ↓
SSE stream: agent.started, tool.started, tool.completed, block.created, agent.completed
  ↓
AgentRun + AgentToolCall persisted to DB
```

### Request Flow — AI Solver

```
User submits question (text or image) in AISolverTab
  ↓
POST /api/ai/solver → auth → rate limit → quota ("solver" bucket)
  ↓
solveQuestion()
  ↓
AI response cache check (24h TTL, Redis/Map)
  ↓
If image: Anthropic primary (vision support); Groq skipped
candidateOrder() returns [anthropic, groq, mock]
  ↓
withFailover() → GroqProvider.generate() or AnthropicProvider.generate()
  ↓
JSON parsing → validateSolverOutput() → normalize steps/explanation
  ↓
Post-stream: recordUsage(), cache response, updateMemory()
```

---

## E. AI Routes

| Route | Method | Feature | Auth | Model | Provider | Tools | DB | Web | Streaming | Rate Limit | Status |
|-------|--------|---------|------|-------|----------|-------|----|-----|-----------|------------|--------|
| /api/ai/tutor | POST | AI Tutor | JWT | openai/gpt-oss-120b | Groq→Anthropic→Mock | No | Yes | Conditional (Tavily) | Yes (text) | 10/60s, 60/day | REAL |
| /api/ai/solver | POST | Question Solver | JWT | claude-sonnet-4-6 | Anthropic→Groq→Mock | No | Yes | No | Yes (JSON) | 10/60s, 60/day | REAL |
| /api/ai/assistant | POST | Study Companion | JWT | openai/gpt-oss-120b | Groq→Anthropic→Mock | No | Yes | Conditional (Tavily) | Yes (JSON) | 10/60s, 60/day | REAL |
| /api/ai/agent | POST | Agent Coach | JWT | varies | Provider chain | 18 | Yes | No (agent) | Yes (SSE) | 10/60s, 60/day | REAL |
| /api/ai/evaluate | POST | Answer Grading | JWT | varies | Solver chain | No | Yes | No | No | 10/60s, 60/day | REAL |
| /api/ai/mock-test | POST | Mock Test Gen | JWT | varies | Solver chain | No | No | No | No | 10/60s, 60/day | REAL |
| /api/ai/advisor | POST | Career Advisor | JWT | varies | Solver chain | No | No | No | No | 10/60s, 60/day | REAL |
| /api/ai/opening | GET | Personalized Opening | JWT | None | None | No | Yes | No | No | None | REAL |
| /api/ai/student-model | GET | Learner Profile | JWT | None | None | No | Yes | No | No | None | REAL |
| /api/ai/usage/summary | GET | Usage Dashboard | JWT | None | None | No | Yes | No | No | None | REAL |
| /api/ai/conversations | GET/POST | Conversation List | JWT | None | None | No | Yes | No | No | None | REAL |
| /api/ai/conversations/[id] | GET/PATCH/DELETE | Conversation CRUD | JWT | None | None | No | Yes | No | No | None | REAL |
| /api/ai/feedback | POST | User Feedback | JWT | None | None | No | Yes | No | No | None | REAL |

---

## F. AI Tools

### Existing Tools (18 registered in `backend/ai/tools/registry.ts`)

#### Profile Tools (READ-only)

| Tool | Purpose | Input | Auth | DB | Timeout | Status |
|------|---------|-------|------|----|---------|--------|
| get_my_profile | Name, progress, accuracy | none | userId | UserProgress | 5s | USED |
| get_my_goals | Exam target, date, prep level | none | userId | User | 5s | USED |

#### Performance Tools (READ-only)

| Tool | Purpose | Input | Auth | DB | Timeout | Status |
|------|---------|-------|------|----|---------|--------|
| get_my_mastery | Per-subject accuracy, mastery distribution | none | userId | QuestionAttempt | 5s | USED |
| get_recent_activity | Latest questions + flashcard reviews | limit? | userId | QuestionAttempt, FlashcardReview | 5s | USED |
| get_question_history | Recently attempted questions with mastery | limit? | userId | UserQuestionProgress | 5s | USED |
| calculate_readiness | Overall readiness score 0-100 | none | userId | (computed) | 5s | USED |

#### Knowledge Tools (READ-only)

| Tool | Purpose | Input | Auth | DB | Timeout | Status |
|------|---------|-------|------|----|---------|--------|
| get_wrong_answers | Mistake notebook with error types | limit? | userId | QuestionAttempt | 5s | USED |
| search_questions | Full-text search over question bank | q, subject?, limit? | userId | Question | 5s | USED |
| get_question | Single question by ID | id | userId | Question | 5s | USED |
| search_syllabus | Subject/topic tree + exam library | q?, limit? | userId | Subject, Topic, ExamCategory | 5s | USED |
| get_topic | Topic detail + question count | id | userId | Topic | 5s | USED |
| get_exam_weightage | Per-subject question counts by exam | examId? | userId | Question, Exam | 5s | USED |
| search_current_affairs | Verified news items | q?, category?, limit? | userId | FlashNews | 5s | USED |

#### Session Builder Tools (READ-only)

| Tool | Purpose | Input | Auth | DB | Timeout | Status |
|------|---------|-------|------|----|---------|--------|
| create_practice_session | Build practice from mistake pool | subjectId?, topicId?, count? | userId | QuestionAttempt, Question | 5s | USED |
| create_mock_exam | Cross-subject mock from mistakes | count?, subjectIds? | userId | QuestionAttempt, Question | 5s | USED |

#### Analysis Tool (READ-only)

| Tool | Purpose | Input | Auth | DB | Timeout | Status |
|------|---------|-------|------|----|---------|--------|
| analyze_my_mistakes | 30-day mistake pattern analysis | days? | userId | QuestionAttempt | 5s | USED |

#### Planning Tool (READ-only)

| Tool | Purpose | Input | Auth | DB | Timeout | Status |
|------|---------|-------|------|----|---------|--------|
| recommend_next_action | Deterministic next-best-action | none | userId | (computed) | 5s | USED |

#### Study Tool (WRITE)

| Tool | Purpose | Input | Auth | DB | Timeout | Status |
|------|---------|-------|------|----|---------|--------|
| create_study_task | Write a real task to study plan | title, subjectId, topicId?, dueDate? | userId | StudyTask | 5s | USED |

### External Integration

| Integration | Purpose | API | Auth | Timeout | Status |
|-------------|---------|-----|------|---------|--------|
| Tavily Web Search | Current affairs grounding | REST `https://api.tavily.com/search` | API key | 10s | REAL |

---

## G. Data + Memory

### What AI Can Currently Access

| Data | Via | Mechanism | Used By |
|------|-----|-----------|---------|
| User profile | Context engine | Prisma query → User | Tutor, Assistant, Agent |
| Exam target | Context engine + tool | Prisma query → User | Advisor, Agent |
| Subject performance | Context engine + tool | QuestionAttempt aggregation | Tutor, Assistant, Agent |
| Topic performance | Context engine + tool | QuestionAttempt aggregation | Tutor, Assistant, Agent |
| Wrong answers | Tool + context | QuestionAttempt (correct=false) | Agent, Tutor |
| Attempt history | Tool | QuestionAttempt | Agent |
| Bookmarks | Direct API | Bookmark table | Not by AI |
| Flashcards | Direct API | FlashcardUserState | Not by AI |
| Study plan | Tool + context | StudyPlanDay, StudyTask | Assistant, Agent |
| Flash news | Tool | FlashNews (seeded) | Agent |
| Question bank | Tool + RAG | Question (keyword search) | Agent, Tutor, Assistant |
| Question metadata | Tool | Question (text, options, answer) | Agent |
| Exam metadata | Tool | Exam, ExamCategory, ExamPaper | Agent |
| Mistake patterns | Tool + analysis | QuestionAttempt (deterministic) | Agent |
| Learning memory | Context engine | AIMemory (90-day) | Tutor, Assistant |
| Mock test results | Direct API | MockTestResult | Not by AI |

### Memory Architecture

| Type | Storage | Scope | Expiry | Used By |
|------|---------|-------|--------|---------|
| Conversation context | AIMessage table | Per conversation | Permanent | Tutor, Assistant, Agent |
| Session memory | In-component state | Current session | Browser tab | AIWorkspace |
| Database-backed memory | AIMemory table | Cross-session | 90 days | Context engine → Tutor, Assistant |
| User profile | User table | Permanent | Never | Context engine |
| Knowledge memory | Question bank | Permanent | Never | Domain RAG |

---

## H. RAG / Knowledge Retrieval

### Current Implementation

**Domain RAG** (`backend/ai/retrieval/knowledge.ts`):
- Method: Keyword-overlap scoring over bounded candidate set (up to 60 questions)
- Scoring: Token matching with stopwords removed, topic match bonus
- No embeddings — pure keyword search
- Injected into tutor and solver prompts as "trusted, curated" context

**Embeddings Pipeline** (`backend/ai/retrieval/embeddings.ts`):
- `HashingEmbedder`: deterministic char-trigram hashing into 256-dim vectors
- NOT semantically meaningful — dev/test only
- Requires Neon Postgres with pgvector extension
- Controlled by `EMBEDDINGS_ENABLED` env var (default: disabled)
- Cosine similarity via dot product on L2-normalized vectors

**Text Chunker** (`backend/ai/retrieval/chunker.ts`):
- Sliding window (800 chars, 100 overlap)
- Not active in production

```
Current RAG status: PARTIAL — keyword-only domain RAG in production, vector RAG implemented but DISABLED
```

---

## I. Internet Access

| Integration | Provider | API | Status | Authenticated | Rate Limited | Citations | Fallback |
|-------------|----------|-----|--------|---------------|-------------|-----------|----------|
| Web Search | Tavily | REST `https://api.tavily.com/search` | REAL (when key set) | API key | 10s timeout | No (snippets injected) | Empty block |
| Groq built-in tools | None | N/A | NOT USED | N/A | N/A | N/A | N/A |
| Jina / SearXNG | None | N/A | NOT IMPLEMENTED | N/A | N/A | N/A | N/A |
| Playwright / Browser | None | N/A | NOT IMPLEMENTED | N/A | N/A | N/A | N/A |
| YouTube | None | N/A | NOT IMPLEMENTED | N/A | N/A | N/A | N/A |
| RSS | None | N/A | NOT IMPLEMENTED | N/A | N/A | N/A | N/A |
| Scraping | None | N/A | NOT IMPLEMENTED | N/A | N/A | N/A | N/A |

**Current affairs**: Curated database feed (seeded), not live-fetched. Agent tool queries same DB. Tavily can supplement for freshness-sensitive intents.

---

## J. Prompt Architecture

### System Prompts

| Prompt | File | Version | Persona | Language | Output Format |
|--------|------|---------|---------|----------|---------------|
| Tutor | `backend/ai/prompts/tutor.ts` | tutor-v2 | "9th-Grade AI" warm expert tutor | Bilingual (BN-first) | Free text (Markdown) |
| Solver | `backend/ai/prompts/solver.ts` | solver-v1 | Patient exam tutor | Bilingual | Structured JSON |
| Assistant | `backend/ai/prompts/assistant.ts` | assistant-v2 | Intelligent study companion | Bilingual | JSON with actions |
| Evaluator | `backend/ai/prompts/evaluator.ts` | evaluator-v1 | Answer grader | Bilingual | Structured JSON |
| Mock Test | `backend/ai/prompts/mockTest.ts` | mock-test-v1 | Test generator | Bilingual | JSON questions |
| Advisor | `backend/ai/prompts/advisor.ts` | advisor-v1 | Career advisor | Bilingual | JSON plan |
| Agent | `backend/ai/agent/prompt.ts` | (inline) | Study coach | Bengali-first | JSON blocks + tool calls |
| Title | `backend/ai/prompts/title.ts` | title-v1 | Summarizer | Match transcript | Plain text (6 words) |

### Prompt Injection Defenses

| Defense | Location | Effectiveness |
|---------|----------|---------------|
| Trust boundary markers (`===`) | tutor.ts:63-75 | Good but not bulletproof |
| "Never invent facts" instruction | All prompts | Moderate |
| "Never expose system prompt" | Agent prompt | Standard |
| No explicit "ignore previous instructions" | User messages | Gap |

### Prompt Weaknesses

1. **No explicit anti-injection instruction for user messages** — only web search results have trust boundary
2. **No citation requirements** — tutor prompt says "mention source" but doesn't enforce structured citations
3. **No uncertainty scoring** — no confidence levels on responses
4. **No hallucination detection** — output validated for format, not factual accuracy
5. **No cross-examined verification** — single-pass generation only
6. **Duplicate prompt structure** — 7 separate prompt files with shared patterns but no DRY extraction
7. **No structured output enforcement for tutor** — tutor returns free text, not validated JSON

---

## K. Agentic Readiness

| Capability | Status | Evidence |
|------------|--------|----------|
| Model | **Implemented** | Groq + Anthropic via Vercel AI SDK with provider abstraction |
| Agent loop | **Implemented** | `backend/ai/agent/loop.ts` — max 8 steps, provider-neutral |
| Task planning | **Missing** | No decomposition — single-pass generation only |
| Tool calling | **Implemented** | 18 tools via JSON-envelope protocol, not native function calling |
| Tool registry | **Implemented** | `backend/ai/tools/registry.ts` with validation, timeouts, schemas |
| MCP | **Missing** | No Model Context Protocol integration |
| Internet access | **Partial** | Tavily search only; no crawling, browsing, or multi-source |
| Internal RAG | **Partial** | Keyword-only domain search; no embeddings in production |
| Knowledge graph | **Missing** | No graph structure for cross-topic relationships |
| User memory | **Partial** | AIMemory table with 90-day expiry; not used for multi-turn context |
| Exam knowledge | **Partial** | Question bank + keyword RAG; no semantic understanding |
| Personalization | **Partial** | Context engine injects performance data; not deeply personalized |
| Mathematical tools | **Missing** | No calculator, no SymPy, no deterministic math |
| Code execution | **Missing** | No sandboxed code execution |
| Verification | **Missing** | No self-correction, no fact-checking pipeline |
| Citation system | **Missing** | No structured citations or source attribution |
| Source trust | **Partial** | Domain RAG labeled "trusted"; web search labeled "untrusted" |
| Structured output | **Partial** | Solver/evaluator/mock-test have JSON output; tutor/assistant do not |
| State management | **Partial** | AgentRun persists; no long-term state machine |
| Retry | **Partial** | Groq retry on generate (3x); no retry on stream; provider failover |
| Timeout | **Implemented** | 60s route; 5s tool; configurable stream timeout |
| Cancellation | **Missing** | No client-side abort (AbortController) on AI calls |
| Rate limiting | **Implemented** | Per-user 10/60s, 60/day, $0.50/day budget |
| Security | **Implemented** | HttpOnly cookies, CSRF, validation, server-only boundary |
| Observability | **Partial** | Pino logging, Sentry, usage ledger; no LLM tracing |
| Evaluation | **Missing** | Static prompt assertions only; no LLM-judge or golden-set scoring |
| E2E testing | **Missing** | 1 Playwright spec; no AI-specific e2e |
| Model fallback | **Implemented** | Groq → Anthropic → Mock chain with runtime failover |
| Cost control | **Implemented** | Daily quota, daily budget, per-call cost tracking |
| Human confirmation | **Missing** | No confirmation for write actions (create_study_task executes directly) |

---

## L. Security Audit

### Vulnerabilities by Severity

#### CRITICAL (0)

None.

#### HIGH (1)

1. **Exam build endpoint unauthenticated** (`POST /api/exam/build`) — allows anonymous paper generation, resource abuse vector.

#### MEDIUM (5)

1. **IP-based rate limiting trusts `x-forwarded-for`** — spoofable where platform doesn't overwrite. Mitigated by per-account throttling.
2. **No absolute session cap** — refresh endpoint can re-sign tokens indefinitely.
3. **Two validation systems coexist** — `backend/validation.ts` + `backend/ai/schemas.ts` + inline validation; historical drift risk.
4. **Web search injection surface** — Tavily snippets in system prompt; trust boundary defense exists but not fully fenced.
5. **No CSRF tokens** — relies on SameSite=Lax + JSON content-type + `assertSameOrigin()`.

#### LOW (6)

1. **No secret rotation** — single `AUTH_SECRET` with no `kid` header.
2. **Progress PATCH silently drops unknown fields** — should reject.
3. **CORS fallback to `*` in development** — acceptable but undocumented.
4. **No RBAC enforcement** — `role` field exists but never checked.
5. **No exponential backoff** — Groq retry uses fixed 500ms.
6. **Agent tool create_study_task is WRITE** — no human confirmation before persistence.

#### INFORMATIONAL (positive)

- All `.env` files properly gitignored, not committed
- `server-only` boundary consistently applied
- `passwordHash` stripped from all API responses
- Prisma parameterizes all queries (no SQL injection)
- Dummy bcrypt timing equalization for non-existent emails
- HIBP k-anonymity (only 5-char SHA-1 prefix sent)
- Structured error handling prevents info leakage
- Tool execution hard timeouts (5s)
- Mock responses clearly labeled `source: "mock"`

---

## M. Reliability Audit

### Failure Modes & Recovery

| Failure | Recovery | Graceful? |
|---------|----------|-----------|
| Groq unavailable | Failover to Anthropic → Mock | Yes |
| Anthropic unavailable | Failover to Groq → Mock | Yes |
| Both providers unavailable | Mock fallback | Yes (labeled) |
| Groq empty response | 3 retries, then AI_EMPTY_RESPONSE | Yes |
| Stream timeout | Cancel + error | Yes |
| Tool timeout (5s) | ToolTimeoutError → `{ ok: false, summary }` | Yes |
| Tool failure | Error result fed back to model | Yes |
| DB failure | Error propagated, request fails | No (hard fail) |
| Redis cache failure | Fail-open (cache miss) | Yes |
| Rate limit hit | 429 response | Yes |
| JSON parse failure | Fallback parsing (markdown fence strip) | Yes |
| Agent step limit (8) | AGENT_STEP_LIMIT error | Yes |
| Malformed model output | `validateSolverOutput()` normalization | Partial |
| User double-submit | Idempotency key on exam; not on AI | Partial |
| Network disconnect | AbortError silently ignored | Yes |
| User refresh | Conversations persist server-side | Yes |
| Streaming break | Accumulate-then-parse fallback | Yes |
| Provider model change | Env var override available | Yes |

---

## N. Performance Audit

| Risk | Detail |
|------|--------|
| Sequential AI calls | Agent loop is sequential (max 8 steps × provider latency) |
| No streaming on agent steps | Agent uses `generate()`, not `stream()` — user sees no intermediate output |
| No response caching on tutor | Cache only on solver, assistant, evaluator, mock-test, advisor — tutor always hits LLM |
| Huge prompts | Context engine loads multiple DB slices; question bank RAG adds up to 60 questions |
| Database query overhead | Agent makes 2-6 DB queries per tool call; 8 steps = 16-48 queries |
| No abort on client | AIWorkspace doesn't use AbortController — navigate-away leaves orphan streams |
| No request dedup | Concurrent identical AI calls not deduplicated |
| No prompt compression | Full conversation history sent each turn |
| Streaming idle timeout | Configurable but default may be too aggressive for complex responses |
| Title summarization fire-and-forget | Runs after response; non-blocking but adds DB write load |

---

## O. Cost / Rate-Limit Audit

### Current Mechanisms

| Mechanism | Value | Scope | Store |
|-----------|-------|-------|-------|
| Per-endpoint rate limit | 10 req / 60s | Per user | Memory/Redis |
| Daily AI quota | 60 req / day | Per user | Memory/Redis + AIUsage backstop |
| Daily cost budget | $0.50 / day | Per user | AIUsage table |
| Per-call cost tracking | Groq: $0; Anthropic: $0.003/1K in, $0.015/1K out | Per call | AIUsage table |
| Response cache | 24h TTL | Per input hash | Redis/Map |

### Risks

| Risk | Detail |
|------|--------|
| Groq free tier | $0.00 cost per token — cost tracking records $0 |
| No token limit on context | Max tokens on output (2048) but input can grow unbounded with conversation history |
| No prompt size guard | No max character count on system prompt construction |
| Retry amplification | 3 Groq retries × normal request = up to 3x cost |
| Agent loop cost | Up to 8 sequential LLM calls per agent request |
| Denial-of-wallet | Mitigated by per-user daily budget; but no per-request token budget |
| Process-local rate limit | In-memory store resets on restart (mitigated by DB backstop) |

---

## P. Dead / Mock / Duplicate AI Systems

| System | Evidence | Status |
|--------|----------|--------|
| Embeddings pipeline | `backend/ai/retrieval/embeddings.ts` exists, `EMBEDDINGS_ENABLED` defaults to false | DISABLED (dev-only) |
| Text chunker | `backend/ai/retrieval/chunker.ts` exists | UNUSED (no production path) |
| Evaluation index | `backend/ai/evaluation/index.ts` is 4-line re-export shim | PLACEHOLDER |
| AI eval harness | `scripts/ai-eval-harness.ts` — static prompt assertions only | MINIMAL |
| Mock provider | `backend/ai/providers/mock.ts` | ACTIVE fallback (clearly labeled) |
| Mock data in frontend | `frontend/lib/data/ai.ts` — only static preset prompts | HARMLESS |
| Orphaned routes | None found — all 13 AI routes have frontend consumers | NONE |
| Duplicate providers | None — single Groq + single Anthropic + single Mock | NONE |
| Dead env vars | None — all AI env vars actively consumed | NONE |
| TODO/FIXME in AI code | Zero matches in `**/ai/**` files | CLEAN |

---

## Q. Agentic Gap Analysis

### 1. Model
- **Current**: Groq `openai/gpt-oss-120b` + Anthropic `claude-sonnet-4-6`
- **Gap**: No model selection intelligence; routing is config-driven, not task-adaptive
- **Impact**: Suboptimal model for specific subtasks
- **Priority**: Medium

### 2. Agent Loop
- **Current**: Implemented at `backend/ai/agent/loop.ts` — max 8 steps, sequential
- **Gap**: No parallel tool execution, no streaming during steps, no retry within steps
- **Impact**: Slow agent responses, no intermediate progress
- **Priority**: High

### 3. Task Planning
- **Current**: None — single-pass generation
- **Gap**: No decomposition of complex requests into subtasks
- **Impact**: Cannot handle multi-part questions or study plans requiring multiple tools
- **Priority**: High

### 4. Tool Calling
- **Current**: JSON-envelope protocol (custom), 18 tools
- **Gap**: Not using native function calling; no tool composition; no tool-specific prompts
- **Impact**: Model must learn tool schemas from prompt text; less reliable than native
- **Priority**: Medium

### 5. Tool Registry
- **Current**: Implemented with validation, timeouts, schemas
- **Gap**: No dynamic tool registration; no tool versioning; no tool access control per user role
- **Impact**: Cannot add tools without code changes
- **Priority**: Low

### 6. MCP
- **Current**: Not implemented
- **Gap**: No Model Context Protocol integration
- **Impact**: Cannot connect to external MCP servers
- **Priority**: Low

### 7. Internet Access
- **Current**: Tavily search only
- **Gap**: No web crawling, browsing, YouTube, Reddit, GitHub, RSS
- **Impact**: Cannot fetch real-time exam circulars, news articles, or educational content
- **Priority**: High

### 8. Internal RAG
- **Current**: Keyword-overlap search only
- **Gap**: No semantic search, no embeddings, no reranking, no hybrid retrieval
- **Impact**: Low recall on conceptual or paraphrased queries
- **Priority**: High

### 9. Knowledge Graph
- **Current**: None
- **Gap**: No cross-topic relationships, no prerequisite chains
- **Impact**: Cannot reason about topic dependencies
- **Priority**: Low

### 10. User Memory
- **Current**: AIMemory table with 5 memory types
- **Gap**: No semantic memory, no conversation summarization, no preference learning
- **Impact**: Memory is shallow — weak/strong topics only
- **Priority**: Medium

### 11. Exam Knowledge
- **Current**: Question bank + keyword RAG
- **Gap**: No exam-specific knowledge base (syllabus structures, scoring patterns, cutoff analysis)
- **Impact**: Generic advice, not exam-strategy-level intelligence
- **Priority**: Medium

### 12. Personalization
- **Current**: Context engine injects performance data into prompts
- **Gap**: No learning style adaptation, no difficulty calibration, no time-of-day optimization
- **Impact**: Same behavior for all users at same performance level
- **Priority**: Medium

### 13. Mathematical Tools
- **Current**: None — LLM trusted to calculate
- **Gap**: No calculator, no SymPy, no deterministic verification
- **Impact**: Math questions may have incorrect calculations
- **Priority**: Critical

### 14. Code Execution
- **Current**: None
- **Gap**: No sandboxed Python/JS execution
- **Impact**: Cannot run data analysis or verify computations
- **Priority**: Low

### 15. Verification
- **Current**: Output format validation only
- **Gap**: No fact-checking, no self-correction, no multi-pass verification
- **Impact**: Hallucinations pass through to user
- **Priority**: High

### 16. Citation System
- **Current**: None — tutor says "mention source" but doesn't enforce
- **Gap**: No structured citations, no source attribution, no link generation
- **Impact**: User cannot verify claims
- **Priority**: High

### 17. Source Trust
- **Current**: Domain RAG labeled "trusted"; web labeled "untrusted"
- **Gap**: No trust ranking, no primary-source preference, no contradiction detection
- **Impact**: Conflicting sources not surfaced
- **Priority**: Medium

### 18. Structured Output
- **Current**: Partial — solver/evaluator/mock-test use JSON; tutor/assistant free text
- **Gap**: Not all outputs validated; no schema enforcement on all responses
- **Impact**: Inconsistent output quality
- **Priority**: Medium

### 19. State Management
- **Current**: AgentRun + AgentToolCall persisted
- **Gap**: No long-term agent state machine, no checkpoint/resume
- **Impact**: Agent cannot resume interrupted tasks
- **Priority**: Low

### 20. Retry
- **Current**: Groq 3x on generate; provider failover on error
- **Gap**: No exponential backoff; no retry on stream; no retry within agent steps
- **Impact**: Transient errors cause failover instead of retry
- **Priority**: Medium

### 21. Timeout
- **Current**: 60s route; 5s tool; configurable stream
- **Gap**: No per-step timeout in agent loop; no global request timeout
- **Impact**: Agent can run up to 8×5s = 40s minimum
- **Priority**: Low

### 22. Cancellation
- **Current**: None on client
- **Gap**: No AbortController on AI fetch calls
- **Impact**: Navigate-away leaves orphan streams
- **Priority**: Medium

### 23. Rate Limiting
- **Current**: Per-user 10/60s, 60/day, $0.50/day
- **Gap**: No per-agent-step cost accounting; no global cost cap
- **Impact**: Single agent request can consume up to 8 quota units
- **Priority**: Medium

### 24. Security
- **Current**: Strong fundamentals (see Section L)
- **Gap**: No prompt injection tests; no agent sandboxing
- **Impact**: Unverified injection defenses
- **Priority**: Medium

### 25. Observability
- **Current**: Pino + Sentry + usage ledger
- **Gap**: No LLM tracing (LangSmith, Helicone, etc.); no prompt/response logging
- **Impact**: Cannot debug AI quality issues in production
- **Priority**: High

### 26. Evaluation
- **Current**: Static prompt assertions only
- **Gap**: No LLM-judge evaluation, no golden-set scoring, no A/B testing
- **Impact**: Cannot measure AI quality over time
- **Priority**: High

### 27. E2E Testing
- **Current**: 1 Playwright spec (signup → mock test)
- **Gap**: No AI-specific e2e tests
- **Impact**: AI features not verified end-to-end
- **Priority**: High

### 28. Model Fallback
- **Current**: Groq → Anthropic → Mock
- **Gap**: No model health monitoring; no circuit breaker; no latency-based routing
- **Impact**: Degraded model silently served
- **Priority**: Medium

### 29. Cost Control
- **Current**: Daily budget + usage ledger
- **Gap**: No per-request token budget; no prompt size limit; no cost estimation before generation
- **Impact**: Unbounded input can exceed budget
- **Priority**: High

### 30. Human Confirmation
- **Current**: None — `create_study_task` tool writes directly
- **Gap**: No confirmation UI for write actions
- **Impact**: Agent can create tasks without user approval
- **Priority**: High

---

## R. Architecture Reuse Map

| Proposed Component | Action | Reason |
|-------------------|--------|--------|
| Provider abstraction (`LLMProvider`) | **KEEP** | Clean interface, runtime failover working well |
| Groq provider | **KEEP** | Free tier, good for fast/simple tasks |
| Anthropic provider | **KEEP** | Vision support, good for complex reasoning |
| Mock provider | **KEEP** | Essential for dev/test/offline |
| Model router | **EXTEND** | Add task-specific model selection, not just config-driven |
| Agent loop | **EXTEND** | Add parallel tools, streaming, retry within steps |
| Tool registry | **EXTEND** | Add dynamic registration, tool versioning, access control |
| 18 agent tools | **KEEP** | Well-structured, correct scope for exam domain |
| Context engine | **EXTEND** | Add semantic memory, learning style, time-of-day |
| Domain RAG | **REPLACE** | Keyword search insufficient; upgrade to embeddings + hybrid |
| Tavily search | **KEEP** | Working integration; extend to multi-source |
| AI response cache | **KEEP** | 24h TTL, fail-open, good pattern |
| Banglish normalizer | **KEEP** | Small but valuable for Bangladeshi users |
| Memory store | **EXTEND** | Add conversation summarization, preference learning |
| Usage ledger | **KEEP** | Working cost tracking |
| Conversation persistence | **KEEP** | Working well |
| Agent persistence | **KEEP** | AgentRun + AgentToolCall pattern is solid |
| Mistake analysis | **KEEP** | Deterministic, accurate |
| Opening (deterministic) | **KEEP** | No LLM needed, works well |
| Student model | **EXTEND** | Add more dimensions (learning velocity, session patterns) |
| Evaluation harness | **REPLACE** | Static assertions insufficient; need LLM-judge |
| Error classifier | **KEEP** | Rule-based, deterministic, correct priority order |
| Prompt architecture | **EXTEND** | Need anti-injection, citation requirements, structured output |
| Validation layer | **REFACTOR LATER** | Two systems coexist; consolidate later |
| Security layer | **KEEP** | Strong fundamentals; add prompt injection tests |

---

## S. Recommended Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       User / UI                              │
│  AIWorkspace │ SolverTab │ VoiceInterview │ HomeCoach │ ... │
│  [AbortController on all AI calls]                          │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    AI Gateway Layer                           │
│  Rate limit │ Auth │ Input validation │ Prompt injection     │
│  guard │ Token budget │ Cost estimation │ Request dedup      │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   Master Agent Loop                          │
│  Task decomposition │ Planning │ Tool selection │            │
│  Iterative reasoning │ Self-correction │ Verification        │
│  Max steps: configurable │ Streaming progress                │
└──────┬──────────────┬──────────────┬────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌────────────┐ ┌───────────┐ ┌──────────────┐
│  Exam      │ │ Internet  │ │ Solver       │
│  Brain     │ │ Tools     │ │ Tools        │
│            │ │           │ │              │
│ Embeddings │ │ Tavily    │ │ Math (calc)  │
│ Semantic   │ │ Crawling  │ │ Code exec    │
│ RAG        │ │ YouTube   │ │ Verification │
│ Knowledge  │ │ RSS       │ │ Fact-check   │
│ Graph      │ │ News APIs │ │              │
└──────┬─────┘ └─────┬─────┘ └──────┬───────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│              Evidence & Verification Layer                    │
│  Source trust ranking │ Multi-source verification │          │
│  Contradiction detection │ Citation generation │             │
│  Confidence scoring │ Hallucination detection                 │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Structured Answer Layer                          │
│  JSON schema enforcement │ Markdown + LaTeX rendering │      │
│  Bilingual output │ Source attribution │ Action buttons       │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│              Memory & Personalization Layer                   │
│  Conversation summaries │ Learning profile │                  │
│  Semantic memory │ Preference learning │ Adaptive difficulty  │
│  Time-of-day optimization │ Session patterns                  │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│              Observability & Evaluation Layer                 │
│  LLM tracing │ Prompt/response logging │                     │
│  LLM-judge eval │ Golden-set scoring │ A/B testing │         │
│  Cost analytics │ Quality dashboards                          │
└──────────────────────────────────────────────────────────────┘
```

---

## T. Recommended Tool Layer

| Tool | Type | Read/Write | Deterministic? | Source |
|------|------|------------|----------------|--------|
| `get_user_profile` | READ | Read-only | Yes | Internal (Prisma) |
| `get_exam_history` | READ | Read-only | Yes | Internal (Prisma) |
| `get_wrong_questions` | READ | Read-only | Yes | Internal (Prisma) |
| `get_subject_accuracy` | READ | Read-only | Yes | Internal (Prisma) |
| `get_topic_accuracy` | READ | Read-only | Yes | Internal (Prisma) |
| `search_questions` | READ | Read-only | Yes | Internal (Prisma + embeddings) |
| `search_topics` | READ | Read-only | Yes | Internal (Prisma) |
| `search_exam_history` | READ | Read-only | Yes | Internal (Prisma) |
| `get_question_details` | READ | Read-only | Yes | Internal (Prisma) |
| `create_study_plan` | WRITE | Write | Yes | Internal (Prisma) — needs confirmation |
| `create_mock_test` | WRITE | Write | No (LLM) | Internal — needs confirmation |
| `create_flashcards` | WRITE | Write | No (LLM) | Internal — needs confirmation |
| `save_note` | WRITE | Write | Yes | Internal (Prisma) — needs confirmation |
| `search_current_affairs` | READ | Read-only | Yes | Internal (Prisma) |
| `search_web` | READ | Read-only | No (External) | Tavily / multi-source |
| `search_youtube` | READ | Read-only | No (External) | YouTube API |
| `calculate_math` | READ | Read-only | Yes | Deterministic (calculator) |
| `solve_equation` | READ | Read-only | Yes | Deterministic (SymPy) |
| `verify_answer` | READ | Read-only | Yes | Deterministic (answer check) |
| `browse_url` | READ | Read-only | No (External) | Web crawler |
| `get_news_feed` | READ | Read-only | Yes | Internal (Prisma) |

---

## U. Migration Strategy

### Phase 0 — Audit / Baseline

- This audit document
- Establish metrics: AI call volume, latency, cost, error rate, user satisfaction
- Set up LLM tracing (Helicone / LangSmith / custom)

### Phase 1 — AI Gateway

- Add request deduplication
- Add prompt size guards (max tokens budget)
- Add per-request token estimation before generation
- Add AbortController on all client-side AI calls
- Consolidate validation layers
- Add exponential backoff to Groq retry
- Add circuit breaker on provider errors

### Phase 2 — Tool Layer

- Add human confirmation for all write tools
- Add tool-specific prompts (guide model on when/how to use each tool)
- Add tool composition (combine multiple tools in single reasoning step)
- Add tool result caching
- Upgrade `search_questions` to semantic search (embeddings)
- Add `calculate_math` deterministic calculator tool
- Add `browse_url` web crawling tool (beyond Tavily snippets)
- Add `search_youtube` tool
- Add `get_news_feed` for live RSS/API news

### Phase 3 — Agent Loop

- Add streaming during agent steps (progress feedback)
- Add parallel tool execution (fan-out)
- Add retry within steps (transient error recovery)
- Add checkpoint/resume for interrupted agents
- Add agent-specific task planning (decompose complex requests)
- Add agent step timeout (not just tool timeout)

### Phase 4 — Internal Exam Brain

- Upgrade RAG to embeddings + keyword hybrid
- Add semantic search over question bank
- Add exam-specific knowledge base (syllabus structures, scoring patterns)
- Add cross-topic knowledge graph
- Add prerequisite chains for topic learning
- Add reranking layer for retrieval results

### Phase 5 — Internet / Agent Reach

- Upgrade Tavily integration to multi-source web search
- Add web crawling for exam circulars and news articles
- Add YouTube integration for educational content
- Add RSS feed aggregation for current affairs
- Add source freshness ranking
- Add content extraction and summarization

### Phase 6 — Verification

- Add fact-checking pipeline (multi-source verification)
- Add contradiction detection
- Add confidence scoring on AI responses
- Add citation generation with source URLs
- Add answer validation for math/science
- Add hallucination detection heuristics
- Add self-correction loop (model reviews own output)

### Phase 7 — Memory + Personalization

- Add conversation summarization (compress long histories)
- Add semantic memory (embedding-based recall)
- Add learning style detection
- Add difficulty calibration (adaptive based on accuracy)
- Add time-of-day optimization (morning vs evening study)
- Add session pattern analysis
- Add preference learning (Bengali/English, explanation depth)

### Phase 8 — Evaluation + Production Hardening

- Add LLM-judge evaluation pipeline
- Add golden-set scoring for all AI features
- Add A/B testing framework for prompt changes
- Add prompt injection test suite
- Add AI-specific e2e tests
- Add quality dashboards
- Add cost analytics
- Add user feedback loop (thumbs up/down → model improvement)

---

## V. Critical Findings

1. **No mathematical reliability** — The LLM is trusted to perform calculations directly. No calculator, SymPy, or deterministic math verification exists. For a Bangladeshi exam prep platform covering math, science, and economics, this is the single highest-impact gap.

2. **No verification pipeline** — AI responses are generated once, format-validated, and returned. No fact-checking, no self-correction, no multi-pass verification. Hallucinations pass through to users unchallenged.

3. **No semantic RAG** — The question bank uses keyword-overlap scoring only. Embeddings are implemented but disabled. Conceptual or paraphrased queries have low recall.

4. **No citation system** — AI makes factual claims without structured source attribution. Users cannot verify whether information comes from the question bank, web search, or model knowledge.

5. **Agent loop lacks streaming and parallelism** — The agent makes up to 8 sequential non-streaming LLM calls. Users see no intermediate progress until completion. This makes the agent feel slow and opaque.

6. **No internet beyond Tavily snippets** — Web search returns 600-char snippets only. No crawling, no full article retrieval, no YouTube, no RSS. Current affairs is a seeded static database.

7. **No prompt injection test suite** — The trust boundary defense in the tutor prompt is untested. Adversarial web search content could potentially override system instructions.

8. **No evaluation harness** — The eval system is static prompt assertions only. No LLM-judge, no golden-set scoring, no quality measurement over time. AI quality regressions are invisible.

9. **Write tools lack human confirmation** — The `create_study_task` tool writes directly to the database without user approval. The agent can modify the user's study plan autonomously.

10. **Groq free tier is fragile** — The primary provider runs on a free tier with $0.00 cost tracking. Rate limits, model availability, and service continuity are outside the project's control.

---

## W. Questions / Unknowns

1. **What is the actual production usage pattern?** — Without runtime data, we cannot determine which AI features are most used, which fail most often, or where latency bottlenecks manifest in production.

2. **What is the actual Groq rate limit in production?** — Free tier limits are undocumented in the codebase; production behavior under load is unknown.

3. **Does the Anthropic model (`claude-sonnet-4-6`) match the intended behavior?** — The model ID is configurable; whether the deployed model matches the default is a deployment concern.

4. **Is Redis configured in production?** — The code supports Redis for rate limiting and caching, but whether `REDIS_URL` is set in production is a deployment question.

5. **What is the actual prompt injection resilience?** — Static analysis cannot determine whether the trust boundary defense actually prevents injection. This requires adversarial testing.

6. **Are there concurrent user sessions creating race conditions?** — The agent loop and tool execution use no distributed locking; concurrent tool calls on the same user data could theoretically conflict.

7. **What is the actual token count of constructed prompts?** — The context engine assembles multiple slices, but without runtime measurement, we cannot confirm prompts stay within model context windows.

8. **Is the `create_study_task` write tool actually used by the agent in practice?** — The tool is registered but whether the model reliably calls it (or calls it incorrectly) requires runtime observation.

---

> **AUDIT COMPLETE — NO FILES MODIFIED**
