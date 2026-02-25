import { describe, it, expect } from "vitest";
import { app } from "../../../index.js";

/**
 * Path traversal and injection tests.
 *
 * Verifies that path parameters cannot be used to access
 * unauthorized resources or traverse the filesystem.
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

describe("path traversal in route parameters", () => {
  const TRAVERSAL_PAYLOADS = [
    "../../../etc/passwd",
    "..%2F..%2F..%2Fetc%2Fpasswd",
    "....//....//etc/passwd",
    "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "..\\..\\..\\windows\\system32\\config\\sam",
    "..%5c..%5c..%5cwindows%5csystem32",
    "....\\\\....\\\\etc\\\\passwd",
  ];

  for (const payload of TRAVERSAL_PAYLOADS) {
    it(`rejects traversal in evaluation ID: ${payload.slice(0, 30)}...`, async () => {
      const res = await request(`/api/v1/evaluations/${encodeURIComponent(payload)}`);
      // Should be 404 (not found) — must never return file contents
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  }

  for (const payload of TRAVERSAL_PAYLOADS) {
    it(`rejects traversal in domain name: ${payload.slice(0, 30)}...`, async () => {
      const res = await request(`/api/v1/domains/${encodeURIComponent(payload)}`);
      expect(res.status).toBe(404);
    });
  }

  it("rejects null bytes in path parameters", async () => {
    const res = await request("/api/v1/evaluations/test%00admin");
    expect(res.status).toBe(404);
  });

  it("rejects URL-encoded dots in path", async () => {
    const res = await request("/api/v1/domains/%2e%2e/admin/keys");
    // Should not return 200 with actual data — 404, 503, or auth error are all acceptable
    expect(res.status).not.toBe(200);
  });
});

describe("HTTP method enforcement", () => {
  it("rejects PUT on evaluations (not supported)", async () => {
    const res = await request("/api/v1/evaluations/some-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "updated" }),
    });
    // Should be 404 (route not found for this method) or 405
    expect([404, 405]).toContain(res.status);
  });

  it("rejects PATCH on evaluations (not supported)", async () => {
    const res = await request("/api/v1/evaluations/some-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "patched" }),
    });
    expect([404, 405]).toContain(res.status);
  });

  it("rejects DELETE on domains (immutable)", async () => {
    const res = await request("/api/v1/domains/web-scraping", {
      method: "DELETE",
    });
    expect([404, 405]).toContain(res.status);
  });
});

describe("route not found handling", () => {
  it("returns structured 404 for unknown API routes", async () => {
    const res = await request("/api/v1/unknown-route");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns structured 404 for nested unknown routes", async () => {
    const res = await request("/api/v1/evaluations/some-id/unknown-sub");
    expect(res.status).toBe(404);
  });

  it("returns JSON for 404 (not HTML)", async () => {
    const res = await request("/api/v1/nonexistent");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
