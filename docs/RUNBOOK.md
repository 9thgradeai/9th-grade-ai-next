# 9Th-Grade AI — Operations Runbook

## Overview
Production deployment for 9Th-Grade AI exam preparation platform.

**Stack**: Next.js 15 (App Router) + Prisma + PostgreSQL + Redis + Vercel
**AI**: Groq (primary) → Anthropic (fallback) → Mock (last resort)

---

## 🔐 Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (Railway/Neon) | ✅ |
| `REDIS_URL` | Redis connection (Upstash/Railway) | ✅ |
| `AUTH_SECRET` | JWT signing key (32+ bytes, `openssl rand -base64 32`) | ✅ |
| `NEXT_PUBLIC_SITE_URL` | Production URL (e.g., `https://9thgrade.ai`) | ✅ |
| `SENDGRID_API_KEY` / `RESEND_API_KEY` | Email transport | ✅ |
| `EMAIL_FROM` | Sender address (e.g., `9Th-Grade AI <noreply@9thgrade.ai>`) | ✅ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth 2.0 | ✅ |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Apple Sign-In | ✅ |
| `ANTHROPIC_API_KEY` | Claude API (fallback) | ✅ |
| `GROQ_API_KEY` | Groq API (primary) | ✅ |
| `SENTRY_DSN` | Error tracking | ✅ |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry | ✅ |
| `POSTHOG_KEY` | Product analytics | ✅ |
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

**Monitoring**: Configure Vercel/Upstash alerts on health check failures.

---

## 🔄 Common Operations

### Deploy New Version
```bash
git push origin main
# Vercel auto-deploys; monitor build logs
# Check /api/health after deploy
```

### Rollback
```bash
# Vercel: Instant rollback via dashboard → Deployments → "Rollback"
# Or: git revert <commit> && git push origin main
```

### Database Schema Changes
```bash
# 1. Edit database/prisma/schema.prisma
# 2. Generate migration
npx prisma migrate dev --name descriptive_name --schema database/prisma/schema.prisma
# 3. Test locally
npm run db:sync
# 4. Deploy - migration runs automatically in CI
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

---

## 🚨 Incident Response

### High Error Rate (>1%)
1. Check Sentry for error patterns
2. Check `/api/health` for DB/Redis status
3. Check Vercel function logs
4. If DB connection issues: verify DATABASE_URL, check Railway/Neon status
5. If Redis issues: verify REDIS_URL, check Upstash status
6. Rollback if recent deploy introduced regression

### AI Endpoints Failing
1. Check Sentry for provider errors
2. Verify `ANTHROPIC_API_KEY` / `GROQ_API_KEY` validity
3. Check provider status pages (Groq, Anthropic)
4. System auto-falls back to mock — users see degraded but functional AI

### Auth Issues (Login/Register Broken)
1. Check `AUTH_SECRET` is set and consistent
2. Check `SENDGRID_API_KEY` / `RESEND_API_KEY` for email flows
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
| DB CPU | Railway/Neon dashboard | >80% |
| Redis memory | Upstash dashboard | >80% |
| Auth failure rate | Custom log metric | >10% |

---

## 💾 Backup & Recovery

| Asset | Frequency | Retention |
|-------|-----------|-----------|
| PostgreSQL | Daily (managed) | 7 days (Railway) / 30 days (Neon) |
| Redis | Not backed up (ephemeral) | N/A |
| Code | GitHub | Forever |

**Recovery**: Point-in-time restore via Railway/Neon dashboard.

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
| Database (Railway/Neon) | Support portal | DB outages |
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

*Last updated: 2026-08-30*
*Version: 1.0*