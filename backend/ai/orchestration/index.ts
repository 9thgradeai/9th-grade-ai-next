// backend/ai/orchestration — structural alias (Phase 13).
// The orchestration layer lives in ../application/services; this barrel gives
// it the target-architecture name so imports can migrate gradually without
// breaking anything.
export {
  createTutorTurn,
  solveQuestion,
  assistantTurn,
  detectIntent,
} from "../application/services";
export { summarizeConversationTitle, DEFAULT_TITLE } from "../application/title";
export { buildContext } from "../context/context-engine";
