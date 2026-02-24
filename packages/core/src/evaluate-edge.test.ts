import { describe, it, expect } from "vitest";
import { evaluate, computeGPassAtK } from "./evaluate.js";
import type { Scenario, TaskResult, TrialResult, Scorer } from "@syntharena/shared";
import { taskCompletion, contains, costThreshold } from "./graders.js";

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

describe("evaluate edge cases", () => {
  it("handles single scenario with single scorer", async () => {
    const run = await evaluate({
      name: "minimal",
      dataset: [makeScenario()],
      task: async () => makeTaskResult(),
      scorers: [taskCompletion],
    });
    expect(run.status).toBe("completed");
    expect(run.results).toHaveLength(1);
    expect(run.summary.totalScenarios).toBe(1);
  });

  it("computes latency percentiles correctly", async () => {
    let callNum = 0;
    const variableTask = async () => {
      callNum++;
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      return makeTaskResult({ duration: durations[(callNum - 1) % durations.length]! });
    };

    const run = await evaluate({
      name: "latency-test",
      dataset: Array.from({ length: 10 }, (_, i) => makeScenario({ id: `s${i}` })),
      task: variableTask,
      scorers: [taskCompletion],
    });

    expect(run.summary.latencyPercentiles.min).toBe(10);
    expect(run.summary.latencyPercentiles.max).toBe(100);
    expect(run.summary.latencyPercentiles.p50).toBeDefined();
    expect(run.summary.latencyPercentiles.mean).toBeGreaterThan(0);
  });

  it("handles empty dataset gracefully", async () => {
    const run = await evaluate({
      name: "empty",
      dataset: [],
      task: async () => makeTaskResult(),
      scorers: [taskCompletion],
    });
    expect(run.results).toHaveLength(0);
    expect(run.summary.totalScenarios).toBe(0);
    expect(run.summary.overallPassRate).toBe(0);
    expect(run.summary.totalCost).toBe(0);
  });

  it("handles scorer errors without crashing", async () => {
    const errorScorer: Scorer = async () => {
      throw new Error("Scorer crashed");
    };

    const run = await evaluate({
      name: "scorer-error",
      dataset: [makeScenario()],
      task: async () => makeTaskResult(),
      scorers: [taskCompletion, errorScorer],
    });

    // taskCompletion passes but errorScorer fails
    const trial = run.results[0]!.trials[0]!;
    expect(trial.scores).toHaveLength(2);
    expect(trial.scores[0]!.passed).toBe(true); // taskCompletion
    expect(trial.scores[1]!.score).toBe(0); // error scorer
    expect(trial.scores[1]!.name).toBe("scorer_error");
    expect(trial.passed).toBe(false); // Overall trial fails because one scorer failed
  });

  it("fires onProgress callback for each scenario", async () => {
    const progressEvents: Array<{ type: string }> = [];
    const scenarios = Array.from({ length: 3 }, (_, i) => makeScenario({ id: `s${i}` }));

    await evaluate({
      name: "progress-test",
      dataset: scenarios,
      task: async () => makeTaskResult(),
      scorers: [taskCompletion],
      onProgress: (event) => progressEvents.push({ type: event.type }),
    });

    // 3 scenario_complete events + 1 run_complete
    const scenarioEvents = progressEvents.filter((e) => e.type === "scenario_complete");
    const runEvents = progressEvents.filter((e) => e.type === "run_complete");
    expect(scenarioEvents).toHaveLength(3);
    expect(runEvents).toHaveLength(1);
  });

  it("respects maxConcurrency of 1 (sequential)", async () => {
    const order: number[] = [];
    let running = 0;
    let maxRunning = 0;

    const trackingTask = async (input: Record<string, unknown>) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      order.push(input["idx"] as number);
      running--;
      return makeTaskResult();
    };

    await evaluate({
      name: "sequential",
      dataset: Array.from({ length: 5 }, (_, i) => makeScenario({ id: `s${i}`, input: { idx: i } })),
      task: trackingTask,
      scorers: [taskCompletion],
      maxConcurrency: 1,
    });

    expect(maxRunning).toBe(1);
  });

  it("aggregates scores across scenarios correctly", async () => {
    let callCount = 0;
    const variableOutputTask = async () => {
      callCount++;
      return makeTaskResult({
        output: callCount <= 2 ? { success: true } : null,
      });
    };

    const run = await evaluate({
      name: "agg-test",
      dataset: Array.from({ length: 3 }, (_, i) => makeScenario({ id: `s${i}` })),
      task: variableOutputTask,
      scorers: [taskCompletion],
    });

    // 2 pass, 1 fail
    const passRate = run.summary.overallPassRate;
    expect(passRate).toBeCloseTo(2 / 3, 5);
  });

  it("computes summary cost correctly across multiple scenarios", async () => {
    const run = await evaluate({
      name: "cost-summary",
      dataset: Array.from({ length: 5 }, (_, i) => makeScenario({ id: `s${i}` })),
      task: async () => makeTaskResult({ tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.1, model: "t", provider: "t" } }),
      scorers: [taskCompletion],
    });

    expect(run.summary.totalCost).toBeCloseTo(0.5, 5);
    expect(run.summary.avgTokensPerScenario).toBe(150);
  });

  it("generates unique run IDs", async () => {
    const run1 = await evaluate({
      name: "unique-1",
      dataset: [makeScenario()],
      task: async () => makeTaskResult(),
      scorers: [taskCompletion],
    });

    const run2 = await evaluate({
      name: "unique-2",
      dataset: [makeScenario()],
      task: async () => makeTaskResult(),
      scorers: [taskCompletion],
    });

    expect(run1.id).not.toBe(run2.id);
  });

  it("preserves config metadata in run", async () => {
    const run = await evaluate({
      name: "meta-test",
      dataset: [makeScenario()],
      task: async () => makeTaskResult(),
      scorers: [taskCompletion],
      metadata: { custom: "value", version: 42 },
    });

    expect(run.config.metadata).toEqual({ custom: "value", version: 42 });
  });

  it("computes stddev correctly for variable scores", async () => {
    let callNum = 0;
    const variableScorer: Scorer = async () => {
      callNum++;
      const scores = [0.2, 0.8, 0.4, 0.6, 1.0];
      const score = scores[(callNum - 1) % scores.length]!;
      return { name: "variable", score, passed: score >= 0.5 };
    };

    const run = await evaluate({
      name: "stddev-test",
      dataset: [makeScenario()],
      task: async () => makeTaskResult(),
      scorers: [variableScorer],
      trials: 5,
    });

    const agg = run.results[0]!.aggregatedScores["variable"];
    expect(agg).toBeDefined();
    expect(agg!.stddev).toBeGreaterThan(0);
    expect(agg!.min).toBe(0.2);
    expect(agg!.max).toBe(1.0);
  });
});

describe("computeGPassAtK edge cases", () => {
  function makeTrial(passed: boolean, trialNumber = 0): TrialResult {
    return {
      trialNumber,
      taskResult: makeTaskResult(),
      scores: [{ name: "test", score: passed ? 1 : 0, passed }],
      passed,
    };
  }

  it("returns 1 for single passing trial", () => {
    expect(computeGPassAtK([makeTrial(true)])).toBe(1);
  });

  it("returns 0 for single failing trial", () => {
    expect(computeGPassAtK([makeTrial(false)])).toBe(0);
  });

  it("handles large number of trials", () => {
    const trials = Array.from({ length: 100 }, (_, i) => makeTrial(i < 70, i));
    const result = computeGPassAtK(trials);
    // 70% pass rate, threshold = ceil(100*0.5) = 50, 70 >= 50 so should be 1
    expect(result).toBe(1);
  });

  it("handles threshold equal to trial count (all must pass)", () => {
    const trials = [makeTrial(true, 0), makeTrial(true, 1), makeTrial(false, 2)];
    const result = computeGPassAtK(trials, 3); // All 3 must pass
    // 2/3 pass, threshold=3, p=2/3, P(X>=3) = (2/3)^3 ≈ 0.296
    expect(result).toBeCloseTo(Math.pow(2 / 3, 3), 3);
  });

  it("handles threshold of 1 (at least one must pass)", () => {
    const trials = [makeTrial(true, 0), makeTrial(false, 1), makeTrial(false, 2)];
    const result = computeGPassAtK(trials, 1);
    // 1 out of 3 pass, threshold=1, c=1 >= t=1 so returns 1
    expect(result).toBe(1);
  });

  it("returns correct probability for exact math case", () => {
    // 2 out of 5 pass, threshold = 3
    const trials = [
      makeTrial(true, 0), makeTrial(true, 1),
      makeTrial(false, 2), makeTrial(false, 3), makeTrial(false, 4),
    ];
    const result = computeGPassAtK(trials, 3);
    // p = 0.4, n=5, P(X>=3) = C(5,3)*0.4^3*0.6^2 + C(5,4)*0.4^4*0.6^1 + C(5,5)*0.4^5
    const expected = 10 * 0.064 * 0.36 + 5 * 0.0256 * 0.6 + 1 * 0.01024;
    expect(result).toBeCloseTo(expected, 5);
  });
});

describe("multiple scorer composition", () => {
  it("correctly marks trial as failed if ANY scorer fails", async () => {
    const passScorer: Scorer = async () => ({ name: "pass", score: 1.0, passed: true });
    const failScorer: Scorer = async () => ({ name: "fail", score: 0, passed: false });

    const run = await evaluate({
      name: "composition-test",
      dataset: [makeScenario()],
      task: async () => makeTaskResult(),
      scorers: [passScorer, failScorer],
    });

    const trial = run.results[0]!.trials[0]!;
    expect(trial.passed).toBe(false); // One scorer failed
    expect(trial.scores[0]!.passed).toBe(true);
    expect(trial.scores[1]!.passed).toBe(false);
  });

  it("aggregates multiple scorers independently", async () => {
    const run = await evaluate({
      name: "multi-agg",
      dataset: [makeScenario()],
      task: async () => makeTaskResult({ output: "hello world" }),
      scorers: [taskCompletion, contains("hello"), costThreshold(1.0)],
      trials: 3,
    });

    const agg = run.results[0]!.aggregatedScores;
    expect(agg["task_completion"]).toBeDefined();
    expect(agg["contains"]).toBeDefined();
    expect(agg["cost_threshold"]).toBeDefined();
  });
});
