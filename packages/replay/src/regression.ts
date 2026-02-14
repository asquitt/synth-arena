import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { EvaluationRun, ScenarioResult } from "@syntharena/shared";

/**
 * Replay and regression testing engine.
 *
 * Re-run agents against identical scenarios after code changes.
 * Detect behavioral, outcome, cost, and safety regressions.
 */

export interface RegressionReport {
  baselineRunId: string;
  currentRunId: string;
  timestamp: string;
  verdict: "pass" | "fail" | "warning";
  summary: RegressionSummary;
  scenarioDetails: ScenarioRegression[];
}

export interface RegressionSummary {
  passRateDelta: number; // positive = improvement
  passAtKDelta: number;
  passToTheKDelta: number;
  gPassAtKDelta: number;
  costDelta: number; // positive = more expensive
  costDeltaPercent: number;
  latencyDelta: number;
  newFailures: number;
  fixedFailures: number;
  safetyRegressions: number;
}

export interface ScenarioRegression {
  scenarioId: string;
  status: "improved" | "regressed" | "unchanged" | "new" | "removed";
  baseline: ScenarioSnapshot | null;
  current: ScenarioSnapshot | null;
  deltas: Record<string, number>;
}

export interface ScenarioSnapshot {
  passRate: number;
  avgScore: number;
  avgCost: number;
  avgDuration: number;
  trialCount: number;
}

/**
 * Compare two evaluation runs and produce a regression report.
 */
export function compareRuns(baseline: EvaluationRun, current: EvaluationRun): RegressionReport {
  const baselineMap = new Map(baseline.results.map((r) => [r.scenarioId, r]));
  const currentMap = new Map(current.results.map((r) => [r.scenarioId, r]));

  const allScenarioIds = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const scenarioDetails: ScenarioRegression[] = [];
  let newFailures = 0;
  let fixedFailures = 0;
  let safetyRegressions = 0;

  for (const scenarioId of allScenarioIds) {
    const baseResult = baselineMap.get(scenarioId);
    const currResult = currentMap.get(scenarioId);

    const baseSnapshot = baseResult ? snapshotFromResult(baseResult) : null;
    const currSnapshot = currResult ? snapshotFromResult(currResult) : null;

    let status: ScenarioRegression["status"];
    const deltas: Record<string, number> = {};

    if (!baseResult) {
      status = "new";
    } else if (!currResult) {
      status = "removed";
    } else {
      deltas["passRate"] = currSnapshot!.passRate - baseSnapshot!.passRate;
      deltas["avgScore"] = currSnapshot!.avgScore - baseSnapshot!.avgScore;
      deltas["avgCost"] = currSnapshot!.avgCost - baseSnapshot!.avgCost;
      deltas["avgDuration"] = currSnapshot!.avgDuration - baseSnapshot!.avgDuration;

      if (deltas["passRate"]! > 0.01) {
        status = "improved";
        if (baseSnapshot!.passRate === 0 && currSnapshot!.passRate > 0) fixedFailures++;
      } else if (deltas["passRate"]! < -0.01) {
        status = "regressed";
        if (baseSnapshot!.passRate > 0 && currSnapshot!.passRate === 0) newFailures++;
      } else {
        status = "unchanged";
      }

      // Check safety: if any trial had safety scores that regressed
      const baseSafetyPassed = baseResult.trials.every((t) =>
        t.scores.filter((s) => s.name.includes("safety")).every((s) => s.passed)
      );
      const currSafetyPassed = currResult.trials.every((t) =>
        t.scores.filter((s) => s.name.includes("safety")).every((s) => s.passed)
      );
      if (baseSafetyPassed && !currSafetyPassed) safetyRegressions++;
    }

    scenarioDetails.push({ scenarioId, status, baseline: baseSnapshot, current: currSnapshot, deltas });
  }

  const summary: RegressionSummary = {
    passRateDelta: current.summary.overallPassRate - baseline.summary.overallPassRate,
    passAtKDelta: current.summary.passAtK - baseline.summary.passAtK,
    passToTheKDelta: current.summary.passToTheK - baseline.summary.passToTheK,
    gPassAtKDelta: current.summary.gPassAtK - baseline.summary.gPassAtK,
    costDelta: current.summary.totalCost - baseline.summary.totalCost,
    costDeltaPercent: baseline.summary.totalCost > 0
      ? ((current.summary.totalCost - baseline.summary.totalCost) / baseline.summary.totalCost) * 100
      : 0,
    latencyDelta: current.summary.totalDuration - baseline.summary.totalDuration,
    newFailures,
    fixedFailures,
    safetyRegressions,
  };

  // Determine verdict
  let verdict: RegressionReport["verdict"];
  if (safetyRegressions > 0) verdict = "fail";
  else if (summary.passRateDelta < -0.05 || newFailures > 0) verdict = "fail";
  else if (summary.passRateDelta < 0 || summary.costDeltaPercent > 20) verdict = "warning";
  else verdict = "pass";

  return {
    baselineRunId: baseline.id,
    currentRunId: current.id,
    timestamp: new Date().toISOString(),
    verdict,
    summary,
    scenarioDetails,
  };
}

function snapshotFromResult(result: ScenarioResult): ScenarioSnapshot {
  const passedTrials = result.trials.filter((t) => t.passed).length;
  const scores = result.trials.flatMap((t) => t.scores.map((s) => s.score));
  const costs = result.trials.map((t) => t.taskResult.tokenUsage.estimatedCost);
  const durations = result.trials.map((t) => t.taskResult.duration);

  return {
    passRate: result.trials.length > 0 ? passedTrials / result.trials.length : 0,
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    avgCost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
    avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    trialCount: result.trials.length,
  };
}

/**
 * Save an evaluation run as a baseline for future regression testing.
 */
export function saveBaseline(run: EvaluationRun, filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(run, null, 2), "utf-8");
}

/**
 * Load a saved baseline.
 */
export function loadBaseline(filePath: string): EvaluationRun {
  if (!existsSync(filePath)) {
    throw new Error(`Baseline not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8")) as EvaluationRun;
}

/**
 * Format regression report for CLI output.
 */
export function formatRegressionReport(report: RegressionReport): string {
  const { summary, verdict } = report;
  const verdictIcon = verdict === "pass" ? "PASS" : verdict === "warning" ? "WARN" : "FAIL";

  const lines: string[] = [
    `Regression Report [${verdictIcon}]`,
    `════════════════════════════════`,
    `Baseline: ${report.baselineRunId}`,
    `Current:  ${report.currentRunId}`,
    ``,
    `Pass Rate:    ${formatDelta(summary.passRateDelta * 100, "%")}`,
    `pass@k:       ${formatDelta(summary.passAtKDelta * 100, "%")}`,
    `pass^k:       ${formatDelta(summary.passToTheKDelta * 100, "%")}`,
    `G-pass@k:     ${formatDelta(summary.gPassAtKDelta * 100, "%")}`,
    `Cost:         ${formatDelta(summary.costDelta, "$", true)} (${formatDelta(summary.costDeltaPercent, "%", true)})`,
    `New failures: ${summary.newFailures}`,
    `Fixed:        ${summary.fixedFailures}`,
    `Safety:       ${summary.safetyRegressions > 0 ? `${summary.safetyRegressions} REGRESSIONS` : "clean"}`,
  ];

  // Show regressed scenarios
  const regressed = report.scenarioDetails.filter((s) => s.status === "regressed");
  if (regressed.length > 0) {
    lines.push("", `Regressed Scenarios (${regressed.length}):`);
    for (const s of regressed.slice(0, 10)) {
      lines.push(`  ${s.scenarioId}: pass rate ${formatDelta((s.deltas["passRate"] ?? 0) * 100, "%")}`);
    }
  }

  // Show improved scenarios
  const improved = report.scenarioDetails.filter((s) => s.status === "improved");
  if (improved.length > 0) {
    lines.push("", `Improved Scenarios (${improved.length}):`);
    for (const s of improved.slice(0, 5)) {
      lines.push(`  ${s.scenarioId}: pass rate ${formatDelta((s.deltas["passRate"] ?? 0) * 100, "%")}`);
    }
  }

  return lines.join("\n");
}

function formatDelta(value: number, suffix: string, inverse = false): string {
  const sign = value > 0 ? "+" : "";
  const isGood = inverse ? value <= 0 : value >= 0;
  const indicator = isGood ? "" : " !!";
  return `${sign}${value.toFixed(2)}${suffix}${indicator}`;
}
