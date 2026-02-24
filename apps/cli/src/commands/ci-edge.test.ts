import { describe, it, expect, vi, beforeEach } from "vitest";
import { ciCommand } from "./ci.js";

vi.mock("@syntharena/core", async () => {
  const actual = await vi.importActual<typeof import("@syntharena/core")>("@syntharena/core");
  return {
    ...actual,
    evaluate: vi.fn().mockResolvedValue({
      id: "ci-run",
      name: "ci-eval",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 10,
        totalTrials: 10,
        overallPassRate: 0.9,
        passAtK: 0.85,
        passToTheK: 0.85,
        gPassAtK: 0.85,
        totalCost: 0.01,
        totalDuration: 500,
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    }),
  };
});

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

import { readFileSync, existsSync } from "node:fs";
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  process.exitCode = undefined;
});

describe("ciCommand edge cases", () => {
  it("sets exit code 1 when pass rate below threshold", async () => {
    const { evaluate } = await import("@syntharena/core");
    vi.mocked(evaluate).mockResolvedValueOnce({
      id: "ci-run",
      name: "ci-eval",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 10,
        totalTrials: 10,
        overallPassRate: 0.3,
        passAtK: 0.3,
        passToTheK: 0.3,
        gPassAtK: 0.3,
        totalCost: 0.01,
        totalDuration: 500,
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    } as ReturnType<typeof evaluate> extends Promise<infer T> ? T : never);

    await ciCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      concurrency: "5",
      minPassRate: "0.5",
      output: "table",
    });

    expect(process.exitCode).toBe(1);
  });

  it("enforces max cost gate", async () => {
    const { evaluate } = await import("@syntharena/core");
    vi.mocked(evaluate).mockResolvedValueOnce({
      id: "ci-run",
      name: "ci-eval",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 10,
        totalTrials: 10,
        overallPassRate: 1.0,
        passAtK: 1.0,
        passToTheK: 1.0,
        gPassAtK: 1.0,
        totalCost: 5.0,
        totalDuration: 500,
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    } as ReturnType<typeof evaluate> extends Promise<infer T> ? T : never);

    await ciCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      concurrency: "5",
      maxCost: "1.0",
      output: "table",
    });

    expect(process.exitCode).toBe(1);
    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("max_cost");
    expect(logs).toContain("FAIL");
  });

  it("detects regression from baseline file and sets exit code 2", async () => {
    // Make the baseline file "exist"
    mockedExistsSync.mockReturnValue(true);
    // Return a high-pass-rate baseline
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      id: "baseline",
      name: "baseline-eval",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 10,
        totalTrials: 10,
        overallPassRate: 1.0,
        passAtK: 1.0,
        passToTheK: 1.0,
        gPassAtK: 1.0,
        totalCost: 0.005,
        totalDuration: 250,
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    }));

    // Mock evaluate to return a much worse run (regression)
    const { evaluate } = await import("@syntharena/core");
    vi.mocked(evaluate).mockResolvedValueOnce({
      id: "ci-run",
      name: "ci-eval",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 10,
        totalTrials: 10,
        overallPassRate: 0.3,
        passAtK: 0.3,
        passToTheK: 0.3,
        gPassAtK: 0.3,
        totalCost: 0.05,
        totalDuration: 2000,
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    } as ReturnType<typeof evaluate> extends Promise<infer T> ? T : never);

    await ciCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      concurrency: "5",
      baseline: "baselines/test.json",
      output: "table",
    });

    // Exit code 2 = regression
    expect(process.exitCode).toBe(2);
    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Regression");
  });

  it("handles malformed baseline JSON gracefully", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("{ invalid json }}}");

    await ciCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      concurrency: "5",
      baseline: "baselines/broken.json",
      output: "json",
    });

    // Should not crash, should still produce output
    expect(process.exitCode).toBe(0);
    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("ci-run");
  });

  it("sets exit code 1 for unknown domain", async () => {
    await ciCommand({
      domain: "nonexistent-domain",
      scenarios: "5",
      trials: "1",
      concurrency: "5",
      output: "json",
    });

    expect(process.exitCode).toBe(1);
    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Unknown domain");
  });

  it("passes with both pass rate and cost gates passing", async () => {
    await ciCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      concurrency: "5",
      minPassRate: "0.5",
      maxCost: "10.0",
      output: "table",
    });

    expect(process.exitCode).toBe(0);
  });

  it("JSON output includes all gate results", async () => {
    await ciCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      concurrency: "5",
      minPassRate: "0.5",
      maxCost: "10.0",
      output: "json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    // JSON output includes the structured output
    expect(logs).toContain("min_pass_rate");
    expect(logs).toContain("max_cost");
    expect(logs).toContain('"gates"');
  });
});
