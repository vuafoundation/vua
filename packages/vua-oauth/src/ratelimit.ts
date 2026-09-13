/**
 * Fixed-window, in-memory rate limiter. Deliberately not shared
 * across instances (same tradeoff as SqliteOAuthStore — fine at
 * min=max=1 instances). This is abuse mitigation, not a security
 * boundary: it does not need to be perfectly distributed to be
 * useful.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the request should be allowed. */
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart > this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= this.maxRequests) {
      return false;
    }
    entry.count++;
    return true;
  }
}

export function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}
