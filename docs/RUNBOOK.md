# 9Th-Grade AI — Operations Runbook

## Overview
Production deployment for 9Th-Grade AI exam preparation platform.

**Stack**: Next.js 16 (App Router, Turbopack) + Prisma + PostgreSQL (Neon) + Redis + Vercel
**Deploy**: GitHub Actions (CI-gated) → Vercel — see `docs/DEPLOYMENT.md` (ADR-065)
**AI**: Groq (primary) → Anthropic (fallback) → Mock (last resort)

---

## 🔐 Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (Neon, pooled host) | ✅ |
| `REDIS_URL` | Redis connection (Upstash/Railway) | ✅ |
| `AUTH_SECRET` | JWT signing key (32+ bytes, `openssl rand -base64 32`) | ✅ |
| `NEXT_PUBLIC_SITE_URL` | Production URL (e.g., `https://9thgrade.ai`) | ✅ |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `RESEND_API_KEY` | Email transport (SMTP preferred, Resend fallback — `backend/lib/email.ts`) | Optional (accounts auto-verify when unset) |
| `EMAIL_FROM` | Sender address (e.g., `9Th-Grade AI <noreply@9thgrade.ai>`) | Optional |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth 2.0 ("Continue with Google") | Optional |
| `ANTHROPIC_API_KEY` | Claude API (fallback) | Optional |
| `GROQ_API_KEY` | Groq API (primary) | Optional |
| `SENTRY_DSN` | Error tracking | Optional |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry (DSN, public by design) | Optional |
| `CRON_SECRET` | Vercel Cron / storage-worker Bearer auth | ✅ (production) |
| `AI_DAILY_BUDGET_USD` | Per-user daily AI cost cap (default: 0.50) | Optional |
| `RL_AI_DAILY` | Daily AI request quota (default: 60) | Optional |
| `LOG_LEVEL` | Pino log level (debug/info/warn/error) | Optional |

---

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Connect GitHub repo to Vercel
# Add all env vars in Vercel dashboard
# Deploy: automatic on push to main
```

### Manual Deploy
```bash
npm run build          # Builds with db:deploy-sync in prebuild
npm run start          # Starts production server
```

### Database Migration
```bash
# First time only (run against target DB)
npx prisma migrate dev --name init --schema database/prisma/schema.prisma

# Subsequent deployments (in CI)
npx prisma migrate deploy --schema database/prisma/schema.prisma
```

### Seed Data
```bash
# Development
npm run db:sync

# Production (no user wipe)
npm run db:seed
```

---

## 📊 Health Checks

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /api/health` | Full system health (DB + Redis) | `200 { status: "ok" }` |
| `GET /api/auth/me` | Auth session validity | `200 { user: {...} }` or `401` |

**Monitoring**: Sentry is integrated (`instrumentation.ts` — set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`); every production deploy smoke-tests `/api/health`. Configure Vercel/Upstash/Neon alerts on health check failures (see `docs/DEPLOYMENT.md`).

---

## 🔄 Common Operations

### Deploy New Version
```bash
git push origin main
# 1. CI runs (test · e2e · perf · secret-scan)
# 2. Deploy workflow (workflow_run, only if CI is green):
#    db:deploy-sync (schema push) → vercel deploy --prod → /api/health smoke test
# Monitor the "Deploy" workflow in GitHub Actions; check /api/health after.
```

### Rollback
```bash
# Fastest: Vercel dashboard → Deployments → previous deployment → Promote
# Then align main: git revert <sha> && git push origin main
# Schema rollback is forward-fix (db push does not down-grade) — see docs/DEPLOYMENT.md
```

### Database Schema Changes
```bash
# This repo does NOT use Prisma migrations — schema is pushed directly (db push).
# 1. Edit database/prisma/schema.prisma (additive-first: add → deploy → backfill → drop later)
# 2. Test locally: npm run db:sync
# 3. Commit + push — production sync runs automatically in the Deploy workflow
#    (db:deploy-sync, before the new code goes live)
# Destructive changes: never in the pipeline; run explicitly per docs/DATABASE.md
```

### Clear Rate Limits (Emergency)
```bash
# Redis CLI
redis-cli FLUSHALL
# Or restart Redis instance
```

### Invalidate AI Cache
```bash
# Redis CLI
redis-cli --scan --pattern "qcache:*" | xargs redis-cli DEL
```

### Reconcile UserProgress (points drift)
```bash
# The exam-submit path awards points post-commit. If a deploy crashes between
# commit and award, the attempt is SUBMITTED but its points are missing.
# Dry-run (report only):
npx tsx scripts/reconcile-progress.ts
# Or via npm script:
npm run db:reconcile-progress -- --apply
# Backfill a single user / everyone:
npx tsx scripts/reconcile-progress.ts --apply --userId <id>
npx tsx scripts/reconcile-progress.ts --apply
# Run weekly via cron until the award path has an outbox worker.
```

### Prune ephemeral activity rows
```bash
# Dry-run (report only):
npm run db:prune-activity
# Delete expired sessions, LearningEvent > 180d, AIUsage > 365d:
npm run db:prune-activity -- --apply
# QuestionAttempt / ExamAttempt / FlashcardReview are never pruned (stats record).
```
```

---

## 🚨 Incident Response

### High Error Rate (>1%)
1. Check Sentry for error patterns
2. Check `/api/health` for DB/Redis status
3. Check Vercel function logs
4. If DB connection issues: verify DATABASE_URL, check Neon status
5. If Redis issues: verify REDIS_URL, check Upstash status
6. Rollback if recent deploy introduced regression

### AI Endpoints Failing
1. Check Sentry for provider errors
2. Verify `ANTHROPIC_API_KEY` / `GROQ_API_KEY` validity
3. Check provider status pages (Groq, Anthropic)
4. System auto-falls back to mock — users see degraded but functional AI

### Auth Issues (Login/Register Broken)
1. Check `AUTH_SECRET` is set and consistent
2. Check `SMTP_*` / `RESEND_API_KEY` for email flows
3. Verify OAuth credentials in Google/Apple consoles
4. Check rate limits: `RL_LOGIN_PER_MIN`, `RL_LOGIN_ACCOUNT_PER_HOUR`

### Database Connection Exhausted
1. Check connection pool: `npx prisma studio` → check active connections
2. Restart app (Vercel: new deployment)
3. Increase DB max connections if persistent

---

## 📈 Monitoring Dashboard

| Metric | Tool | Alert Threshold |
|--------|------|-----------------|
| Error rate | Sentry | >1% over 5m |
| p95 latency | Vercel Analytics | >3s |
| AI daily spend | Sentry/PostHog custom | >$50/day |
| DB CPU | Neon dashboard | >80% |
| Redis memory | Upstash dashboard | >80% |
| Auth failure rate | Custom log metric | >10% |

---

## 💾 Backup & Recovery

| Asset | Frequency | Retention |
|-------|-----------|-----------|
| PostgreSQL — PITR (Neon WAL history) | Continuous | Plan-dependent window — verify in the Neon console |
| PostgreSQL — logical dump (`npm run db:backup`) | Daily (schedule it) | 14 days by default (`BACKUP_RETENTION_DAYS`) |
| Redis | Not backed up (ephemeral) | N/A |
| Code | GitHub | Forever |

**Primary recovery — point-in-time restore**: use the Neon console to restore
the project/branch to the timestamp immediately before the incident. This is
the fastest path for accidental deletes or bad writes.

**Secondary — nightly logical dump**:

```bash
# from the repo root; reads DIRECT_DATABASE_URL (or DATABASE_URL) from .env.local
npm run db:backup

# optional overrides
BACKUP_DIR=/mnt/private/db BACKUP_RETENTION_DAYS=30 npm run db:backup
```

The script writes `9thgradeai-<UTC timestamp>.dump` (`pg_dump -Fc`) plus a
`.sha256` sidecar. Schedule it with cron/systemd on an operator host, or with
your platform's scheduler.

**Restore drill** (quarterly — never restore straight onto production):

```bash
pg_restore --dbname="$DIRECT_DATABASE_URL" --no-owner --clean --if-exists \
  backups/db/9thgradeai-<timestamp>.dump
```

**Storage rules**: dumps contain PII and password hashes. Keep them on
private storage, never commit them, and never upload them as GitHub Actions
artifacts — this repository is public.

---

## 🔧 Maintenance Windows

- **Weekly**: Dependency updates (`npm update` → PR → test → merge)
- **Monthly**: Prisma version update, security audit
- **Quarterly**: Rotate `AUTH_SECRET`, API keys, DB passwords

---

## 📞 Escalation Contacts

| Role | Contact | When |
|------|---------|------|
| Platform (Vercel) | support@vercel.com | Deploy/infra issues |
| Database (Neon) | Support portal | DB outages |
| Redis (Upstash) | support@upstash.com | Cache issues |
| AI Providers | Status pages / support | Provider outages |

---

## ✅ Pre-Launch Checklist

- [ ] All env vars set in Vercel production
- [ ] `DATABASE_URL` points to production DB
- [ ] `REDIS_URL` points to production Redis
- [ ] `AUTH_SECRET` generated and set
- [ ] Email transport verified (test reset flow)
- [ ] OAuth callbacks configured for production domain
- [ ] AI API keys have sufficient quota
- [ ] Sentry receiving test events
- [ ] CSP headers not blocking resources (check console)
- [ ] Health endpoint returns green
- [ ] Load test passed (100 concurrent users, p95 < 2s)
- [ ] Rollback tested

---

*Last updated: 2026-10-20*
*Version: 1.1*