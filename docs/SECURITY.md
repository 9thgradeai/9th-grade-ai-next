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

## Authorization

- Middleware guards `/dashboard` and `/login` based on cookie presence.
- Protected API routes verify JWT via `getUserIdFromRequest()` and return `401` if invalid.
- No role-based access control (RBAC) beyond `student`/`admin` in the User model (admin features not yet implemented).

## API Validation

- Auth-protected routes validate session before processing.
- Input validation is present in route handlers (type checks, required fields).
- Example: `/api/ai/solver` checks for `text` or `imageBase64`.

## Rate Limiting

- No application-level rate limiting implemented.
- Relies on Vercel platform limits and Anthropic API limits.

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

- Run `npm audit` regularly.
- No automated dependency scanning in CI/CD (no CI/CD configured).
