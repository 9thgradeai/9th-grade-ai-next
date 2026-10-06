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
import { countUsageToday, getDailyCostUsd } from "~backend/ai/usage/usage";
import { getRateLimitStore } from "~backend/infrastructure/cache";

const DAY_MS = 86_400_000;

// Default daily AI cost budget per user in USD (configurable via env)
function getDailyAiBudget(): number {
  const raw = process.env.AI_DAILY_BUDGET_USD;
  if (!raw) return 0.50; // $0.50/day default
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.50;
}

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
  get googlePerMin() {
    return envInt("RL_GOOGLE_PER_MIN", 10);
  },
  get aiPerMin() {
    return envInt("RL_AI_PER_MIN", 10);
  },
  get aiDaily() {
    return envInt("RL_AI_DAILY", 60);
  },
  get submitPerMin() {
    return envInt("RL_SUBMIT_PER_MIN", 30);
  },
  get publicPerMin() {
    return envInt("RL_PUBLIC_PER_MIN", 120);
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
  } catch (error) {
    // Fail CLOSED: without the ledger there is no trustworthy daily count,
    // so allowing traffic would let cost run unbounded during a DB outage.
    // (The fast store still fails open per docs/SECURITY.md; the AI routes
    // need the DB for conversation persistence anyway.)
    console.error(`[rate-limit] usage ledger unavailable for ${route}:${userId}`, error);
    return false;
  }
  if (!Number.isFinite(used)) used = 0;
  return used < dailyMax;
}

// ── Identity helpers ──────────────────────────────────────

/** Best-effort client identity from platform-controlled headers.
 * Prefers headers set by the platform (x-real-ip, cf-connecting-ip) over
 * x-forwarded-for, and when falling back to x-forwarded-for takes the LAST
 * entry (appended by our proxy) — the leftmost entry is client-controlled
 * and trivially spoofable, so it must never be trusted. */
export function getClientKey(req: Request): string {
  if ((process.env.TRUST_CLIENT_IP ?? "true") === "false") {
    return "opaque";
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  const forwarded = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = cfIp || realIp || (forwarded && forwarded[forwarded.length - 1]) || "unknown";
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
 * Per-account throttle for anonymous email-triggered endpoints
 * (forgot-password, resend-verification). Keyed on a hash of the submitted
 * email so rotating IPs cannot spam a single mailbox, while the companion
 * per-IP bucket protects the endpoint globally.
 */
export async function assertAccountAllowed(
  req: Request,
  route: string,
  email: string,
  max: number,
  windowMs: number,
): Promise<void> {
  if (!(await checkRateLimit(getRateLimitKey(req, route), max, windowMs))) {
    throw new RateLimitError("Too many requests. Please try again later.");
  }
  const accountKey = `${route}:acct:${hashEmail(email)}`;
  if (!(await checkRateLimit(accountKey, max, windowMs))) {
    throw new RateLimitError("Too many requests for this account. Please try again later.");
  }
}

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
 * Check if user has exceeded their daily AI cost budget.
 */
export async function checkDailyCostBudget(userId: string): Promise<boolean> {
  const budget = getDailyAiBudget();
  if (budget <= 0) return true; // No budget limit set (0 or negative = unlimited)

  const spent = await getDailyCostUsd(userId);
  return spent < budget;
}

/**
 * AI endpoint guard: per-user minute limit + per-user daily quota + cost budget,
 * with the usage ledger as the authoritative daily backstop on single-instance stores.
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

  // Check daily cost budget
  const budgetOk = await checkDailyCostBudget(userId);
  if (!budgetOk) {
    throw new RateLimitError(`Daily AI cost budget exceeded ($${getDailyAiBudget().toFixed(2)}). Try again tomorrow.`);
  }
}

/**
 * Graded-submission guard (practice / daily quiz / custom exam). Per-user
 * minute bucket — a real user cannot finish 30 graded attempts per minute;
 * anything beyond that is a script.
 */
export async function assertSubmitAllowed(userId: string): Promise<void> {
  const ok = await checkRateLimit(
    `submit:user:${userId}`,
    LIMITS.submitPerMin,
    MINUTE_MS,
  );
  if (!ok) {
    throw new RateLimitError("Too many submissions. Please slow down.");
  }
}

/** Dev/test convenience: wipe in-memory counters. */
export async function resetRateLimitStore(): Promise<void> {
  await getRateLimitStore().resetAll();
}

/**
 * Anonymous-friendly read guard for heavy public GETs (question bank,
 * documents, spotlight). Keyed on client IP when signed out, on the user id
 * when signed in — scrapers share one small bucket, real users get their own.
 */
export async function assertReadAllowed(req: Request, route: string, userId?: string | null): Promise<void> {
  const ok = await checkRateLimit(
    getRateLimitKey(req, route, userId),
    LIMITS.publicPerMin,
    MINUTE_MS,
  );
  if (!ok) {
    throw new RateLimitError("Too many requests. Please slow down.");
  }
}
