/**
 * Cross-package integration tests.
 *
 * Located in apps/cli because it has dependencies on all packages:
 * - @syntharena/core (evaluation, scorers)
 * - @syntharena/cost (cost estimation)
 * - @syntharena/replay (regression, adversarial)
 */

import { describe, it, expect } from "vitest";
import { evaluate, taskCompletion, costThreshold, safetyCheck } from "@syntharena/core";
import { estimateCost, MODEL_PRICING } from "@syntharena/cost";
import { compareRuns, formatRegressionReport, generateAdversarialScenarios } from "@syntharena/replay";
import type { Scenario, TaskResult } from "@syntharena/shared";

function makeScenarios(count: number, domain = "web-scraping"): Scenario[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${domain}-${i + 1}`,
    domain,
    name: `scenario-${i + 1}`,
    description: `Test scenario ${i + 1}`,
    input: { query: `test-${i}`, index: i },
    expected: { success: true },
    metadata: {
      complexity: "medium" as const,
      tags: [domain, "cross-package-test"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "test",
    },
  }));
}

function demoTask(input: Record<string, unknown>): Promise<TaskResult> {
  return Promise.resolve({
    output: { success: true, data: input },
    trace: [],
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.001,
      model: "demo",
      provider: "demo",
    },
    duration: 50,
  });
}

// ─── Evaluation → Cost Estimation ───────────────────────────────

describe("evaluation to cost estimation (cross-package)", () => {
  it("cost estimate exists alongside evaluation results", async () => {
    const scenarios = makeScenarios(5);

    const estimate = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: scenarios.length,
      trialsPerScenario: 1,
      avgCallsPerScenario: 1,
      avgInputTokensPerCall: 1000,
      avgOutputTokensPerCall: 500,
    });

    const run = await evaluate({
      name: "cost-pipeline-test",
      dataset: scenarios,
      task: demoTask,
      scorers: [taskCompletion],
      trials: 1,
    });

    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(run.summary.totalCost).toBeGreaterThanOrEqual(0);

    expect(MODEL_PRICING.length).toBeGreaterThan(0);
    expect(MODEL_PRICING.some((m) => m.model.includes("claude"))).toBe(true);
  });

  it("cost estimation scales linearly with scenario count", () => {
    const small = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 10,
      trialsPerScenario: 1,
      avgCallsPerScenario: 1,
      avgInputTokensPerCall: 1000,
      avgOutputTokensPerCall: 500,
    });

    const large = estimateCost({
      model: "claude-sonnet-4-20250514",
      scenarioCount: 100,
      trialsPerScenario: 1,
      avgCallsPerScenario: 1,
      avgInputTokensPerCall: 1000,
      avgOutputTokensPerCall: 500,
    });

    const ratio = large.estimatedCost / small.estimatedCost;
    expect(ratio).toBeCloseTo(10, 0);
  });
});

// ─── Evaluation → Regression ────────────────────────────────────

describe("evaluation to regression comparison (cross-package)", () => {
  it("runs evaluation and compares two runs", async () => {
    const scenarios = makeScenarios(3);

    const baseline = await evaluate({
      name: "cross-pkg-baseline",
      dataset: scenarios,
      task: demoTask,
      scorers: [taskCompletion, costThreshold(1.0)],
      trials: 1,
    });

    const current = await evaluate({
      name: "cross-pkg-current",
      dataset: scenarios,
      task: demoTask,
      scorers: [taskCompletion, costThreshold(1.0)],
      trials: 1,
    });

    const report = compareRuns(baseline, current);

    expect(report.verdict).toBe("pass");
    expect(report.baselineRunId).toBe(baseline.id);
    expect(report.currentRunId).toBe(current.id);
    expect(report.summary.newFailures).toBe(0);

    const formatted = formatRegressionReport(report);
    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("PASS");
  });

  it("detects regression when current run degrades", async () => {
    const scenarios = makeScenarios(3);

    const baseline = await evaluate({
      name: "cross-pkg-good",
      dataset: scenarios,
      task: demoTask,
      scorers: [taskCompletion],
      trials: 1,
    });

    const failingTask = async (_input: Record<string, unknown>): Promise<TaskResult> => ({
      output: { success: false, error: "failed" },
      trace: [],
      tokenUsage: { inputTokens: 50, outputTokens: 25, totalTokens: 75, estimatedCost: 0.0005, model: "demo", provider: "demo" },
      duration: 25,
    });

    const current = await evaluate({
      name: "cross-pkg-bad",
      dataset: scenarios,
      task: failingTask,
      scorers: [taskCompletion],
      trials: 1,
    });

    const report = compareRuns(baseline, current);
    expect(report.summary.passRateDelta).toBeLessThanOrEqual(0);
  });
});

// ─── Adversarial → Evaluation → Regression ──────────────────────

describe("adversarial to evaluation to regression (cross-package)", () => {
  it("generates adversarial scenarios and evaluates them", async () => {
    const baseScenarios = makeScenarios(2);

    const adversarial = generateAdversarialScenarios({
      baseScenarios,
      categories: ["input-perturbation", "prompt-injection", "tool-misuse"],
      intensityLevel: "low",
      count: 6,
    });

    expect(adversarial).toHaveLength(6);
    expect(adversarial.every((s) => s.metadata.complexity === "adversarial")).toBe(true);

    const run = await evaluate({
      name: "cross-pkg-adversarial",
      dataset: adversarial,
      task: demoTask,
      scorers: [taskCompletion, safetyCheck()],
      trials: 1,
    });

    expect(run.status).toBe("completed");
    expect(run.results).toHaveLength(6);
    expect(run.summary.totalScenarios).toBe(6);
  });

  it("adversarial evaluation feeds into regression comparison", async () => {
    const baseScenarios = makeScenarios(2);

    const adversarial = generateAdversarialScenarios({
      baseScenarios,
      categories: ["input-perturbation"],
      intensityLevel: "low",
      count: 2,
    });

    const run1 = await evaluate({
      name: "cross-pkg-adv-baseline",
      dataset: adversarial,
      task: demoTask,
      scorers: [taskCompletion],
      trials: 1,
    });

    const run2 = await evaluate({
      name: "cross-pkg-adv-current",
      dataset: adversarial,
      task: demoTask,
      scorers: [taskCompletion],
      trials: 1,
    });

    const report = compareRuns(run1, run2);
    expect(report.verdict).toBe("pass");
    expect(report.summary.newFailures).toBe(0);
  });
});
