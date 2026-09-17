# Deployment

## Build

```bash
npm run build
```

This creates an optimized production build in `.next/`.

## Start

```bash
npm run start
```

Runs the production server on the port defined by `PORT` (default 3000).

## Environment Variables (Production)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | JWT signing secret (generate with `openssl rand -base64 32`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string — on Neon/serverless use the **pooled** host with `?connection_limit=10` so function fan-out cannot exhaust `max_connections` |
| `REDIS_URL` | Yes (prod) | Distributed rate limiting (Upstash/Redis). Without it each serverless instance enforces its own counters — see `docs/DECISIONS.md` ADR-0009 |
| `ANTHROPIC_API_KEY` | No | AI features (mock fallback if empty) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | No | Transactional email (verification links) via SMTP, e.g. a free Gmail App Password. See `docs/EMAIL.md`. When unset, `RESEND_API_KEY` is used; when neither is set, accounts auto-verify. |
| `SMTP_PORT` / `SMTP_SECURE` / `EMAIL_FROM` | No | Optional SMTP tuning. Defaults: port `587`, `SMTP_SECURE=false`, `EMAIL_FROM` falls back to `SMTP_USER`. |
| `RESEND_API_KEY` | No | Alternative transactional transport when SMTP is not configured. See `docs/EMAIL.md`. |
| `NODE_ENV` | Auto | Set to `production` |

## Database (Production)

**Production database: Neon PostgreSQL** (`ninth_grade_ai`). Runtime uses the
**pooled** connection (function fan-out cannot exhaust `max_connections`); the
build-time schema sync uses the **direct** connection.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL — runtime reads/writes |
| `DIRECT_DATABASE_URL` | Neon **direct** URL — build-time `db:deploy-sync` schema push + seed |

Schema changes ship via **direct push** (`prisma db push`), not migration files
(single truthful baseline migration exists so `migrate deploy` stays a no-op, but
it is not the deploy mechanism). On every Vercel deploy the `prebuild` hook runs
`npm run db:deploy-sync` when `VERCEL=1`:
1. `scripts/heal-source-keys.ts` — dedupe seed-source key collisions, and
2. `prisma db push --skip-generate --accept-data-loss --schema …`, then
3. `npm run db:seed` — idempotent upsert-only seed (never deletes content rows).

It targets `DIRECT_DATABASE_URL` when set, falling back to `DATABASE_URL`.

**Deploys are content-safe but schema-forgiving.** The push uses a non-empty
`--accept-data-loss` diff to drift back to the declared schema — the schema is
the source of truth and DB content (rows) is never dropped by it except when a
matching column/table is removed from `schema.prisma`. Before removing a column
or table, run the force-push flow once by hand against production and review
the diff first:

```bash
DATABASE_URL="<prod-direct-url>" npm run db:push-force   # review the diff first!
```

If a deploy fails during schema sync, the build aborts before the new code goes
live. Inspect the deploy log for the offending table, fix the schema or run the
manual command above, then redeploy.

Seeding is idempotent (upserts keyed on stable `sourceKey`s). Per-user data
(attempts, progress, bookmarks, reviews) is never wiped by a deploy —
`SEED_RESET_USERS=1` is required to reset it and is never set in builds.

For manual provisioning from scratch (from the repo alone — no external dump):

1. Provision a PostgreSQL database (e.g., Neon, Supabase, AWS RDS).
2. Update `DATABASE_URL` (+ `DIRECT_DATABASE_URL` for direct-host syncs) in
   `.env.local` or your hosting provider's env config.
3. Push the schema:
4. Seed data:

```bash
npm run db:push
npm run db:seed
```

## Hosting

- **Vercel**: Recommended. Zero-config Next.js deployment.
- **Database**: Neon PostgreSQL (pooled `-pooler.neon.tech` connection string in serverless). Other PaaS options (Supabase/AWS RDS) also work via `DATABASE_URL`.
- **Docker**: Not currently configured, but can be added.

## Rollback

- Vercel: Instant rollback via dashboard.
- Manual: Redeploy previous Git commit.

## Monitoring

- No application monitoring configured.
- Consider adding Vercel Analytics or Sentry.

## SSL

- Handled by hosting provider (Vercel, Railway, etc.).
- Ensure `secure: true` on cookies in production (already handled in `backend/auth.ts`).
