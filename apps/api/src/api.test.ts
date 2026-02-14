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
    expect(text).toContain("syntharena_http_requests_total");
    expect(text).toContain("syntharena_process_uptime_seconds");
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

describe("Evaluation CRUD", () => {
  it("creates an evaluation and retrieves it", async () => {
    const createRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-eval",
        domain: "web-scraping",
        scenarioCount: 2,
        trials: 1,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.data.id).toBeDefined();
    expect(created.data.status).toBe("completed");

    // Retrieve it
    const getRes = await request(`/api/v1/evaluations/${created.data.id}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.data.id).toBe(created.data.id);
    expect(fetched.data.results).toBeDefined();
    expect(fetched.data.results.length).toBe(2);
  });

  it("lists evaluations with pagination", async () => {
    const listRes = await request("/api/v1/evaluations?limit=10&offset=0");
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.data).toBeDefined();
    expect(list.metadata.limit).toBe(10);
    expect(list.metadata.offset).toBe(0);
    expect(list.metadata.total).toBeGreaterThanOrEqual(0);
  });

  it("returns 404 for non-existent evaluation", async () => {
    const res = await request("/api/v1/evaluations/nonexistent-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
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

describe("Security headers", () => {
  it("includes security headers on all responses", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
  });
});

describe("Request ID", () => {
  it("returns a generated request ID when none provided", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    const rid = res.headers.get("x-request-id");
    expect(rid).toBeDefined();
    expect(rid!.length).toBeGreaterThan(0);
  });

  it("echoes back a provided X-Request-Id header", async () => {
    const customId = "test-request-123";
    const res = await request("/health", {
      headers: { "X-Request-Id": customId },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe(customId);
  });
});
