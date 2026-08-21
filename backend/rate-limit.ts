// backend/rate-limit.ts — rate-limit POLICY layer (Phase 8).
//
// All counter state lives behind the RateLimitStore interface
// (~backend/infrastructure/cache): in-memory by default, Redis-compatible when
// REDIS_URL is set. This module owns keys, limits and product rules only.
//
// Key policy:
//   • Authenticated callers are throttled per-USER — never by IP alone.
//   • Anonymous callers fall back to client IP, trusted only via platform-set
//     headers; TRUST_CLIENT_IP=false collapses everyone into one opaque bucket.
//   • Login additionally throttles per-ACCOUNT (hashed), so cycling IPs cannot
//     brute-force a single mailbox.

import "server-only";

import { createHash } from "crypto";
import { RateLimitError } from "~backend/errors";
import { countUsageToday } from "~backend/ai/usage/usage";
import { getRateLimitStore } from "~backend/infrastructure/cache";

const DAY_MS = 86_400_000;

// ── Configurable limits (defaults = previously hardcoded values) ──
// Read LIVE via getters so env changes apply without code edits and tests
// can stub them; values are cached nowhere.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const LIMITS = {
  get loginPerMin() {
    return envInt("RL_LOGIN_PER_MIN", 5);
  },
  get registerPerMin() {
    return envInt("RL_REGISTER_PER_MIN", 3);
  },
  get refreshPerMin() {
    return envInt("RL_REFRESH_PER_MIN", 20);
  },
  get passwordPerMin() {
    return envInt("RL_PASSWORD_PER_MIN", 5);
  },
  get loginAccountPerHour() {
    return envInt("RL_LOGIN_ACCOUNT_PER_HOUR", 10);
  },
  get aiPerMin() {
    return envInt("RL_AI_PER_MIN", 10);
  },
  get aiDaily() {
    return envInt("RL_AI_DAILY", 60);
  },
};

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

// ── Store-backed primitives ────────────────────────────────

/** Fixed-window counter. Returns true when the call is allowed. */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  return getRateLimitStore().consume(key, max, windowMs).then((r) => r.allowed);
}

/** Daily quota keyed by UTC calendar day. */
export async function checkDailyQuota(key: string, max: number): Promise<boolean> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayKey = `day:${dayStart.getTime()}:${key}`;
  return checkRateLimit(dayKey, max, DAY_MS);
}

/**
 * DB-authoritative daily quota for AI endpoints. The store keeps fast shared
 * counters, but on a memory store (single instance) counters die with the
 * process — so the AIUsage ledger double-checks the real daily spend.
 */
async function checkDailyAuthority(
  route: string,
  userId: string,
  task: "tutor" | "solver" | "assistant",
  dailyMax: number,
): Promise<boolean> {
  if (getRateLimitStore().name !== "memory") {
    // Shared store counters survive deploys; ledger check unnecessary.
    return true;
  }
  let used = 0;
  try {
    used = await countUsageToday(userId, task);
  } catch {
    used = 0; // ledger unavailable → fail open to store-based decision
  }
  if (!Number.isFinite(used)) used = 0;
  return used < dailyMax;
}

// ── Identity helpers ──────────────────────────────────────

/** Best-effort client identity from platform-controlled headers. */
export function getClientKey(req: Request): string {
  if ((process.env.TRUST_CLIENT_IP ?? "true") === "false") {
    return "opaque";
  }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  const ip = cfIp ?? realIp ?? forwarded ?? "unknown";
  return `${ip}:${req.headers.get("host") ?? ""}`;
}

export function getRateLimitKey(req: Request, route: string, userId?: string | null): string {
  if (userId) return `${route}:user:${userId}`;
  return `${route}:${getClientKey(req)}`;
}

function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

// ── Product rules ─────────────────────────────────────────

/**
 * Login throttle: per-IP bucket AND per-account bucket. The account bucket is
 * keyed on a hash of the submitted email, so an attacker rotating IPs still
 * hits it; a victim sharing Wi-Fi with others is protected by generous caps.
 */
export async function assertLoginAllowed(req: Request, email: string): Promise<void> {
  if (!(await checkRateLimit(getRateLimitKey(req, "auth:login"), LIMITS.loginPerMin, MINUTE_MS))) {
    throw new RateLimitError("Too many login attempts. Please try again later.");
  }
  const accountKey = `auth:login:acct:${hashEmail(email)}`;
  if (
    !(await checkRateLimit(accountKey, LIMITS.loginAccountPerHour, HOUR_MS))
  ) {
    throw new RateLimitError("Too many login attempts for this account. Please try again later.");
  }
}

/**
 * AI endpoint guard: per-user minute limit + per-user daily quota, with the
 * usage ledger as the authoritative daily backstop on single-instance stores.
 */
export async function enforceAiQuotas(
  req: Request,
  task: "tutor" | "solver" | "assistant",
  userId: string,
): Promise<void> {
  const minuteOk = await checkRateLimit(
    getRateLimitKey(req, `ai:${task}`, userId),
    LIMITS.aiPerMin,
    MINUTE_MS,
  );
  if (!minuteOk) {
    throw new RateLimitError("Too many AI requests. Please wait a moment.");
  }

  const dayStoreOk = await checkDailyQuota(`ai:${task}:${userId}`, LIMITS.aiDaily);
  const dayAuthorityOk = await checkDailyAuthority(task, userId, task, LIMITS.aiDaily);
  if (!dayStoreOk || !dayAuthorityOk) {
    throw new RateLimitError(`Daily AI ${task} limit reached. Come back tomorrow!`);
  }
}

/** Dev/test convenience: wipe in-memory counters. */
export async function resetRateLimitStore(): Promise<void> {
  await getRateLimitStore().resetAll();
}
