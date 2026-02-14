import { describe, it, expect } from "vitest";
import { evaluate, computeGPassAtK } from "./evaluate.js";
import type { Scenario, TaskResult, TrialResult } from "@syntharena/shared";
import { taskCompletion, exactMatch, contains, costThreshold, safetyCheck } from "./graders.js";

function makeScenario(overrides?: Partial<Scenario>): Scenario {
  return {
    id: "test-1",
    domain: "test",
    name: "Test scenario",
    description: "A test scenario",
    input: { query: "test" },
    expected: { success: true },
    metadata: {
      complexity: "low",
      tags: ["test"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0",
    },
    ...overrides,
  };
}

function makeTaskResult(overrides?: Partial<TaskResult>): TaskResult {
  return {
    output: { success: true },
    trace: [],
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.001,
      model: "test",
      provider: "test",
    },
    duration: 50,
    ...overrides,
  };
}

const alwaysPassTask = async () => makeTaskResult();

const alwaysFailTask = async () =>
  makeTaskResult({ output: null, error: "failed" });

describe("evaluate", () => {
  it("runs a simple evaluation with 1 scenario, 1 trial", async () => {
    const run = await evaluate({
      name: "simple-test",
      dataset: [makeScenario()],
      task: alwaysPassTask,
      scorers: [taskCompletion],
    });

    expect(run.status).toBe("completed");
    expect(run.results).toHaveLength(1);
    expect(run.results[0]!.trials).toHaveLength(1);
    expect(run.summary.overallPassRate).toBe(1);
    expect(run.summary.passAtK).toBe(1);
    expect(run.summary.passToTheK).toBe(1);
  });

  it("runs multiple scenarios", async () => {
    const scenarios = [
      makeScenario({ id: "s1", name: "scenario-1" }),
      makeScenario({ id: "s2", name: "scenario-2" }),
      makeScenario({ id: "s3", name: "scenario-3" }),
    ];

    const run = await evaluate({
      name: "multi-scenario",
      dataset: scenarios,
      task: alwaysPassTask,
      scorers: [taskCompletion],
    });

    expect(run.results).toHaveLength(3);
    expect(run.summary.totalScenarios).toBe(3);
    expect(run.summary.totalTrials).toBe(3);
  });

  it("runs multiple trials per scenario", async () => {
    const run = await evaluate({
      name: "multi-trial",
      dataset: [makeScenario()],
      task: alwaysPassTask,
      scorers: [taskCompletion],
      trials: 5,
    });

    expect(run.results[0]!.trials).toHaveLength(5);
    expect(run.summary.totalTrials).toBe(5);
  });

  it("computes pass@k > 0 when at least one trial passes", async () => {
    let callCount = 0;
    const failFirstTask = async () => {
      callCount++;
      if (callCount === 1) {
        return makeTaskResult({ output: null, error: "first fail" });
      }
      return makeTaskResult();
    };

    const run = await evaluate({
      name: "pass-at-k",
      dataset: [makeScenario()],
      task: failFirstTask,
      scorers: [taskCompletion],
      trials: 3,
    });

    // 2/3 pass rate → pass@k = 1 - (1 - 2/3)^3 ≈ 0.963
    expect(run.results[0]!.passAtK).toBeGreaterThan(0.9);
    expect(run.results[0]!.passAtK).toBeLessThan(1);
  });

  it("computes pass^k < 1 when not all trials pass", async () => {
    let callCount = 0;
    const failLastTask = async () => {
      callCount++;
      if (callCount === 3) {
        return makeTaskResult({ output: null, error: "last fail" });
      }
      return makeTaskResult();
    };

    const run = await evaluate({
      name: "pass-to-k",
      dataset: [makeScenario()],
      task: failLastTask,
      scorers: [taskCompletion],
      trials: 3,
    });

    // 2/3 pass rate → pass^k = (2/3)^3 ≈ 0.296
    expect(run.results[0]!.passToTheK).toBeGreaterThan(0.2);
    expect(run.results[0]!.passToTheK).toBeLessThan(0.4);
  });

  it("computes pass@k=0 and pass^k=0 when all trials fail", async () => {
    const run = await evaluate({
      name: "all-fail",
      dataset: [makeScenario()],
      task: alwaysFailTask,
      scorers: [taskCompletion],
      trials: 3,
    });

    expect(run.results[0]!.passAtK).toBe(0);
    expect(run.results[0]!.passToTheK).toBe(0);
  });

  it("computes pass@k=1 and pass^k=1 when all trials pass", async () => {
    const run = await evaluate({
      name: "all-pass",
      dataset: [makeScenario()],
      task: alwaysPassTask,
      scorers: [taskCompletion],
      trials: 5,
    });

    expect(run.results[0]!.passAtK).toBe(1);
    expect(run.results[0]!.passToTheK).toBe(1);
  });

  it("handles task errors gracefully", async () => {
    const throwingTask = async () => {
      throw new Error("Task exploded");
    };

    // The evaluate function should propagate the error from Promise.race
    await expect(
      evaluate({
        name: "error-test",
        dataset: [makeScenario()],
        task: throwingTask,
        scorers: [taskCompletion],
      })
    ).rejects.toThrow();
  });

  it("runs multiple scorers", async () => {
    const run = await evaluate({
      name: "multi-scorer",
      dataset: [makeScenario()],
      task: alwaysPassTask,
      scorers: [taskCompletion, costThreshold(1.0), safetyCheck()],
    });

    const trial = run.results[0]!.trials[0]!;
    expect(trial.scores).toHaveLength(3);
    expect(trial.scores.map((s) => s.name)).toEqual([
      "task_completion",
      "cost_threshold",
      "safety_check",
    ]);
  });

  it("tracks cost and token usage in summary", async () => {
    const run = await evaluate({
      name: "cost-tracking",
      dataset: [makeScenario(), makeScenario({ id: "s2" })],
      task: alwaysPassTask,
      scorers: [taskCompletion],
    });

    expect(run.summary.totalCost).toBe(0.002);
    expect(run.summary.avgTokensPerScenario).toBe(150); // 150 total tokens per scenario
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const trackingTask = async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 20));
      currentConcurrent--;
      return makeTaskResult();
    };

    const scenarios = Array.from({ length: 10 }, (_, i) =>
      makeScenario({ id: `s${i}` })
    );

    await evaluate({
      name: "concurrency-test",
      dataset: scenarios,
      task: trackingTask,
      scorers: [taskCompletion],
      maxConcurrency: 3,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it("includes metadata in evaluation run", async () => {
    const run = await evaluate({
      name: "metadata-test",
      dataset: [makeScenario()],
      task: alwaysPassTask,
      scorers: [taskCompletion],
      metadata: { domain: "testing", version: "1.0" },
    });

    expect(run.config.metadata).toEqual({ domain: "testing", version: "1.0" });
  });

  it("computes aggregated score statistics", async () => {
    const variableTask = async () => {
      const score = 0.5 + Math.random() * 0.5; // 0.5-1.0
      return makeTaskResult({
        output: { success: true, score },
      });
    };

    const run = await evaluate({
      name: "aggregation-test",
      dataset: [makeScenario()],
      task: variableTask,
      scorers: [taskCompletion],
      trials: 10,
    });

    const agg = run.results[0]!.aggregatedScores["task_completion"];
    expect(agg).toBeDefined();
    expect(agg!.mean).toBeGreaterThanOrEqual(0);
    expect(agg!.mean).toBeLessThanOrEqual(1);
    expect(agg!.min).toBeLessThanOrEqual(agg!.max);
  });
});

describe("graders", () => {
  describe("taskCompletion", () => {
    it("passes when output exists and no errors", async () => {
      const result = await taskCompletion({
        input: {},
        output: { data: "hello" },
      });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it("fails when output is null", async () => {
      const result = await taskCompletion({
        input: {},
        output: null,
      });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.0);
    });

    it("fails when trace has errors", async () => {
      const result = await taskCompletion({
        input: {},
        output: { data: "hello" },
        trace: [{
          id: "1", name: "test", type: "llm_call",
          startTime: 0, endTime: 100, status: "error",
          attributes: {}, events: [],
        }],
      });
      expect(result.passed).toBe(false);
    });
  });

  describe("exactMatch", () => {
    it("passes on exact object match", async () => {
      const result = await exactMatch({
        input: {},
        output: { a: 1, b: "two" },
        expected: { a: 1, b: "two" },
      });
      expect(result.passed).toBe(true);
    });

    it("fails on mismatch", async () => {
      const result = await exactMatch({
        input: {},
        output: { a: 1 },
        expected: { a: 2 },
      });
      expect(result.passed).toBe(false);
    });

    it("fails when no expected value", async () => {
      const result = await exactMatch({
        input: {},
        output: { a: 1 },
      });
      expect(result.passed).toBe(false);
    });
  });

  describe("contains", () => {
    it("passes when all substrings found", async () => {
      const scorer = contains("hello", "world");
      const result = await scorer({
        input: {},
        output: "hello beautiful world",
      });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it("partially scores when some missing", async () => {
      const scorer = contains("hello", "missing");
      const result = await scorer({
        input: {},
        output: "hello world",
      });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.5);
    });
  });

  describe("costThreshold", () => {
    it("passes when cost under threshold", async () => {
      const scorer = costThreshold(1.0);
      const result = await scorer({
        input: {},
        output: {},
        tokenUsage: {
          inputTokens: 100, outputTokens: 50, totalTokens: 150,
          estimatedCost: 0.5, model: "test", provider: "test",
        },
      });
      expect(result.passed).toBe(true);
    });

    it("fails when cost exceeds threshold", async () => {
      const scorer = costThreshold(0.01);
      const result = await scorer({
        input: {},
        output: {},
        tokenUsage: {
          inputTokens: 10000, outputTokens: 5000, totalTokens: 15000,
          estimatedCost: 0.5, model: "test", provider: "test",
        },
      });
      expect(result.passed).toBe(false);
    });
  });

  describe("safetyCheck", () => {
    it("passes with no violations", async () => {
      const scorer = safetyCheck();
      const result = await scorer({
        input: {},
        output: { safe: true },
        trace: [],
      });
      expect(result.passed).toBe(true);
    });

    it("detects blocked patterns in output", async () => {
      const scorer = safetyCheck({ blockedPatterns: [/password/i] });
      const result = await scorer({
        input: {},
        output: "The password is secret123",
      });
      expect(result.passed).toBe(false);
    });

    it("detects excessive tool calls", async () => {
      const spans = Array.from({ length: 200 }, (_, i) => ({
        id: `${i}`, name: `tool-${i}`, type: "tool_invocation" as const,
        startTime: 0, endTime: 10, status: "ok" as const,
        attributes: {}, events: [],
      }));

      const scorer = safetyCheck({ maxToolCalls: 50 });
      const result = await scorer({
        input: {},
        output: {},
        trace: spans,
      });
      expect(result.passed).toBe(false);
    });
  });
});

describe("computeGPassAtK", () => {
  function makeTrial(passed: boolean, trialNumber = 0): TrialResult {
    return {
      trialNumber,
      taskResult: makeTaskResult(),
      scores: [{ name: "test", score: passed ? 1 : 0, passed }],
      passed,
    };
  }

  it("returns 1 when enough trials pass the threshold", () => {
    // 4 out of 5 pass, threshold defaults to ceil(5 * 0.5) = 3
    const trials = [
      makeTrial(true, 0), makeTrial(true, 1), makeTrial(true, 2),
      makeTrial(true, 3), makeTrial(false, 4),
    ];
    expect(computeGPassAtK(trials)).toBe(1);
  });

  it("returns 0 when no trials pass", () => {
    const trials = [makeTrial(false, 0), makeTrial(false, 1), makeTrial(false, 2)];
    expect(computeGPassAtK(trials)).toBe(0);
  });

  it("returns 1 when all trials pass", () => {
    const trials = [makeTrial(true, 0), makeTrial(true, 1), makeTrial(true, 2)];
    expect(computeGPassAtK(trials)).toBe(1);
  });

  it("returns 0 for empty trials", () => {
    expect(computeGPassAtK([])).toBe(0);
  });

  it("uses custom threshold", () => {
    // 2 out of 4 pass, threshold = 3 → c < t so uses binomial estimation
    const trials = [
      makeTrial(true, 0), makeTrial(true, 1),
      makeTrial(false, 2), makeTrial(false, 3),
    ];
    const result = computeGPassAtK(trials, 3);
    // p = 0.5, P(X >= 3) with n=4 = C(4,3)*0.5^4 + C(4,4)*0.5^4 = 4/16 + 1/16 = 5/16
    expect(result).toBeCloseTo(5 / 16, 5);
  });

  it("returns probability between 0 and 1 for borderline cases", () => {
    // 1 out of 4 pass, default threshold = ceil(4*0.5) = 2
    const trials = [
      makeTrial(true, 0), makeTrial(false, 1),
      makeTrial(false, 2), makeTrial(false, 3),
    ];
    const result = computeGPassAtK(trials);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });
});
