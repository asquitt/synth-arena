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

describe("loadConfig edge cases", () => {
  it("handles yaml with only domain field", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("domain: energy\n");

    const config = loadConfig("syntharena.yaml");
    expect(config!.domain).toBe("energy");
    expect(config!.scenarios).toBe(10);
    expect(config!.trials).toBe(1);
  });

  it("handles nested cost config with partial fields", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(`
domain: web-scraping
cost:
  cache_hit_rate: 0.8
`);

    const config = loadConfig("syntharena.yaml");
    expect(config!.cost.cache_hit_rate).toBe(0.8);
    expect(config!.cost.avg_calls_per_scenario).toBe(3); // default
  });

  it("handles nested regression config with partial fields", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(`
domain: legal
regression:
  fail_on_regression: false
`);

    const config = loadConfig("syntharena.yaml");
    expect(config!.regression.fail_on_regression).toBe(false);
    expect(config!.regression.baseline_path).toBe(".syntharena/baselines/latest.json");
  });

  it("handles nested output config with partial fields", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(`
domain: web-scraping
output:
  format: csv
`);

    const config = loadConfig("syntharena.yaml");
    expect(config!.output.format).toBe("csv");
    expect(config!.output.save_results).toBe(false);
    expect(config!.output.results_dir).toBe(".syntharena/results");
  });

  it("handles numeric values as numbers not strings", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(`
domain: healthcare
scenarios: 200
trials: 5
concurrency: 20
`);

    const config = loadConfig("syntharena.yaml");
    expect(config!.scenarios).toBe(200);
    expect(config!.trials).toBe(5);
    expect(config!.concurrency).toBe(20);
  });

  it("handles complex scorer configurations", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(`
domain: web-scraping
scorers:
  - task_completion
  - cost_threshold:
      max: 0.25
  - safety_check
`);

    const config = loadConfig("syntharena.yaml");
    expect(config!.scorers).toHaveLength(3);
    expect(config!.scorers[0]).toBe("task_completion");
    expect(typeof config!.scorers[1]).toBe("object");
  });

  it("returns undefined for missing config path", () => {
    mockedExistsSync.mockReturnValue(false);
    const config = loadConfig("nonexistent.yaml");
    expect(config).toBeUndefined();
  });

  it("handles all default values correctly", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("domain: web-scraping\n");

    const config = loadConfig("syntharena.yaml")!;
    expect(config.domain).toBe("web-scraping");
    expect(config.scenarios).toBe(10);
    expect(config.trials).toBe(1);
    expect(config.concurrency).toBe(5);
    expect(config.model).toBe("claude-sonnet-4-20250514");
    expect(config.scorers).toEqual(["task_completion"]);
    expect(config.cost.avg_calls_per_scenario).toBe(3);
    expect(config.cost.cache_hit_rate).toBe(0);
    expect(config.regression.baseline_path).toBe(".syntharena/baselines/latest.json");
    expect(config.regression.fail_on_regression).toBe(true);
    expect(config.output.format).toBe("table");
    expect(config.output.save_results).toBe(false);
    expect(config.output.results_dir).toBe(".syntharena/results");
  });
});
