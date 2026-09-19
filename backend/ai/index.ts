// backend/ai — public API for the AI domain.
//
// Route handlers import from here only; business logic stays inside this layer.

export {
  createTutorTurn,
  solveQuestion,
  explainQuestion,
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

// Agent checkpoint system (Phase 3)
export {
  saveCheckpoint,
  getLatestCheckpoint,
  getCheckpoint,
  clearCheckpoints,
  getCheckpointCount,
} from "./agent/checkpoint";
export type { AgentCheckpoint } from "./agent/checkpoint";

// Task-aware context slices + personalization (AI Study Copilot)
export { resolveContextPlan } from "./context/resolver";
export type { ContextPlan } from "./context/resolver";
export { loadContextSlices } from "./context/slices";
export { renderSlicesForPrompt } from "./context/render";
export { buildMistakePatterns, analyzeMistakePatterns } from "./analysis/mistakes";
export type { MistakeRow } from "./analysis/mistakes";
export { getAIOpening, composeOpening } from "./opening";
export type { AIOpening, AIOpeningInsight, AIOpeningPrompt, OpeningFacts } from "./opening";

// Infrastructure — tracing, metrics, circuit breaker, retry, dedup, token budgets
export { createTraceContext, traced, startTimer } from "./infrastructure/tracing";
export type { TraceContext, TraceSpan } from "./infrastructure/tracing";
export {
  recordAiRequest,
  recordToolExecution,
  recordAgentStep,
  recordProviderFailover,
  recordCacheHit,
  recordRetrieval,
  flushMetrics,
  getAllMetrics,
  getMetricsByPrefix,
  resetMetrics,
} from "./infrastructure/metrics";
export {
  isCircuitClosed,
  recordSuccess as recordCircuitSuccess,
  recordFailure as recordCircuitFailure,
  resetCircuit,
  getAllCircuitStates,
} from "./infrastructure/circuit-breaker";
export { withRetry, withRetryOrFallback } from "./infrastructure/retry";
export { deduplicate, isInFlight, getInFlightCount } from "./infrastructure/dedup";
export {
  TUTOR_BUDGET,
  SOLVER_BUDGET,
  ASSISTANT_BUDGET,
  AGENT_BUDGET,
  EVALUATOR_BUDGET,
  enforceInputBudget,
  clampMaxTokens,
  truncateMessages,
} from "./infrastructure/token-budget";
export type { TokenBudget } from "./infrastructure/token-budget";