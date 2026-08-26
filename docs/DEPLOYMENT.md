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
| `NODE_ENV` | Auto | Set to `production` |

## Database (Production)

Schema changes ship via **direct push** (`prisma db push`), not migration files.
On every Vercel deploy the `prebuild` hook runs `npm run db:deploy-sync`
(schema push + idempotent seed) when `VERCEL=1`, keeping the production schema
in sync automatically — matching the local `db:push` policy.

**Deploys are non-destructive and fail closed.** The push runs *without*
`--accept-data-loss`: additive changes apply automatically, but any change that
would drop data (removed column/table) fails the deploy loudly instead of
silently destroying production rows. To ship an intentionally destructive
change, run it once by hand against production, then redeploy:

```bash
DATABASE_URL="<prod-url>" npm run db:push-force   # review the diff first!
```

If a deploy fails during schema sync, the build aborts before the new code goes
live. Inspect the deploy log for the offending table, fix the schema or run the
manual command above, then redeploy.

Seeding is idempotent (upserts keyed on stable `sourceKey`s). Mock-test and
daily-quiz question sets are replaced inside a single transaction, so readers
never observe partially-replaced content.

For manual provisioning from scratch:

1. Provision a PostgreSQL database (e.g., Neon, Supabase, AWS RDS).
2. Update `DATABASE_URL` in `.env.local` (or your hosting provider's env config).
3. Push the schema:

```bash
npm run db:push
```

4. Seed data:

```bash
npm run db:seed
```

## Hosting

- **Vercel**: Recommended. Zero-config Next.js deployment.
- **Railway / Render**: Alternative PaaS options.
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
