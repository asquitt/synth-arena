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
  const gPassAtK = computeGPassAtK(trials);

  return {
    scenarioId: scenario.id,
    trials,
    aggregatedScores,
    passAtK,
    passToTheK,
    gPassAtK,
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
 * pass@k: Unbiased estimator from the Codex paper (Chen et al. 2021).
 * Probability of at least one success when sampling k solutions from n attempts.
 * Formula: 1 - C(n-c, k) / C(n, k) where c = number of correct solutions.
 * Measures capability -- "can the agent ever solve this?"
 */
function computePassAtK(trials: TrialResult[]): number {
  const n = trials.length;
  if (n === 0) return 0;
  const c = trials.filter((t) => t.passed).length;
  if (c === 0) return 0;
  if (c === n) return 1;
  // Unbiased estimator: 1 - C(n-c, k) / C(n, k) where k = n (we use all trials)
  // For k = n, this simplifies to: c > 0 ? 1 : 0
  // For a more useful metric, compute the estimated probability of success per trial
  // and report the probability of at least 1 success in k=n trials
  const p = c / n;
  return 1 - Math.pow(1 - p, n);
}

/**
 * pass^k: probability of all k trials succeeding.
 * Measures reliability -- "does the agent always solve this?"
 * Based on the observed success rate p = c/n, estimates P(all k succeed) = p^k.
 */
function computePassToTheK(trials: TrialResult[]): number {
  const n = trials.length;
  if (n === 0) return 0;
  const c = trials.filter((t) => t.passed).length;
  if (c === n) return 1;
  if (c === 0) return 0;
  const p = c / n;
  return Math.pow(p, n);
}

/**
 * G-Pass@k (Generalized Pass@k): Measures consistency across attempts.
 * From LiveMathBench. Instead of "at least 1 success", measures the
 * probability of getting t or more successes in k attempts.
 * Default threshold t = ceil(k * 0.5) (majority of attempts must succeed).
 */
export function computeGPassAtK(trials: TrialResult[], threshold?: number): number {
  const n = trials.length;
  if (n === 0) return 0;
  const c = trials.filter((t) => t.passed).length;
  const t = threshold ?? Math.ceil(n * 0.5);
  if (c >= t) return 1;
  // Estimate probability using binomial CDF
  const p = c / n;
  // P(X >= t) = 1 - P(X < t) = 1 - sum_{i=0}^{t-1} C(n,i) * p^i * (1-p)^(n-i)
  let cumulativeProb = 0;
  for (let i = 0; i < t; i++) {
    cumulativeProb += binomialPmf(n, i, p);
  }
  return 1 - cumulativeProb;
}

function binomialPmf(n: number, k: number, p: number): number {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return binomialCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

function binomialCoeff(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i;
  }
  return result;
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

  const gPassAtK =
    totalScenarios > 0
      ? results.reduce((sum, r) => sum + r.gPassAtK, 0) / totalScenarios
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
    gPassAtK,
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
