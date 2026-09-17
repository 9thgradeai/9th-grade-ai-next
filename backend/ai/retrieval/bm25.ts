// BM25 search index — in-memory keyword search for Bengali/English question
// text. Complements vector embeddings by catching exact keyword matches that
// semantic search misses (e.g., "BCS 2024" or "অষ্টম শ্রেণি").
// Lightweight implementation without external dependencies.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

export type BM25Document = {
  id: number;
  text: string;
  /** Optional metadata for reranking. */
  metadata?: Record<string, unknown>;
};

export type BM25Result = {
  id: number;
  score: number;
  text: string;
  metadata?: Record<string, unknown>;
};

/** BM25 parameters. */
const K1 = 1.5;
const B = 0.75;

/**
 * Simple Bengali/English tokenizer — splits on whitespace and punctuation,
 * lowercases Latin characters, and preserves Bengali characters.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\u0980-\u09FF\u0960-\u096F\u0964-\u0965a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * In-memory BM25 index for fast keyword search.
 * Build once per request or cache across requests.
 */
export class BM25Index {
  private docs: Map<number, { tokens: string[]; text: string; metadata?: Record<string, unknown> }> = new Map();
  private avgDocLength = 0;
  private totalDocs = 0;
  private df: Map<string, number> = new Map();
  private built = false;

  /** Add a document to the index. */
  add(doc: BM25Document): void {
    const tokens = tokenize(doc.text);
    this.docs.set(doc.id, { tokens, text: doc.text, metadata: doc.metadata });
    this.built = false;
  }

  /** Add multiple documents. */
  addAll(docs: BM25Document[]): void {
    for (const doc of docs) {
      this.add(doc);
    }
  }

  /** Build/rebuild the index after adding documents. */
  build(): void {
    this.totalDocs = this.docs.size;
    if (this.totalDocs === 0) {
      this.avgDocLength = 0;
      this.built = true;
      return;
    }

    // Calculate average document length
    let totalLength = 0;
    for (const doc of this.docs.values()) {
      totalLength += doc.tokens.length;
    }
    this.avgDocLength = totalLength / this.totalDocs;

    // Calculate document frequency for each term
    this.df.clear();
    for (const doc of this.docs.values()) {
      const uniqueTokens = new Set(doc.tokens);
      for (const token of uniqueTokens) {
        this.df.set(token, (this.df.get(token) ?? 0) + 1);
      }
    }

    this.built = true;
  }

  /**
   * Search the index with a query string.
   * Returns results sorted by BM25 score (descending).
   */
  search(query: string, topK: number = 10): BM25Result[] {
    if (!this.built) this.build();

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = new Map<number, number>();

    for (const token of queryTokens) {
      const docFreq = this.df.get(token) ?? 0;
      if (docFreq === 0) continue;

      // IDF component: log((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log((this.totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);

      for (const [docId, doc] of this.docs) {
        // Term frequency in this document
        let tf = 0;
        for (const t of doc.tokens) {
          if (t === token) tf++;
        }
        if (tf === 0) continue;

        // BM25 score component
        const docLen = doc.tokens.length;
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * (docLen / this.avgDocLength));
        const score = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) ?? 0) + score);
      }
    }

    // Sort by score and return top K
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id, score]) => {
        const doc = this.docs.get(id)!;
        return { id, score, text: doc.text, metadata: doc.metadata };
      });
  }

  /** Get index size. */
  get size(): number {
    return this.totalDocs;
  }

  /** Clear the index. */
  clear(): void {
    this.docs.clear();
    this.df.clear();
    this.totalDocs = 0;
    this.avgDocLength = 0;
    this.built = false;
  }
}

/**
 * Global BM25 index instance — built lazily on first search.
 * Refreshed every 5 minutes in production.
 */
let globalIndex: BM25Index | null = null;
let lastBuildTime = 0;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Get or build the global BM25 index.
 * In production, refreshes periodically.
 */
export async function getBM25Index(): Promise<BM25Index> {
  const now = Date.now();
  if (globalIndex && now - lastBuildTime < REFRESH_INTERVAL_MS) {
    return globalIndex;
  }

  // Build fresh index
  globalIndex = new BM25Index();
  lastBuildTime = now;

  try {
    // Import Prisma client dynamically to avoid circular deps
    const { prisma } = await import("~backend/db");

      // Fetch questions in batches for indexing
      const batchSize = 1000;
      let offset = 0;
      let totalIndexed = 0;

      while (true) {
        const questions = await prisma.question.findMany({
          select: { id: true, question: true, explanation: true, options: true },
          skip: offset,
          take: batchSize,
        });

        if (questions.length === 0) break;

        for (const q of questions) {
          const optionsText = Array.isArray(q.options)
            ? (q.options as string[]).join(" ")
            : typeof q.options === "string"
              ? q.options
              : "";
          const text = [q.question, q.explanation ?? "", optionsText].filter(Boolean).join(" ");

          globalIndex.add({ id: q.id, text });
        }

      totalIndexed += questions.length;
      offset += batchSize;

      if (questions.length < batchSize) break;
    }

    globalIndex.build();
    log.info("BM25 index built", { documents: totalIndexed });
  } catch (err) {
    log.error("Failed to build BM25 index", { error: String(err) });
    // Return empty index — search will return no results
    globalIndex = new BM25Index();
  }

  return globalIndex;
}
