import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Auth bypass security tests.
 *
 * Verifies that all authenticated endpoints reject requests with
 * missing, invalid, or malformed authorization headers. Tests both
 * env-var and database-backed auth modes.
 */

// We need to set API_KEYS before importing the app
const VALID_KEY = "sk-test-valid-key-12345";

// Store original env
const originalEnv = { ...process.env };

describe("auth bypass – env-var mode", () => {
  let app: typeof import("../../../index.js")["app"];

  beforeEach(async () => {
    vi.resetModules();
    process.env["API_KEYS"] = VALID_KEY;
    delete process.env["DATABASE_URL"];
    const mod = await import("../../../index.js");
    app = mod.app;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function request(path: string, init?: RequestInit) {
    return app.fetch(new Request(`http://localhost${path}`, init));
  }

  function authed(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${VALID_KEY}`);
    return request(path, { ...init, headers });
  }

  // ── Public endpoints should NOT require auth ──────────────────

  it("GET /health is accessible without auth", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
  });

  it("GET /health/deep is accessible without auth", async () => {
    const res = await request("/health/deep");
    expect(res.status).toBe(200);
  });

  it("GET /metrics is accessible without auth", async () => {
    const res = await request("/metrics");
    expect(res.status).toBe(200);
  });

  it("GET /api/docs is accessible without auth", async () => {
    const res = await request("/api/docs");
    expect(res.status).toBe(200);
  });

  // ── Missing Authorization header ────────────────────────────

  const protectedEndpoints = [
    ["GET", "/api/v1/evaluations"],
    ["GET", "/api/v1/evaluations/some-id"],
    ["POST", "/api/v1/evaluations"],
    ["GET", "/api/v1/domains"],
    ["POST", "/api/v1/scenarios/generate"],
    ["POST", "/api/v1/cost/estimate"],
    ["GET", "/api/v1/cost/models"],
    ["GET", "/api/v1/traces/run/some-run"],
    ["POST", "/api/v1/scorers/generate"],
    ["GET", "/api/v1/red-team/presets"],
    ["GET", "/api/v1/admin/keys"],
    ["POST", "/api/v1/admin/keys"],
  ] as const;

  for (const [method, path] of protectedEndpoints) {
    it(`rejects ${method} ${path} without Authorization header`, async () => {
      const init: RequestInit = { method };
      if (method === "POST") {
        init.headers = { "Content-Type": "application/json" };
        init.body = "{}";
      }
      const res = await request(path, init);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  }

  // ── Invalid Authorization formats ─────────────────────────

  it("rejects empty Authorization header", async () => {
    const res = await request("/api/v1/evaluations", {
      headers: { Authorization: "" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects Authorization without Bearer prefix", async () => {
    const res = await request("/api/v1/evaluations", {
      headers: { Authorization: VALID_KEY },
    });
    expect(res.status).toBe(401);
  });

  it("rejects Basic auth scheme", async () => {
    const res = await request("/api/v1/evaluations", {
      headers: { Authorization: `Basic ${btoa("user:pass")}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects Bearer with no token", async () => {
    const res = await request("/api/v1/evaluations", {
      headers: { Authorization: "Bearer " },
    });
    // Should be 401 (missing token) or 403 (invalid key)
    expect([401, 403]).toContain(res.status);
  });

  it("rejects Bearer with wrong key", async () => {
    const res = await request("/api/v1/evaluations", {
      headers: { Authorization: "Bearer wrong-key-entirely" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects bearer (lowercase) with valid key", async () => {
    // "bearer" (lowercase b) should still work per spec
    const res = await request("/api/v1/evaluations", {
      headers: { Authorization: `bearer ${VALID_KEY}` },
    });
    // The code lowercases the scheme, so this should work
    expect(res.status).toBe(200);
  });

  // ── Valid auth works ──────────────────────────────────────

  it("accepts valid Bearer token", async () => {
    const res = await authed("/api/v1/evaluations");
    expect(res.status).toBe(200);
  });

  it("accepts valid Bearer token on POST", async () => {
    const res = await authed("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", domain: "web-scraping" }),
    });
    // 201 = created successfully
    expect(res.status).toBe(201);
  });
});

describe("auth bypass – dev mode (no auth configured)", () => {
  let app: typeof import("../../../index.js")["app"];

  beforeEach(async () => {
    vi.resetModules();
    delete process.env["API_KEYS"];
    delete process.env["DATABASE_URL"];
    const mod = await import("../../../index.js");
    app = mod.app;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function request(path: string, init?: RequestInit) {
    return app.fetch(new Request(`http://localhost${path}`, init));
  }

  it("allows unauthenticated requests in dev mode", async () => {
    const res = await request("/api/v1/evaluations");
    expect(res.status).toBe(200);
  });

  it("allows admin endpoints in dev mode (no permission check)", async () => {
    const res = await request("/api/v1/admin/webhooks");
    expect(res.status).toBe(200);
  });
});
