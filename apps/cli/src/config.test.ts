import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "fs";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadConfig", () => {
  it("returns undefined for non-existent file", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(loadConfig("missing.yaml")).toBeUndefined();
  });

  it("loads and parses a full config file", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(`
domain: healthcare
scenarios: 50
trials: 3
concurrency: 10
model: gpt-4.1
scorers:
  - task_completion
  - cost_threshold:
      max: 0.50
cost:
  avg_calls_per_scenario: 5
  cache_hit_rate: 0.3
regression:
  baseline_path: baselines/latest.json
  fail_on_regression: true
output:
  format: json
  save_results: true
  results_dir: ./results
`);

    const config = loadConfig("syntharena.yaml");

    expect(config).toBeDefined();
    expect(config!.domain).toBe("healthcare");
    expect(config!.scenarios).toBe(50);
    expect(config!.trials).toBe(3);
    expect(config!.concurrency).toBe(10);
    expect(config!.model).toBe("gpt-4.1");
    expect(config!.scorers).toHaveLength(2);
    expect(config!.cost.avg_calls_per_scenario).toBe(5);
    expect(config!.cost.cache_hit_rate).toBe(0.3);
    expect(config!.regression.baseline_path).toBe("baselines/latest.json");
    expect(config!.output.format).toBe("json");
  });

  it("provides defaults for missing fields", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("domain: legal\n");

    const config = loadConfig("syntharena.yaml");

    expect(config).toBeDefined();
    expect(config!.domain).toBe("legal");
    expect(config!.scenarios).toBe(10);
    expect(config!.trials).toBe(1);
    expect(config!.concurrency).toBe(5);
    expect(config!.model).toBe("claude-sonnet-4-20250514");
    expect(config!.scorers).toEqual(["task_completion"]);
    expect(config!.cost.avg_calls_per_scenario).toBe(3);
    expect(config!.cost.cache_hit_rate).toBe(0);
    expect(config!.regression.fail_on_regression).toBe(true);
    expect(config!.output.format).toBe("table");
    expect(config!.output.save_results).toBe(false);
  });

  it("handles empty yaml file (returns null from parser)", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("");

    // yaml.parse("") returns null, which causes the function to throw
    // This tests that the function doesn't handle null parsed values
    expect(() => loadConfig("syntharena.yaml")).toThrow();
  });
});
