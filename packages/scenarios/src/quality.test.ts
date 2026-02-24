import { describe, it, expect } from "vitest";
import { validateScenarioQuality, formatQualityReport } from "./quality.js";
import type { Scenario } from "@syntharena/shared";

function makeScenario(overrides?: Partial<Scenario>): Scenario {
  return {
    id: "test-1",
    domain: "test",
    name: "Test scenario",
    description: "A test scenario for validation",
    input: { query: "test" },
    expected: { success: true },
    metadata: {
      complexity: "low",
      tags: ["test"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0",
    },
    ...overrides,
  };
}

describe("validateScenarioQuality", () => {
  it("returns clean report for valid scenarios", () => {
    const scenarios = [
      makeScenario({ id: "s-1", description: "First scenario" }),
      makeScenario({ id: "s-2", description: "Second scenario", metadata: { complexity: "high", tags: ["test", "edge"], generatedAt: "", generatorVersion: "" } }),
    ];

    const report = validateScenarioQuality(scenarios);

    expect(report.total).toBe(2);
    expect(report.duplicates).toBe(0);
    expect(report.issues.filter((i) => i.type !== "no_expected")).toHaveLength(0);
  });

  it("detects missing id", () => {
    const scenarios = [makeScenario({ id: "" })];
    const report = validateScenarioQuality(scenarios);

    expect(report.issues.some((i) => i.type === "missing_field" && i.message === "Missing id")).toBe(true);
  });

  it("detects missing description", () => {
    const scenarios = [makeScenario({ id: "s-1", description: "" })];
    const report = validateScenarioQuality(scenarios);

    expect(report.issues.some((i) => i.type === "missing_field" && i.message === "Missing description")).toBe(true);
  });

  it("detects empty input", () => {
    const scenarios = [makeScenario({ id: "s-1", input: {} })];
    const report = validateScenarioQuality(scenarios);

    expect(report.issues.some((i) => i.type === "empty_input")).toBe(true);
  });

  it("detects missing expected output", () => {
    const scenarios = [makeScenario({ id: "s-1", expected: undefined })];
    const report = validateScenarioQuality(scenarios);

    expect(report.issues.some((i) => i.type === "no_expected")).toBe(true);
  });

  it("detects invalid complexity", () => {
    const scenarios = [
      makeScenario({
        id: "s-1",
        metadata: { complexity: "extreme" as "low", tags: ["test"], generatedAt: "", generatorVersion: "" },
      }),
    ];
    const report = validateScenarioQuality(scenarios);

    expect(report.issues.some((i) => i.type === "invalid_complexity")).toBe(true);
  });

  it("detects duplicate descriptions", () => {
    const scenarios = [
      makeScenario({ id: "s-1", description: "Same description here" }),
      makeScenario({ id: "s-2", description: "Same description here" }),
    ];
    const report = validateScenarioQuality(scenarios);

    expect(report.duplicates).toBe(1);
    expect(report.issues.some((i) => i.type === "duplicate")).toBe(true);
  });

  it("detects duplicates with whitespace normalization", () => {
    const scenarios = [
      makeScenario({ id: "s-1", description: "Same  description   here" }),
      makeScenario({ id: "s-2", description: "same description here" }),
    ];
    const report = validateScenarioQuality(scenarios);

    expect(report.duplicates).toBe(1);
  });

  it("tracks complexity distribution", () => {
    const scenarios = [
      makeScenario({ id: "s-1", metadata: { complexity: "low", tags: ["a"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-2", description: "Diff", metadata: { complexity: "high", tags: ["b"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-3", description: "Another", metadata: { complexity: "low", tags: ["c"], generatedAt: "", generatorVersion: "" } }),
    ];
    const report = validateScenarioQuality(scenarios);

    expect(report.complexityDistribution["low"]).toBe(2);
    expect(report.complexityDistribution["high"]).toBe(1);
  });

  it("tracks tag coverage", () => {
    const scenarios = [
      makeScenario({ id: "s-1", metadata: { complexity: "low", tags: ["auth", "api"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-2", description: "Diff", metadata: { complexity: "low", tags: ["api", "crud"], generatedAt: "", generatorVersion: "" } }),
    ];
    const report = validateScenarioQuality(scenarios);

    expect(report.tagCoverage["auth"]).toBe(1);
    expect(report.tagCoverage["api"]).toBe(2);
    expect(report.tagCoverage["crud"]).toBe(1);
  });

  it("computes diversity score of 0 for empty array", () => {
    const report = validateScenarioQuality([]);

    expect(report.total).toBe(0);
    expect(report.diversityScore).toBe(0);
  });

  it("computes higher diversity for more evenly distributed scenarios", () => {
    const uniform = [
      makeScenario({ id: "s-1", description: "D1", metadata: { complexity: "low", tags: ["a"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-2", description: "D2", metadata: { complexity: "medium", tags: ["b"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-3", description: "D3", metadata: { complexity: "high", tags: ["c"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-4", description: "D4", metadata: { complexity: "adversarial", tags: ["d"], generatedAt: "", generatorVersion: "" } }),
    ];

    const skewed = [
      makeScenario({ id: "s-1", description: "D1", metadata: { complexity: "low", tags: ["a"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-2", description: "D2", metadata: { complexity: "low", tags: ["a"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-3", description: "D3", metadata: { complexity: "low", tags: ["a"], generatedAt: "", generatorVersion: "" } }),
      makeScenario({ id: "s-4", description: "D4", metadata: { complexity: "low", tags: ["a"], generatedAt: "", generatorVersion: "" } }),
    ];

    const uniformReport = validateScenarioQuality(uniform);
    const skewedReport = validateScenarioQuality(skewed);

    expect(uniformReport.diversityScore).toBeGreaterThan(skewedReport.diversityScore);
  });

  it("handles single scenario correctly", () => {
    const report = validateScenarioQuality([makeScenario()]);

    expect(report.total).toBe(1);
    expect(report.duplicates).toBe(0);
    expect(report.diversityScore).toBe(0); // Single item = 0 entropy
  });
});

describe("formatQualityReport", () => {
  it("formats a clean report", () => {
    const report = validateScenarioQuality([
      makeScenario({ id: "s-1", description: "D1" }),
      makeScenario({ id: "s-2", description: "D2" }),
    ]);

    const formatted = formatQualityReport(report);

    expect(formatted).toContain("Scenario Quality Report");
    expect(formatted).toContain("Total:      2");
    expect(formatted).toContain("Duplicates: 0");
    expect(formatted).toContain("Complexity Distribution:");
  });

  it("includes issues in output", () => {
    const report = validateScenarioQuality([
      makeScenario({ id: "", description: "" }),
    ]);

    const formatted = formatQualityReport(report);

    expect(formatted).toContain("Issues (");
    expect(formatted).toContain("[missing_field]");
  });

  it("truncates issues at 10 and shows remainder count", () => {
    // Create scenarios that generate many issues
    const scenarios = Array.from({ length: 15 }, (_, i) =>
      makeScenario({ id: "", description: "", input: {}, expected: undefined }),
    );

    const report = validateScenarioQuality(scenarios);
    const formatted = formatQualityReport(report);

    if (report.issues.length > 10) {
      expect(formatted).toContain("... and");
      expect(formatted).toContain("more");
    }
  });
});
