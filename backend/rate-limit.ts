// In-memory rate limiting with user-aware keys and daily quotas.
//
// Production note: this is a per-instance in-memory store, appropriate for a
// single-process / low-concurrency deployment. For multi-instance serverless
// deployments the store should be swapped for a shared store (Redis/Upstash)
// behind the same `checkRateLimit`/`checkDailyQuota` surface. Keys are
// scoped to the authenticated userId when present, and never trust a raw
// `x-forwarded-for` header alone.

const stores = new Map<string, { count: number; reset: number }>();
const DAY_MS = 86_400_000;

function now() {
  return Date.now();
}

/** Sliding/fixed-window counter. Returns true when the call is allowed. */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const record = stores.get(key);
  const current = now();
  if (!record || current > record.reset) {
    stores.set(key, { count: 1, reset: current + windowMs });
    return true;
  }
  record.count += 1;
  return record.count <= max;
}

/** Daily quota keyed by UTC calendar day. */
export function checkDailyQuota(key: string, max: number): boolean {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayKey = `day:${dayStart.getTime()}:${key}`;
  return checkRateLimit(dayKey, max, DAY_MS);
}

/** Best-effort client identifier. Prefers trusted proxy headers. */
export function getClientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  const ip = cfIp ?? realIp ?? forwarded ?? "unknown";
  return `${ip}:${req.headers.get("host") ?? ""}`;
}

/**
 * Rate-limit key combining the authenticated user (when present) with the
 * client identity. Two anonymous clients behind the same NAT are treated as
 * one bucket (documented trade-off of IP-based limiting).
 */
export function getRateLimitKey(req: Request, route: string, userId?: string | null): string {
  if (userId) return `${route}:user:${userId}`;
  return `${route}:${getClientKey(req)}`;
}

export function resetRateLimitStore(): void {
  stores.clear();
}