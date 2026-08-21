# Security Audit — 9Th-Grade AI (Phase 0)

> Findings from full-code review. Severity: 🔴 high · 🟠 medium · 🟡 low · ℹ️ note.
> "Exploit" describes the preconditions; every finding maps to a phase in migration-plan.md.

## 1. Authentication

| Sev | Finding | Evidence |
|---|---|---|
| ℹ️ | JWT HS256, single secret, 7d, HttpOnly+Lax+Secure cookie; verification then live DB lookup (deleted user ⇒ 401 despite valid token) — sound baseline | `auth.ts` |
| 🟡 | No secret-rotation story (single `AUTH_SECRET`; no kid header support) | `auth.ts:17-28` |
| 🟡 | Password policy drift: live register route enforces ≥8 (`register/route.ts:28`), shared validator allows ≥6 and is dead code | `validation.ts:76` |
| ℹ️ | Login/register return generic `AUTH_INVALID_CREDENTIALS`/409-exists split: login generic ✅, register 409 confirms account existence (acceptable trade-off, note for enumeration policies) | routes |
| ℹ️ | bcrypt cost 10 per AGENTS.md contract | `services/user.ts:62` |
| 🟠 | Refresh endpoint re-signs tokens forever with no absolute session cap (infinite sliding window) | `refresh/route.ts` |

## 2. Authorization / IDOR

Verified ownership scoping is **consistently applied**: conversations/messages (userId in every WHERE),
bookmarks, progress, attempts, notifications-read, feedback-via-owned-message.

| Sev | Finding | Evidence |
|---|---|---|
| 🟠 | `POST /api/exam/build` unauthenticated — anonymous paper generation (resource abuse vector; also inconsistent with submit being authed) | `exam/build/route.ts` |
| 🟠 | **No authorization layer exists**: `role` parsed but never checked anywhere; zero admin-only surface defined while ADMIN enum ships | schema + all handlers |
| ℹ️ | Cross-user AI context leakage: impossible by construction — context engine queries are userId-scoped; memories are per-user | `context-engine.ts`, `memory-store.ts` |

IDOR test matrix (to become Phase 19/20 tests): A↔B on conversations, messages, rename/pin/delete,
feedback messageId, bookmarks toggle/read, progress patch, exam results, notifications read-marker,
study-task toggle (already scoped via findFirst({id,userId})).

## 3. CSRF / Cookies / CORS

| Sev | Finding | Evidence |
|---|---|---|
| ℹ️ | No CSRF tokens; risk mitigated by SameSite=Lax (blocks cross-site POST cookie attach) + JSON content-type requirements | `auth.ts:69-76` |
| 🟡 | CORS helper sets `Access-Control-Allow-Origin: *` but only on public `/api/questions`; middleware OPTIONS path echoes nothing origin-specific — acceptable, document as policy | `_middleware.ts:12-17`, `middleware.ts:45-50` |

## 4. Input Validation

| Sev | Finding | Evidence |
|---|---|---|
| 🟠 | Two validation systems coexist (`backend/validation.ts` vs inline route validation vs AI schemas.ts); register divergence already bit (password rule) | repo-wide |
| 🟡 | `progress PATCH` silently drops unknown fields instead of rejecting (silent-malformed-input tolerance) | `progress/route.ts:29-33` |
| ℹ️ | AI payloads capped (8K chars, 5MB image→413, 100 msgs) and role/intent enums enforced | `ai/schemas.ts` |
| ℹ️ | SQLi: no raw SQL anywhere; Prisma parameterized throughout ✅ | grep-verified |

## 5. Rate Limiting / Brute Force

| Sev | Finding | Evidence |
|---|---|---|
| 🟠 | IP fallback trusts `x-forwarded-for` first value blindly — spoofable where platform doesn't overwrite it; combined with memory store this is the weakest perimeter | `rate-limit.ts:38-44` |
| 🟡 | Login limit keyed to user-or-IP bucket: attacker cycling IPs gets fresh buckets per attempt against one victim email (per-account lockout absent) | `rate-limit.ts:51-54` |
| ℹ️ | DB-backed daily AI counting exists (`countUsageToday`) but enforcement uses only memory store | `usage.ts:51` unused by routes |

## 6. AI-Specific Security

| Sev | Finding | Evidence |
|---|---|---|
| 🟠 | Prompt-injection surface: retrieved Tavily snippets injected into system block; guardrails exist ("never contradict results", cite sources) but retrieved text is not fenced/isolated from instructions | `prompts/tutor.ts:63-71` |
| ℹ️ | System prompts never sent to client; provider/model exposed only as header metadata (by design) | tutor/solver routes |
| ℹ️ | Solver output never trusted: schema-normalized, capped, fallback string | `validation/outputs.ts` |
| ℹ️ | Mock clearly labelled; no key ⇒ no real model calls | `providers/mock.ts` |
| ℹ️ | AIMemory writes are application-controlled only; model cannot author memory | architecture invariant |

## 7. Headers, Errors, Secrets

- Security headers comprehensive at edge + per-route + next.config (nosniff, DENY, referrer, permissions-policy, HSTS prod). `poweredByHeader:false`. ✅
- Stack traces dev-only; flash-news error shape inconsistent (`{error:{message}}`) — cosmetic leak-risk none.
- Secrets: none logged; `.env.local.example` documents all vars; demo credentials printed to seed console (dev convenience, flag for prod noise).
- Request IDs generated client-side (UUID) and trusted into logs — log-forgery-lite concern once structured logging lands (sanitize length/format).

## 8. Data Protection

- Account deletion hard-cascades everything owned (GDPR-aligned) ✅.
- Bookmarks destroyed by deploy pipeline (database-audit §5) — integrity issue rather than confidentiality.
- No PII beyond name/email/handle. Passwords only hashed. AIUsage stores no prompt content ✅.

## 9. Top Remediation Queue (feeds phases)

1. Kill deploy-wipe pipeline (data integrity) → Phase 0-immediate / migration plan gate
2. Unify validation (one source of truth) → Phase 7
3. Rate-limit interface + trusted-proxy-aware keys + per-account throttle → Phase 8
4. Auth layer: role checks or explicit removal of ADMIN pretense; refresh absolute cap → Phase 9
5. Exam-build auth decision → Phase 4/9
6. Prompt-injection fencing for retrieved content → Phase 13/15
7. IDOR test suite → Phase 20
