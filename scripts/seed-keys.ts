/**
 * scripts/seed-keys.ts
 * ----------------------------------------------------------------------------
 * Deterministic seed identities ("sourceKey") for seed-managed content rows.
 *
 * The seeder upserts by these keys instead of wiping tables, so row ids —
 * and every user row referencing them (bookmarks, attempts, read markers,
 * quiz participations) — stay stable across deploys.
 *
 * PARITY CONTRACT with database/prisma/migrations/000000000002_seed_source_keys:
 *   sourceKey(a, b, ...) === PostgreSQL md5(a || '|' || b || ...)
 * where null/undefined parts are COALESCEd to '' on both sides. Node's md5
 * hex digest and PostgreSQL md5() hash identical UTF-8 bytes. Any change to
 * the part order/format here MUST be mirrored in a new migration.
 * ----------------------------------------------------------------------------
 */
import { createHash } from "crypto";

export function sourceKey(...parts: Array<string | number | null | undefined>): string {
  return createHash("md5")
    .update(parts.map((p) => String(p ?? "")).join("|"))
    .digest("hex");
}
