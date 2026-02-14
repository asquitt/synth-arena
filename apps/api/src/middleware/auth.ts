import type { Context, Next } from "hono";

/**
 * API key authentication middleware.
 *
 * Validates the Authorization header against configured API keys.
 * In dev mode (no API_KEYS env var), all requests are allowed.
 * In production, requires: Authorization: Bearer <key>
 */

let validKeys: Set<string> | null = null;

function getValidKeys(): Set<string> | null {
  if (validKeys !== null) return validKeys.size > 0 ? validKeys : null;

  const keysEnv = process.env["API_KEYS"];
  if (!keysEnv) {
    validKeys = new Set();
    return null;
  }

  validKeys = new Set(keysEnv.split(",").map((k) => k.trim()).filter(Boolean));
  return validKeys.size > 0 ? validKeys : null;
}

export async function authenticate(c: Context, next: Next) {
  const keys = getValidKeys();

  // Dev mode: no keys configured, skip auth
  if (!keys) return next();

  const authHeader = c.req.header("authorization");
  if (!authHeader) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }

  const [scheme, token] = authHeader.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return c.json({ error: "Invalid Authorization format. Use: Bearer <key>" }, 401);
  }

  if (!keys.has(token)) {
    return c.json({ error: "Invalid API key" }, 403);
  }

  return next();
}
