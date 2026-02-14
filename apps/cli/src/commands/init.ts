import { writeFileSync, existsSync } from "fs";
import chalk from "chalk";

const TEMPLATE = `# SynthArena Configuration
# Docs: https://syntharena.dev/docs/config

# Domain to generate scenarios for
domain: web-scraping

# Number of scenarios to generate
scenarios: 20

# Trials per scenario (higher = more reliable metrics)
trials: 3

# Maximum concurrent evaluations
concurrency: 5

# Model used by the agent being tested
model: claude-sonnet-4-20250514

# Scorers to run on each trial
scorers:
  - task_completion
  - cost_threshold:
      max: 0.50
  - safety_check

# Cost estimation settings
cost:
  avg_calls_per_scenario: 3
  cache_hit_rate: 0.0

# Regression testing
regression:
  baseline_path: .syntharena/baselines/latest.json
  fail_on_regression: true

# Output settings
output:
  format: table  # table, json, csv
  save_results: true
  results_dir: .syntharena/results
`;

export async function initCommand() {
  const configPath = "syntharena.yaml";

  if (existsSync(configPath)) {
    console.log(chalk.yellow(`\n  ${configPath} already exists. Remove it first to re-initialize.\n`));
    return;
  }

  writeFileSync(configPath, TEMPLATE, "utf-8");

  console.log(chalk.green(`\n  Created ${configPath}\n`));
  console.log(chalk.gray("  Edit the config, then run:"));
  console.log(chalk.cyan("  $ synth-arena run --config syntharena.yaml\n"));
  console.log(chalk.gray("  Available domains:"));
  console.log(chalk.white("    web-scraping  government  healthcare\n"));
}
