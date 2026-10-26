/* Server-only web-search helper for AI endpoints.
   Delegates to the structured retrieval seam (`~backend/ai/retrieval/web-search`)
   and formats a grounding block. Returns "" when no key is set, the search
   fails, or there are no results; callers fall back to model-only answers. */

import "server-only";

import { webSearch } from "~backend/ai/retrieval/web-search";

const MAX_RESULTS = 5;
const SNIPPET_CHARS = 600;

export type WebSearchBlock = {
  query: string;
  block: string;
  results: number;
};

export async function searchWeb(query: string): Promise<WebSearchBlock> {
  const response = await webSearch(query, { maxResults: MAX_RESULTS });
  const results = response.results.slice(0, MAX_RESULTS);

  if (results.length === 0) {
    return { query, block: "", results: 0 };
  }

  const block = results
    .map(
      (r, i) =>
        `[WEB ${i + 1}] ${r.title || "(no title)"} (${r.url})\n` +
        `${(r.content ?? "").slice(0, SNIPPET_CHARS)}`,
    )
    .join("\n\n");

  return { query, block, results: results.length };
}
