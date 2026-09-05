// backend/ai — public API for the AI domain.
//
// Route handlers import from here only; business logic stays inside this layer.

export {
  createTutorTurn,
  solveQuestion,
  assistantTurn,
  evaluateAnswer,
  generateMockTest,
  getCareerAdvice,
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
export { recordUsage, bumpAIQuestions, countUsageToday, getUsageSummary } from "./usage/usage";
export type { UsageSummary } from "./usage/usage";
export { getMemories, upsertMemory, setExamGoal } from "./memory/memory-store";
export { getStudentModel } from "./student-model";
export type { StudentModel } from "./student-model";

// AI agent (Phase 1)
export { createAgentTurn } from "./application/services";
export type { AgentTurnRequest } from "./application/services";
export { runAgentTurn } from "./agent/loop";
export type { AgentTurnResult, AgentStatus } from "./agent/loop";
export { validateAgentRequest } from "./schemas";
export { validateAgentOutput, agentResponseText } from "./agent/response";
export type { AgentResponse, AgentBlock, AgentAction } from "./agent/response";
export { MAX_AGENT_STEPS } from "./agent/prompt";