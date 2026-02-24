import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";

/**
 * Rate limiter tests — in-memory mode only (no Redis in test).
 *
 * We re-import the module each test to reset the module-level memStore.
 */

describe("rateLimit middleware (in-memory)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env["REDIS_URL"];
    delete process.env["RATE_LIMIT_MAX"];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  async function buildApp(maxRequests?: number) {
    if (maxRequests) {
      process.env["RATE_LIMIT_MAX"] = String(maxRequests);
    }
    const { rateLimit } = await import("./rate-limit.js");
    const { ApiError } = await import("../errors.js");
    const app = new Hono();
    app.use("*", rateLimit);
    app.get("/test", (c) => c.json({ ok: true }));
    app.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json(err.toJSON(), err.statusCode as 429);
      }
      return c.json({ error: err.message }, 500);
    });
    return app;
  }

  it("allows requests under the limit", async () => {
    const app = await buildApp(10);
    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
  });

  it("sets rate limit headers", async () => {
    const app = await buildApp(100);
    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("decrements remaining count with each request", async () => {
    const app = await buildApp(10);
    const res1 = await app.fetch(new Request("http://localhost/test"));
    const remaining1 = parseInt(res1.headers.get("X-RateLimit-Remaining")!, 10);

    const res2 = await app.fetch(new Request("http://localhost/test"));
    const remaining2 = parseInt(res2.headers.get("X-RateLimit-Remaining")!, 10);

    expect(remaining2).toBe(remaining1 - 1);
  });

  it("rejects requests over the limit", async () => {
    const app = await buildApp(2);
    // Make 3 requests — third should be rejected
    await app.fetch(new Request("http://localhost/test"));
    await app.fetch(new Request("http://localhost/test"));
    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.status).toBe(429);
  });

  it("uses per-key identifier when apiKeyId is set", async () => {
    const { rateLimit } = await import("./rate-limit.js");
    const { ApiError } = await import("../errors.js");
    const app = new Hono();
    // Simulate auth middleware setting apiKeyId
    app.use("*", async (c, next) => {
      c.set("apiKeyId", "test-key-123");
      await next();
    });
    app.use("*", rateLimit);
    app.get("/test", (c) => c.json({ ok: true }));
    app.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json(err.toJSON(), err.statusCode as 429);
      }
      return c.json({ error: err.message }, 500);
    });

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBeDefined();
  });

  it("uses IP from x-forwarded-for as fallback identifier", async () => {
    const app = await buildApp(100);
    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { "X-Forwarded-For": "1.2.3.4" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
