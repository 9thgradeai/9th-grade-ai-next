const stores = new Map<string, { count: number; reset: number }>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const record = stores.get(key);

  if (!record || now > record.reset) {
    stores.set(key, { count: 1, reset: now + windowMs });
    return true;
  }

  record.count++;
  return record.count <= max;
}

export function getRateLimitKey(req: Request, route: string): string {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("host") ?? "unknown";
  return `${route}:${ip}`;
}
