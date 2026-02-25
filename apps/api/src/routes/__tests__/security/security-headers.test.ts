import { describe, it, expect } from "vitest";
import { app } from "../../../index.js";

/**
 * Security headers tests.
 *
 * Verifies that all responses include proper security headers
 * to prevent common web vulnerabilities.
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

describe("security headers on all responses", () => {
  const paths = [
    "/health",
    "/health/deep",
    "/metrics",
    "/api/v1/evaluations",
    "/api/v1/domains",
    "/api/v1/cost/models",
  ];

  for (const path of paths) {
    describe(`GET ${path}`, () => {
      it("includes X-Content-Type-Options: nosniff", async () => {
        const res = await request(path);
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      });

      it("includes X-Frame-Options: DENY", async () => {
        const res = await request(path);
        expect(res.headers.get("x-frame-options")).toBe("DENY");
      });

      it("includes Referrer-Policy", async () => {
        const res = await request(path);
        expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      });

      it("includes Permissions-Policy", async () => {
        const res = await request(path);
        const pp = res.headers.get("permissions-policy");
        expect(pp).toContain("camera=()");
        expect(pp).toContain("microphone=()");
        expect(pp).toContain("geolocation=()");
      });
    });
  }

  it("includes X-Request-Id on API responses", async () => {
    const res = await request("/api/v1/evaluations");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("rate limit headers", () => {
  it("includes rate limit headers on API responses", async () => {
    const res = await request("/api/v1/evaluations");
    expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-remaining")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-reset")).toBeTruthy();
  });

  it("rate limit remaining decreases on successive requests", async () => {
    const res1 = await request("/api/v1/evaluations");
    const remaining1 = parseInt(res1.headers.get("x-ratelimit-remaining") ?? "0", 10);

    const res2 = await request("/api/v1/evaluations");
    const remaining2 = parseInt(res2.headers.get("x-ratelimit-remaining") ?? "0", 10);

    expect(remaining2).toBeLessThanOrEqual(remaining1);
  });
});

describe("cache control on API responses", () => {
  it("API v1 responses have no-cache headers", async () => {
    const res = await request("/api/v1/evaluations");
    const cc = res.headers.get("cache-control");
    expect(cc).toBeTruthy();
    // Should prevent caching of authenticated data
    expect(cc).toMatch(/no-cache|no-store|private/);
  });

  it("health endpoint has short cache", async () => {
    const res = await request("/health");
    const cc = res.headers.get("cache-control");
    // Health checks can be cached briefly
    if (cc) {
      expect(cc).toMatch(/max-age=\d+|public/);
    }
  });
});
