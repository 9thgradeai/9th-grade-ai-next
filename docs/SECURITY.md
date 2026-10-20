# Security

## Secrets

### Classification

Classification follows **use**, not name — a `NEXT_PUBLIC_*` name is a
promise, but only tracing a value to its consumer proves it is safe.

#### Privileged — server-only credentials

Never prefixed `NEXT_PUBLIC_`, never imported by client components, never
returned in API responses, never logged (pino auto-redacts matching keys).

| Secret | Consumed by | Notes |
|--------|-------------|-------|
| `AUTH_SECRET` | `backend/auth.ts` (JWT HS256 signing) | Fails closed in production when unset (dev uses a random per-boot fallback) |
| `AUTH_SECRET_PREVIOUS` | `backend/auth.ts` | Optional rotation grace — old sessions stay valid while new secret signs |
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | `backend/db.ts` (Prisma) | Contains the DB password; pooled for app, direct for migrations |
| `GOOGLE_CLIENT_SECRET` | `backend/auth/google.ts` | Authorization-code exchange, server-side only |
| `GOOGLE_OAUTH_ENCRYPTION_KEY` | `backend/services/storage/encryption.ts` | AES-256-GCM key for stored Drive tokens; production REQUIRES it and it must differ from `AUTH_SECRET` |
| `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GROQ_API_KEY_EXPLAIN`, `TAVILY_API_KEY` | `backend/ai/providers/*`, `backend/ai/tools/search.ts`, `app/api/ai/_search.ts` | Vendor AI/web-search keys; all AI calls go through authenticated `/api/ai/*` routes |
| `SMTP_PASS`, `RESEND_API_KEY` | `backend/lib/email.ts` | Email transport credentials |
| `REDIS_URL` | `backend/infrastructure/cache/*` | Contains Redis credentials |
| `CRON_SECRET` / `WORKER_SECRET` | `app/api/cron/daily-current-affairs`, `app/api/storage/worker` | Bearer auth for background jobs; constant-time compare; 503 when unconfigured in production |
| `SENTRY_DSN` | `instrumentation.ts` | Server-side Sentry DSN (kept server-side by convention) |
| `VERCEL_OIDC_TOKEN` | Vercel platform | Injected by Vercel, short-lived by design |

#### Sensitive — server-side config (not credentials, not for the public)

`APP_URL`, `ALLOWED_ORIGINS`, `GOOGLE_CLIENT_ID`, `GOOGLE_AUTH_REDIRECT_URI`,
`LOG_LEVEL`, `TRUST_CLIENT_IP`, `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`,
`AI_*` tuning knobs, `RL_*` limits, `AI_DAILY_BUDGET_USD`.

#### Public by design — safe to publish

- `NEXT_PUBLIC_*` values are **inlined into the browser bundle at build
  time** and visible to anyone: `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN` (a DSN only authorizes
  event submission), `NEXT_PUBLIC_ANALYTICS_ENDPOINT`.
- Public identifiers: `GOOGLE_CLIENT_ID` (OAuth client id), model names,
  deployment health/status output.

### Storage rules

- Live secrets live **only** in `.env.local` (gitignored) and deployment
  environment variables (Vercel project settings). No `.env*` file with real
  values has ever been committed — verified against full git history.
- Client code may read `process.env.NEXT_PUBLIC_*` only; `backend/` imports
  `server-only`; no client component imports `~backend/*`.
- The complete reference lives in `.env.local.example` (every entry marked
  PRIVILEGED / SENSITIVE / PUBLIC).

### Rotation

- **No rotation is required due to source exposure**: no live credential was
  ever committed, shipped in a client bundle, or returned by an API route
  (evidence in § Secret scanning + `npm run secret-scan` output).
- `AUTH_SECRET`: set the new value, move the old one to
  `AUTH_SECRET_PREVIOUS`, deploy (verification accepts the previous secret
  during the grace window), drop `AUTH_SECRET_PREVIOUS` after sessions
  expire (7 days).
- Vendor keys (`GROQ_*`, `ANTHROPIC_*`, `TAVILY_*`, `SMTP_PASS`,
  `RESEND_API_KEY`): rotate in the vendor console, then update the
  deployment env var — no app changes.
- `DATABASE_URL` password: rotate in the Neon console and update
  `DATABASE_URL` **and** `DIRECT_DATABASE_URL` together.

## Secret scanning

- **Tool:** [gitleaks](https://github.com/gitleaks/gitleaks), config
  `.gitleaks.toml` (vendored v8.30.1 default rules + project allowlist —
  a custom config *replaces* the default rule set, which is why the full
  default rules are vendored), `.gitleaksignore` (vetted false positives,
  each with a reason).
- **Local:** `npm run secret-scan` — scans tracked files + full git
  history with `--redact` (secrets are never echoed, even on failure).
- **Pre-commit:** `.githooks/pre-commit` scans staged changes only; the
  hook path is configured automatically by `npm install` via
  `scripts/setup-hooks.mjs` (skips with a warning when gitleaks is not
  installed so it never blocks work; CI is the hard gate).
- **CI:** `secret-scan` job in `.github/workflows/ci.yml` — pinned gitleaks
  version, `fetch-depth: 0`, full-history scan, fails the pipeline.
- **False-positive policy:** prefer an inline `// gitleaks:allow` comment
  at the source; otherwise add the finding fingerprint to
  `.gitleaksignore` with a justification. Never disable or weaken a rule.
- `gitleaks dir .` additionally sweeps untracked on-disk files — it will
  (correctly) flag your local `.env.local`; that mode is never run in CI.

## Authentication

- **Mechanism**: JWT via `jose`.
- **Algorithm**: HS256.
- **Expiry**: 7 days.
- **Cookie**: `auth_token`, HttpOnly, SameSite=Lax, Secure in production.
 - **Client storage**: No tokens stored in localStorage or sessionStorage.

### Google OAuth 2.0 (social sign-in)

- **Flow**: Authorization Code + PKCE (`S256`). The `code_verifier` is kept only in the `oauth_google` HttpOnly cookie; a leaked `code` is useless without it.
- **CSRF**: an opaque, single-use `state` is bound to the same cookie and checked against the callback `state` param. The one-time cookie is cleared on first callback (success or failure).
- **Token verification**: the Google `id_token` is verified locally against Google's published JWKS (`createRemoteJWKSet` / `jwtVerify` from `jose`) — issuer (`accounts.google.com`) and audience (`GOOGLE_CLIENT_ID`) are enforced. No extra network hop and no new dependency.
- **Account linking**: a Google identity is linked onto an existing email account (`authProvider` → `"both"`); Google-only accounts get `passwordHash = ""` and password login is blocked with `AUTH_GOOGLE_ONLY`.
- **Open-redirect guard**: the post-login `?redirect=` is run through `safeRedirect()` and confined to this origin.

## Authorization

- The proxy (`proxy.ts`) **cryptographically verifies** the session JWT (signature + expiry via `isValidSessionToken`) before rendering `/dashboard` or bouncing `/login` — not mere cookie presence; a stale/garbage cookie counts as signed-out.
- Protected API routes verify JWT via `getUserIdFromRequest()` and return `401` if invalid. Database failures propagate as `500` (never masquerade as `401`) so outages are visible.
- Roles: `student` / `admin` / `banned`. `BANNED` users are rejected at session resolution (`getSessionUser` returns `null`) and explicitly in `requireRole` (`403`), so bans take effect immediately even with an unexpired JWT.

## API Validation

- Auth-protected routes validate session before processing.
- Input validation is present in route handlers (type checks, required fields).
- Example: `/api/ai/solver` checks for `text` or `imageBase64`.

## Rate Limiting

- Implemented in `backend/rate-limit.ts` (token buckets behind a pluggable
  `RateLimitStore`): login (per-IP + per-account hashed), register, refresh,
  password change, forgot-password and resend-verification (per-IP +
  per-account hashed), AI endpoints (per-minute + daily quota with a DB-backed
  usage-ledger backstop), and graded submissions.
- Client identity prefers platform-set headers (`cf-connecting-ip`,
  `x-real-ip`) and takes the LAST `x-forwarded-for` entry (proxy-appended);
  the spoofable leftmost entry is never trusted.
- Limits are env-tunable (`RL_*` variables) — see `.env.local.example`.
- Production MUST set `REDIS_URL` so counters are shared across serverless
  instances (ADR-0009); on Redis outage the fast store fails open and the
  failure is logged, but the AI usage-ledger backstop fails CLOSED so cost
  cannot run unbounded during a DB outage.

## CORS

- Same-origin by default (Next.js).
- Preflight `OPTIONS` is handled in `proxy.ts`: the origin is echoed only when it is same-origin or listed in `ALLOWED_ORIGINS` — never `*` with credentials.

## CSRF

- SameSite=Lax cookies provide basic CSRF protection.
- No CSRF tokens.

## Database Security

- Prisma parameterizes all queries — no raw SQL concatenation.
- Passwords hashed with `bcryptjs` (cost 10).
- No SQL injection vectors identified.

## File Uploads

- No file upload endpoints currently implemented.
- Image input for AI solver accepts base64 strings only.

## Logging

- Non-operational (`500`) errors are logged server-side with their `cause`
  chain (`toHttpResponse`); clients receive a generic message except in local
  development (`NODE_ENV=development`), where message + stack are returned.
  Staging must never receive internals.
- Service catch blocks rethrow `InternalServerError(message, { cause })` so
  on-call retains query context.

## Sensitive Information

- User passwords are never returned to the client.
- API routes return sanitized user objects (no `passwordHash`, no `emailVerifyToken`, no `passwordResetToken` — reset/verify tokens are stored as SHA-256 hashes and only the raw value is emailed).
- JWT payload contains only `{ email, ver }` plus standard `iat`/`exp` claims — no credentials, no roles (role/ban state is re-read from the database on every authenticated request).
- `GET /api/health` is deliberately unauthenticated but returns **generic** check failures outside development (raw Prisma/Redis errors — which can embed the database host — are logged server-side only).

## AI Prompt Injection

- No dedicated prompt injection mitigation.
- System prompts are simple and fixed.
- LLM output is never trusted for security decisions.

## Tool Execution

- No external tool execution by AI agents.
- AI endpoints are direct API calls to Anthropic.

## Dependency Vulnerabilities

- CI runs on every push/PR (`.github/workflows/ci.yml`): typecheck, lint,
  tests with enforced coverage against a real Postgres service container,
  build, and a full-history secret scan (`secret-scan` job, gitleaks).
- Dependabot monitors npm dependencies weekly (`.github/dependabot.yml`).
