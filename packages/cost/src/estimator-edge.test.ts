import { describe, it, expect } from "vitest";
import {
  getPricing,
  estimateCost,
  costFromTraces,
  generateCostRecommendations,
  MODEL_PRICING,
} from "./estimator.js";
import type { TraceSpan } from "@syntharena/shared";

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

describe("estimateCost edge cases", () => {
  it("handles zero scenarios", () => {
    const result = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 0,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 1000,
      avgOutputTokensPerCall: 500,
      avgCallsPerScenario: 1,
    });
    expect(result.estimatedCost).toBe(0);
    expect(result.estimatedInputTokens).toBe(0);
    expect(result.estimatedOutputTokens).toBe(0);
  });

  it("handles zero tokens", () => {
    const result = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 10,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 0,
      avgOutputTokensPerCall: 0,
      avgCallsPerScenario: 1,
    });
    expect(result.estimatedCost).toBe(0);
  });

  it("handles 100% cache hit rate", () => {
    const result = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 10,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 1000,
      avgOutputTokensPerCall: 500,
      avgCallsPerScenario: 1,
      cacheHitRate: 1.0,
    });
    // All input tokens are cached, output tokens still apply
    expect(result.estimatedCost).toBeGreaterThan(0);
    // Cached cost should be cheaper than non-cached
    const nonCached = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 10,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 1000,
      avgOutputTokensPerCall: 500,
      avgCallsPerScenario: 1,
      cacheHitRate: 0,
    });
    expect(result.estimatedCost).toBeLessThan(nonCached.estimatedCost);
  });

  it("handles very large scenario counts", () => {
    const result = estimateCost({
      model: "gemini-2.5-flash",
      scenarioCount: 100_000,
      trialsPerScenario: 10,
      avgInputTokensPerCall: 5000,
      avgOutputTokensPerCall: 2000,
      avgCallsPerScenario: 3,
    });
    expect(result.estimatedCost).toBeGreaterThan(0);
    expect(result.estimatedInputTokens).toBe(100_000 * 10 * 3 * 5000);
  });

  it("computes correct cost for each Anthropic model", () => {
    const anthropicModels = MODEL_PRICING.filter((p) => p.provider === "anthropic");
    for (const model of anthropicModels) {
      const result = estimateCost({
        model: model.model,
        scenarioCount: 1,
        trialsPerScenario: 1,
        avgInputTokensPerCall: 1_000_000,
        avgOutputTokensPerCall: 1_000_000,
        avgCallsPerScenario: 1,
      });
      const expectedCost = model.inputPer1M + model.outputPer1M;
      expect(result.estimatedCost).toBeCloseTo(expectedCost, 2);
    }
  });

  it("throws descriptive error for unknown model with available model list", () => {
    expect(() => estimateCost({
      model: "fake-model",
      scenarioCount: 1,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 100,
      avgOutputTokensPerCall: 50,
      avgCallsPerScenario: 1,
    })).toThrow(/Available:/);
  });

  it("handles Google models without cached pricing (no cachedInputPer1M)", () => {
    const result = estimateCost({
      model: "gemini-2.5-flash",
      scenarioCount: 10,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 1000,
      avgOutputTokensPerCall: 500,
      avgCallsPerScenario: 1,
      cacheHitRate: 0.5,
    });
    // Google models don't have cachedInputPer1M, so cached tokens cost the same as regular
    expect(result.estimatedCost).toBeGreaterThan(0);
  });
});

describe("costFromTraces edge cases", () => {
  it("handles spans with zero tokens", () => {
    const spans = [makeSpan({ attributes: { inputTokens: 0, outputTokens: 0 } })];
    const result = costFromTraces(spans, "claude-sonnet-4-20250514");
    expect(result.estimatedCost).toBe(0);
  });

  it("handles many spans", () => {
    const spans = Array.from({ length: 100 }, (_, i) =>
      makeSpan({
        id: `span-${i}`,
        attributes: { inputTokens: 100, outputTokens: 50 },
      })
    );
    const result = costFromTraces(spans, "claude-sonnet-4-20250514");
    expect(result.estimatedInputTokens).toBe(10_000);
    expect(result.estimatedOutputTokens).toBe(5_000);
  });

  it("only counts llm_call type spans", () => {
    const spans = [
      makeSpan({ type: "llm_call", attributes: { inputTokens: 100, outputTokens: 50 } }),
      makeSpan({ id: "s2", type: "tool_invocation", attributes: { inputTokens: 999, outputTokens: 999 } }),
      makeSpan({ id: "s3", type: "decision", attributes: { inputTokens: 888, outputTokens: 888 } }),
      makeSpan({ id: "s4", type: "state_transition", attributes: { inputTokens: 777, outputTokens: 777 } }),
    ];
    const result = costFromTraces(spans, "claude-sonnet-4-20250514");
    expect(result.estimatedInputTokens).toBe(100);
    expect(result.estimatedOutputTokens).toBe(50);
  });

  it("breakdown percentages sum to 100 for non-zero costs", () => {
    const spans = [makeSpan({ attributes: { inputTokens: 1000, outputTokens: 500 } })];
    const result = costFromTraces(spans, "claude-sonnet-4-20250514");
    const totalPct = result.breakdown.reduce((sum, b) => sum + b.percentage, 0);
    expect(totalPct).toBeCloseTo(100, 0);
  });
});

describe("generateCostRecommendations edge cases", () => {
  it("suggests model routing for OpenAI models", () => {
    const estimate = estimateCost({
      model: "o3",
      scenarioCount: 50,
      trialsPerScenario: 3,
      avgInputTokensPerCall: 2000,
      avgOutputTokensPerCall: 1000,
      avgCallsPerScenario: 3,
    });
    const recs = generateCostRecommendations(estimate);
    const modelRec = recs.find((r) => r.type === "model-routing");
    expect(modelRec).toBeDefined();
    expect(modelRec!.estimatedSavingsPercent).toBeGreaterThan(0);
  });

  it("does not suggest model routing for cheapest model in provider", () => {
    const estimate = estimateCost({
      model: "gemini-2.5-flash",
      scenarioCount: 50,
      trialsPerScenario: 3,
      avgInputTokensPerCall: 2000,
      avgOutputTokensPerCall: 1000,
      avgCallsPerScenario: 3,
    });
    const recs = generateCostRecommendations(estimate);
    const modelRec = recs.find((r) => r.type === "model-routing");
    // Flash is the cheapest Google model, so no routing recommendation
    expect(modelRec).toBeUndefined();
  });

  it("does not suggest caching when input tokens are low", () => {
    const estimate = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 1,
      trialsPerScenario: 1,
      avgInputTokensPerCall: 100,
      avgOutputTokensPerCall: 50,
      avgCallsPerScenario: 1,
    });
    const recs = generateCostRecommendations(estimate);
    const cacheRec = recs.find((r) => r.type === "prompt-caching");
    // Only 100 input tokens total, below 10000 threshold
    expect(cacheRec).toBeUndefined();
  });

  it("savings percentages are between 0 and 100", () => {
    const estimate = estimateCost({
      model: "claude-opus-4-20250514",
      scenarioCount: 100,
      trialsPerScenario: 5,
      avgInputTokensPerCall: 5000,
      avgOutputTokensPerCall: 2000,
      avgCallsPerScenario: 5,
    });
    const recs = generateCostRecommendations(estimate);
    for (const rec of recs) {
      expect(rec.estimatedSavingsPercent).toBeGreaterThan(0);
      expect(rec.estimatedSavingsPercent).toBeLessThanOrEqual(100);
    }
  });
});

describe("getPricing", () => {
  it("returns correct pricing for every model in the list", () => {
    for (const model of MODEL_PRICING) {
      const pricing = getPricing(model.model);
      expect(pricing).toBeDefined();
      expect(pricing!.model).toBe(model.model);
      expect(pricing!.provider).toBe(model.provider);
    }
  });

  it("output is always more expensive than input for all models", () => {
    for (const model of MODEL_PRICING) {
      expect(model.outputPer1M).toBeGreaterThan(model.inputPer1M);
    }
  });

  it("cached input is always cheaper than regular input", () => {
    for (const model of MODEL_PRICING) {
      if (model.cachedInputPer1M !== undefined) {
        expect(model.cachedInputPer1M).toBeLessThan(model.inputPer1M);
      }
    }
  });
});
