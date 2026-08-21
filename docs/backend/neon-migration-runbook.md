# Neon Migration Runbook — Railway → Neon PostgreSQL

> Operator-facing procedure. Execute only after the app-hardening gates below are
> green (they are, as of this commit). **Never** delete Railway resources until
> rollback confidence is established (≥14 days on Neon).

## 0. Pre-flight (application side — already done in this repo)

- [x] Versioned migrations exist (`database/prisma/migrations/000…005`), chain
      verified end-to-end on scratch Postgres.
- [x] Seed is idempotent/upsert-only — safe against production data.
- [x] Deploy hook is non-destructive (`prebuild` = tolerant `prisma migrate deploy`).
- [ ] **Operator**: one-time baseline resolution on Railway BEFORE first deploy of this branch:
      ```bash
      DATABASE_URL="<railway-url>" npx prisma migrate resolve --applied 000000000000_init --schema database/prisma/schema.prisma
      ```
      Migrations 001–005 then apply automatically on the next Vercel build.

## 1. Provision Neon

1. Create project `9th-grade-ai` (region closest to users; `aws-us-east-1` fine for BDT via CF).
2. Create **three branches**: `main` (production), `staging`, `dev`.
3. Copy BOTH connection strings per branch:
   - **Pooled** (`...-pooler.neon.tech/...`, pgbouncer) → serverless runtime (`DATABASE_URL`).
   - Direct → migrations/admin (`DIRECT_DATABASE_URL`, optional).
4. Enable extension (needed by future RAG activation):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

## 2. Staging rehearsal

```bash
# Snapshot source of truth FIRST (custom format, compresses well)
pg_dump "$RAILWAY_URL" -Fc -f railway-snapshot.dump

# Restore into Neon staging (direct, non-pooled URL)
pg_restore --clean --if-exists -d "$NEON_STAGING_DIRECT" railway-snapshot.dump

# Align Prisma history: staging already has objects → mark baseline applied
DATABASE_URL="$NEON_STAGING_POOLED" npx prisma migrate resolve --applied 000000000000_init --schema database/prisma/schema.prisma
DATABASE_URL="$NEON_STAGING_POOLED" npx prisma migrate deploy     --schema database/prisma/schema.prisma   # applies 001–005
```

Validate:
```sql
-- Row counts match Railway per table (spot list)
SELECT 'User', COUNT(*) FROM "User"
UNION ALL SELECT 'Question', COUNT(*) FROM "Question"
UNION ALL SELECT 'Bookmark', COUNT(*) FROM "Bookmark"
UNION ALL SELECT 'QuestionAttempt', COUNT(*) FROM "QuestionAttempt";

-- FK integrity sweep (must return zero rows)
SELECT c.conrelid::regclass AS tbl, c.conname
FROM pg_constraint c
WHERE c.contype='f' AND NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE conindid=c.conindid AND convalidated);
```

Then: point staging Vercel preview at Neon staging env vars → run `npm run test`,
manual smoke (login, exam build/submit, tutor stream with mock keys absent),
and the k6 smoke (`tests/load/k6-smoke.js`) at 100 VUs.

## 3. Production cutover (low-traffic window)

1. Freeze writes (announce; ~10 min).
2. Final dump: `pg_dump "$RAILWAY_URL" -Fc -f final.dump`
3. Restore to Neon prod branch (as §2).
4. `migrate resolve` + `deploy` against prod branch.
5. Flip Vercel env `DATABASE_URL` → Neon pooled URL; redeploy.
6. Smoke: login → dashboard → questions → exam build/submit → AI tutor (mock) → flashcards review.
7. Unfreeze. Monitor error rate + P95s for 48h.

## 4. Rollback (any point before decommission)

Vercel env `DATABASE_URL` → previous Railway pooled/direct URL → redeploy.
Railway stays untouched throughout; nothing writes there after freeze except the
final restore source. Data written to Neon during the observation window is lost on
rollback — acceptable only within the first hours; after that, reverse-replicate or
accept loss explicitly.

## 5. Decommission Railway

Only after ≥14 days stable: final `pg_dump` archived to cold storage (two copies),
then delete the Railway Postgres plugin.

## Connection handling notes

- Serverless functions MUST use the **pooled** host (Neon pooler); direct host
  exhausts connections under fan-out.
- Prisma `connection_limit=10` param is a sane start on pooled URLs if needed.
