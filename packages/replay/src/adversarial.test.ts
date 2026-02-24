import { describe, it, expect } from "vitest";
import {
  generateAdversarialScenarios,
  type AdversarialConfig,
  type AdversarialCategory,
} from "./adversarial.js";
import type { Scenario, ScenarioMetadata } from "@syntharena/shared";

function makeScenario(overrides?: Partial<Scenario>): Scenario {
  return {
    id: "base-1",
    domain: "web-scraping",
    name: "Test Scenario",
    description: "A test scenario",
    input: { url: "https://example.com", query: "test" },
    expected: { title: "Example", status: 200 },
    metadata: {
      complexity: "medium" as ScenarioMetadata["complexity"],
      tags: ["test"],
      generatedAt: "2026-01-01T00:00:00Z",
      generatorVersion: "1.0",
    },
    ...overrides,
  };
}

describe("generateAdversarialScenarios", () => {
  it("generates the requested number of scenarios", () => {
    const config: AdversarialConfig = {
      baseScenarios: [makeScenario()],
      categories: ["input-perturbation"],
      intensityLevel: "low",
      count: 4,
    };

    const results = generateAdversarialScenarios(config);

    expect(results).toHaveLength(4);
  });

  it("distributes scenarios across categories", () => {
    const config: AdversarialConfig = {
      baseScenarios: [makeScenario()],
      categories: ["input-perturbation", "prompt-injection", "tool-misuse"],
      intensityLevel: "medium",
      count: 6,
    };

    const results = generateAdversarialScenarios(config);

    expect(results).toHaveLength(6);
    // Each category should have ~2 scenarios
    const perturbation = results.filter((r) => r.metadata.tags.includes("input-perturbation"));
    const injection = results.filter((r) => r.metadata.tags.includes("prompt-injection"));
    const toolMisuse = results.filter((r) => r.metadata.tags.includes("tool-misuse"));

    expect(perturbation.length).toBeGreaterThanOrEqual(1);
    expect(injection.length).toBeGreaterThanOrEqual(1);
    expect(toolMisuse.length).toBeGreaterThanOrEqual(1);
  });

  it("all generated scenarios have adversarial complexity", () => {
    const config: AdversarialConfig = {
      baseScenarios: [makeScenario()],
      categories: ["input-perturbation", "prompt-injection"],
      intensityLevel: "low",
      count: 4,
    };

    const results = generateAdversarialScenarios(config);

    for (const r of results) {
      expect(r.metadata.complexity).toBe("adversarial");
      expect(r.metadata.tags).toContain("adversarial");
    }
  });

  it("generates unique IDs for each scenario", () => {
    const config: AdversarialConfig = {
      baseScenarios: [makeScenario()],
      categories: ["input-perturbation"],
      intensityLevel: "low",
      count: 10,
    };

    const results = generateAdversarialScenarios(config);
    const ids = results.map((r) => r.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("preserves base scenario metadata tags", () => {
    const base = makeScenario({
      metadata: {
        complexity: "medium",
        tags: ["web-scraping", "e-commerce"],
        generatedAt: "2026-01-01T00:00:00Z",
        generatorVersion: "1.0",
      },
    });

    const config: AdversarialConfig = {
      baseScenarios: [base],
      categories: ["prompt-injection"],
      intensityLevel: "low",
      count: 1,
    };

    const results = generateAdversarialScenarios(config);

    expect(results[0]!.metadata.tags).toContain("web-scraping");
    expect(results[0]!.metadata.tags).toContain("e-commerce");
    expect(results[0]!.metadata.tags).toContain("adversarial");
    expect(results[0]!.metadata.tags).toContain("prompt-injection");
  });

  it("cycles through base scenarios", () => {
    const bases = [
      makeScenario({ id: "base-a", name: "Scenario A" }),
      makeScenario({ id: "base-b", name: "Scenario B" }),
    ];

    const config: AdversarialConfig = {
      baseScenarios: bases,
      categories: ["state-confusion"],
      intensityLevel: "low",
      count: 4,
    };

    const results = generateAdversarialScenarios(config);

    // Should alternate between base scenarios
    expect(results).toHaveLength(4);
  });

  describe("input-perturbation", () => {
    it("generates perturbation variants", () => {
      const config: AdversarialConfig = {
        baseScenarios: [makeScenario()],
        categories: ["input-perturbation"],
        intensityLevel: "low",
        count: 4,
      };

      const results = generateAdversarialScenarios(config);

      for (const r of results) {
        expect(r.name).toContain("[ADV] Input perturbation");
        expect(r.id).toMatch(/^adv-input-/);
      }
    });

    it("applies unicode perturbation", () => {
      const base = makeScenario({ input: { query: "apple" } });
      const config: AdversarialConfig = {
        baseScenarios: [base],
        categories: ["input-perturbation"],
        intensityLevel: "low",
        count: 1,
      };

      const results = generateAdversarialScenarios(config);
      // First perturbation (index 0) is unicode
      expect(results[0]!.input["query"]).not.toBe("apple");
    });

    it("applies empty perturbation", () => {
      const base = makeScenario({ input: { query: "test", url: "http://example.com" } });
      const config: AdversarialConfig = {
        baseScenarios: [base],
        categories: ["input-perturbation"],
        intensityLevel: "low",
        count: 4,
      };

      const results = generateAdversarialScenarios(config);
      // Second perturbation (index 1) is empty
      const emptyResult = results[1];
      expect(Object.keys(emptyResult!.input)).toHaveLength(0);
    });
  });

  describe("prompt-injection", () => {
    it("injects into string fields", () => {
      const base = makeScenario({ input: { query: "safe input" } });
      const config: AdversarialConfig = {
        baseScenarios: [base],
        categories: ["prompt-injection"],
        intensityLevel: "medium",
        count: 1,
      };

      const results = generateAdversarialScenarios(config);

      expect(results[0]!.id).toMatch(/^adv-inject-/);
      expect(results[0]!.name).toContain("[ADV] Prompt injection");
      expect(results[0]!.expected?.["injectionDetected"]).toBe(true);
      expect(results[0]!.expected?.["injectionBlocked"]).toBe(true);
    });

    it("adds _injected field when no string fields exist", () => {
      const base = makeScenario({ input: { count: 42, flag: true } });
      const config: AdversarialConfig = {
        baseScenarios: [base],
        categories: ["prompt-injection"],
        intensityLevel: "low",
        count: 1,
      };

      const results = generateAdversarialScenarios(config);

      expect(results[0]!.input["_injected"]).toBeDefined();
      expect(typeof results[0]!.input["_injected"]).toBe("string");
    });
  });

  describe("tool-misuse", () => {
    it("adds adversarial tool hints", () => {
      const config: AdversarialConfig = {
        baseScenarios: [makeScenario()],
        categories: ["tool-misuse"],
        intensityLevel: "low",
        count: 4,
      };

      const results = generateAdversarialScenarios(config);

      for (const r of results) {
        expect(r.id).toMatch(/^adv-tool-/);
        expect(r.name).toContain("[ADV] Tool misuse");
        expect(r.input["_adversarialToolHint"]).toBeDefined();
        expect(r.expected?.["toolMisuseBlocked"]).toBe(true);
      }
    });
  });

  describe("state-confusion", () => {
    it("adds contradictory information", () => {
      const config: AdversarialConfig = {
        baseScenarios: [makeScenario()],
        categories: ["state-confusion"],
        intensityLevel: "low",
        count: 1,
      };

      const results = generateAdversarialScenarios(config);

      expect(results[0]!.id).toMatch(/^adv-state-/);
      expect(results[0]!.input["_contradictory"]).toBeDefined();
    });
  });

  describe("resource-exhaustion", () => {
    it("adds resource trap with intensity-based multiplier", () => {
      const configLow: AdversarialConfig = {
        baseScenarios: [makeScenario()],
        categories: ["resource-exhaustion"],
        intensityLevel: "low",
        count: 1,
      };

      const configHigh: AdversarialConfig = {
        ...configLow,
        intensityLevel: "high",
      };

      const lowResults = generateAdversarialScenarios(configLow);
      const highResults = generateAdversarialScenarios(configHigh);

      const lowTrap = lowResults[0]!.input["_resourceTrap"] as Record<string, unknown>;
      const highTrap = highResults[0]!.input["_resourceTrap"] as Record<string, unknown>;

      expect(lowTrap["paginationPages"]).toBe(10);
      expect(highTrap["paginationPages"]).toBe(1000);
      expect(lowResults[0]!.expected?.["resourceLimitRespected"]).toBe(true);
    });
  });

  describe("data-exfiltration", () => {
    it("embeds bait data", () => {
      const config: AdversarialConfig = {
        baseScenarios: [makeScenario()],
        categories: ["data-exfiltration"],
        intensityLevel: "low",
        count: 4,
      };

      const results = generateAdversarialScenarios(config);

      for (const r of results) {
        expect(r.id).toMatch(/^adv-exfil-/);
        expect(r.input["_baitContent"]).toBeDefined();
        expect(typeof r.input["_baitContent"]).toBe("string");
        expect(r.expected?.["baitDataNotLeaked"]).toBe(true);
        expect(r.expected?.["baitType"]).toBeDefined();
      }
    });
  });

  describe("multi-turn-manipulation", () => {
    it("adds conversation script with escalation", () => {
      const config: AdversarialConfig = {
        baseScenarios: [makeScenario()],
        categories: ["multi-turn-manipulation"],
        intensityLevel: "low",
        count: 1,
      };

      const results = generateAdversarialScenarios(config);

      expect(results[0]!.id).toMatch(/^adv-multiturn-/);
      const script = results[0]!.input["_conversationScript"] as Array<Record<string, unknown>>;
      expect(script).toHaveLength(4);
      expect(script[0]!["intent"]).toBe("build-trust");
      expect(script[3]!["intent"]).toBe("pressure");
      expect(results[0]!.expected?.["escalationResisted"]).toBe(true);
    });
  });

  it("handles all 7 categories together", () => {
    const allCategories: AdversarialCategory[] = [
      "input-perturbation",
      "prompt-injection",
      "tool-misuse",
      "state-confusion",
      "resource-exhaustion",
      "data-exfiltration",
      "multi-turn-manipulation",
    ];

    const config: AdversarialConfig = {
      baseScenarios: [makeScenario()],
      categories: allCategories,
      intensityLevel: "medium",
      count: 14,
    };

    const results = generateAdversarialScenarios(config);

    expect(results).toHaveLength(14);
    // Each of 7 categories should have 2 scenarios
    for (const cat of allCategories) {
      const matching = results.filter((r) => r.metadata.tags.includes(cat));
      expect(matching.length, `${cat} count`).toBeGreaterThanOrEqual(1);
    }
  });

  it("respects count limit across categories", () => {
    const config: AdversarialConfig = {
      baseScenarios: [makeScenario()],
      categories: ["input-perturbation", "prompt-injection", "tool-misuse"],
      intensityLevel: "low",
      count: 5,
    };

    const results = generateAdversarialScenarios(config);

    expect(results).toHaveLength(5);
  });
});
