import chalk from "chalk";
import ora from "ora";
import { evaluate, taskCompletion, costThreshold } from "@syntharena/core";
import type { TaskResult, EvaluationRun } from "@syntharena/shared";
import { generateDemoScenarios } from "../demo.js";

interface RunOptions {
  domain: string;
  scenarios: string;
  trials: string;
  concurrency: string;
  config?: string;
  output: string;
}

export async function runCommand(opts: RunOptions): Promise<void> {
  const scenarioCount = parseInt(opts.scenarios, 10);
  const trialCount = parseInt(opts.trials, 10);
  const concurrency = parseInt(opts.concurrency, 10);

  console.log(chalk.bold("\n  SynthArena Evaluation\n"));
  console.log(`  Domain:      ${chalk.cyan(opts.domain)}`);
  console.log(`  Scenarios:   ${chalk.cyan(String(scenarioCount))}`);
  console.log(`  Trials:      ${chalk.cyan(String(trialCount))}`);
  console.log(`  Concurrency: ${chalk.cyan(String(concurrency))}`);
  console.log();

  // Generate demo scenarios
  const spinner = ora("Generating scenarios...").start();
  const scenarios = generateDemoScenarios(opts.domain, scenarioCount);
  spinner.succeed(`Generated ${scenarios.length} scenarios`);

  // Run evaluation with a demo task (echo agent)
  const evalSpinner = ora("Running evaluation...").start();

  const run = await evaluate({
    name: `${opts.domain}-eval-${Date.now()}`,
    dataset: scenarios,
    task: demoTask,
    scorers: [taskCompletion, costThreshold(1.0)],
    trials: trialCount,
    maxConcurrency: concurrency,
  });

  evalSpinner.succeed("Evaluation complete");

  // Display results
  if (opts.output === "json") {
    console.log(JSON.stringify(run, null, 2));
  } else {
    printTable(run);
  }
}

/**
 * Demo task that echoes input. Replace with real agent integration.
 */
async function demoTask(input: Record<string, unknown>): Promise<TaskResult> {
  return {
    output: { processed: true, ...input },
    trace: [
      {
        id: "demo-span",
        name: "demo_task",
        type: "llm_call",
        startTime: Date.now(),
        endTime: Date.now() + 50,
        attributes: { model: "demo" },
        events: [],
        status: "ok",
      },
    ],
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.001,
      model: "demo",
      provider: "demo",
    },
    duration: 50,
  };
}

function printTable(run: EvaluationRun): void {
  const { summary } = run;

  console.log(chalk.bold("\n  Results\n"));

  const passColor = summary.overallPassRate >= 0.9
    ? chalk.green
    : summary.overallPassRate >= 0.7
      ? chalk.yellow
      : chalk.red;

  console.log(`  Pass Rate:        ${passColor(`${(summary.overallPassRate * 100).toFixed(1)}%`)}`);
  console.log(`  pass@k:           ${chalk.cyan(`${(summary.passAtK * 100).toFixed(1)}%`)}`);
  console.log(`  pass^k:           ${chalk.cyan(`${(summary.passToTheK * 100).toFixed(1)}%`)}`);
  console.log(`  G-pass@k:         ${chalk.cyan(`${(summary.gPassAtK * 100).toFixed(1)}%`)}`);
  console.log(`  Total Cost:       ${chalk.yellow(`$${summary.totalCost.toFixed(4)}`)}`);
  console.log(`  Avg Tokens:       ${chalk.dim(String(Math.round(summary.avgTokensPerScenario)))}`);
  console.log(`  Total Duration:   ${chalk.dim(`${summary.totalDuration}ms`)}`);
  console.log(`  Scenarios:        ${summary.totalScenarios}`);
  console.log(`  Trials:           ${summary.totalTrials}`);

  // Score breakdown
  if (Object.keys(summary.scoreSummaries).length > 0) {
    console.log(chalk.bold("\n  Score Breakdown\n"));
    for (const [name, score] of Object.entries(summary.scoreSummaries)) {
      const bar = "█".repeat(Math.round(score.mean * 20)) + "░".repeat(20 - Math.round(score.mean * 20));
      console.log(`  ${name.padEnd(20)} ${bar} ${(score.mean * 100).toFixed(1)}% (stddev: ${score.stddev.toFixed(3)})`);
    }
  }

  console.log();
}
