# AI Agent Tool Registry

## Design principles

- **Identity from the authenticated request** — tools operate on the calling user only;
  never accept arbitrary `studentId` params from the model.
- **Read-first** — Phase 1 tools are pure reads over existing services. Write tools
  (`create_practice_session`, `create_mock_exam`, …) are Phase 2–3, gated behind explicit
  authorization and idempotency.
- **Bounded** — every tool declares a `timeoutMs` (default 5s) and returns a bounded
  summary the LLM sees plus an optional structured `data` payload the frontend renders.
- **Dependency-free validators** — input/output validated server-side without adding
  `zod` as a direct dependency; hand-rolled validators follow the `schemas.ts` convention.

## Tool definition shape

```ts
type ToolDefinition<Input = unknown> = {
  name: string;            // e.g. "get_my_mastery"
  description: string;     // shown to the model
  inputShape: string;      // JSON-schema-like description embedded in the system prompt
  validateInput(raw: unknown): Input;  // throws ValidationError on invalid input
  execute(ctx: ToolContext, args: Input): Promise<ToolResult>;
  timeoutMs?: number;      // default 5000
};

type ToolContext = {
  userId: string;          // always from authenticated request
  conversationId?: string;
};

type ToolResult = {
  summary: string;         // concise, human-readable — what the model sees
  data?: Record<string, unknown>; // optional structured payload for UI blocks
  action?: AgentAction;    // optional single best-action to surface as a card
};

type AgentAction = {
  type: "practice" | "revision" | "mock_exam" | "open_tab" | "open_question"
      | "open_wrong_answers" | "open_study_plan" | "refresh";
  label: string;
  params?: Record<string, unknown>;
};
```

## Phase 1 tool inventory

| Tool | What it does | Data source | Returns (`summary` + `data`) |
|---|---|---|---|
| `get_my_profile` | User + points, streak, accuracy, questions | `findUserById` + `UserProgress` | profile summary; accuracy % |
| `get_my_goals` | examTarget, examDate, studyHours, prepLevel | `findUserById` | goal statement |
| `get_my_mastery` | per-subject/topic mastery from attempts | `getSubjectReports` + aggregate | subject + score + status labels |
| `get_recent_activity` | last N attempts, flashcards, AI sessions | `QuestionAttempt` + `FlashcardReview` | activity timeline |
| `get_wrong_answers` | top mistakes with question text | `getMistakesForUser` (limit 20) | mistake list + total count |
| `get_question_history` | per-question attempts | `UserQuestionProgress` | question + mastery + last subject/topic |
| `search_questions` | full-text match over question bank | `getQuestions` + filter | matched questions + total |
| `get_question` | single question + explanation | `getQuestionById` | question text + answer + explanation |
| `search_syllabus` | subject/topic tree | `getQuestionBankCategories` + `ExamCategory` | categories + exams |
| `get_topic` | topic + question count | `Subject/Topic` via content | topic + count |
| `get_exam_weightage` | exam metadata + per-subject weightage | `getExamSelectionTree` | exams + subjects + counts |
| `calculate_readiness` | overall readiness score + per-subject | `getSubjectReports` + streak | readiness %, recommendation |
| `recommend_next_action` | next best tab/session | `deriveNextAction` (existing planner logic) | action type + subject + tab |
| `search_current_affairs` | recent verified flash news | `getFlashNews` | news items (titleBn, category, date) |

Later tools (Phase 2–3): `create_practice_session`, `create_mock_exam`,
`create_revision_session`, `generate_study_plan`, `record_learning_event`, `calculate`
(deterministic math/code executor).

## Authorization

Every tool runs inside `ToolContext` with `userId` from the authenticated request. The
`authorize` phase (always-pass in Phase 1 read tools) exists as the seam for:
- Role-based gating (ADMIN-only tools).
- Feature-flag gating (e.g., "AI generation quarantined until admin review").

## Failure modes

- Tool throws `ValidationError` → agent loop surfaces "could not read that data" to the
  model; step counted; loop continues.
- Tool times out (> `timeoutMs`) → same graceful degradation.
- All tools fail → model produces a best-effort response based on the question text alone.
  `AgentRun.errorCode` is set; the response blocks are still validated.