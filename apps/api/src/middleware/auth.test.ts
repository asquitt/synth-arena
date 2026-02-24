import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

/**
 * Auth middleware tests.
 *
 * Tests three modes: dev (no auth), env-var, and database-backed.
 * Must mock process.env and api-keys repo since module-level vars cache at import.
 */

describe("authenticate middleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env["DATABASE_URL"];
    delete process.env["API_KEYS"];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  async function buildApp(envOverrides: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(envOverrides)) {
      process.env[k] = v;
    }
    const { authenticate } = await import("./auth.js");
    const app = new Hono();
    app.use("*", authenticate);
    app.get("/test", (c) => c.json({ ok: true }));
    app.onError((err: any, c) => {
      const status = err.statusCode ?? 500;
      return c.json({ error: { code: err.code, message: err.message } }, status);
    });
    return app;
  }

  function req(app: Hono, headers?: Record<string, string>) {
    return app.fetch(
      new Request("http://localhost/test", { headers }),
    );
  }

  it("allows requests in dev mode (no auth configured)", async () => {
    const app = await buildApp();
    const res = await req(app);
    expect(res.status).toBe(200);
  });

  it("rejects requests without Authorization header when API_KEYS set", async () => {
    const app = await buildApp({ API_KEYS: "test-key-1,test-key-2" });
    const res = await req(app);
    expect(res.status).toBe(401);
  });

  it("rejects non-Bearer auth scheme", async () => {
    const app = await buildApp({ API_KEYS: "test-key" });
    const res = await req(app, { Authorization: "Basic dXNlcjpwYXNz" });
    expect(res.status).toBe(401);
  });

  it("rejects invalid key with env-var auth", async () => {
    const app = await buildApp({ API_KEYS: "valid-key" });
    const res = await req(app, { Authorization: "Bearer wrong-key" });
    expect(res.status).toBe(403);
  });

  it("accepts valid key with env-var auth", async () => {
    const app = await buildApp({ API_KEYS: "valid-key" });
    const res = await req(app, { Authorization: "Bearer valid-key" });
    expect(res.status).toBe(200);
  });

  it("accepts any of multiple comma-separated keys", async () => {
    const app = await buildApp({ API_KEYS: "key-a, key-b, key-c" });

    const resA = await req(app, { Authorization: "Bearer key-a" });
    expect(resA.status).toBe(200);

    const resC = await req(app, { Authorization: "Bearer key-c" });
    expect(resC.status).toBe(200);
  });

  it("trims whitespace from API_KEYS entries", async () => {
    const app = await buildApp({ API_KEYS: "  spaced-key  " });
    const res = await req(app, { Authorization: "Bearer spaced-key" });
    expect(res.status).toBe(200);
  });

  it("ignores empty entries in API_KEYS", async () => {
    const app = await buildApp({ API_KEYS: "key-a,,, ,key-b" });
    const res = await req(app, { Authorization: "Bearer key-a" });
    expect(res.status).toBe(200);
  });
});

describe("requirePermission middleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env["DATABASE_URL"];
    delete process.env["API_KEYS"];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("skips permission check when not in DB mode", async () => {
    const { requirePermission } = await import("./auth.js");
    const app = new Hono();
    app.use("*", requirePermission("admin"));
    app.get("/test", (c) => c.json({ ok: true }));
    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
  });
});
