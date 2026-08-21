// backend/infrastructure/storage/local-disk.ts — dev/test driver (Phase 17).
// Files land under a single base directory; keys are sanitized and resolved
// inside it (path-traversal proof). Production swaps to an S3-compatible
// driver (Cloudflare R2 first: zero egress) behind the same interface.

import "server-only";

import { existsSync } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { ObjectStorage, StoredObject } from "./types";

export class LocalDiskStorage implements ObjectStorage {
  readonly name = "local-disk";

  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const safe = path.resolve(this.baseDir, key.replace(/\\/g, "/"));
    if (!safe.startsWith(path.resolve(this.baseDir) + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return safe;
  }

  async put(key: string, data: Uint8Array, opts?: { contentType?: string }): Promise<StoredObject> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return { key, size: data.byteLength, contentType: opts?.contentType };
  }

  async get(key: string): Promise<{ data: Uint8Array; contentType?: string } | null> {
    const target = this.resolve(key);
    if (!existsSync(target)) return null;
    const data = await readFile(target);
    return { data: new Uint8Array(data) };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  /** Local driver serves via an API route; production signs URLs instead. */
  async url(key: string): Promise<string> {
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

}
