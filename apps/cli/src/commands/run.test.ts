import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCommand } from "./run.js";

// Mock ora
vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  }),
}));

// Mock config loader to return undefined (no config file)
vi.mock("../config.js", () => ({
  loadConfig: vi.fn().mockReturnValue(undefined),
}));

// Mock evaluate to return a minimal result
vi.mock("@syntharena/core", async () => {
  const actual = await vi.importActual<typeof import("@syntharena/core")>("@syntharena/core");
  return {
    ...actual,
    evaluate: vi.fn().mockResolvedValue({
      id: "test-run",
      name: "test",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 5,
        totalTrials: 5,
        overallPassRate: 0.8,
        passAtK: 0.8,
        passToTheK: 0.8,
        gPassAtK: 0.8,
        totalCost: 0.005,
        totalDuration: 250,
        avgTokensPerScenario: 150,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    }),
  };
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("runCommand", () => {
  it("runs evaluation and displays table results", async () => {
    await runCommand({
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
      concurrency: "5",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("SynthArena Evaluation");
    expect(logs).toContain("web-scraping");
    expect(logs).toContain("Results");
  });

  it("runs evaluation with JSON output", async () => {
    await runCommand({
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
      concurrency: "5",
      output: "json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("test-run");
  });

  it("displays domain and trial count in header", async () => {
    await runCommand({
      domain: "healthcare",
      scenarios: "10",
      trials: "3",
      concurrency: "2",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("healthcare");
    expect(logs).toContain("10");
    expect(logs).toContain("3");
  });
});
