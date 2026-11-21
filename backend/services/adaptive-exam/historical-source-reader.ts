// backend/services/adaptive-exam/historical-source-reader.ts
// Server-only filesystem adapter for the Phase 05 source reader port.
//
// It accepts only descriptors from the explicit catalogue and resolves their
// repo-relative paths inside a fixed root, so a caller cannot turn a source id
// into an arbitrary filesystem read.

import "server-only";

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { IsoTimestamp } from "./contracts";
import type { HistoricalSourceDescriptor } from "./historical-sources";

export type HistoricalSourceContent = Readonly<{
  text: string;
  sha256: string;
  byteSize: number;
  retrievedAt: IsoTimestamp;
}>;

export interface HistoricalSourceReader {
  read(source: HistoricalSourceDescriptor): Promise<HistoricalSourceContent>;
}

export type CreateFileSystemSourceReaderOptions = Readonly<{
  rootDir?: string;
  now(): IsoTimestamp;
}>;

export function createFileSystemHistoricalSourceReader(
  options: CreateFileSystemSourceReaderOptions,
): HistoricalSourceReader {
  const root = path.resolve(options.rootDir ?? process.cwd());

  return {
    async read(source) {
      const resolved = path.resolve(root, source.filePath);
      const relative = path.relative(root, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Historical source path escapes the configured root.");
      }

      const info = await stat(resolved);
      if (!info.isFile()) {
        throw new Error("Historical source path is not a file.");
      }
      const buffer = await readFile(resolved);
      return {
        text: buffer.toString("utf8"),
        sha256: createHash("sha256").update(buffer).digest("hex"),
        byteSize: buffer.byteLength,
        retrievedAt: options.now(),
      };
    },
  };
}
