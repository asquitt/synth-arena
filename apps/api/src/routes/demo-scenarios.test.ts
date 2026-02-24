import { describe, it, expect } from "vitest";
import { generateDemoScenarios } from "./demo-scenarios.js";

describe("generateDemoScenarios", () => {
  it("generates the requested number of scenarios", () => {
    const scenarios = generateDemoScenarios("web-scraping", 5);
    expect(scenarios).toHaveLength(5);
  });

  it("assigns sequential IDs based on domain", () => {
    const scenarios = generateDemoScenarios("healthcare", 3);
    expect(scenarios[0]!.id).toBe("healthcare-1");
    expect(scenarios[1]!.id).toBe("healthcare-2");
    expect(scenarios[2]!.id).toBe("healthcare-3");
  });

  it("sets domain correctly on all scenarios", () => {
    const scenarios = generateDemoScenarios("government", 3);
    for (const s of scenarios) {
      expect(s.domain).toBe("government");
    }
  });

  it("generates valid web-scraping scenarios", () => {
    const scenarios = generateDemoScenarios("web-scraping", 10);
    for (const s of scenarios) {
      expect(s.input).toHaveProperty("targetUrl");
      expect(s.input).toHaveProperty("extractFields");
      expect(s.metadata.complexity).toBeDefined();
      expect(s.metadata.tags).toContain("web-scraping");
    }
  });

  it("generates valid government scenarios", () => {
    const scenarios = generateDemoScenarios("government", 5);
    for (const s of scenarios) {
      expect(s.input).toHaveProperty("solicitationType");
      expect(s.input).toHaveProperty("agency");
      expect(s.metadata.tags).toContain("government");
    }
  });

  it("generates valid healthcare scenarios", () => {
    const scenarios = generateDemoScenarios("healthcare", 5);
    for (const s of scenarios) {
      expect(s.input).toHaveProperty("patientId");
      expect(s.input).toHaveProperty("insurance");
      expect(s.metadata.tags).toContain("healthcare");
    }
  });

  it("generates valid legal scenarios", () => {
    const scenarios = generateDemoScenarios("legal", 5);
    for (const s of scenarios) {
      expect(s.input).toHaveProperty("visaCategory");
      expect(s.input).toHaveProperty("action");
      expect(s.metadata.tags).toContain("legal");
    }
  });

  it("generates valid energy scenarios", () => {
    const scenarios = generateDemoScenarios("energy", 5);
    for (const s of scenarios) {
      expect(s.input).toHaveProperty("region");
      expect(s.input).toHaveProperty("task");
      expect(s.metadata.tags).toContain("energy");
    }
  });

  it("falls back to web-scraping for unknown domains", () => {
    const scenarios = generateDemoScenarios("unknown-domain", 2);
    expect(scenarios).toHaveLength(2);
    // Falls back to web-scraping generator but with the given domain ID prefix
    expect(scenarios[0]!.id).toBe("unknown-domain-1");
  });

  it("handles count of 0", () => {
    const scenarios = generateDemoScenarios("web-scraping", 0);
    expect(scenarios).toHaveLength(0);
  });

  it("all scenarios have valid metadata structure", () => {
    const domains = ["web-scraping", "government", "healthcare", "legal", "energy"];
    for (const domain of domains) {
      const scenarios = generateDemoScenarios(domain, 3);
      for (const s of scenarios) {
        expect(s.metadata).toHaveProperty("complexity");
        expect(s.metadata).toHaveProperty("tags");
        expect(s.metadata).toHaveProperty("generatedAt");
        expect(s.metadata).toHaveProperty("generatorVersion");
        expect(["low", "medium", "high", "adversarial"]).toContain(s.metadata.complexity);
      }
    }
  });
});
