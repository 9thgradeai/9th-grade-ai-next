/* Server-only web-search helper for AI endpoints.
   Uses Tavily's plain REST API (no SDK dependency) to fetch top results for a
   query. Returns a formatted, injectable grounding block, or "" when no key is
   set or the search fails — callers fall back to model-only answers. */

const TAVILY_URL = "https://api.tavily.com/search";
const MAX_RESULTS = 5;
const SNIPPET_CHARS = 600;

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
};

export type WebSearchBlock = {
  query: string;
  block: string;
  results: number;
};

export async function searchWeb(query: string): Promise<WebSearchBlock> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return { query, block: "", results: 0 };
  }

  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        api_key: apiKey,
        query: query.slice(0, 400),
        search_depth: "basic",
        max_results: MAX_RESULTS,
      }),
    });

    if (!res.ok) {
      return { query, block: "", results: 0 };
    }

    const data = (await res.json()) as { results?: TavilyResult[] };
    const results = (data.results ?? []).slice(0, MAX_RESULTS);

    if (results.length === 0) {
      return { query, block: "", results: 0 };
    }

    const block = results
      .map(
        (r, i) =>
          `[WEB ${i + 1}] ${r.title ?? "(no title)"} (${r.url ?? "(no url)"})\n` +
          `${(r.content ?? "").slice(0, SNIPPET_CHARS)}`,
      )
      .join("\n\n");

    return { query, block, results: results.length };
  } catch {
    return { query, block: "", results: 0 };
  }
}