import type { Context, Next } from "hono";
import { ApiError } from "../errors.js";

/**
 * Request timeout middleware.
 *
 * Aborts requests that exceed the configured timeout.
 * Default: 30s for regular routes, evaluations have their own timeout.
 */

const DEFAULT_TIMEOUT_MS = parseInt(process.env["REQUEST_TIMEOUT_MS"] ?? "30000", 10);

export function timeout(ms: number = DEFAULT_TIMEOUT_MS) {
  return async (_c: Context, next: Next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      await Promise.race([
        next(),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new ApiError("SERVICE_UNAVAILABLE", `Request timed out after ${ms}ms`, 504));
          });
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
