import { watch } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { evaluate, taskCompletion, costThreshold, safetyCheck, createAgent } from "@syntharena/core";
import type { EvaluationRun, Scorer } from "@syntharena/shared";
import { generateDemoScenarios } from "../demo.js";
import { loadConfig, type ScorerConfig } from "../config.js";

interface RunOptions {
  domain: string;
  scenarios: string;
  trials: string;
  concurrency: string;
  config?: string;
  output: string;
  watch?: boolean;
}

function buildScorers(configs: ScorerConfig[]): Scorer[] {
  const scorers: Scorer[] = [];
  for (const cfg of configs) {
    if (typeof cfg === "string") {
      if (cfg === "task_completion") scorers.push(taskCompletion);
      else if (cfg === "safety_check") scorers.push(safetyCheck());
    } else {
      const [name, params] = Object.entries(cfg)[0]!;
      if (name === "cost_threshold" && typeof params === "object" && params && "max" in params) {
        scorers.push(costThreshold(params["max"] as number));
      } else if (name === "safety_check") {
        scorers.push(safetyCheck());
      }
    }
  }
  return scorers.length > 0 ? scorers : [taskCompletion, costThreshold(1.0)];
}

export async function runCommand(opts: RunOptions): Promise<void> {
  // Load config file if specified (or auto-detect syntharena.yaml)
  const configPath = opts.config ?? "syntharena.yaml";
  const config = opts.config ? loadConfig(configPath) : loadConfig(configPath);

  const domain = config?.domain ?? opts.domain;
  const scenarioCount = config?.scenarios ?? parseInt(opts.scenarios, 10);
  const trialCount = config?.trials ?? parseInt(opts.trials, 10);
  const concurrency = config?.concurrency ?? parseInt(opts.concurrency, 10);
  const outputFormat = config?.output?.format ?? opts.output;
  const scorers = config ? buildScorers(config.scorers) : [taskCompletion, costThreshold(1.0)];

  console.log(chalk.bold("\n  SynthArena Evaluation\n"));
  if (config && opts.config) {
    console.log(`  Config:      ${chalk.dim(configPath)}`);
  }
  console.log(`  Domain:      ${chalk.cyan(domain)}`);
  console.log(`  Scenarios:   ${chalk.cyan(String(scenarioCount))}`);
  console.log(`  Trials:      ${chalk.cyan(String(trialCount))}`);
  console.log(`  Concurrency: ${chalk.cyan(String(concurrency))}`);
  console.log();

  // Generate demo scenarios
  const spinner = ora("Generating scenarios...").start();
  const scenarios = generateDemoScenarios(domain, scenarioCount);
  spinner.succeed(`Generated ${scenarios.length} scenarios`);

  // Create agent — uses real LLM if ANTHROPIC_API_KEY or OPENAI_API_KEY is set
  const agentProvider = process.env.ANTHROPIC_API_KEY ? "anthropic"
    : process.env.OPENAI_API_KEY ? "openai"
    : "demo";
  const task = createAgent({
    provider: agentProvider === "demo" ? "demo" : agentProvider,
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
    model: config?.model,
    systemPrompt: config?.systemPrompt ?? `You are an AI agent being evaluated on ${domain} tasks. Complete the task described in the input.`,
    buildPrompt: (input) => `Complete this ${domain} task:\n\n${JSON.stringify(input, null, 2)}`,
  });

  if (agentProvider === "demo") {
    console.log(chalk.dim("  Agent: demo (set ANTHROPIC_API_KEY or OPENAI_API_KEY for real agent)"));
  } else {
    console.log(`  Agent:       ${chalk.green(agentProvider)} (${config?.model ?? "default model"})`);
  }
  console.log();

  const evalSpinner = ora("Running evaluation...").start();

  const run = await evaluate({
    name: `${domain}-eval-${Date.now()}`,
    dataset: scenarios,
    task,
    scorers,
    trials: trialCount,
    maxConcurrency: concurrency,
  });

  evalSpinner.succeed("Evaluation complete");

  // Display results
  if (outputFormat === "json") {
    console.log(JSON.stringify(run, null, 2));
  } else {
    printTable(run);
  }

  // Watch mode: re-run on config file changes
  if (opts.watch) {
    const watchPath = opts.config ?? "syntharena.yaml";
    console.log(chalk.dim(`\n  Watching ${watchPath} for changes... (Ctrl+C to stop)\n`));

    let debounce: ReturnType<typeof setTimeout> | null = null;
    watch(watchPath, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log(chalk.yellow(`\n  Config changed, re-running evaluation...\n`));
        runCommand({ ...opts, watch: false }).catch(console.error);
      }, 500);
    });

    // Keep process alive
    await new Promise(() => {});
  }
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
