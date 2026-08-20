"use client";

// AI service layer — the single typed entry point for AI features.
// Feature components must use these methods, never raw fetch("/api/ai/...").

export { tutorTurn } from "./tutor";
export type { TutorTurnOptions } from "./tutor";
export { solve } from "./solver";
export type { SolverTurnOptions } from "./solver";
export { askAssistant } from "./assistant";
export type { AssistantTurnOptions } from "./assistant";
export {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  deleteConversation,
  submitFeedback,
} from "./conversations";
export { AIError, streamChat, aiJson } from "./client";
export type { StreamChatMeta } from "./client";
export type * from "./types";