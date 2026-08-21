// backend/ai/retrieval/chunker.ts — pure text chunking for ingestion (Phase 15).

export interface TextChunk {
  index: number;
  text: string;
}

/**
 * Sliding-window chunker with character overlap so sentences spanning
 * boundaries stay retrievable. Pure + deterministic; unit-tested.
 */
export function chunkText(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {},
): TextChunk[] {
  const maxChars = Math.max(64, opts.maxChars ?? 800);
  const overlap = Math.min(Math.max(0, opts.overlap ?? Math.floor(maxChars / 8)), maxChars - 1);

  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length === 0) return [];
  if (clean.length <= maxChars) return [{ index: 0, text: clean }];

  const step = maxChars - overlap;
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < clean.length) {
    const end = Math.min(start + maxChars, clean.length);
    chunks.push({ index, text: clean.slice(start, end).trim() });
    if (end >= clean.length) break;
    start += step;
    index += 1;
  }
  return chunks.filter((c) => c.text.length > 0);
}
