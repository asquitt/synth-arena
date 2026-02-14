import chalk from "chalk";
import { loadBaseline, compareRuns, formatRegressionReport, saveBaseline } from "@syntharena/replay";
import { evaluate, taskCompletion, costThreshold, safetyCheck } from "@syntharena/core";
import { generateDemoScenarios } from "../demo.js";

interface ReplayOptions {
  baselinePath: string;
  domain?: string;
  scenarios?: string;
  trials?: string;
  saveBaseline?: string;
}

export async function replayCommand(opts: ReplayOptions): Promise<void> {
  console.log(chalk.bold("\nSynthArena Replay & Regression Engine\n"));

  // If --save-baseline is specified, run an evaluation and save it as baseline
  if (opts.saveBaseline) {
    const domain = opts.domain ?? "web-scraping";
    const scenarioCount = parseInt(opts.scenarios ?? "10", 10);
    const trials = parseInt(opts.trials ?? "1", 10);

    console.log(chalk.gray(`Creating baseline for domain: ${domain}`));
    console.log(chalk.gray(`Scenarios: ${scenarioCount}, Trials: ${trials}\n`));

    const scenarios = generateDemoScenarios(domain, scenarioCount);

    const demoTask = async (input: Record<string, unknown>) => {
      const startTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        output: { success: true, data: input },
        trace: [],
        tokenUsage: {
          inputTokens: 150, outputTokens: 50, totalTokens: 200,
          estimatedCost: 0.001, model: "demo", provider: "demo",
        },
        duration: Date.now() - startTime,
      };
    };

    const run = await evaluate({
      name: `baseline-${domain}`,
      dataset: scenarios,
      task: demoTask,
      scorers: [taskCompletion, costThreshold(0.50), safetyCheck()],
      trials,
    });

    saveBaseline(run, opts.saveBaseline);
    console.log(chalk.green(`Baseline saved to ${opts.saveBaseline}`));
    console.log(chalk.gray(`Run ID: ${run.id}`));
    console.log(chalk.gray(`Pass rate: ${(run.summary.overallPassRate * 100).toFixed(1)}%`));
    console.log(chalk.gray(`pass@k: ${(run.summary.passAtK * 100).toFixed(1)}%`));
    console.log(chalk.gray(`pass^k: ${(run.summary.passToTheK * 100).toFixed(1)}%`));
    return;
  }

  // Otherwise, compare against an existing baseline
  try {
    console.log(chalk.gray(`Loading baseline from: ${opts.baselinePath}`));
    const baseline = loadBaseline(opts.baselinePath);
    console.log(chalk.gray(`Baseline run: ${baseline.id} (${baseline.results.length} scenarios)\n`));

    // Run current evaluation
    const domain = opts.domain ?? "web-scraping";
    const scenarioCount = baseline.results.length;
    const trials = parseInt(opts.trials ?? "1", 10);

    console.log(chalk.gray(`Running current evaluation (${scenarioCount} scenarios, ${trials} trials)...\n`));

    const scenarios = generateDemoScenarios(domain, scenarioCount);

    const demoTask = async (input: Record<string, unknown>) => {
      const startTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Simulate slight variation to show regression detection
      const success = Math.random() > 0.15;
      return {
        output: success ? { success: true, data: input } : { success: false, error: "simulated failure" },
        trace: [],
        tokenUsage: {
          inputTokens: 150, outputTokens: 50, totalTokens: 200,
          estimatedCost: 0.001, model: "demo", provider: "demo",
        },
        duration: Date.now() - startTime,
      };
    };

    const currentRun = await evaluate({
      name: `current-${domain}`,
      dataset: scenarios,
      task: demoTask,
      scorers: [taskCompletion, costThreshold(0.50), safetyCheck()],
      trials,
    });

    // Compare
    const report = compareRuns(baseline, currentRun);
    console.log(formatRegressionReport(report));

    // Exit with non-zero code on failure (for CI/CD)
    if (report.verdict === "fail") {
      process.exitCode = 1;
    }
  } catch (err) {
    console.log(chalk.red(err instanceof Error ? err.message : "Replay failed"));
    process.exitCode = 1;
  }
}
