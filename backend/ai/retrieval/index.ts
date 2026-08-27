// backend/ai/retrieval — structural alias (Phase 13).
// Today: Tavily web-search grounding + domain RAG over the question bank.
// Tomorrow: pgvector similarity search behind the same retrieval seam.
export { searchForIntent } from "../tools/search";
export type { WebSearchBlock } from "../tools/search";
export { retrieveQuestionBank } from "./knowledge";
export type { DomainRetrieval } from "./knowledge";
