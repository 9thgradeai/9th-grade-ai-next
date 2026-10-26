// Structured web search (Tavily REST, no SDK dependency).
//
// This is the single retrieval seam: the assistant tool and the explanation
// evidence stage both consume it. It never throws — callers must be able to
// distinguish "search failed" from "no results" without exception handling.

import "server-only";

const TAVILY_URL = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS = 5;
const MAX_SNIPPET_CHARS = 2_400;

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  publishedDate: string | null;
  score: number | null;
};

export type WebSearchResponse = {
  ok: boolean;
  /** True when a successful HTTP request returned zero results. */
  empty: boolean;
  results: WebSearchResult[];
  errorCode: "NO_KEY" | "HTTP_ERROR" | "NETWORK_ERROR" | "BAD_PAYLOAD" | null;
  status: number | null;
};

export type WebSearchOptions = {
  maxResults?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
  score?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function webSearch(
  query: string,
  opts: WebSearchOptions = {},
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { ok: false, empty: false, results: [], errorCode: "NO_KEY", status: null };
  }

  const timeoutMs = Math.min(20_000, Math.max(1_000, opts.timeoutMs ?? 10_000));
  const maxResults = Math.min(10, Math.max(1, opts.maxResults ?? DEFAULT_MAX_RESULTS));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query: query.slice(0, 400),
        search_depth: "basic",
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!res.ok) {
      return {
        ok: false,
        empty: false,
        results: [],
        errorCode: "HTTP_ERROR",
        status: res.status,
      };
    }

    const data = (await res.json().catch(() => null)) as { results?: TavilyResult[] } | null;
    if (!data || !Array.isArray(data.results)) {
      return { ok: true, empty: true, results: [], errorCode: "BAD_PAYLOAD", status: res.status };
    }

    const results = data.results.slice(0, maxResults).flatMap((r) => {
      const url = str(r.url).slice(0, 2_000);
      if (!url) return [];
      return [
        {
          title: str(r.title).slice(0, 400),
          url,
          content: str(r.content).slice(0, MAX_SNIPPET_CHARS),
          publishedDate: str(r.published_date).slice(0, 40) || null,
          score: num(r.score),
        },
      ];
    });

    return {
      ok: true,
      empty: results.length === 0,
      results,
      errorCode: null,
      status: res.status,
    };
  } catch {
    return { ok: false, empty: false, results: [], errorCode: "NETWORK_ERROR", status: null };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
