# AI Agent Frontend Architecture

Companion to the API contract and tool registry. Focused on what changes in the
`frontend/` directory; the rest of the dashboard is unaltered.

## Component tree (AI workspace)

```
VoiceAITutor (global overlay)
├── header (mode switch, quick actions, status badge)
├── body
│   ├── aside: ConversationList (desktop sidebar)
│   └── chat column
│       ├── messages
│       │   ├── UIMessage(role=user)  → <ChatMessage> right-aligned bubble
│       │   └── UIMessage(role=ai)
│       │       ├── <ChatMessage> text + copy + feedback + read-aloud
│       │       └── <AgentBlocks blocks={msg.blocks}> (NEW — renders typed cards)
│       └── form (composer)
└── mobile conversation drawer
```

## New: `AgentBlocks` (`frontend/components/dashboard/ai/AgentBlocks.tsx`)

Pure-presentational. Renders an ordered list of `AgentBlock`s (typed) as native React cards.
Unknown/malformed block types are dropped by the client; never renders raw AI HTML.

| Block type | Card visual |
|---|---|
| `text` | rendered as Markdown inside the ChatMessage (already exists) |
| `study_recommendation` | subject + topic chip, reason line, action buttons (Practice / Revise) |
| `weakness` | subject/topic + accuracy % + "Practice similar" CTA |
| `practice_action` | blue CTA — "Start Practice (N questions)" |
| `revision_action` | teal CTA — "Review concepts" |
| `exam_action` | purple CTA — "Take a mock" |
| `progress` | numeric KPIs (accuracy, streak, questions answered) |

Every CTA dispatches through an **allowlisted action dispatcher** inside VoiceAITutor:

```ts
function handleAction(action: AgentAction) {
  switch (action.type) {
    case "practice":
    case "revision":
    case "mock_exam":
    case "open_tab":
      useDashboardStore.getState().setActiveTab(action.params?.tab ?? "practice");
      break;
    case "open_wrong_answers":
      useDashboardStore.getState().setActiveTab("mistakes");
      break;
    case "open_question":
      // navigate via ai-launcher event if needed
      break;
  }
}
```

No `eval`, no arbitrary JS execution. Only known action types are handled.

## SSE client (`frontend/lib/services/ai/agent.ts`)

Reuses the existing `fetch` + `ReadableStream` pattern from `streamChat`, but parses SSE
events (`event: X\ndata: {...}\n`) instead of raw chunks. Returns an async generator so
VoiceAITutor can process events incrementally:

```ts
type AgentEvent = {
  event: "agent.started" | "agent.status" | "tool.started" | "tool.completed"
         | "message.delta" | "block.created" | "agent.completed" | "agent.error";
  data: Record<string, unknown>;
};

async function* streamAgent(opts: {
  question: string;
  context?: { subjectId?: number; topicId?: number; topicPath?: string; questionId?: number };
  intent?: AIIntent;
  signal?: AbortSignal;
}): AsyncGenerator<AgentEvent, { conversationId: string; source: string; model: string; steps: number }>
```

Status updates (`agent.status`) are rendered as a non-intrusive status line ("Checking your
performance…"). Only `block.created` and `message.delta` produce visible content. Chain of
thought is never streamed.

## Types (`frontend/lib/types/index.ts` — Client namespace)

```ts
type AgentActionType = "practice" | "revision" | "mock_exam" | "open_tab"
  | "open_question" | "open_wrong_answers" | "open_study_plan" | "refresh";

type AgentAction = { type: AgentActionType; label: string; params?: Record<string, unknown> };

type AgentBlock =
  | { type: "text"; text: string }
  | { type: "study_recommendation"; title: string; reason: string; subject?: string; topic?: string; actions: AgentAction[] }
  | { type: "weakness"; subject: string; topic: string; accuracy: number; attempts: number; wrongCount: number; advice: string; actions: AgentAction[] }
  | { type: "practice_action"; label: string; questionCount?: number }
  | { type: "revision_action"; label: string }
  | { type: "exam_action"; label: string }
  | { type: "progress"; accuracy: number; streak: number; questionsAnswered: number; rank?: number };
```

## VoiceAITutor changes (minimal, additive)

- A new `Mode`: `"agent"` alongside `"tutor"` / `"assistant"`. (Can also be wired as a
  toggle in the header for quick access.)
- When `mode === "agent"`, `sendTurn` calls `streamAgent` instead of `askAssistant` /
  `tutorTurn`. Results are processed into a `UIMessage` with both `text` and `blocks`.
- Block cards render under the ChatMessage text for that turn.

No existing tutor/assistant behavior is changed. The agent surface is additive; a future
iteration can make `"agent"` the default assistant mode once validated.

## Dark / light mode

The AI workspace is already scope-light/dark via `DashboardThemeProvider`. Block cards use
existing design tokens (`--surface-solid`, `--primary`, `--accent`, `--dashboard-*`); no
new CSS properties are introduced. Tailwind utilities only.

## Accessibility

- Block cards use semantic elements (`<section>` + `<h4>` for title, `<p>` for description,
  `<button>` for CTAs) with proper focus management.
- Status labels (`agent.status`) are in a visually-hidden live region; the animated badge
  in the header is decorative-only (`aria-hidden` on the animation itself).
- Keyboard navigation within AgentBlocks uses standard `<button>` focus order.