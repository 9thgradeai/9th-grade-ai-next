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
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | No | AI features (mock fallback if empty) |
| `NODE_ENV` | Auto | Set to `production` |

## Database (Production)

The Vercel build runs `npm run db:sync` (`prisma db push` + idempotent seed)
automatically when `VERCEL=1`, so schema and seed data stay in sync on every
production deploy.

For manual application:

1. Provision a PostgreSQL database (e.g., Neon, Supabase, AWS RDS).
2. Update `DATABASE_URL` in `.env.local` (or your hosting provider's env config).
3. Run migrations (schema push):

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
