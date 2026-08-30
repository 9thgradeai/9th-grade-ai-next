# Transactional Email & Email Verification

This document explains how the app delivers transactional email (email-verification
links and password-reset links), how to choose a $0 transport, and how email
verification behaves in each configuration.

## Transport selection

`backend/lib/email.ts` resolves a single transport by priority:

1. **SMTP** — used when `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are all set.
   This is the recommended $0 option because it works with a free account from
   any provider (Gmail App Password, Zoho, Tutanota, Brevo SMTP relay, …) and
   needs **no custom domain**.
2. **Resend** — used when only `RESEND_API_KEY` is set.
3. **None** — used when neither is set.

`hasEmailTransport()` returns `true` if the resolved transport is not `none`.

## Environment variables

| Variable | Required (for SMTP) | Description |
|----------|---------------------|-------------|
| `SMTP_HOST` | Yes | SMTP server, e.g. `smtp.gmail.com` |
| `SMTP_PORT` | No | Default `587` |
| `SMTP_USER` | Yes | SMTP username — for Gmail this is the full Gmail address |
| `SMTP_PASS` | No* | SMTP password — for Gmail this is an **App Password**, not your login password |
| `SMTP_SECURE` | No | `true` to use TLS (port 465), else STARTTLS on port 587 |
| `EMAIL_FROM` | No | "From" address; defaults to `SMTP_USER` |
| `RESEND_API_KEY` | No | Alternative transport when SMTP is not configured |

\* `SMTP_PASS` is required for most SMTP servers to authenticate; without it the
transport won't select.

## Recommended $0 setup: Gmail App Password

Gmail is free, needs no custom domain, and allows roughly 500 messages/day —
plenty for a transactional verification flow. You cannot use your regular login
password over SMTP; you must generate an **App Password**.

1. Enable 2-Step Verification on the Gmail account:
   `myaccount.google.com/security`.
2. Generate an App Password: `myaccount.google.com/apppasswords`.
3. Set these env vars in the hosting provider (Vercel):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<you>@gmail.com
   SMTP_PASS=<16-char app password>
   EMAIL_FROM="9Th-Grade AI <you@gmail.com>"
   ```
   Gmail rewrites the From to your verified address, so `EMAIL_FROM` should use
   the same Gmail address.

## Alternative $0 setup: Resend

Resend's free tier (100 emails/day, 3000/month) also works. You must verify a
sender domain (or use their shared `onboarding@resend.dev` sender for limited
testing) and set:

```
RESEND_API_KEY=re_xxx
EMAIL_FROM="9Th-Grade AI <no-reply@yourdomain>"
```

## Behavior for each configuration

- **Transport configured (SMTP or Resend):** new accounts are created
  `emailVerified: false`. A verification link is emailed on registration and
  again on "Resend". Clicking the link hits `/api/auth/verify-email` with the
  token; the account is verified (token hash matched, not expired) and the user
  is redirected to the dashboard. An unverified login is soft-blocked by the
  dashboard gate, which points the user to `/verify-email`.
- **No transport:** a confirmation link can never arrive, so to avoid locking
  users out:
  - `createUser` sets `emailVerified: true` immediately.
  - `resendVerification` verifies the account inline and returns
    `{ ok, autoVerified: true }`.
  - The `/verify-email` and login UI surface this clearly.

## Token mechanics

- Tokens are 32 random bytes (`crypto.randomBytes(32).toString("hex")` → 64 hex
  chars). The **SHA-256 hash** is stored in `emailVerifyToken`; the raw token is
  only ever placed in the emailed link (`/verify-email?token=<raw>`).
- `emailVerifyExpires` is `24h` from issue; verification rejects expired or
  mismatched tokens.
- `resendVerification` is idempotent and enumeration-safe (unknown / already
  verified emails resolve to `ok: true` without re-sending).
