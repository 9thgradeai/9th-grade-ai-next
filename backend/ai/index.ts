// backend/ai — public API for the AI domain.
//
// Route handlers import from here only; business logic stays inside this layer.

export {
  createTutorTurn,
  solveQuestion,
  assistantTurn,
  detectIntent,
} from "./application/services";
export type { SolverResult, AssistantResult, SuggestedAction, AIContext } from "./types";

export {
  createConversation,
  listConversations,
  getConversation,
  renameConversation,
  setConversationPinned,
  deleteConversation,
  listMessages,
} from "./persistence/conversations";
export type { ConversationSummary, MessageRow } from "./persistence/conversations";

export { submitFeedback } from "./feedback";
export { recordUsage, bumpAIQuestions, countUsageToday } from "./usage/usage";
export { getMemories, upsertMemory, setExamGoal } from "./memory/memory-store";