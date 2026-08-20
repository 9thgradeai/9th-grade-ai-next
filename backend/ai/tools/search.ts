// SearchTool — web-search as a tool, not the architecture. Only invoked when
// an intent is freshness-sensitive; failures degrade gracefully to model-only.

import "server-only";

import { searchWeb, type WebSearchBlock } from "../../../app/api/ai/_search";
import type { AIIntent } from "../types";

const NEVER_SEARCH = new Set<AIIntent>([
  "solve",
  "hint",
  "quiz",
  "question_generation",
  "analyze_performance",
  "plan",
  "recommend",
  "revise",
]);

/**
 * Decide whether to search the web for an intent, and run the search if so.
 * Returns an empty block when no key is set, the intent doesn't need web data,
 * or the search fails.
 */
export async function searchForIntent(
  intent: AIIntent | undefined,
  query: string,
): Promise<WebSearchBlock> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { query, block: "", results: 0 };

  const needsWeb = !intent || !NEVER_SEARCH.has(intent);
  if (!needsWeb) return { query, block: "", results: 0 };

  return searchWeb(query);
}