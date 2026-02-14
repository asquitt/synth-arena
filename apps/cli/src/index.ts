#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { runCommand } from "./commands/run.js";
import { arenaCommand } from "./commands/arena.js";
import { generateCommand } from "./commands/generate.js";
import { domainsCommand } from "./commands/domains.js";

const program = new Command();

program
  .name("synth-arena")
  .description("Pre-deployment simulation platform for AI agents")
  .version("0.1.0");

program
  .command("run")
  .description("Generate scenarios and evaluate an agent")
  .requiredOption("-d, --domain <domain>", "Domain template (web-scraping, government, healthcare)")
  .option("-s, --scenarios <count>", "Number of scenarios to generate", "10")
  .option("-t, --trials <count>", "Trials per scenario", "1")
  .option("-c, --concurrency <count>", "Max concurrent evaluations", "5")
  .option("--config <path>", "Path to evaluation config file")
  .option("--output <format>", "Output format (table, json, csv)", "table")
  .action(runCommand);

program
  .command("arena")
  .description("Head-to-head comparison of agent implementations")
  .requiredOption("-a, --agents <names>", "Comma-separated agent names")
  .option("-s, --scenarios <count>", "Number of scenarios", "10")
  .option("-t, --trials <count>", "Trials per matchup", "1")
  .option("-d, --domain <domain>", "Domain template", "web-scraping")
  .option("--output <format>", "Output format (table, json)", "table")
  .action(arenaCommand);

program
  .command("generate")
  .description("Generate scenarios for a domain (requires ANTHROPIC_API_KEY)")
  .requiredOption("-d, --domain <domain>", "Domain template")
  .option("-s, --scenarios <count>", "Number of scenarios to generate", "10")
  .option("--complexity <level>", "Force complexity level (low, medium, high, adversarial)")
  .option("-o, --output <path>", "Export scenarios to JSON file")
  .option("--quality", "Run quality validation on generated scenarios", false)
  .option("--domains-dir <path>", "Custom domains directory")
  .action(generateCommand);

program
  .command("domains")
  .description("List available domain templates")
  .option("--domains-dir <path>", "Custom domains directory")
  .option("--validate", "Validate all templates", false)
  .action(domainsCommand);

program
  .command("replay")
  .description("Replay a previous evaluation run")
  .requiredOption("--trace-id <id>", "Trace ID to replay")
  .option("--compare", "Compare with original run")
  .action(() => {
    console.log(chalk.yellow("Replay engine coming in Phase 4"));
  });

program
  .command("cost")
  .description("Estimate costs for an evaluation run")
  .requiredOption("-d, --domain <domain>", "Domain template")
  .option("-s, --scenarios <count>", "Number of scenarios", "100")
  .option("-t, --trials <count>", "Trials per scenario", "3")
  .option("-m, --model <model>", "Model to estimate for", "claude-sonnet-4-20250514")
  .action(() => {
    console.log(chalk.yellow("Cost modeling engine coming in Phase 3"));
  });

program.parse();
