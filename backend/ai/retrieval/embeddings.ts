// backend/ai/retrieval/embeddings.ts — embedding seam (Phase 15).
//
// ACTIVATION STATUS: flag-off. The pipeline (chunk → embed → pgvector) is
// implemented against interfaces; the DATABASE layer activates on Neon, where
// the `vector` extension is available (local Postgres lacks it — see
// docs/backend/FINAL-REPORT.md §RAG). Until a real provider key exists, the
// only implementation is the deterministic HashingEmbedder: it exercises the
// pipeline end-to-end in tests but is NOT semantically meaningful.

import "server-only";

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

const DIMS = 256;

/**
 * DEV-GRADE deterministic embedder: hashed character trigrams into a fixed
 * vector. Stable across runs/processes (same input ⇒ same vector), zero cost,
 * zero network. Clearly NOT semantic similarity.
 */
export class HashingEmbedder implements EmbeddingProvider {
  readonly name = "hashing-dev";
  readonly dimensions = DIMS;

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): Float32Array {
    const vec = new Float32Array(DIMS);
    const norm = text.toLowerCase().replace(/\s+/g, " ");
    for (let i = 0; i < norm.length - 2; i++) {
      const tri = norm.slice(i, i + 3);
      let h = 2166136261;
      for (let j = 0; j < tri.length; j++) {
        h ^= tri.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
      vec[Math.abs(h) % DIMS] += 1;
    }
    // L2-normalize so cosine similarity is a plain dot product downstream.
    let sum = 0;
    for (const v of vec) sum += v * v;
    const len = Math.sqrt(sum) || 1;
    for (let i = 0; i < DIMS; i++) vec[i] /= len;
    return vec;
  }
}

/** Cosine similarity for L2-normalized vectors = dot product. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Activation gate: RAG stays OFF until both an embedding provider is chosen
 * and the pgvector tables exist on the target database.
 */
export function embeddingsEnabled(): boolean {
  return process.env.EMBEDDINGS_ENABLED === "true";
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!embeddingsEnabled()) {
    throw new Error("Embeddings are disabled. Set EMBEDDINGS_ENABLED=true to activate.");
  }
  // Provider selection lands when the first real provider is adopted
  // (OpenAI/Groq-compatible endpoint). Hashing embedder is the dev default.
  return new HashingEmbedder();
}
