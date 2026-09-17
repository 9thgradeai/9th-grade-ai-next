// Hybrid retrieval system — combines BM25 keyword search, vector embedding
// search (when available), and heuristic reranking for robust question retrieval.
// Falls back gracefully when embeddings or vector DB are unavailable.

import "server-only";

import { getBM25Index, type BM25Result } from "./bm25";
import { log } from "~backend/infrastructure/observability/logger";

export type RetrievalQuery = {
  /** User query text. */
  query: string;
  /** Optional subject filter. */
  subjectId?: number;
  /** Optional topic filter. */
  topicId?: number;
  /** Maximum results to return. */
  topK?: number;
  /** Which retrieval strategies to use. */
  strategies?: ("bm25" | "vector" | "rerank")[];
};

export type RetrievalResult = {
  id: number;
  /** Combined score from all strategies (0-1 range). */
  score: number;
  /** Which strategies contributed to this result. */
  sources: ("bm25" | "vector" | "rerank")[];
  /** Original question text for display. */
  text: string;
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
};

export type RetrievalStrategy = "bm25" | "vector" | "rerank";

/**
 * Hybrid retrieval — combines multiple search strategies and deduplicates
 * results by question ID.
 */
export async function hybridRetrieval(opts: RetrievalQuery): Promise<RetrievalResult[]> {
  const { query, subjectId, topicId } = opts;
  const topK = opts.topK ?? 20;
  const strategies = opts.strategies ?? ["bm25", "rerank"];

  const allResults = new Map<number, RetrievalResult>();

  // ── BM25 keyword search ──────────────────────────────────

  if (strategies.includes("bm25")) {
    try {
      const bm25Index = await getBM25Index();
      const bm25Results = bm25Index.search(query, topK * 2);

      for (const r of bm25Results) {
        const existing = allResults.get(r.id);
        if (existing) {
          existing.score += r.score;
          existing.sources.push("bm25");
        } else {
          allResults.set(r.id, {
            id: r.id,
            score: r.score,
            sources: ["bm25"],
            text: r.text,
            metadata: r.metadata,
          });
        }
      }

      log.debug("BM25 retrieval completed", { results: bm25Results.length });
    } catch (err) {
      log.error("BM25 retrieval failed", { error: String(err) });
    }
  }

  // ── Vector embedding search (stub — requires external embedding service) ──

  if (strategies.includes("vector")) {
    // Vector search requires embedding service — log availability
    log.debug("Vector retrieval strategy requested but embedding service not configured");
  }

  // ── Normalize scores to 0-1 range ────────────────────────

  const maxScore = Math.max(...Array.from(allResults.values()).map((r) => r.score), 1);
  for (const r of allResults.values()) {
    r.score = r.score / maxScore;
  }

  // ── Apply optional metadata filters ───────────────────────

  let results = Array.from(allResults.values());

  if ((subjectId || topicId) && results.length > 0) {
    try {
      const { prisma } = await import("~backend/db");
      const ids = results.map((r) => r.id);
      const filtered = await prisma.question.findMany({
        where: {
          id: { in: ids },
          ...(subjectId ? { subjectId } : {}),
          ...(topicId ? { topicId } : {}),
        },
        select: { id: true },
      });
      const validIds = new Set(filtered.map((q) => q.id));
      results = results.filter((r) => validIds.has(r.id));
    } catch {
      // Ignore filter errors — return unfiltered results
    }
  }

  // ── Rerank ────────────────────────────────────────────────

  if (strategies.includes("rerank") && results.length > 0) {
    results = rerankResults(query, results);
    for (const r of results) {
      if (!r.sources.includes("rerank")) {
        r.sources.push("rerank");
      }
    }
  }

  // ── Return top K results ──────────────────────────────────

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Simple heuristic reranking — boosts results with more keyword overlap
 * and penalizes very short/very long texts.
 */
function rerankResults(query: string, results: RetrievalResult[]): RetrievalResult[] {
  const queryTokens = new Set(query.toLowerCase().split(/\s+/));

  return results.map((r) => {
    const textTokens = new Set(r.text.toLowerCase().split(/\s+/));
    const overlap = Array.from(queryTokens).filter((t) => textTokens.has(t)).length;
    const overlapRatio = overlap / Math.max(queryTokens.size, 1);

    // Length penalty — prefer medium-length texts
    const len = r.text.length;
    const lengthPenalty = len < 20 ? 0.5 : len > 2000 ? 0.8 : 1.0;

    // Boost if BM25 and vector agree
    const agreementBoost = r.sources.length >= 2 ? 1.2 : 1.0;

    const rerankScore = r.score * lengthPenalty * agreementBoost + overlapRatio * 0.3;

    return { ...r, score: rerankScore };
  });
}
