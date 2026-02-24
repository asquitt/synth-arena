import { describe, it, expect } from "vitest";
import {
  getPricing,
  estimateCost,
  costFromTraces,
  generateCostRecommendations,
  MODEL_PRICING,
  type EstimateConfig,
} from "./estimator.js";
import type { TraceSpan } from "@syntharena/shared";

describe("getPricing", () => {
  it("returns pricing for known models", () => {
    const pricing = getPricing("claude-sonnet-4-20250514");
    expect(pricing).toBeDefined();
    expect(pricing!.provider).toBe("anthropic");
    expect(pricing!.inputPer1M).toBe(3.0);
    expect(pricing!.outputPer1M).toBe(15.0);
  });

  it("returns undefined for unknown model", () => {
    expect(getPricing("nonexistent-model")).toBeUndefined();
  });

  it("has pricing for all major providers", () => {
    const providers = new Set(MODEL_PRICING.map((p) => p.provider));
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("google")).toBe(true);
  });

  it("all pricing values are positive", () => {
    for (const p of MODEL_PRICING) {
      expect(p.inputPer1M, `${p.model} inputPer1M`).toBeGreaterThan(0);
      expect(p.outputPer1M, `${p.model} outputPer1M`).toBeGreaterThan(0);
    }
  });
});

describe("estimateCost", () => {
  const baseConfig: EstimateConfig = {
    model: "claude-sonnet-4-20250514",
    scenarioCount: 100,
    trialsPerScenario: 3,
    avgInputTokensPerCall: 1000,
    avgOutputTokensPerCall: 500,
    avgCallsPerScenario: 2,
  };

  it("calculates cost for basic scenario", () => {
    const estimate = estimateCost(baseConfig);

    expect(estimate.scenarioCount).toBe(100);
    expect(estimate.trialsPerScenario).toBe(3);
    expect(estimate.model).toBe("claude-sonnet-4-20250514");
    expect(estimate.provider).toBe("anthropic");
    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(estimate.estimatedInputTokens).toBe(600_000); // 100*3*2*1000
    expect(estimate.estimatedOutputTokens).toBe(300_000); // 100*3*2*500
  });

  it("calculates correct cost arithmetic", () => {
    const estimate = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 1,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 1_000_000,
      avgOutputTokensPerCall: 1_000_000,
      avgCallsPerScenario: 1,
    });

    // Sonnet: $3/1M input + $15/1M output = $18
    expect(estimate.estimatedCost).toBeCloseTo(18.0);
  });

  it("throws for unknown model", () => {
    expect(() => estimateCost({ ...baseConfig, model: "nonexistent" })).toThrow("Unknown model");
  });

  it("includes breakdown items", () => {
    const estimate = estimateCost(baseConfig);

    expect(estimate.breakdown.length).toBeGreaterThanOrEqual(2);
    expect(estimate.breakdown.some((b) => b.category.includes("Input"))).toBe(true);
    expect(estimate.breakdown.some((b) => b.category.includes("Output"))).toBe(true);
  });

  it("percentages sum to ~100", () => {
    const estimate = estimateCost(baseConfig);
    const totalPct = estimate.breakdown.reduce((sum, b) => sum + b.percentage, 0);
    expect(totalPct).toBeCloseTo(100, 0);
  });

  it("applies cache hit rate", () => {
    const withCache = estimateCost({ ...baseConfig, cacheHitRate: 0.5 });
    const withoutCache = estimateCost({ ...baseConfig, cacheHitRate: 0 });

    expect(withCache.estimatedCost).toBeLessThan(withoutCache.estimatedCost);
    expect(withCache.breakdown.some((b) => b.category === "Input tokens (cached)")).toBe(true);
  });

  it("no cached breakdown item when cacheHitRate is 0", () => {
    const estimate = estimateCost({ ...baseConfig, cacheHitRate: 0 });
    expect(estimate.breakdown.some((b) => b.category === "Input tokens (cached)")).toBe(false);
  });

  it("works with OpenAI models", () => {
    const estimate = estimateCost({ ...baseConfig, model: "gpt-4.1" });
    expect(estimate.provider).toBe("openai");
    expect(estimate.estimatedCost).toBeGreaterThan(0);
  });

  it("works with Google models", () => {
    const estimate = estimateCost({ ...baseConfig, model: "gemini-2.5-flash" });
    expect(estimate.provider).toBe("google");
    expect(estimate.estimatedCost).toBeGreaterThan(0);
  });
});

describe("costFromTraces", () => {
  function makeSpan(overrides?: Partial<TraceSpan>): TraceSpan {
    return {
      id: "span-1",
      name: "test",
      type: "llm_call",
      startTime: 1000,
      endTime: 2000,
      attributes: { inputTokens: 500, outputTokens: 200 },
      events: [],
      status: "ok",
      ...overrides,
    };
  }

  it("calculates cost from LLM call spans", () => {
    const spans = [
      makeSpan({ attributes: { inputTokens: 1000, outputTokens: 500 } }),
      makeSpan({ id: "span-2", attributes: { inputTokens: 2000, outputTokens: 800 } }),
    ];

    const result = costFromTraces(spans, "claude-sonnet-4-20250514");

    expect(result.estimatedInputTokens).toBe(3000);
    expect(result.estimatedOutputTokens).toBe(1300);
    expect(result.estimatedCost).toBeGreaterThan(0);
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("ignores non-LLM spans", () => {
    const spans = [
      makeSpan({ type: "tool_invocation", attributes: { inputTokens: 1000, outputTokens: 500 } }),
      makeSpan({ type: "llm_call", attributes: { inputTokens: 100, outputTokens: 50 } }),
    ];

    const result = costFromTraces(spans, "claude-sonnet-4-20250514");
    expect(result.estimatedInputTokens).toBe(100);
    expect(result.estimatedOutputTokens).toBe(50);
  });

  it("throws for unknown model", () => {
    expect(() => costFromTraces([], "nonexistent")).toThrow("Unknown model");
  });

  it("handles empty spans", () => {
    const result = costFromTraces([], "claude-sonnet-4-20250514");
    expect(result.estimatedCost).toBe(0);
    expect(result.estimatedInputTokens).toBe(0);
  });

  it("handles spans with missing token attributes", () => {
    const spans = [makeSpan({ attributes: {} })];
    const result = costFromTraces(spans, "claude-sonnet-4-20250514");
    expect(result.estimatedInputTokens).toBe(0);
  });
});

describe("generateCostRecommendations", () => {
  it("suggests cheaper model for expensive estimates", () => {
    const estimate = estimateCost({
      model: "claude-opus-4-20250514",
      scenarioCount: 100,
      trialsPerScenario: 3,
      avgInputTokensPerCall: 2000,
      avgOutputTokensPerCall: 1000,
      avgCallsPerScenario: 5,
    });

    const recs = generateCostRecommendations(estimate);
    const modelRec = recs.find((r) => r.type === "model-routing");

    expect(modelRec).toBeDefined();
    expect(modelRec!.estimatedSavings).toBeGreaterThan(0);
  });

  it("suggests prompt caching when input tokens are high", () => {
    const estimate = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 100,
      trialsPerScenario: 3,
      avgInputTokensPerCall: 5000,
      avgOutputTokensPerCall: 1000,
      avgCallsPerScenario: 3,
    });

    const recs = generateCostRecommendations(estimate);
    const cacheRec = recs.find((r) => r.type === "prompt-caching");

    expect(cacheRec).toBeDefined();
    expect(cacheRec!.description).toContain("caching");
  });

  it("returns empty for unknown model", () => {
    const fakeEstimate = {
      scenarioCount: 1,
      trialsPerScenario: 1,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      estimatedCost: 1.0,
      model: "nonexistent",
      provider: "unknown",
      breakdown: [],
    };

    const recs = generateCostRecommendations(fakeEstimate);
    expect(recs).toHaveLength(0);
  });
});
