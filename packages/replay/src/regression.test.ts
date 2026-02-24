import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  compareRuns,
  saveBaseline,
  loadBaseline,
  formatRegressionReport,
  type RegressionReport,
} from "./regression.js";
import type { EvaluationRun, ScenarioResult, TrialResult, ScorerResult, TaskResult } from "@syntharena/shared";

// Mock fs module
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);

// ─── Test Helpers ─────────────────────────────────────────────────

function makeTaskResult(overrides?: Partial<TaskResult>): TaskResult {
  return {
    output: { result: "done" },
    trace: [],
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.01,
      model: "test-model",
      provider: "test",
    },
    duration: 1000,
    ...overrides,
  };
}

function makeScore(overrides?: Partial<ScorerResult>): ScorerResult {
  return {
    name: "task_completion",
    score: 0.8,
    passed: true,
    ...overrides,
  };
}

function makeTrial(overrides?: Partial<TrialResult>): TrialResult {
  return {
    trialNumber: 1,
    taskResult: makeTaskResult(),
    scores: [makeScore()],
    passed: true,
    ...overrides,
  };
}

function makeScenarioResult(scenarioId: string, overrides?: Partial<ScenarioResult>): ScenarioResult {
  return {
    scenarioId,
    trials: [makeTrial()],
    aggregatedScores: {
      task_completion: { name: "task_completion", mean: 0.8, min: 0.8, max: 0.8, stddev: 0 },
    },
    passAtK: 0.8,
    passToTheK: 0.8,
    gPassAtK: 0.8,
    ...overrides,
  };
}

function makeEvalRun(overrides?: Partial<EvaluationRun>): EvaluationRun {
  return {
    id: "run-1",
    name: "test-eval",
    createdAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T00:01:00Z",
    status: "completed",
    config: {
      name: "test-eval",
      dataset: [],
      scorers: [],
      trials: 1,
    },
    results: [makeScenarioResult("scenario-1")],
    summary: {
      totalScenarios: 1,
      totalTrials: 1,
      overallPassRate: 1.0,
      passAtK: 0.8,
      passToTheK: 0.8,
      gPassAtK: 0.8,
      totalCost: 0.01,
      totalDuration: 1000,
      avgTokensPerScenario: 150,
      latencyPercentiles: { p50: 1000, p75: 1000, p95: 1000, p99: 1000, min: 1000, max: 1000, mean: 1000 },
      scoreSummaries: {},
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe("compareRuns", () => {
  it("produces a pass verdict for identical runs", () => {
    const baseline = makeEvalRun({ id: "baseline" });
    const current = makeEvalRun({ id: "current" });

    const report = compareRuns(baseline, current);

    expect(report.verdict).toBe("pass");
    expect(report.baselineRunId).toBe("baseline");
    expect(report.currentRunId).toBe("current");
    expect(report.summary.newFailures).toBe(0);
    expect(report.summary.fixedFailures).toBe(0);
    expect(report.summary.safetyRegressions).toBe(0);
  });

  it("detects improved scenarios", () => {
    const baseline = makeEvalRun({
      id: "baseline",
      summary: { ...makeEvalRun().summary, overallPassRate: 0.5, passAtK: 0.5, passToTheK: 0.5, gPassAtK: 0.5 },
      results: [
        makeScenarioResult("s1", {
          trials: [makeTrial({ passed: false, scores: [makeScore({ score: 0.3, passed: false })] })],
        }),
      ],
    });

    const current = makeEvalRun({
      id: "current",
      summary: { ...makeEvalRun().summary, overallPassRate: 1.0 },
      results: [
        makeScenarioResult("s1", {
          trials: [makeTrial({ passed: true, scores: [makeScore({ score: 0.9, passed: true })] })],
        }),
      ],
    });

    const report = compareRuns(baseline, current);
    const s1 = report.scenarioDetails.find((s) => s.scenarioId === "s1");

    expect(s1).toBeDefined();
    expect(s1!.status).toBe("improved");
    expect(report.summary.fixedFailures).toBe(1);
  });

  it("detects regressed scenarios and marks verdict as fail", () => {
    const baseline = makeEvalRun({
      id: "baseline",
      summary: { ...makeEvalRun().summary, overallPassRate: 1.0 },
      results: [
        makeScenarioResult("s1", {
          trials: [makeTrial({ passed: true, scores: [makeScore({ score: 0.9, passed: true })] })],
        }),
      ],
    });

    const current = makeEvalRun({
      id: "current",
      summary: { ...makeEvalRun().summary, overallPassRate: 0.0 },
      results: [
        makeScenarioResult("s1", {
          trials: [makeTrial({ passed: false, scores: [makeScore({ score: 0.1, passed: false })] })],
        }),
      ],
    });

    const report = compareRuns(baseline, current);
    const s1 = report.scenarioDetails.find((s) => s.scenarioId === "s1");

    expect(report.verdict).toBe("fail");
    expect(s1!.status).toBe("regressed");
    expect(report.summary.newFailures).toBe(1);
  });

  it("detects new scenarios", () => {
    const baseline = makeEvalRun({ id: "baseline", results: [] });
    const current = makeEvalRun({ id: "current", results: [makeScenarioResult("new-s")] });

    const report = compareRuns(baseline, current);
    const newS = report.scenarioDetails.find((s) => s.scenarioId === "new-s");

    expect(newS).toBeDefined();
    expect(newS!.status).toBe("new");
    expect(newS!.baseline).toBeNull();
  });

  it("detects removed scenarios", () => {
    const baseline = makeEvalRun({ id: "baseline", results: [makeScenarioResult("old-s")] });
    const current = makeEvalRun({ id: "current", results: [] });

    const report = compareRuns(baseline, current);
    const oldS = report.scenarioDetails.find((s) => s.scenarioId === "old-s");

    expect(oldS).toBeDefined();
    expect(oldS!.status).toBe("removed");
    expect(oldS!.current).toBeNull();
  });

  it("detects safety regressions and marks verdict as fail", () => {
    const baseline = makeEvalRun({
      id: "baseline",
      results: [
        makeScenarioResult("s1", {
          trials: [makeTrial({ scores: [makeScore({ name: "safety_check", score: 1.0, passed: true })] })],
        }),
      ],
    });

    const current = makeEvalRun({
      id: "current",
      results: [
        makeScenarioResult("s1", {
          trials: [makeTrial({ scores: [makeScore({ name: "safety_check", score: 0.0, passed: false })] })],
        }),
      ],
    });

    const report = compareRuns(baseline, current);

    expect(report.verdict).toBe("fail");
    expect(report.summary.safetyRegressions).toBe(1);
  });

  it("marks warning for cost increase >20%", () => {
    const baseline = makeEvalRun({
      id: "baseline",
      summary: { ...makeEvalRun().summary, totalCost: 1.0 },
    });

    const current = makeEvalRun({
      id: "current",
      summary: { ...makeEvalRun().summary, totalCost: 1.5 },
    });

    const report = compareRuns(baseline, current);

    expect(report.verdict).toBe("warning");
    expect(report.summary.costDeltaPercent).toBe(50);
  });

  it("computes correct deltas", () => {
    const baseline = makeEvalRun({
      id: "baseline",
      summary: { ...makeEvalRun().summary, overallPassRate: 0.7, totalCost: 1.0, totalDuration: 5000, passAtK: 0.6, passToTheK: 0.5, gPassAtK: 0.55 },
    });

    const current = makeEvalRun({
      id: "current",
      summary: { ...makeEvalRun().summary, overallPassRate: 0.9, totalCost: 0.8, totalDuration: 4000, passAtK: 0.8, passToTheK: 0.7, gPassAtK: 0.75 },
    });

    const report = compareRuns(baseline, current);

    expect(report.summary.passRateDelta).toBeCloseTo(0.2);
    expect(report.summary.costDelta).toBeCloseTo(-0.2);
    expect(report.summary.latencyDelta).toBe(-1000);
    expect(report.summary.passAtKDelta).toBeCloseTo(0.2);
  });

  it("handles multiple scenarios with mixed statuses", () => {
    const baseline = makeEvalRun({
      id: "baseline",
      results: [
        makeScenarioResult("s1", { trials: [makeTrial({ passed: true })] }),
        makeScenarioResult("s2", { trials: [makeTrial({ passed: false, scores: [makeScore({ score: 0.1, passed: false })] })] }),
        makeScenarioResult("s3", { trials: [makeTrial({ passed: true })] }),
      ],
    });

    const current = makeEvalRun({
      id: "current",
      results: [
        makeScenarioResult("s1", { trials: [makeTrial({ passed: false, scores: [makeScore({ score: 0.1, passed: false })] })] }),
        makeScenarioResult("s2", { trials: [makeTrial({ passed: true })] }),
        makeScenarioResult("s4", { trials: [makeTrial({ passed: true })] }),
      ],
    });

    const report = compareRuns(baseline, current);

    const s1 = report.scenarioDetails.find((s) => s.scenarioId === "s1");
    const s2 = report.scenarioDetails.find((s) => s.scenarioId === "s2");
    const s3 = report.scenarioDetails.find((s) => s.scenarioId === "s3");
    const s4 = report.scenarioDetails.find((s) => s.scenarioId === "s4");

    expect(s1!.status).toBe("regressed");
    expect(s2!.status).toBe("improved");
    expect(s3!.status).toBe("removed");
    expect(s4!.status).toBe("new");
  });
});

describe("saveBaseline", () => {
  it("writes run as JSON to file", () => {
    const run = makeEvalRun();
    saveBaseline(run, "/tmp/baselines/test.json");

    expect(mkdirSync).toHaveBeenCalledWith("/tmp/baselines", { recursive: true });
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/tmp/baselines/test.json",
      expect.any(String),
      "utf-8",
    );

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string);
    expect(written.id).toBe("run-1");
  });
});

describe("loadBaseline", () => {
  it("reads and parses baseline file", () => {
    const run = makeEvalRun();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(run));

    const loaded = loadBaseline("/tmp/baselines/test.json");

    expect(loaded.id).toBe("run-1");
    expect(loaded.results).toHaveLength(1);
  });

  it("throws for missing baseline file", () => {
    mockedExistsSync.mockReturnValue(false);

    expect(() => loadBaseline("/tmp/missing.json")).toThrow("Baseline not found");
  });
});

describe("formatRegressionReport", () => {
  it("formats a passing report", () => {
    const report: RegressionReport = {
      baselineRunId: "baseline-1",
      currentRunId: "current-1",
      timestamp: "2026-01-01T00:00:00Z",
      verdict: "pass",
      summary: {
        passRateDelta: 0.1,
        passAtKDelta: 0.05,
        passToTheKDelta: 0.05,
        gPassAtKDelta: 0.05,
        costDelta: -0.01,
        costDeltaPercent: -5,
        latencyDelta: -100,
        newFailures: 0,
        fixedFailures: 2,
        safetyRegressions: 0,
      },
      scenarioDetails: [],
    };

    const formatted = formatRegressionReport(report);

    expect(formatted).toContain("PASS");
    expect(formatted).toContain("baseline-1");
    expect(formatted).toContain("current-1");
    expect(formatted).toContain("clean");
  });

  it("formats a failing report with regressed scenarios", () => {
    const report: RegressionReport = {
      baselineRunId: "b",
      currentRunId: "c",
      timestamp: "2026-01-01T00:00:00Z",
      verdict: "fail",
      summary: {
        passRateDelta: -0.3,
        passAtKDelta: -0.2,
        passToTheKDelta: -0.2,
        gPassAtKDelta: -0.2,
        costDelta: 0.5,
        costDeltaPercent: 50,
        latencyDelta: 1000,
        newFailures: 2,
        fixedFailures: 0,
        safetyRegressions: 1,
      },
      scenarioDetails: [
        {
          scenarioId: "s1",
          status: "regressed",
          baseline: { passRate: 1.0, avgScore: 0.9, avgCost: 0.01, avgDuration: 1000, trialCount: 3 },
          current: { passRate: 0.0, avgScore: 0.1, avgCost: 0.02, avgDuration: 2000, trialCount: 3 },
          deltas: { passRate: -1.0 },
        },
      ],
    };

    const formatted = formatRegressionReport(report);

    expect(formatted).toContain("FAIL");
    expect(formatted).toContain("REGRESSIONS");
    expect(formatted).toContain("Regressed Scenarios");
    expect(formatted).toContain("s1");
  });

  it("formats improved scenarios section", () => {
    const report: RegressionReport = {
      baselineRunId: "b",
      currentRunId: "c",
      timestamp: "2026-01-01T00:00:00Z",
      verdict: "pass",
      summary: {
        passRateDelta: 0.2,
        passAtKDelta: 0.1,
        passToTheKDelta: 0.1,
        gPassAtKDelta: 0.1,
        costDelta: 0,
        costDeltaPercent: 0,
        latencyDelta: 0,
        newFailures: 0,
        fixedFailures: 1,
        safetyRegressions: 0,
      },
      scenarioDetails: [
        {
          scenarioId: "s-improved",
          status: "improved",
          baseline: { passRate: 0.0, avgScore: 0.1, avgCost: 0.01, avgDuration: 1000, trialCount: 3 },
          current: { passRate: 1.0, avgScore: 0.9, avgCost: 0.01, avgDuration: 1000, trialCount: 3 },
          deltas: { passRate: 1.0 },
        },
      ],
    };

    const formatted = formatRegressionReport(report);

    expect(formatted).toContain("Improved Scenarios");
    expect(formatted).toContain("s-improved");
  });
});
