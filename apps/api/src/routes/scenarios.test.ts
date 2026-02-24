import { describe, it, expect } from "vitest";
import { app } from "../index.js";

/**
 * Scenario route tests — verifies generation, validation, and adversarial endpoints.
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

function json(data: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

describe("Scenario routes", () => {
  describe("POST /api/v1/scenarios/generate", () => {
    it("rejects request with missing domain", async () => {
      const res = await request("/api/v1/scenarios/generate", json({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unknown domain", async () => {
      const res = await request(
        "/api/v1/scenarios/generate",
        json({ domain: "nonexistent-domain", count: 5 }),
      );
      // Either 400 (domain not found) or 404
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /api/v1/scenarios/validate", () => {
    it("rejects request with missing scenarios", async () => {
      const res = await request("/api/v1/scenarios/validate", json({}));
      expect(res.status).toBe(400);
    });

    it("validates a scenario set", async () => {
      const now = new Date().toISOString();
      const res = await request(
        "/api/v1/scenarios/validate",
        json({
          scenarios: [
            {
              id: "s1",
              domain: "web-scraping",
              name: "Scenario 1",
              description: "First test scenario",
              input: { url: "https://example.com" },
              expected: { result: "expected1" },
              metadata: { complexity: "low", tags: ["test"], generatedAt: now, generatorVersion: "1.0" },
            },
            {
              id: "s2",
              domain: "web-scraping",
              name: "Scenario 2",
              description: "Second test scenario",
              input: { url: "https://example.org" },
              expected: { result: "expected2" },
              metadata: { complexity: "medium", tags: ["test"], generatedAt: now, generatorVersion: "1.0" },
            },
            {
              id: "s3",
              domain: "web-scraping",
              name: "Scenario 3",
              description: "Third test scenario",
              input: { query: "search" },
              expected: { result: "expected3" },
              metadata: { complexity: "high", tags: ["different"], generatedAt: now, generatorVersion: "1.0" },
            },
          ],
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.total).toBe(3);
      expect(typeof body.data.diversityScore).toBe("number");
      expect(typeof body.data.isAcceptable).toBe("boolean");
    });
  });

  describe("POST /api/v1/scenarios/adversarial", () => {
    it("rejects request with missing base scenarios", async () => {
      const res = await request("/api/v1/scenarios/adversarial", json({}));
      expect(res.status).toBe(400);
    });

    it("generates adversarial scenarios", async () => {
      const now = new Date().toISOString();
      const res = await request(
        "/api/v1/scenarios/adversarial",
        json({
          baseScenarios: [
            {
              id: "base1",
              domain: "web-scraping",
              name: "Add to cart",
              description: "Navigate to the product page and add item to cart",
              input: { url: "https://shop.example.com/product/1" },
              metadata: { complexity: "low", tags: ["e-commerce"], generatedAt: now, generatorVersion: "1.0" },
            },
          ],
          count: 5,
          intensity: "medium",
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.count).toBeGreaterThan(0);
      expect(Array.isArray(body.data.scenarios)).toBe(true);
    });
  });

  describe("POST /api/v1/scenarios/import-traces", () => {
    it("rejects request with missing traces", async () => {
      const res = await request("/api/v1/scenarios/import-traces", json({}));
      expect(res.status).toBe(400);
    });

    it("rejects empty traces array", async () => {
      const res = await request(
        "/api/v1/scenarios/import-traces",
        json({ traces: [], domain: "test" }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects request without domain", async () => {
      const res = await request(
        "/api/v1/scenarios/import-traces",
        json({
          traces: [
            {
              traceId: "t1",
              input: "test",
              output: "result",
              outcome: "success",
              spans: [],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("imports production traces as scenarios", async () => {
      const res = await request(
        "/api/v1/scenarios/import-traces",
        json({
          traces: [
            {
              traceId: "t1",
              input: "Search for product X",
              output: { found: true },
              outcome: "success",
              spans: [
                { name: "search", type: "tool_invocation", startTime: 0, endTime: 10 },
              ],
              timestamp: new Date().toISOString(),
              metadata: { domain: "e-commerce" },
            },
          ],
          domain: "web-scraping",
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.scenarios).toBeDefined();
      expect(body.data.summary).toBeDefined();
    });
  });
});
