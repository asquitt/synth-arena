import { describe, it, expect } from "vitest";
import { app } from "../../../index.js";

/**
 * Input validation security tests.
 *
 * Verifies that all endpoints properly reject:
 * - SQL injection payloads
 * - XSS payloads
 * - Oversized inputs
 * - Malformed JSON
 * - Unexpected types
 * - Boundary values
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

function rawPost(path: string, body: string, contentType = "application/json"): Promise<Response> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

// ── SQL Injection Payloads ──────────────────────────────────────

describe("SQL injection prevention", () => {
  const SQL_PAYLOADS = [
    "'; DROP TABLE evaluations; --",
    "1 OR 1=1",
    "1; SELECT * FROM api_keys; --",
    "' UNION SELECT * FROM api_keys --",
    "1' AND '1'='1",
    "'; EXEC xp_cmdshell('whoami'); --",
    "1; WAITFOR DELAY '0:0:5'--",
  ];

  it("rejects SQL injection in evaluation name", async () => {
    for (const payload of SQL_PAYLOADS) {
      const res = await json("/api/v1/evaluations", {
        name: payload,
        domain: "web-scraping",
      });
      // Either 201 (treated as string, which is safe since we use parameterized queries)
      // or 400 (validation rejects it). Both are acceptable — NOT 500 with DB error.
      expect([201, 400]).toContain(res.status);
      if (res.status === 201) {
        const body = await res.json();
        // If accepted, the name is stored as a literal string — not executed as SQL
        expect(body.data.name).toBe(payload);
      }
    }
  });

  it("rejects SQL injection in query parameters", async () => {
    const res = await request("/api/v1/evaluations?domain=' OR '1'='1&limit=1; DROP TABLE evaluations");
    // Should either parse safely or return 200 with no matching results
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should not throw an error or expose DB info
    expect(body.error).toBeUndefined();
  });

  it("rejects SQL injection in path parameters", async () => {
    const res = await request("/api/v1/evaluations/' OR '1'='1");
    // Should be 404 (not found) — not a DB error
    expect(res.status).toBe(404);
  });

  it("rejects SQL injection in domain path param", async () => {
    const res = await request("/api/v1/domains/' UNION SELECT * FROM api_keys --");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

// ── XSS Payloads ────────────────────────────────────────────────

describe("XSS prevention", () => {
  const XSS_PAYLOADS = [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(document.cookie)",
    "<svg/onload=alert('xss')>",
    "'-alert(1)-'",
    "\"><script>alert(1)</script>",
  ];

  it("does not reflect XSS in error messages", async () => {
    for (const payload of XSS_PAYLOADS) {
      const res = await request(`/api/v1/evaluations/${encodeURIComponent(payload)}`);
      const body = await res.json();
      // Check that response content type is JSON (not HTML)
      expect(res.headers.get("content-type")).toContain("application/json");
      // If the payload appears in the error, it's stored as a safe string, not executed
      if (body.error?.message?.includes(payload)) {
        // Ensure X-Content-Type-Options is set to prevent MIME sniffing
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      }
    }
  });

  it("stores XSS payloads as literal strings in evaluations", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "<script>alert('xss')</script>",
      domain: "web-scraping",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    // The payload should be stored literally, not sanitized
    // (API returns JSON — XSS is a frontend concern, but the API should set proper headers)
    expect(body.data.name).toBe("<script>alert('xss')</script>");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("sets X-Content-Type-Options header", async () => {
    const res = await request("/api/v1/evaluations");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

// ── Malformed JSON ──────────────────────────────────────────────

describe("malformed JSON handling", () => {
  it("rejects completely invalid JSON", async () => {
    const res = await rawPost("/api/v1/evaluations", "this is not json");
    expect([400, 500]).toContain(res.status);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("rejects truncated JSON", async () => {
    const res = await rawPost("/api/v1/evaluations", '{"name": "test", "domain":');
    expect([400, 500]).toContain(res.status);
  });

  it("rejects empty body on POST endpoints", async () => {
    const res = await rawPost("/api/v1/evaluations", "");
    expect([400, 500]).toContain(res.status);
  });

  it("rejects non-object JSON (array)", async () => {
    const res = await rawPost("/api/v1/evaluations", "[1, 2, 3]");
    expect(res.status).toBe(400);
  });

  it("rejects non-object JSON (string)", async () => {
    const res = await rawPost("/api/v1/evaluations", '"just a string"');
    expect(res.status).toBe(400);
  });

  it("rejects non-object JSON (number)", async () => {
    const res = await rawPost("/api/v1/evaluations", "42");
    expect(res.status).toBe(400);
  });

  it("rejects null body", async () => {
    const res = await rawPost("/api/v1/evaluations", "null");
    expect(res.status).toBe(400);
  });
});

// ── Type Coercion & Unexpected Types ────────────────────────────

describe("type safety", () => {
  it("rejects string where number expected (scenarioCount)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      scenarioCount: "not-a-number",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects negative scenarioCount", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      scenarioCount: -5,
    });
    expect(res.status).toBe(400);
  });

  it("rejects zero scenarioCount", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      scenarioCount: 0,
    });
    expect(res.status).toBe(400);
  });

  it("rejects float scenarioCount", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      scenarioCount: 5.5,
    });
    expect(res.status).toBe(400);
  });

  it("rejects scenarioCount above max (10000)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      scenarioCount: 99999,
    });
    expect(res.status).toBe(400);
  });

  it("rejects empty name", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "",
      domain: "web-scraping",
    });
    expect(res.status).toBe(400);
  });

  it("rejects name exceeding max length (255)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "x".repeat(256),
      domain: "web-scraping",
    });
    expect(res.status).toBe(400);
  });

  it("rejects number where string expected (name)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: 12345,
      domain: "web-scraping",
    });
    expect(res.status).toBe(400);
  });

  it("rejects boolean where string expected", async () => {
    const res = await json("/api/v1/evaluations", {
      name: true,
      domain: "web-scraping",
    });
    expect(res.status).toBe(400);
  });

  it("rejects cost estimate with invalid cacheHitRate > 1", async () => {
    const res = await json("/api/v1/cost/estimate", {
      model: "claude-sonnet-4-20250514",
      scenarioCount: 10,
      cacheHitRate: 1.5,
    });
    expect(res.status).toBe(400);
  });

  it("rejects cost estimate with negative cacheHitRate", async () => {
    const res = await json("/api/v1/cost/estimate", {
      model: "claude-sonnet-4-20250514",
      scenarioCount: 10,
      cacheHitRate: -0.1,
    });
    expect(res.status).toBe(400);
  });

  it("rejects scorer with threshold > 1", async () => {
    const res = await json("/api/v1/scorers/generate", {
      name: "test",
      criteria: "check quality",
      threshold: 1.5,
    });
    expect(res.status).toBe(400);
  });

  it("rejects scorer with invalid mode", async () => {
    const res = await json("/api/v1/scorers/generate", {
      name: "test",
      criteria: "check quality",
      mode: "invalid-mode",
    });
    expect(res.status).toBe(400);
  });

  it("rejects webhook with invalid URL", async () => {
    const res = await json("/api/v1/admin/webhooks", {
      url: "not-a-url",
      events: ["evaluation.completed"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects webhook with empty events array", async () => {
    const res = await json("/api/v1/admin/webhooks", {
      url: "https://example.com/hook",
      events: [],
    });
    expect(res.status).toBe(400);
  });

  it("rejects webhook with invalid event type", async () => {
    const res = await json("/api/v1/admin/webhooks", {
      url: "https://example.com/hook",
      events: ["not.a.real.event"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects API key with invalid permission", async () => {
    const res = await json("/api/v1/admin/keys", {
      name: "test-key",
      permissions: ["read", "superadmin"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects complexity enum with invalid value", async () => {
    const res = await json("/api/v1/scenarios/generate", {
      domain: "web-scraping",
      count: 5,
      complexity: "extreme",
    });
    expect(res.status).toBe(400);
  });
});

// ── Boundary Values ─────────────────────────────────────────────

describe("boundary values", () => {
  it("accepts minimum valid evaluation", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "a",
      domain: "x",
      scenarioCount: 1,
      trials: 1,
    });
    expect(res.status).toBe(201);
  });

  it("rejects trials above max (100)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      trials: 101,
    });
    expect(res.status).toBe(400);
  });

  it("rejects maxConcurrency above max (50)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      maxConcurrency: 51,
    });
    expect(res.status).toBe(400);
  });

  it("rejects timeout below min (1000ms)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      timeout: 500,
    });
    expect(res.status).toBe(400);
  });

  it("rejects systemPrompt exceeding max length (10000)", async () => {
    const res = await json("/api/v1/evaluations", {
      name: "test",
      domain: "web-scraping",
      systemPrompt: "x".repeat(10001),
    });
    expect(res.status).toBe(400);
  });

  it("caps limit query param at 200", async () => {
    const res = await request("/api/v1/evaluations?limit=500");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata.limit).toBeLessThanOrEqual(200);
  });
});
