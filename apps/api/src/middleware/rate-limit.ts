import type { Context, Next } from "hono";
import Redis from "ioredis";
import { rateLimited } from "../errors.js";

/**
 * Rate limiter with Redis backend (production) or in-memory fallback (dev).
 *
 * Uses fixed-window counting with Redis INCR + EXPIRE for atomicity.
 * Respects per-key rate limits from the api_keys table when available.
 */

const WINDOW_SECONDS = 60;
const DEFAULT_MAX = parseInt(process.env["RATE_LIMIT_MAX"] ?? "100", 10);

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env["REDIS_URL"];
  if (!url) return null;
  redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  redis.connect().catch((err) => {
    console.error(JSON.stringify({
      level: "warn",
      message: "Rate limiter Redis connection failed, falling back to in-memory",
      error: err instanceof Error ? err.message : String(err),
    }));
    redis = null;
  });
  return redis;
}

// In-memory fallback
interface MemEntry { count: number; resetAt: number }
const memStore = new Map<string, MemEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (entry.resetAt <= now) memStore.delete(key);
  }
}, 60_000);

function getIdentifier(c: Context): string {
  const apiKeyId = c.get("apiKeyId") as string | undefined;
  if (apiKeyId) return `ratelimit:${apiKeyId}`;

  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "anonymous";
  return `ratelimit:${ip}`;
}

export async function rateLimit(c: Context, next: Next) {
  const identifier = getIdentifier(c);

  // Per-key rate limit from DB (set by auth middleware)
  const perKeyLimit = c.get("apiKeyRateLimit") as number | undefined;
  const maxRequests = perKeyLimit ?? DEFAULT_MAX;

  const r = getRedis();

  let count: number;
  let ttl: number;

  if (r) {
    // Redis-backed: atomic INCR + EXPIRE
    try {
      count = await r.incr(identifier);
      if (count === 1) {
        await r.expire(identifier, WINDOW_SECONDS);
      }
      ttl = await r.ttl(identifier);
      if (ttl < 0) ttl = WINDOW_SECONDS;
    } catch {
      // Redis failure: fall through to in-memory
      return inMemoryRateLimit(c, next, identifier, maxRequests);
    }
  } else {
    return inMemoryRateLimit(c, next, identifier, maxRequests);
  }

  c.header("X-RateLimit-Limit", String(maxRequests));
  c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - count)));
  c.header("X-RateLimit-Reset", String(Math.ceil((Date.now() + ttl * 1000) / 1000)));

  if (count > maxRequests) {
    throw rateLimited(ttl);
  }

  return next();
}

function inMemoryRateLimit(c: Context, next: Next, identifier: string, maxRequests: number) {
  const now = Date.now();
  let entry = memStore.get(identifier);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_SECONDS * 1000 };
    memStore.set(identifier, entry);
  }

  entry.count++;

  c.header("X-RateLimit-Limit", String(maxRequests));
  c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
  c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > maxRequests) {
    throw rateLimited(Math.ceil((entry.resetAt - now) / 1000));
  }

  return next();
}
