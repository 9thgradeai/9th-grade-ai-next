# AI Agent API Contract

All endpoints are `/api/*`, authenticated, CSRF-checked, quota-enforced, and respond as
`NextResponse.json` / streaming `Response`. Route handlers carry no business logic.

## New: `POST /api/ai/agent` (Phase 1)

The **agent endpoint** — a bounded, tool-using reasoning loop. Returns an SSE stream so the
frontend can render live status + typed blocks. Additive; existing endpoints unchanged.

### Request

```jsonc
{
  "context": {
    "subjectId": 4,           // optional
    "topicId": 12,            // optional
    "topicPath": "04_আন্তর্জাতিক_বিষয়াবলি/…",
    "questionId": 2231        // optional scratchpad context
  },
  "intent": "recommend",      // optional AIIntent hint (else server-detects)
  "question": "আজকে ৪০ মিনিটে কী পড়ব?"
}
```

Validation: `question` required, ≤ `MAX_AI_INPUT_CHARS`; numbers optional integers;
`intent` from the allowlist.

### SSE event protocol (server → client)

```text
event: agent.started        data: {"runId":"…","conversationId":"…"}          // + headers
event: agent.status         data: {"message":"Understanding your request"}    // high-level status labels only
event: tool.started         data: {"name":"get_my_mastery"}
event: tool.completed       data: {"name":"get_my_mastery","ok":true,"ms":12}
event: message.delta        data: {"text":"…"}                                // streamed final text
event: block.created        data: {<typed AgentResponse block>}               // one per block
event: agent.completed      data: {"runId":"…","conversationId":"…","provider":"groq","model":"…","steps":3,"source":"groq"}
event: agent.error          data: {"code":"AI_PROVIDER_ERROR","message":"…"}
```

No chain-of-thought is streamed or persisted. Status messages are fixed, user-safe labels.

### Response headers

`X-Run-Id`, `X-Conversation-Id`, `X-AI-Source`, `X-AI-Model`, `X-Request-Id`,
`X-Response-Time`, `Content-Type: text/event-stream`.

The assistant message is persisted to the conversation (kind `ASSISTANT`, intent set) and
its structured blocks to `AgentRun.responseJson`.

## New: `GET /api/ai/wrong-answers` filters (Phase 2)

Extends the existing mistake surface with error taxonomy:

```
GET /api/ai/wrong-answers?subject=&topic=&errorType=&from=&to=&page=&limit=
```

- `errorType` ∈ `MistakeErrorType`. Backed by the `errorType` column on `QuestionAttempt`
  (top-1 per question per user is the notebook's classification).
- Returns the existing `WrongAnswerNotebook` item shape + `errorType`, `selectedAnswer`,
  `durationSec`.
- `GET /api/ai/wrong-answers/stats` gains `byErrorType` breakdown.

## Existing AI endpoints (unchanged in Phase 1)

| Endpoint | Streams | Purpose |
|---|---|---|
| `POST /api/ai/tutor` | yes | tutor turn |
| `POST /api/ai/assistant` | yes | guidance + suggested actions |
| `POST /api/ai/solver` | yes | text/image solve |
| `POST /api/ai/evaluate` | no | answer evaluation |
| `POST /api/ai/mock-test` | no | generated mock test |
| `POST /api/ai/advisor` | no | career advisor |
| `POST /api/ai/feedback` | no | feedback ingestion |
| `GET  /api/ai/student-model` | no | student model |
| `GET  /api/ai/usage/summary` | no | usage/cost |
| `GET/POST /api/ai/conversations(/:id)` | no | conversation CRUD |

## Frontend types

Typed DTOs live in `frontend/lib/types/index.ts` (Client namespace) and are re-exported
from `frontend/lib/services/ai/types.ts`:

```ts
type AgentActionType = "practice" | "revision" | "mock_exam" | "open_tab" | "open_question" | "open_wrong_answers" | "open_study_plan" | "refresh";
type AgentBlock = TextBlock | StudyRecommendationBlock | WeaknessBlock | PracticeActionBlock
                | RevisionActionBlock | ExamActionBlock | ProgressBlock;
type AgentRunResult = { conversationId: string; source: string; model: string; steps: number };
```

The frontend executes **only allowlisted actions**; it never runs AI-generated code.
Unknown/malformed blocks are dropped by the server validator before they reach the client.