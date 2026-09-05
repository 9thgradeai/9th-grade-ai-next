// Structured AgentResponse block model + validation.
//
// The agent loop ends by producing an ordered list of typed blocks, of which a
// `text` block is always first. Each block carries data (often the `data`
// payload from a successful tool call) that the frontend renders as native
// cards, plus allowlisted actions the UI is safe to execute. Chain-of-thought
// is NEVER included in any block.

import type { AgentActionType } from "../tools/types";

export type AgentBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "study_recommendation";
      title: string;
      reason: string;
      subject?: string;
      topic?: string;
      actions: AgentAction[];
    }
  | {
      type: "weakness";
      subject: string;
      topic: string;
      accuracy: number;
      attempts: number;
      wrongCount: number;
      advice: string;
      actions: AgentAction[];
    }
  | {
      type: "practice_action";
      label: string;
      questionCount?: number;
      actions?: AgentAction[];
    }
  | {
      type: "revision_action";
      label: string;
      actions?: AgentAction[];
    }
  | {
      type: "exam_action";
      label: string;
      actions?: AgentAction[];
    }
  | {
      type: "progress";
      accuracy: number;
      streak: number;
      questionsAnswered: number;
      actions?: AgentAction[];
    };

export type AgentAction = {
  type: AgentActionType;
  label: string;
  params?: Record<string, unknown>;
};

export type AgentResponse = { blocks: AgentBlock[] };

const ACTION_TYPES: AgentActionType[] = [
  "practice",
  "revision",
  "mock_exam",
  "open_tab",
  "open_question",
  "open_wrong_answers",
  "open_study_plan",
  "refresh",
];

const MAX_BLOCKS = 8;
const MAX_STR = 240;

function asStr(v: unknown, fb = ""): string {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_STR) : fb;
}
function asNum(v: unknown, fb = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}
function asAction(v: unknown): AgentAction | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.type !== "string" || !ACTION_TYPES.includes(o.type as AgentActionType)) return null;
  return {
    type: o.type as AgentActionType,
    label: asStr(o.label, "Go"),
    params: o.params && typeof o.params === "object" ? (o.params as Record<string, unknown>) : undefined,
  };
}
function asActions(v: unknown): AgentAction[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(asAction)
    .filter((a): a is AgentAction => a !== null)
    .slice(0, 4);
}

function validateBlock(b: unknown): AgentBlock | null {
  if (!b || typeof b !== "object") return null;
  const raw = b as Record<string, unknown>;
  switch (raw.type) {
    case "text":
      return { type: "text", text: asStr(raw.text, "").slice(0, 4000) };
    case "study_recommendation":
      return {
        type: "study_recommendation",
        title: asStr(raw.title, "Recommended next step"),
        reason: asStr(raw.reason, ""),
        subject: asStr(raw.subject),
        topic: asStr(raw.topic),
        actions: asActions(raw.actions),
      };
    case "weakness":
      return {
        type: "weakness",
        subject: asStr(raw.subject, "General"),
        topic: asStr(raw.topic, "topic"),
        accuracy: asNum(raw.accuracy, 0),
        attempts: asNum(raw.attempts, 0),
        wrongCount: asNum(raw.wrongCount, 0),
        advice: asStr(raw.advice, ""),
        actions: asActions(raw.actions),
      };
    case "practice_action":
      return {
        type: "practice_action",
        label: asStr(raw.label, "Start practice"),
        questionCount: asNum(raw.questionCount, 0) || undefined,
        actions: asActions(raw.actions),
      };
    case "revision_action":
      return { type: "revision_action", label: asStr(raw.label, "Review concepts"), actions: asActions(raw.actions) };
    case "exam_action":
      return { type: "exam_action", label: asStr(raw.label, "Take a mock exam"), actions: asActions(raw.actions) };
    case "progress":
      return {
        type: "progress",
        accuracy: asNum(raw.accuracy, 0),
        streak: asNum(raw.streak, 0),
        questionsAnswered: asNum(raw.questionsAnswered, 0),
        actions: asActions(raw.actions),
      };
    default:
      return null;
  }
}

/**
 * Normalize a raw agent "response" (either already-blocked or prose) into a
 * valid AgentResponse. Guarantees a leading text block.
 */
export function validateAgentOutput(raw: unknown, fallback = ""): AgentResponse {
  // Preferred: model returns { blocks: [...] }.
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.blocks)) {
      const blocks = (o.blocks as unknown[])
        .map(validateBlock)
        .filter((b): b is AgentBlock => b !== null)
        .slice(0, MAX_BLOCKS);
      if (blocks.length > 0) {
        if (blocks[0].type !== "text") {
          blocks.unshift({ type: "text", text: asStr(fallback, "Here's what I found.") });
        }
        return { blocks };
      }
    }
  }
  // Fallback: bare prose (e.g., mock provider text) wraps in a text block.
  const text = asStr(raw, fallback).slice(0, 4000);
  return { blocks: [{ type: "text", text: text || "Here's what I found." }] };
}

/** Extract plain text from a validated response (for the persisted chat message). */
export function agentResponseText(response: AgentResponse): string {
  return response.blocks
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n\n");
}