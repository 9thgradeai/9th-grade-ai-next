# Security

## Secrets

| Secret | Where Stored | Rotation Policy |
|--------|-------------|-----------------|
| `AUTH_SECRET` | `process.env` (`.env.local` gitignored) | Rotate on compromise |
| `ANTHROPIC_API_KEY` | `process.env` | Rotate on compromise |
| `DATABASE_URL` | `process.env` | Rotate on compromise |

**Never** commit secrets to version control. `.env.local` is gitignored.

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

- Middleware guards `/dashboard` and `/login` based on cookie presence.
- Protected API routes verify JWT via `getUserIdFromRequest()` and return `401` if invalid.
- No role-based access control (RBAC) beyond `student`/`admin` in the User model (admin features not yet implemented).

## API Validation

- Auth-protected routes validate session before processing.
- Input validation is present in route handlers (type checks, required fields).
- Example: `/api/ai/solver` checks for `text` or `imageBase64`.

## Rate Limiting

- Implemented in `backend/rate-limit.ts` (token buckets behind a pluggable
  `RateLimitStore`): login (per-IP + per-account hashed), register, refresh,
  password change, AI endpoints (per-minute + daily quota with a DB-backed
  usage-ledger backstop), and graded submissions.
- Limits are env-tunable (`RL_*` variables) — see `.env.local.example`.
- Production MUST set `REDIS_URL` so counters are shared across serverless
  instances (ADR-0009); on Redis outage requests fail open and the failure is
  logged.

## CORS

- Same-origin by default (Next.js).
- No custom CORS headers configured.

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

- Errors logged to server console (`console.error`).
- No structured logging or external log aggregation.

## Sensitive Information

- User passwords are never returned to the client.
- API routes return sanitized user objects (no `passwordHash`).
- JWT payload contains only `{ email }`.

## AI Prompt Injection

- No dedicated prompt injection mitigation.
- System prompts are simple and fixed.
- LLM output is never trusted for security decisions.

## Tool Execution

- No external tool execution by AI agents.
- AI endpoints are direct API calls to Anthropic.

## Dependency Vulnerabilities

- CI runs on every push/PR (`.github/workflows/ci.yml`): typecheck, lint,
  tests with enforced coverage against a real Postgres service container, and
  build.
- Dependabot monitors npm dependencies weekly (`.github/dependabot.yml`).
