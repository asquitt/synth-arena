import type {
  EvaluationConfig,
  EvaluationRun,
  EvaluationSummary,
  ScenarioResult,
  TrialResult,
  AggregatedScore,
  ScorerContext,
  ScorerResult,
  Scenario,
} from "@syntharena/shared";
import { generateId } from "./utils.js";

/**
 * Run an evaluation: execute a task function against a dataset of scenarios,
 * score each result with multiple scorers, and aggregate statistics.
 *
 * Supports multiple trials per scenario to compute pass@k and pass^k
 * reliability metrics (following Anthropic's evaluation methodology).
 */
export async function evaluate(config: EvaluationConfig): Promise<EvaluationRun> {
  const {
    name,
    dataset,
    task,
    scorers,
    trials = 1,
    maxConcurrency = 5,
    timeout = 300_000,
  } = config;

  const runId = generateId();
  const createdAt = new Date().toISOString();

  const results: ScenarioResult[] = [];

  // Process scenarios with concurrency limit
  const chunks = chunkArray(dataset, maxConcurrency);

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((scenario) => evaluateScenario(scenario, task, scorers, trials, timeout))
    );
    results.push(...chunkResults);
  }

  const summary = computeSummary(results);

  return {
    id: runId,
    name,
    createdAt,
    completedAt: new Date().toISOString(),
    status: "completed",
    config: { name, dataset, scorers, trials, maxConcurrency, timeout, metadata: config.metadata },
    results,
    summary,
  };
}

async function evaluateScenario(
  scenario: Scenario,
  task: EvaluationConfig["task"],
  scorers: EvaluationConfig["scorers"],
  trialCount: number,
  timeout: number
): Promise<ScenarioResult> {
  const trials: TrialResult[] = [];

  for (let t = 0; t < trialCount; t++) {
    const trial = await runTrial(scenario, task, scorers, t, timeout);
    trials.push(trial);
  }

  const aggregatedScores = aggregateScores(trials);
  const passAtK = computePassAtK(trials);
  const passToTheK = computePassToTheK(trials);

  return {
    scenarioId: scenario.id,
    trials,
    aggregatedScores,
    passAtK,
    passToTheK,
  };
}

async function runTrial(
  scenario: Scenario,
  task: EvaluationConfig["task"],
  scorers: EvaluationConfig["scorers"],
  trialNumber: number,
  timeout: number
): Promise<TrialResult> {
  const taskResult = await Promise.race([
    task(scenario.input),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Trial timed out after ${timeout}ms`)), timeout)
    ),
  ]);

  const scorerCtx: ScorerContext = {
    input: scenario.input,
    output: taskResult.output,
    expected: scenario.expected,
    metadata: scenario.metadata as unknown as Record<string, unknown>,
    trace: taskResult.trace,
    tokenUsage: taskResult.tokenUsage,
  };

  const scores: ScorerResult[] = [];
  for (const scorer of scorers) {
    try {
      const result = await scorer(scorerCtx);
      scores.push(result);
    } catch (err) {
      scores.push({
        name: "scorer_error",
        score: 0,
        passed: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = scores.every((s) => s.passed);

  return { trialNumber, taskResult, scores, passed };
}

/**
 * pass@k: probability of at least one success in k trials.
 * Measures capability -- "can the agent ever solve this?"
 */
function computePassAtK(trials: TrialResult[]): number {
  if (trials.length === 0) return 0;
  const successes = trials.filter((t) => t.passed).length;
  return successes > 0 ? 1 : 0;
}

/**
 * pass^k: probability of all k trials succeeding.
 * Measures reliability -- "does the agent always solve this?"
 */
function computePassToTheK(trials: TrialResult[]): number {
  if (trials.length === 0) return 0;
  const successes = trials.filter((t) => t.passed).length;
  return successes === trials.length ? 1 : 0;
}

function aggregateScores(trials: TrialResult[]): Record<string, AggregatedScore> {
  const scoresByName = new Map<string, number[]>();

  for (const trial of trials) {
    for (const score of trial.scores) {
      const existing = scoresByName.get(score.name) ?? [];
      existing.push(score.score);
      scoresByName.set(score.name, existing);
    }
  }

  const result: Record<string, AggregatedScore> = {};

  for (const [name, values] of scoresByName) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    result[name] = { name, mean, min, max, stddev };
  }

  return result;
}

function computeSummary(results: ScenarioResult[]): EvaluationSummary {
  const totalScenarios = results.length;
  const totalTrials = results.reduce((sum, r) => sum + r.trials.length, 0);

  const passedTrials = results.reduce(
    (sum, r) => sum + r.trials.filter((t) => t.passed).length,
    0
  );
  const overallPassRate = totalTrials > 0 ? passedTrials / totalTrials : 0;

  const passAtK =
    totalScenarios > 0
      ? results.filter((r) => r.passAtK > 0).length / totalScenarios
      : 0;

  const passToTheK =
    totalScenarios > 0
      ? results.filter((r) => r.passToTheK > 0).length / totalScenarios
      : 0;

  const totalCost = results.reduce(
    (sum, r) =>
      sum +
      r.trials.reduce((tSum, t) => tSum + t.taskResult.tokenUsage.estimatedCost, 0),
    0
  );

  const totalDuration = results.reduce(
    (sum, r) => sum + r.trials.reduce((tSum, t) => tSum + t.taskResult.duration, 0),
    0
  );

  const totalTokens = results.reduce(
    (sum, r) =>
      sum +
      r.trials.reduce((tSum, t) => tSum + t.taskResult.tokenUsage.totalTokens, 0),
    0
  );
  const avgTokensPerScenario = totalScenarios > 0 ? totalTokens / totalScenarios : 0;

  // Merge all aggregated scores across scenarios
  const allScoreNames = new Set<string>();
  for (const r of results) {
    for (const name of Object.keys(r.aggregatedScores)) {
      allScoreNames.add(name);
    }
  }

  const scoreSummaries: Record<string, AggregatedScore> = {};
  for (const name of allScoreNames) {
    const values = results
      .filter((r) => r.aggregatedScores[name])
      .map((r) => r.aggregatedScores[name]!.mean);

    if (values.length === 0) continue;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    scoreSummaries[name] = { name, mean, min, max, stddev };
  }

  return {
    totalScenarios,
    totalTrials,
    overallPassRate,
    passAtK,
    passToTheK,
    totalCost,
    totalDuration,
    avgTokensPerScenario,
    scoreSummaries,
  };
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
