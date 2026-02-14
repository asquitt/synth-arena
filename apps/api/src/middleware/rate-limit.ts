import type { Context, Next } from "hono";

/**
 * Simple in-memory sliding window rate limiter.
 *
 * Tracks requests per API key (or IP for unauthenticated requests).
 * For production, replace with Redis-based rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = parseInt(process.env["RATE_LIMIT_MAX"] ?? "100", 10);

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000);

export async function rateLimit(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");
  const key = authHeader
    ? authHeader.split(" ")[1] ?? "unknown"
    : c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "anonymous";

  const now = Date.now();
  let entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }

  entry.count++;

  c.header("X-RateLimit-Limit", String(MAX_REQUESTS));
  c.header("X-RateLimit-Remaining", String(Math.max(0, MAX_REQUESTS - entry.count)));
  c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > MAX_REQUESTS) {
    return c.json(
      { error: "Rate limit exceeded", retryAfter: Math.ceil((entry.resetAt - now) / 1000) },
      429,
    );
  }

  return next();
}
