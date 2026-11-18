import "server-only";

import { getEmailTransportName } from "~backend/lib/email";
import { log } from "~backend/infrastructure/observability/logger";

/**
 * Startup configuration checks (first-release gate).
 *
 * Called once from `instrumentation.ts` `register()` so every server instance
 * logs a loud, greppable warning for each known-degraded configuration. None
 * of these are boot failures — each has a documented fallback behavior — but
 * an operator must clear them before launch:
 *
 *   • email.transport.missing → accounts auto-verify, no mail is delivered
 *     (backend/services/user.ts `emailVerified: !hasEmailTransport()`).
 *     Fix: SMTP_* or RESEND_API_KEY — docs/EMAIL.md.
 *   • ai.keys.missing         → every AI surface answers with a labelled
 *     mock response (`source: "mock"`). Fix: GROQ_API_KEY (+ optional
 *     ANTHROPIC_API_KEY) — docs/AI-SYSTEM.md.
 *   • redis.missing           → rate limits are enforced per serverless
 *     instance, so concurrent instances multiply the effective quota
 *     (ADR-0009). Fix: REDIS_URL — docs/DECISIONS.md.
 *
 * Reads `process.env` directly (same contract as `getEmailTransportName`) so
 * there is one source of truth; tests stub `process.env` around the call.
 */
export type StartupWarning = {
  /** Stable machine-readable code — safe to alert on in log queries. */
  code: string;
  /** Human-readable remediation hint shown in the server log. */
  message: string;
};

export function collectStartupWarnings(): StartupWarning[] {
  const warnings: StartupWarning[] = [];

  // P1 — verification emails cannot be delivered without a transport.
  if (getEmailTransportName() === "none") {
    warnings.push({
      code: "email.transport.missing",
      message:
        "No email transport configured (SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY). " +
        "Verification emails will NOT be sent and new accounts auto-verify. " +
        "Configure before production — docs/EMAIL.md.",
    });
  }

  // P2 — without any provider key every AI endpoint falls back to mock.
  if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    warnings.push({
      code: "ai.keys.missing",
      message:
        "Neither GROQ_API_KEY nor ANTHROPIC_API_KEY is set. AI features will answer " +
        'with mock responses labelled source:"mock" — docs/AI-SYSTEM.md.',
    });
  }

  // P3 — single-instance rate limiting (ADR-0009) is only safe on one warm
  // instance; on Vercel each instance keeps its own counters.
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
    warnings.push({
      code: "redis.missing",
      message:
        "REDIS_URL is not set in production: rate limits are enforced per serverless " +
        "instance and multiply with instance count (ADR-0009). Set REDIS_URL (e.g. " +
        "Upstash free tier) before launch — docs/DECISIONS.md.",
    });
  }

  return warnings;
}

/**
 * Log every startup warning once per server instance. Returns the warnings so
 * callers (tests, future health surfaces) can inspect them without re-reading
 * env. Never throws — startup checks must not block the server.
 */
export function logStartupWarnings(): StartupWarning[] {
  try {
    const warnings = collectStartupWarnings();
    for (const warning of warnings) {
      log.warn("startup.config.warning", { code: warning.code, message: warning.message });
    }
    if (warnings.length === 0) {
      log.info("startup.config.ok", {});
    }
    return warnings;
  } catch (error) {
    log.error("startup.config.error", { error: String(error) });
    return [];
  }
}
