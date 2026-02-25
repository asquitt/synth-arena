import { describe, it, expect } from "vitest";
import { app } from "../../../index.js";

/**
 * Error leakage security tests.
 *
 * Verifies that error responses do not expose:
 * - Stack traces
 * - File paths
 * - Internal server state
 * - Database connection strings
 * - Environment variable values
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

function json(path: string, data: unknown): Promise<Response> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

describe("error response safety", () => {
  // Patterns that should NEVER appear in error responses
  const LEAKED_PATTERNS = [
    /node_modules/i,
    /at\s+\w+\s+\(/,       // Stack trace pattern: "at Function ("
    /\.ts:\d+:\d+/,         // TypeScript source reference
    /\.js:\d+:\d+/,         // JS source reference
    /\/Users\//,            // macOS file paths
    /\/home\//,             // Linux file paths
    /C:\\Users/,            // Windows file paths
    /DATABASE_URL/,         // Env var names
    /CLICKHOUSE_URL/,
    /REDIS_URL/,
    /API_KEYS/,
    /postgres:\/\//,        // Connection strings
    /redis:\/\//,
    /password/i,
  ];

  async function assertNoLeaks(res: Response) {
    const text = await res.text();
    for (const pattern of LEAKED_PATTERNS) {
      expect(text, `Response leaked pattern: ${pattern}`).not.toMatch(pattern);
    }
  }

  it("404 does not leak internal info", async () => {
    const res = await request("/api/v1/nonexistent-route");
    expect(res.status).toBe(404);
    await assertNoLeaks(res);
  });

  it("validation error does not leak stack traces", async () => {
    const res = await json("/api/v1/evaluations", { invalid: true });
    expect(res.status).toBe(400);
    await assertNoLeaks(res);
  });

  it("evaluation not found does not leak internal paths", async () => {
    const res = await request("/api/v1/evaluations/non-existent-id");
    expect(res.status).toBe(404);
    await assertNoLeaks(res);
  });

  it("domain not found does not leak file system info", async () => {
    const res = await request("/api/v1/domains/nonexistent-domain");
    expect(res.status).toBe(404);
    await assertNoLeaks(res);
  });

  it("invalid JSON does not expose parser internals", async () => {
    const res = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{malformed",
    });
    expect([400, 500]).toContain(res.status);
    await assertNoLeaks(res);
  });

  it("trace 503 does not expose connection details", async () => {
    const res = await request("/api/v1/traces/run/some-run-id");
    // Should be 503 (ClickHouse not configured) — not leak connection info
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).not.toMatch(/postgres|clickhouse:\/\/|redis:\/\//i);
  });
});

describe("error response structure", () => {
  it("all error responses follow the envelope format", async () => {
    const errorCases = [
      request("/api/v1/evaluations/missing"),
      request("/api/v1/nothing-here"),
      json("/api/v1/evaluations", {}),
    ];

    for (const resPromise of errorCases) {
      const res = await resPromise;
      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(typeof body.error.code).toBe("string");
      expect(body.error.message).toBeDefined();
      expect(typeof body.error.message).toBe("string");
    }
  });

  it("error responses include requestId", async () => {
    const res = await request("/api/v1/evaluations/missing");
    expect(res.status).toBe(404);
    const body = await res.json();
    // requestId should be present
    expect(body.requestId ?? body.error?.requestId ?? res.headers.get("x-request-id")).toBeTruthy();
  });

  it("does not include stack in JSON responses", async () => {
    const res = await json("/api/v1/evaluations", {});
    const body = await res.json();
    expect(body.stack).toBeUndefined();
    expect(body.error?.stack).toBeUndefined();
  });
});

describe("information disclosure via headers", () => {
  it("does not expose Server header with version info", async () => {
    const res = await request("/api/v1/evaluations");
    const server = res.headers.get("server");
    // Should either be absent or not reveal specific version
    if (server) {
      expect(server).not.toMatch(/\d+\.\d+\.\d+/); // No semver in Server header
    }
  });

  it("does not expose X-Powered-By header", async () => {
    const res = await request("/api/v1/evaluations");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});
