// backend/ai/retrieval — structural alias (Phase 13).
// Today: Tavily web-search grounding. Tomorrow: pgvector similarity search
// (docs/backend/FINAL-REPORT.md §RAG) behind the same retrieval seam.
export { searchForIntent } from "../tools/search";
export type { WebSearchBlock } from "../tools/search";
