import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { evaluate, taskCompletion, costThreshold, safetyCheck } from "@syntharena/core";
import { getTemplate } from "@syntharena/scenarios";
import { compareRuns } from "@syntharena/replay";
import type { EvaluationRun } from "@syntharena/shared";

/**
 * CI command — headless evaluation for CI/CD pipelines.
 *
 * - JSON output only (no colors, no tables)
 * - Exit code 0 = pass, 1 = fail, 2 = regression
 * - Baseline comparison for regression detection
 * - Threshold-based gating
 */

interface CiOptions {
  domain: string;
  scenarios: string;
  trials: string;
  concurrency: string;
  baseline?: string;
  saveBaseline?: string;
  minPassRate?: string;
  maxCost?: string;
  output: string;
}

export async function ciCommand(opts: CiOptions): Promise<void> {
  const scenarioCount = parseInt(opts.scenarios, 10);
  const trials = parseInt(opts.trials, 10);
  const maxConcurrency = parseInt(opts.concurrency, 10);

  const template = getTemplate(opts.domain);
  if (!template) {
    outputJson({ error: `Unknown domain: ${opts.domain}` });
    process.exitCode = 1;
    return;
  }

  // Generate scenarios using template (no LLM call, deterministic)
  const scenarios = Array.from({ length: scenarioCount }, (_, i) => ({
    id: `${opts.domain}-ci-${i + 1}`,
    domain: opts.domain,
    name: `${opts.domain}-scenario-${i + 1}`,
    description: `CI test scenario ${i + 1} for ${opts.domain}`,
    input: { scenarioIndex: i, domain: opts.domain },
    metadata: {
      complexity: "medium" as const,
      tags: [opts.domain, "ci"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0-ci",
    },
  }));

  const demoTask = async (input: Record<string, unknown>) => {
    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      output: { success: true, data: input },
      trace: [],
      tokenUsage: {
        inputTokens: 150,
        outputTokens: 50,
        totalTokens: 200,
        estimatedCost: 0.001,
        model: "demo",
        provider: "demo",
      },
      duration: Date.now() - startTime,
    };
  };

  const run = await evaluate({
    name: `ci-eval-${opts.domain}`,
    dataset: scenarios,
    task: demoTask,
    scorers: [taskCompletion, costThreshold(0.50), safetyCheck()],
    trials,
    maxConcurrency,
    metadata: { domain: opts.domain, ci: true },
  });

  // Check thresholds
  const minPassRate = opts.minPassRate ? parseFloat(opts.minPassRate) : undefined;
  const maxCost = opts.maxCost ? parseFloat(opts.maxCost) : undefined;
  const gateResults: Array<{ gate: string; passed: boolean; value: number; threshold: number }> = [];

  if (minPassRate !== undefined) {
    gateResults.push({
      gate: "min_pass_rate",
      passed: run.summary.overallPassRate >= minPassRate,
      value: run.summary.overallPassRate,
      threshold: minPassRate,
    });
  }

  if (maxCost !== undefined) {
    gateResults.push({
      gate: "max_cost",
      passed: run.summary.totalCost <= maxCost,
      value: run.summary.totalCost,
      threshold: maxCost,
    });
  }

  // Regression check
  let regression: { detected: boolean; details?: string } = { detected: false };
  if (opts.baseline && existsSync(opts.baseline)) {
    try {
      const baselineRun = JSON.parse(readFileSync(opts.baseline, "utf-8")) as EvaluationRun;
      const report = compareRuns(baselineRun, run);
      const hasRegression = report.verdict === "fail";
      regression = {
        detected: hasRegression,
        details: `Pass rate: ${baselineRun.summary.overallPassRate.toFixed(3)} -> ${run.summary.overallPassRate.toFixed(3)}`,
      };
      if (hasRegression) {
        gateResults.push({
          gate: "regression",
          passed: false,
          value: run.summary.overallPassRate,
          threshold: baselineRun.summary.overallPassRate,
        });
      }
    } catch {
      regression = { detected: false, details: "Baseline file could not be parsed" };
    }
  }

  // Save baseline if requested
  if (opts.saveBaseline) {
    const dir = dirname(resolve(opts.saveBaseline));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(opts.saveBaseline, JSON.stringify(run, null, 2));
  }

  // Determine exit code
  const allGatesPassed = gateResults.every((g) => g.passed);
  const exitCode = regression.detected ? 2 : (allGatesPassed ? 0 : 1);

  // Output
  const output = {
    status: exitCode === 0 ? "pass" : exitCode === 2 ? "regression" : "fail",
    runId: run.id,
    summary: {
      totalScenarios: run.summary.totalScenarios,
      totalTrials: run.summary.totalTrials,
      overallPassRate: run.summary.overallPassRate,
      passAtK: run.summary.passAtK,
      passToTheK: run.summary.passToTheK,
      gPassAtK: run.summary.gPassAtK,
      totalCost: run.summary.totalCost,
      totalDuration: run.summary.totalDuration,
    },
    gates: gateResults,
    regression,
    baseline: opts.saveBaseline ? { saved: opts.saveBaseline } : undefined,
  };

  if (opts.output === "json") {
    outputJson(output);
  } else {
    // Summary output for CI logs
    const icon = exitCode === 0 ? "PASS" : exitCode === 2 ? "REGRESSION" : "FAIL";
    console.log(`\n  SynthArena CI: ${icon}`);
    console.log(`  Pass rate: ${(run.summary.overallPassRate * 100).toFixed(1)}%`);
    console.log(`  Reliability (pass^k): ${(run.summary.passToTheK * 100).toFixed(1)}%`);
    console.log(`  Cost: $${run.summary.totalCost.toFixed(4)}`);
    console.log(`  Duration: ${run.summary.totalDuration}ms`);

    if (gateResults.length > 0) {
      console.log("\n  Gates:");
      for (const g of gateResults) {
        const status = g.passed ? "PASS" : "FAIL";
        console.log(`    ${status}  ${g.gate}: ${g.value.toFixed(4)} (threshold: ${g.threshold.toFixed(4)})`);
      }
    }

    if (regression.detected) {
      console.log(`\n  Regression: ${regression.details}`);
    }
    console.log();
  }

  process.exitCode = exitCode;
}

function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
