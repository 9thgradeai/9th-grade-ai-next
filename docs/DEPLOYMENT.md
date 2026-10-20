# Deployment

Production runs on **Vercel**; **GitHub Actions is the only thing that deploys** (ADR-065). Vercel's own Git-integration deploys are disabled (`"github": { "enabled": false }` in `vercel.json`), so nothing reaches an environment without passing CI first.

## Pipeline

```
pull request ──► CI (.github/workflows/ci.yml)
                  test · e2e · perf · secret-scan
             └─► Deploy [preview] (.github/workflows/deploy.yml)
                  vercel pull (Preview env) → vercel build → deploy --prebuilt
                  → sticky PR comment with the preview URL

push to main ──► CI (same gates)
             └─► Deploy [production]  (workflow_run — only if CI succeeded)
                  1. npm ci
                  2. vercel pull --environment=production
                  3. db:deploy-sync   ← schema push + seed, BEFORE code goes live
                  4. vercel build + deploy --prebuilt --prod
                  5. smoke test: GET /api/health must return 200 { "status": "ok" }

manual       ──► workflow_dispatch on the Deploy workflow → production deploy
```

Ordering guarantees:

- **Nothing ships from a red branch.** Production is triggered by `workflow_run` on a successful CI run of `main`; a failed CI means no deploy.
- **Schema before code.** `db:deploy-sync` runs in the deploy job *before* `vercel deploy`, against Neon via `DIRECT_DATABASE_URL` — the new deployment never boots against a stale schema. Old code keeps serving while the deploy builds, so schema changes must be **additive-first** (add columns/tables → deploy → backfill → drop only in a later deploy).
- **Previews never touch production data.** Preview builds use Vercel's *Preview* environment variables, whose `DATABASE_URL` points at a dedicated Neon **preview branch**.
- **One deploy per ref.** PR previews cancel superseded runs (newest commit wins); production deploys serialize — the newest green commit always deploys last.

## One-time setup

### 1. Vercel (project settings)

- Import the GitHub repo. Leave "Deployments" settings as they are — auto-deploy from Git is off via `vercel.json`.
- **Production environment variables** — set every variable in the matrix below (Project → Settings → Environment Variables → *Production*).
- **Preview environment variables** — same keys, but `DATABASE_URL` and `DIRECT_DATABASE_URL` point at the Neon **preview branch** (see step 2). `AUTH_SECRET` may reuse the production value or a separate preview secret.

### 2. Neon (database branches)

- **Production branch**: whatever the production `DATABASE_URL` already points at (the `main` Neon branch by default).
- **Preview branch** (one-time, ~1 minute):

  ```bash
  npx @neondatabase/cli@latest branches create --name preview
  # or: Neon dashboard → Branches → Create branch → "preview"
  ```

  Put the branch's **pooled** URL into Vercel Preview `DATABASE_URL` and its **direct** URL into Preview `DIRECT_DATABASE_URL`, then seed it once: `npm run db:seed` with those URLs exported.

### 3. GitHub (repo settings)

- **Settings → Secrets and variables → Actions → Secrets**:
  | Secret | Value |
  |--------|-------|
  | `VERCEL_TOKEN` | Vercel → Account Settings → Tokens (team-scoped) |
  | `VERCEL_ORG_ID` | Team slug/ID (dashboard URL segment after `/teams/`), or `npx vercel link` locally and read `.vercel/project.json` |
  | `VERCEL_PROJECT_ID` | From `.vercel/project.json` after `vercel link`, or `npx vercel project ls` |
- **Settings → Environments → `production`** (created automatically on first deploy run): optionally add required reviewers for a manual approval gate; variable `PRODUCTION_URL` (already set to `https://9th-grade-ai.vercel.app` — the project's primary domain; update it if a custom domain is attached).
- **Settings → Branches → Branch protection on `main`**: require PRs, block direct pushes, and require these status checks: `test`, `e2e`, `perf`, `secret-scan` (the `CI` workflow jobs).

### 4. Cutover order (important)

Set the GitHub secrets **first**, then merge the change that added `github.enabled: false`. If the merge lands before the secrets exist, Vercel stops auto-deploying `main` and the Deploy workflow fails on missing secrets — production simply keeps serving the last deployed build (nothing breaks, but nothing ships until the secrets are added and the workflow is re-run).

## Environment variables

Full classification (PRIVILEGED / SENSITIVE / PUBLIC) lives in `.env.local.example`. Where each is set:

| Variable | Vercel Production | Vercel Preview | GitHub Actions |
|----------|:-:|:-:|:-:|
| `DATABASE_URL` (pooled) / `DIRECT_DATABASE_URL` | ✅ Neon main branch | ✅ Neon **preview** branch | — (pulled from Vercel at deploy time) |
| `AUTH_SECRET` (+ optional `AUTH_SECRET_PREVIOUS`) | ✅ | ✅ | — |
| `NEXT_PUBLIC_APP_URL` (+ optional `NEXT_PUBLIC_SITE_URL` for canonical URLs) | ✅ `https://9th-grade-ai.vercel.app` | ✅ preview URL | — |
| `CRON_SECRET` | ✅ (both crons 503 without it) | — | — |
| `REDIS_URL` | ✅ (falls back to per-instance memory — see ADR-0009) | optional | — |
| `ANTHROPIC_API_KEY` / `GROQ_API_KEY` | ✅ optional (mock fallback when unset) | optional | — |
| `SMTP_*` / `RESEND_API_KEY` / `EMAIL_FROM` | ✅ optional | — | — |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | ✅ optional | — | — |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | — | — | ✅ repo secrets |

No secrets are ever duplicated into GitHub except the three `VERCEL_*` values — database credentials stay in Vercel and are pulled at deploy time (`vercel env pull`, step 3 of the production job).

## Database sync on deploy

- The repo does not use Prisma migrations; the schema is pushed directly (`db:deploy-sync` = `prisma db push` + `db:seed`, idempotent).
- Sync runs **only** in the production deploy job, **before** the new code is promoted. It does **not** run in `vercel build` and never runs for previews.
- Destructive changes (renames, drops, type changes) need an explicit, human-run step — `prisma db push` will refuse data-loss changes without `--accept-data-loss` (never add it to the deploy pipeline). Do those out-of-band per `docs/DATABASE.md`.

## Crons

Defined in `vercel.json` (Vercel Cron, no extra infra):

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/daily-current-affairs` | daily 00:00 UTC | AI-generated daily current-affairs |
| `/api/storage/worker` | daily 01:00 UTC | Storage cleanup job queue |

Both require `Authorization: Bearer $CRON_SECRET` and return `503` when `CRON_SECRET` is unset — set it in Vercel Production.

## Rollback

1. **Fastest**: Vercel dashboard → Deployments → previous healthy deployment → **Promote to Production** (instant, no rebuild).
2. Then align `main`: `git revert <sha> && git push origin main` — the Deploy workflow re-runs; `db:deploy-sync` is idempotent so the schema step is a no-op unless the revert touched `schema.prisma`.
3. **Schema rollback is forward-fix**: `db push` does not down-grade. Write a new additive change and redeploy (step 2).

## Monitoring

- **Health**: `GET /api/health` → `200 { "status": "ok" }` when DB + Redis are healthy (`503` otherwise). The production deploy smoke-tests it with retries after every deploy; alert on repeated failures (Vercel + Neon + Upstash dashboards).
- **Errors**: Sentry via `instrumentation.ts` — set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client); releases are auto-tagged from `COMMIT_SHA`.
- **Logs**: structured JSON via `~backend/infrastructure/observability/logger`; level tunable with `LOG_LEVEL`. View in Vercel → Observability / runtime logs.

## Local parity

```bash
npx vercel env pull .env.local   # same env the preview build would use
npm run build && npm run start   # identical to Vercel's buildCommand/start
```
