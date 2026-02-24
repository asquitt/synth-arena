import { describe, it, expect } from "vitest";
import { validateScenarioQuality } from "./quality.js";
import type { Scenario } from "@syntharena/shared";

function makeScenario(overrides?: Partial<Scenario>): Scenario {
  return {
    id: `s-${Math.random().toString(36).slice(2, 8)}`,
    domain: "web-scraping",
    name: "Test scenario",
    description: "A test scenario for edge case testing",
    input: { url: "https://example.com" },
    expected: { result: "success" },
    metadata: {
      complexity: "low",
      tags: ["test"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0",
    },
    ...overrides,
  };
}

describe("validateScenarioQuality edge cases", () => {
  it("handles empty scenario array", () => {
    const report = validateScenarioQuality([]);
    expect(report.diversityScore).toBeDefined();
    expect(report.complexityDistribution).toBeDefined();
  });

  it("handles single scenario", () => {
    const report = validateScenarioQuality([makeScenario()]);
    expect(report.diversityScore).toBeDefined();
    expect(typeof report.diversityScore).toBe("number");
  });

  it("detects near-duplicate descriptions", () => {
    const scenarios = [
      makeScenario({ id: "a", description: "Navigate to the login page" }),
      makeScenario({ id: "b", description: "Navigate to the login page" }),
    ];
    const report = validateScenarioQuality(scenarios);
    expect(report.duplicates).toBe(1);
    expect(report.issues.some((i) => i.type === "duplicate")).toBe(true);
  });

  it("reports complexity distribution", () => {
    const scenarios = [
      makeScenario({ metadata: { complexity: "low", tags: ["a"], generatedAt: "", generatorVersion: "1" } }),
      makeScenario({ metadata: { complexity: "medium", tags: ["b"], generatedAt: "", generatorVersion: "1" } }),
      makeScenario({ metadata: { complexity: "high", tags: ["c"], generatedAt: "", generatorVersion: "1" } }),
    ];
    const report = validateScenarioQuality(scenarios);
    expect(report.complexityDistribution).toBeDefined();
    expect(report.complexityDistribution.low).toBe(1);
    expect(report.complexityDistribution.medium).toBe(1);
    expect(report.complexityDistribution.high).toBe(1);
  });

  it("handles scenarios with same tags (low diversity)", () => {
    const scenarios = Array.from({ length: 10 }, (_, i) =>
      makeScenario({
        id: `same-${i}`,
        name: `Same scenario ${i}`,
        description: "Identical description",
        input: { url: "https://same-site.com" },
        metadata: { complexity: "low", tags: ["same-tag"], generatedAt: "", generatorVersion: "1" },
      }),
    );
    const report = validateScenarioQuality(scenarios);
    // Low tag diversity should result in a lower diversity score
    expect(report.diversityScore).toBeLessThan(1);
  });

  it("handles scenarios with diverse tags (high diversity)", () => {
    const tags = ["auth", "payment", "search", "navigation", "form", "api", "upload", "export"];
    const scenarios = tags.map((tag, i) =>
      makeScenario({
        id: `diverse-${i}`,
        name: `Scenario for ${tag}`,
        description: `Testing ${tag} functionality`,
        metadata: { complexity: i % 3 === 0 ? "low" : i % 3 === 1 ? "medium" : "high", tags: [tag], generatedAt: "", generatorVersion: "1" },
      }),
    );
    const report = validateScenarioQuality(scenarios);
    expect(report.diversityScore).toBeGreaterThan(0.3);
  });

  it("handles large scenario sets", () => {
    const scenarios = Array.from({ length: 100 }, (_, i) =>
      makeScenario({
        id: `large-${i}`,
        name: `Scenario ${i}`,
        metadata: {
          complexity: ["low", "medium", "high", "adversarial"][i % 4] as Scenario["metadata"]["complexity"],
          tags: [`tag-${i % 10}`],
          generatedAt: "",
          generatorVersion: "1",
        },
      }),
    );
    const report = validateScenarioQuality(scenarios);
    expect(report.diversityScore).toBeDefined();
    expect(report.complexityDistribution.low).toBe(25);
    expect(report.complexityDistribution.medium).toBe(25);
    expect(report.complexityDistribution.high).toBe(25);
  });
});
