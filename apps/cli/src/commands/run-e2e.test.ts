import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateDemoScenarios } from "../demo.js";
import { loadConfig } from "../config.js";

/**
 * CLI E2E tests — verifies demo scenario generation, config loading,
 * and scorer building logic used by the run command.
 */

describe("generateDemoScenarios", () => {
  it("generates correct number of web-scraping scenarios", () => {
    const scenarios = generateDemoScenarios("web-scraping", 5);
    expect(scenarios).toHaveLength(5);
    scenarios.forEach((s, i) => {
      expect(s.id).toBe(`web-scraping-${i + 1}`);
      expect(s.domain).toBe("web-scraping");
      expect(s.input.targetUrl).toMatch(/^https:\/\/mock-/);
      expect(s.input.extractFields).toBeInstanceOf(Array);
      expect(s.metadata.generatorVersion).toBe("0.1.0-demo");
    });
  });

  it("generates government scenarios", () => {
    const scenarios = generateDemoScenarios("government", 3);
    expect(scenarios).toHaveLength(3);
    scenarios.forEach((s) => {
      expect(s.domain).toBe("government");
      expect(s.input.solicationType).toBeDefined();
      expect(s.input.agency).toBeDefined();
      expect(s.input.naicsCode).toBe("541511");
    });
  });

  it("generates healthcare scenarios", () => {
    const scenarios = generateDemoScenarios("healthcare", 3);
    expect(scenarios).toHaveLength(3);
    scenarios.forEach((s) => {
      expect(s.domain).toBe("healthcare");
      expect(s.input.patientId).toMatch(/^PAT-/);
      expect(s.input.insurance).toBeDefined();
    });
  });

  it("falls back to web-scraping for unknown domains", () => {
    const scenarios = generateDemoScenarios("unknown-domain", 2);
    expect(scenarios).toHaveLength(2);
    // Falls back to web-scraping generator
    scenarios.forEach((s) => {
      expect(s.input.targetUrl).toBeDefined();
    });
  });

  it("generates zero scenarios when count is 0", () => {
    const scenarios = generateDemoScenarios("web-scraping", 0);
    expect(scenarios).toHaveLength(0);
  });

  it("assigns sequential IDs with domain prefix", () => {
    const scenarios = generateDemoScenarios("government", 3);
    expect(scenarios[0].id).toBe("government-1");
    expect(scenarios[1].id).toBe("government-2");
    expect(scenarios[2].id).toBe("government-3");
  });

  it("includes expected output for all scenario types", () => {
    for (const domain of ["web-scraping", "government", "healthcare"]) {
      const scenarios = generateDemoScenarios(domain, 1);
      expect(scenarios[0].expected).toBeDefined();
    }
  });

  it("generates valid metadata", () => {
    const scenarios = generateDemoScenarios("web-scraping", 1);
    const meta = scenarios[0].metadata;
    expect(["low", "medium", "high", "adversarial"]).toContain(meta.complexity);
    expect(meta.tags).toBeInstanceOf(Array);
    expect(meta.tags.length).toBeGreaterThan(0);
    expect(meta.generatedAt).toBeDefined();
    expect(new Date(meta.generatedAt).getTime()).not.toBeNaN();
  });
});

describe("loadConfig", () => {
  it("returns undefined for non-existent config file", () => {
    const config = loadConfig("/tmp/nonexistent-syntharena.yaml");
    expect(config).toBeUndefined();
  });

  it("returns config with defaults for minimal yaml", async () => {
    const { writeFileSync, unlinkSync } = await import("fs");
    const tmpPath = `/tmp/test-syntharena-${Date.now()}.yaml`;
    writeFileSync(tmpPath, "domain: healthcare\n");
    try {
      const config = loadConfig(tmpPath);
      expect(config).toBeDefined();
      expect(config!.domain).toBe("healthcare");
      expect(config!.scenarios).toBe(10); // default
      expect(config!.trials).toBe(1); // default
      expect(config!.concurrency).toBe(5); // default
      expect(config!.scorers).toEqual(["task_completion"]); // default
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("parses full config correctly", async () => {
    const { writeFileSync, unlinkSync } = await import("fs");
    const tmpPath = `/tmp/test-syntharena-full-${Date.now()}.yaml`;
    const yaml = `
domain: government
scenarios: 50
trials: 3
concurrency: 10
model: gpt-4.1
scorers:
  - task_completion
  - cost_threshold:
      max: 0.50
output:
  format: json
  save_results: true
  results_dir: ./results
`;
    writeFileSync(tmpPath, yaml);
    try {
      const config = loadConfig(tmpPath);
      expect(config!.domain).toBe("government");
      expect(config!.scenarios).toBe(50);
      expect(config!.trials).toBe(3);
      expect(config!.concurrency).toBe(10);
      expect(config!.model).toBe("gpt-4.1");
      expect(config!.output.format).toBe("json");
      expect(config!.output.save_results).toBe(true);
    } finally {
      unlinkSync(tmpPath);
    }
  });
});
