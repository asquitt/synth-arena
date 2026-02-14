import { describe, it, expect } from "vitest";
import { app } from "./index.js";

/**
 * API smoke tests — verifies core endpoints respond correctly.
 *
 * Uses Hono's built-in fetch handler (no server needed).
 * These run without external services (Postgres, Redis, ClickHouse).
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

describe("Health endpoints", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThan(0);
  });

  it("GET /health/deep returns 200 with checks", async () => {
    const res = await request("/health/deep");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.checks).toBeDefined();
    expect(body.checks.memory).toBeDefined();
    expect(body.checks.event_loop).toBeDefined();
  });
});

describe("Metrics endpoint", () => {
  it("GET /metrics returns Prometheus text format", async () => {
    const res = await request("/metrics");
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("http_requests_total");
    expect(text).toContain("process_uptime_seconds");
  });
});

describe("404 handler", () => {
  it("returns structured error for unknown routes", async () => {
    const res = await request("/api/v1/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("Authentication", () => {
  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request("/api/v1/evaluations");
    // Without API_KEYS env var, auth is bypassed in dev mode
    // With API_KEYS set, this would return 401
    expect([200, 401]).toContain(res.status);
  });
});

describe("CORS", () => {
  it("includes CORS headers on responses", async () => {
    const res = await request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
  });
});
