// backend/services/adaptive-exam/hash.ts
// Deterministic content hashing for immutable adaptive snapshots.
// Key order is normalised so the same logical object always hashes identically,
// regardless of the order in which a caller assembled its properties.

import "server-only";

import { createHash } from "node:crypto";

/** Stable JSON: object keys sorted, arrays kept in order, undefined omitted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Hash a domain snapshot. Volatile audit fields are excluded by the caller. */
export function hashSnapshot(value: unknown): string {
  return sha256(canonicalJson(value));
}
