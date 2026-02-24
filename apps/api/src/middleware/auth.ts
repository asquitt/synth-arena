import type { Context, Next } from "hono";
import * as apiKeyRepo from "../repositories/api-keys.js";
import { unauthorized, forbidden } from "../errors.js";

/**
 * API key authentication middleware.
 *
 * Two modes:
 * 1. Database-backed (DATABASE_URL set): validates against api_keys table with SHA-256 hash lookup.
 *    Supports per-key permissions and rate limits. Attaches key info to context.
 * 2. Env-var (API_KEYS set): validates against comma-separated list in env var.
 * 3. Dev mode (neither set): all requests allowed.
 */

const useDb = !!process.env["DATABASE_URL"];
let envKeys: Set<string> | null = null;

function getEnvKeys(): Set<string> | null {
  if (envKeys !== null) return envKeys.size > 0 ? envKeys : null;

  const keysEnv = process.env["API_KEYS"];
  if (!keysEnv) {
    envKeys = new Set();
    return null;
  }

  envKeys = new Set(keysEnv.split(",").map((k) => k.trim()).filter(Boolean));
  return envKeys.size > 0 ? envKeys : null;
}

export async function authenticate(c: Context, next: Next) {
  // Dev mode: no auth configured
  if (!useDb && !getEnvKeys()) return next();

  const authHeader = c.req.header("authorization");
  if (!authHeader) {
    throw unauthorized("Missing Authorization header");
  }

  const [scheme, token] = authHeader.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw unauthorized("Invalid Authorization format. Use: Bearer <key>");
  }

  // Database-backed auth
  if (useDb) {
    const keyHash = apiKeyRepo.hashKey(token);
    const keyRecord = await apiKeyRepo.findByHash(keyHash);

    if (!keyRecord) {
      throw forbidden("Invalid API key");
    }

    // Attach key info to context for downstream use
    c.set("apiKeyId", keyRecord.id);
    c.set("apiKeyPermissions", keyRecord.permissions);
    c.set("apiKeyRateLimit", keyRecord.rateLimitPerMinute);

    // Update last_used_at (fire-and-forget, log on failure)
    apiKeyRepo.touchKey(keyHash).catch((err) => {
      console.error(JSON.stringify({
        level: "error",
        message: "Failed to update API key last_used_at",
        error: err instanceof Error ? err.message : String(err),
      }));
    });

    return next();
  }

  // Env-var auth fallback
  const keys = getEnvKeys();
  if (keys && !keys.has(token)) {
    throw forbidden("Invalid API key");
  }

  return next();
}

/**
 * Permission check middleware factory.
 * Requires a specific permission on the API key.
 * Only effective in database-backed auth mode.
 */
export function requirePermission(permission: string) {
  return async (c: Context, next: Next) => {
    if (!useDb) return next();

    const permissions = c.get("apiKeyPermissions") as string[] | undefined;
    if (!permissions || !permissions.includes(permission)) {
      throw forbidden(`Missing required permission: ${permission}`);
    }

    return next();
  };
}
