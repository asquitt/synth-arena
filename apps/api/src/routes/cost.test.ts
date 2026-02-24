import { describe, it, expect } from "vitest";
import { app } from "../index.js";

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

describe("Cost routes", () => {
  describe("GET /api/v1/cost/models", () => {
    it("returns list of model pricing", async () => {
      const res = await request("/api/v1/cost/models");
      expect(res.status).toBe(200);
      const body = await res.json() as { data: Array<{ model: string; provider: string }> };
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0]).toHaveProperty("model");
      expect(body.data[0]).toHaveProperty("provider");
      expect(body.data[0]).toHaveProperty("inputPer1M");
      expect(body.data[0]).toHaveProperty("outputPer1M");
    });
  });

  describe("POST /api/v1/cost/estimate", () => {
    it("returns cost estimate for valid input", async () => {
      const res = await request("/api/v1/cost/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          scenarioCount: 100,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { estimate: { estimatedCost: number }; recommendations: unknown[] } };
      expect(body.data).toHaveProperty("estimate");
      expect(body.data).toHaveProperty("recommendations");
      expect(body.data.estimate.estimatedCost).toBeGreaterThan(0);
    });

    it("rejects invalid input (missing model)", async () => {
      const res = await request("/api/v1/cost/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioCount: 100 }),
      });
      expect(res.status).toBe(400);
    });

    it("accepts optional fields", async () => {
      const res = await request("/api/v1/cost/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1",
          scenarioCount: 50,
          trialsPerScenario: 3,
          avgInputTokensPerCall: 1000,
          avgOutputTokensPerCall: 250,
          avgCallsPerScenario: 5,
          cacheHitRate: 0.3,
          useBatchApi: true,
        }),
      });
      expect(res.status).toBe(200);
    });
  });
});
