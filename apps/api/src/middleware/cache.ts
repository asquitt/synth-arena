import type { Context, Next } from "hono";

/**
 * Cache-Control headers for API responses.
 *
 * Sets appropriate caching directives based on route type:
 * - Health/metrics: short cache (5s) for load balancer polling
 * - API data: no-store for dynamic content
 */

export function cacheControl(directive: string) {
  return async (c: Context, next: Next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) {
      c.header("Cache-Control", directive);
    }
  };
}

/** No caching — for authenticated/dynamic API responses. */
export const noCache = cacheControl("no-store, no-cache, must-revalidate");

/** Short cache for health checks polled by load balancers. */
export const shortCache = cacheControl("public, max-age=5, s-maxage=5");
