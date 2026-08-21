// backend/infrastructure/storage/index.ts — driver selection (Phase 17).
// STORAGE_DRIVER=local-disk (default, dev) | s3-compatible (activation pending,
// Cloudflare R2 first for $0 egress — same interface).

import "server-only";

import path from "path";
import { LocalDiskStorage } from "./local-disk";
import type { ObjectStorage } from "./types";

let storage: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (!storage) {
    const driver = process.env.STORAGE_DRIVER ?? "local-disk";
    if (driver === "local-disk") {
      const base = process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), ".data", "storage");
      storage = new LocalDiskStorage(base);
    } else {
      throw new Error(
        `STORAGE_DRIVER=${driver} is not active yet. Implement an S3-compatible ` +
          `ObjectStorage behind the existing interface (docs/DECISIONS.md).`,
      );
    }
  }
  return storage;
}

export type { ObjectStorage, StoredObject } from "./types";
