# Neon Migration Runbook — Railway → Neon PostgreSQL

> **STATUS: COMPLETE (2026-09-12).** Production now runs entirely on Neon
> (`ninth_grade_ai`). Railway is retained as rollback target ≥14 days, then
> decommissioned per §5. This document is the operator-facing record + going-forward
> maintenance guide.

## 0. Final architecture (as executed)

- **Schema synchronization:** `prisma db push` is the canonical mechanism
  (per AGENTS.md — migrations are not used). Deploy hook `db:deploy-sync`
  (package.json `prebuild`, Vercel `VERCEL=1`) runs:
  1. `tsx scripts/heal-source-keys.ts` — dedupes seed-source key collisions.
  2. `prisma db push --skip-generate --accept-data-loss` — pushes current schema.
  3. `npm run db:seed` — idempotent, upsert-only; never deletes content rows.
  All three target `DIRECT_DATABASE_URL` when set, else `DATABASE_URL`.
- **Runtime:** serverless reads/writes use the Neon **pooled** URL (`DATABASE_URL`).
  `DIRECT_DATABASE_URL` (direct host) is used only for the build-time sync.
- **Migration history:** one truthful baseline
  `000000000000_production_schema_baseline` (complete DDL of the CURRENT schema),
  generated with `prisma migrate diff` and marked applied on Neon. It exists so
  `prisma migrate deploy` stays a coherent no-op; it is NOT the deploy mechanism.
  Verified: baseline reproduces `schema.prisma` with zero diff (shadow-DB check),
  live Neon has zero drift from `schema.prisma`.
- **Independence proof:** a fresh, empty Neon DB + repo alone (`db push` +
  `db:seed`) reproduced the full content schema (2,391 questions, 10 subjects,
  357 topics, 3 mock tests, 4 exam archives, 15 flashcards, 8 badges).
  No Railway, no dump, no external step required.
- **Non-destructiveness:** seed deletes per-user data ONLY when explicit
  `SEED_RESET_USERS=1` (never set in build). User-owned rows (14 users, question
  attempts, progress) and the 446 legacy questions beyond current seed data are
  preserved forever.

## 1. Environment configuration (Vercel production)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled → `...ep-empty-mouse-avz32yjd-pooler.../ninth_grade_ai?sslmode=require` |
| `DIRECT_DATABASE_URL` | Neon direct → `...ep-empty-mouse-avz32yjd.../ninth_grade_ai?sslmode=require` |

## 2. Re-running schema/content sync (operator)

```bash
# Sets schema + seed on the target Neon DB using only this repo.
DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}" npm run db:deploy-sync
```

## 3. Recreating a database from scratch (no external dependency)

```bash
# Empty Neon DB `ninth_grade_ai_rebuild`:
DATABASE_URL="$NEON_DIRECT_URL…/ninth_grade_ai_rebuild?sslmode=require" npx prisma db push --skip-generate
DATABASE_URL="$NEON_DIRECT_URL…/ninth_grade_ai_rebuild?sslmode=require" npm run db:seed
```

## 4. Rollback (before Railway decommission)

Vercel env `DATABASE_URL` → previous Railway pooled/direct URL → redeploy.
Data written to Neon during the observation window is lost on rollback —
acceptable only within the first hours; after that accept loss explicitly.

## 5. Decommission Railway

Only after ≥14 days stable on Neon: archive a final `pg_dump -Fc` to cold storage
(two copies), then delete the Railway Postgres plugin. Keep the archived dump
forever as the last fallback (currently at
`/tmp/railway-neon-migration/railway-20260912-011844.dump`).

## Connection handling notes

- Serverless functions MUST use the **pooled** host (Neon pooler); the direct host
  exhausts connections under fan-out.
- Prisma `connection_limit=10` param is a sane start on pooled URLs if needed.