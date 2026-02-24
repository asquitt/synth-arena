import { describe, it, expect } from "vitest";
import {
  createEvaluationSchema,
  compareRunsSchema,
  generateScenariosSchema,
  createApiKeySchema,
  createWebhookSchema,
  generateScorerSchema,
  costEstimateSchema,
} from "./schemas.js";

describe("createEvaluationSchema", () => {
  it("accepts valid minimal input", () => {
    const result = createEvaluationSchema.safeParse({ name: "test", domain: "web-scraping" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenarioCount).toBe(10); // default
      expect(result.data.trials).toBe(1);
      expect(result.data.maxConcurrency).toBe(5);
      expect(result.data.timeout).toBe(300_000);
    }
  });

  it("accepts full input", () => {
    const result = createEvaluationSchema.safeParse({
      name: "full-test",
      domain: "healthcare",
      scenarioCount: 100,
      trials: 5,
      maxConcurrency: 10,
      timeout: 60000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createEvaluationSchema.safeParse({ name: "", domain: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects scenarioCount over 10000", () => {
    const result = createEvaluationSchema.safeParse({ name: "t", domain: "d", scenarioCount: 20000 });
    expect(result.success).toBe(false);
  });

  it("rejects scenarioCount of 0", () => {
    const result = createEvaluationSchema.safeParse({ name: "t", domain: "d", scenarioCount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects trials over 100", () => {
    const result = createEvaluationSchema.safeParse({ name: "t", domain: "d", trials: 200 });
    expect(result.success).toBe(false);
  });

  it("rejects timeout below 1000ms", () => {
    const result = createEvaluationSchema.safeParse({ name: "t", domain: "d", timeout: 100 });
    expect(result.success).toBe(false);
  });
});

describe("compareRunsSchema", () => {
  it("accepts valid baselineId", () => {
    const result = compareRunsSchema.safeParse({ baselineId: "run-123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty baselineId", () => {
    const result = compareRunsSchema.safeParse({ baselineId: "" });
    expect(result.success).toBe(false);
  });
});

describe("generateScenariosSchema", () => {
  it("accepts minimal input with defaults", () => {
    const result = generateScenariosSchema.safeParse({ domain: "web-scraping" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(10);
    }
  });

  it("accepts complexity levels", () => {
    for (const complexity of ["low", "medium", "high", "adversarial"]) {
      const result = generateScenariosSchema.safeParse({ domain: "test", complexity });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid complexity", () => {
    const result = generateScenariosSchema.safeParse({ domain: "test", complexity: "extreme" });
    expect(result.success).toBe(false);
  });
});

describe("createApiKeySchema", () => {
  it("accepts empty object (all optional with defaults)", () => {
    const result = createApiKeySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions).toEqual(["read", "write"]);
      expect(result.data.rateLimitPerMinute).toBe(60);
    }
  });

  it("accepts custom permissions", () => {
    const result = createApiKeySchema.safeParse({ permissions: ["admin"], rateLimitPerMinute: 1000 });
    expect(result.success).toBe(true);
  });

  it("rejects invalid permission value", () => {
    const result = createApiKeySchema.safeParse({ permissions: ["superuser"] });
    expect(result.success).toBe(false);
  });
});

describe("createWebhookSchema", () => {
  it("accepts valid webhook config", () => {
    const result = createWebhookSchema.safeParse({
      url: "https://example.com/webhook",
      events: ["evaluation.completed"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-URL", () => {
    const result = createWebhookSchema.safeParse({ url: "not-a-url", events: ["evaluation.completed"] });
    expect(result.success).toBe(false);
  });

  it("rejects empty events array", () => {
    const result = createWebhookSchema.safeParse({ url: "https://example.com", events: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid event type", () => {
    const result = createWebhookSchema.safeParse({
      url: "https://example.com",
      events: ["evaluation.started"],
    });
    expect(result.success).toBe(false);
  });
});

describe("generateScorerSchema", () => {
  it("accepts valid scorer definition", () => {
    const result = generateScorerSchema.safeParse({
      criteria: "Check if output contains valid JSON",
      name: "json-check",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("deterministic");
      expect(result.data.threshold).toBe(0.7);
    }
  });

  it("accepts llm mode", () => {
    const result = generateScorerSchema.safeParse({
      criteria: "Is the response helpful?",
      name: "helpfulness",
      mode: "llm",
    });
    expect(result.success).toBe(true);
  });

  it("rejects threshold above 1", () => {
    const result = generateScorerSchema.safeParse({
      criteria: "test",
      name: "t",
      threshold: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("costEstimateSchema", () => {
  it("accepts minimal input with defaults", () => {
    const result = costEstimateSchema.safeParse({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trialsPerScenario).toBe(1);
      expect(result.data.avgInputTokensPerCall).toBe(2000);
      expect(result.data.avgOutputTokensPerCall).toBe(500);
      expect(result.data.avgCallsPerScenario).toBe(3);
    }
  });

  it("rejects missing model", () => {
    const result = costEstimateSchema.safeParse({ scenarioCount: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects scenarioCount of 0", () => {
    const result = costEstimateSchema.safeParse({ model: "gpt-4", scenarioCount: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts cacheHitRate between 0 and 1", () => {
    const result = costEstimateSchema.safeParse({
      model: "gpt-4",
      scenarioCount: 50,
      cacheHitRate: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects cacheHitRate above 1", () => {
    const result = costEstimateSchema.safeParse({
      model: "gpt-4",
      scenarioCount: 50,
      cacheHitRate: 1.5,
    });
    expect(result.success).toBe(false);
  });
});
