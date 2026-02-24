import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  }),
}));

vi.mock("@syntharena/core", async () => {
  const actual = await vi.importActual<typeof import("@syntharena/core")>("@syntharena/core");
  return {
    ...actual,
    evaluate: vi.fn().mockResolvedValue({
      id: "replay-run",
      name: "replay-eval",
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
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    }),
  };
});

vi.mock("@syntharena/replay", async () => {
  const actual = await vi.importActual<typeof import("@syntharena/replay")>("@syntharena/replay");
  return {
    ...actual,
    loadBaseline: vi.fn().mockReturnValue({
      id: "baseline-run",
      name: "baseline",
      status: "completed",
      results: [
        { scenarioId: "s1", trials: [{ trialNumber: 1, passed: true, scores: [{ name: "task_completion", score: 1.0, passed: true }], taskResult: { output: {}, trace: [], tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.001, model: "demo", provider: "demo" }, duration: 50 } }], aggregatedScores: {}, passAtK: 1, passToTheK: 1, gPassAtK: 1 },
      ],
      summary: {
        totalScenarios: 1,
        totalTrials: 1,
        overallPassRate: 1.0,
        passAtK: 1.0,
        passToTheK: 1.0,
        gPassAtK: 1.0,
        totalCost: 0.001,
        totalDuration: 50,
        avgTokensPerScenario: 150,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    }),
    saveBaseline: vi.fn(),
    compareRuns: vi.fn().mockReturnValue({
      baselineRunId: "baseline-run",
      currentRunId: "replay-run",
      timestamp: "2026-01-01",
      verdict: "pass",
      summary: { passRateDelta: 0, passAtKDelta: 0, passToTheKDelta: 0, gPassAtKDelta: 0, costDelta: 0, costDeltaPercent: 0, latencyDelta: 0, newFailures: 0, fixedFailures: 0, safetyRegressions: 0 },
      scenarioDetails: [],
    }),
    formatRegressionReport: vi.fn().mockReturnValue("Regression Report [PASS]"),
  };
});

import { replayCommand } from "./replay.js";
import { saveBaseline } from "@syntharena/replay";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  process.exitCode = undefined;
});

describe("replayCommand", () => {
  it("compares against baseline and displays report", async () => {
    await replayCommand({
      baselinePath: "baselines/test.json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Regression Report");
    expect(logs).toContain("PASS");
  });

  it("saves new baseline when --save-baseline is specified", async () => {
    await replayCommand({
      baselinePath: "",
      saveBaseline: "baselines/new.json",
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
    });

    expect(saveBaseline).toHaveBeenCalledWith(
      expect.objectContaining({ id: "replay-run" }),
      "baselines/new.json",
    );

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Baseline saved");
  });
});
