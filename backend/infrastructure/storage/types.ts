// backend/infrastructure/storage/types.ts — ObjectStorage seam (Phase 17).
// Binary data NEVER goes to PostgreSQL. The database stores metadata and a
// key reference; bytes live behind this replaceable interface.

import "server-only";

export interface StoredObject {
  key: string;
  size: number;
  contentType?: string;
}

export interface ObjectStorage {
  readonly name: string;
  put(key: string, data: Uint8Array, opts?: { contentType?: string }): Promise<StoredObject>;
  get(key: string): Promise<{ data: Uint8Array; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  /** URL a client can fetch from (signed for private buckets). */
  url(key: string, opts?: { downloadName?: string }): Promise<string>;
}
