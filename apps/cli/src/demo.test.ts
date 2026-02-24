import { describe, it, expect } from "vitest";
import { generateDemoScenarios } from "./demo.js";

describe("generateDemoScenarios", () => {
  it("generates the requested number of scenarios", () => {
    const scenarios = generateDemoScenarios("web-scraping", 10);
    expect(scenarios).toHaveLength(10);
  });

  it("assigns sequential IDs", () => {
    const scenarios = generateDemoScenarios("web-scraping", 3);
    expect(scenarios[0]!.id).toBe("web-scraping-1");
    expect(scenarios[1]!.id).toBe("web-scraping-2");
    expect(scenarios[2]!.id).toBe("web-scraping-3");
  });

  it("assigns sequential names", () => {
    const scenarios = generateDemoScenarios("government", 2);
    expect(scenarios[0]!.name).toBe("government-scenario-1");
    expect(scenarios[1]!.name).toBe("government-scenario-2");
  });

  it("generates web-scraping scenarios with expected fields", () => {
    const scenarios = generateDemoScenarios("web-scraping", 5);
    for (const s of scenarios) {
      expect(s.domain).toBe("web-scraping");
      expect(s.input["targetUrl"]).toBeDefined();
      expect(s.input["extractFields"]).toBeDefined();
      expect(s.metadata.tags).toContain("web-scraping");
    }
  });

  it("generates government scenarios", () => {
    const scenarios = generateDemoScenarios("government", 5);
    for (const s of scenarios) {
      expect(s.domain).toBe("government");
      expect(s.input["listingUrl"]).toBeDefined();
      expect(s.input["agency"]).toBeDefined();
      expect(s.metadata.tags).toContain("government");
    }
  });

  it("generates healthcare scenarios", () => {
    const scenarios = generateDemoScenarios("healthcare", 5);
    for (const s of scenarios) {
      expect(s.domain).toBe("healthcare");
      expect(s.input["patientId"]).toBeDefined();
      expect(s.input["insurance"]).toBeDefined();
      expect(s.metadata.tags).toContain("healthcare");
    }
  });

  it("falls back to web-scraping for unknown domain", () => {
    const scenarios = generateDemoScenarios("unknown-domain", 3);
    expect(scenarios).toHaveLength(3);
    // Falls back to web-scraping generator
    for (const s of scenarios) {
      expect(s.input["targetUrl"]).toBeDefined();
    }
  });

  it("generates zero scenarios when count is 0", () => {
    const scenarios = generateDemoScenarios("web-scraping", 0);
    expect(scenarios).toHaveLength(0);
  });

  it("all scenarios have valid metadata", () => {
    const scenarios = generateDemoScenarios("web-scraping", 10);
    for (const s of scenarios) {
      expect(s.metadata.generatedAt).toBeDefined();
      expect(s.metadata.generatorVersion).toBe("0.1.0-demo");
      expect(["low", "medium", "high", "adversarial"]).toContain(s.metadata.complexity);
      expect(s.metadata.tags.length).toBeGreaterThan(0);
    }
  });
});
