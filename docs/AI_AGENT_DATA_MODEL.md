# AI Agent Data Model

Additive changes only. New models get `prisma db push` (no destructive migration); existing
tables gain nullable/default columns. The full reference lives in `docs/DATABASE.md`.

## New: `AgentRun` — one row per agent loop execution

Persists an agent run so the loop is observable and auditable. Owned by the user (cascade
on account deletion). Optionally linked to the conversation it belongs to.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid PK | |
| `userId` | FK → User | cascade |
| `conversationId?` | FK → AIConversation | SetNull |
| `intent` | string | task intent captured at start |
| `status` | `AgentRunStatus` (IN_PROGRESS / COMPLETED / FAILED) | |
| `steps` | int | number of loop iterations used |
| `model` / `provider` | string | which provider/model produced the final response |
| `inputTokens` / `outputTokens` | int | usage accounting (chars/4 estimate or provider-reported) |
| `latencyMs` | int | whole-run latency |
| `errorCode` | string? | non-empty when FAILED |
| `responseJson` | JSON? | validated final `AgentResponse` blocks (never chain-of-thought) |
| `toolCalls` | AgentToolCall[] | |

Indexes: `(userId, createdAt)`, `(conversationId)`.

## New: `AgentToolCall` — one row per tool invocation within a run

| Field | Type | Notes |
|---|---|---|
| `id` | cuid PK | |
| `runId` | FK → AgentRun | cascade |
| `name` | string | allowlisted tool name |
| `argumentsJson` | JSON | validated, normalized arguments |
| `resultJson` | JSON? | `ToolResult` (summary + optional structured `data`) |
| `durationMs` | int | |
| `success` | boolean | |
| `errorCode` | string? | non-empty on failure |
| `createdAt` | datetime | |

Index: `(runId)`.

## New: `LearningEvent` — replayable per-user learning timeline

A single extensible event table (per the plan, not "dozens of tables"). Phase 1 creates the
model; Phase 2 emits events from existing write paths. Metadata JSON carries the
reconstruction payload (attempt state, score, session id, …); a small set of scalar
dimensions (subject/topic/question) powers the common filters.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid PK | |
| `userId` | FK → User | cascade |
| `type` | `LearningEventType` enum | see below |
| `subjectId?` / `topicId?` / `questionId?` | int FKs | SetNull |
| `metadata` | JSON? | extensible payload |
| `occurredAt` | datetime | when the event happened (business time) |
| `createdAt` | datetime | ingestion time |

Enum `LearningEventType`:

```
SESSION_STARTED, SESSION_COMPLETED,
QUESTION_ATTEMPTED, QUESTION_CORRECT, QUESTION_WRONG, QUESTION_SKIPPED,
TOPIC_REVIEWED, REVISION_COMPLETED, MOCK_EXAM_COMPLETED,
AI_EXPLANATION_REQUESTED, AI_TUTOR_SESSION,
STUDY_PLAN_CREATED, STUDY_PLAN_COMPLETED
```

Indexes: `(userId, occurredAt)`, `(userId, type)`, `(userId, subjectId, occurredAt)`,
`(userId, topicId, occurredAt)`. Enough to answer "which questions do I keep missing",
"what did I study this week", and "how does the AI tutor move the needle".

## New enum: `MistakeErrorType`

Classification of *why* a question was answered incorrectly. The AI may *suggest* a
classification; the backend validates, stores, and — only when confident — persists it.
`UNKNOWN` is the honest default when no signal is available.

```
CONCEPTUAL_GAP, CARELESS_MISTAKE, MEMORY_FAILURE, MISREADING,
CALCULATION_ERROR, CONFUSION, GUESSING, TIME_PRESSURE, UNKNOWN
```

## Extended: `QuestionAttempt` (additive nullable/default columns)

| Field | Type | Notes |
|---|---|---|
| `selectedAnswer` | string default "" | what the learner picked |
| `durationSec` | int default 0 | response time for this attempt |
| `confidence` | int? | learner-reported confidence 0–100 |
| `errorType` | `MistakeErrorType?` | server-validated classification |

These are **backfill-safe** (defaults/optional) and do not change the existing write path in
`recordQuestionAttempt`. Emission wiring is Phase 2.

## New relation on `User` / `AIConversation`

- `User.agentRuns AgentRun[]`, `User.learningEvents LearningEvent[]`.
- `AIConversation.agentRuns AgentRun[]`.

## Migration approach

`npx prisma validate` → `prisma db push --schema database/prisma/schema.prisma`
(additive only). No `--accept-data-loss` needed for these changes; the enum additions are
new values only. `docs/DATABASE.md` is updated in the same commit.

## Governance

- The LLM never writes these tables directly; only server services do.
- `AgentRun.responseJson` stores typed blocks, not free-form reasoning.
- `LearningEvent.metadata` never stores prompt text or chain-of-thought.