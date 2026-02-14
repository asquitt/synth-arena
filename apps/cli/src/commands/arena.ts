import chalk from "chalk";
import ora from "ora";
import { runArena, taskCompletion } from "@syntharena/core";
import type { TaskResult, ArenaResult } from "@syntharena/shared";
import { generateDemoScenarios } from "../demo.js";

interface ArenaOptions {
  agents: string;
  scenarios: string;
  trials: string;
  domain: string;
  output: string;
}

export async function arenaCommand(opts: ArenaOptions): Promise<void> {
  const agentNames = opts.agents.split(",").map((n) => n.trim());
  const scenarioCount = parseInt(opts.scenarios, 10);
  const trialCount = parseInt(opts.trials, 10);

  console.log(chalk.bold("\n  SynthArena - Arena Mode\n"));
  console.log(`  Agents:    ${chalk.cyan(agentNames.join(", "))}`);
  console.log(`  Domain:    ${chalk.cyan(opts.domain)}`);
  console.log(`  Scenarios: ${chalk.cyan(String(scenarioCount))}`);
  console.log(`  Trials:    ${chalk.cyan(String(trialCount))}`);
  console.log();

  const spinner = ora("Generating scenarios...").start();
  const scenarios = generateDemoScenarios(opts.domain, scenarioCount);
  spinner.succeed(`Generated ${scenarios.length} scenarios`);

  const arenaSpinner = ora("Running arena matchups...").start();

  // Create demo agents with varying quality
  const agents = agentNames.map((name, i) => ({
    name,
    task: createDemoAgent(name, i),
  }));

  const result = await runArena({
    agents,
    scenarios,
    scorers: [taskCompletion],
    trials: trialCount,
  });

  arenaSpinner.succeed("Arena complete");

  if (opts.output === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printArenaTable(result);
  }
}

function createDemoAgent(_name: string, index: number): (input: Record<string, unknown>) => Promise<TaskResult> {
  // Each agent has slightly different "quality" for demo purposes
  const successRate = 0.7 + index * 0.1;

  return async (input: Record<string, unknown>): Promise<TaskResult> => {
    const succeeded = Math.random() < successRate;

    return {
      output: succeeded ? { processed: true, ...input } : null,
      trace: [
        {
          id: `agent-${index}-span`,
          name: "agent_task",
          type: "llm_call",
          startTime: Date.now(),
          endTime: Date.now() + 50 + index * 20,
          attributes: { model: `agent-${index}` },
          events: [],
          status: succeeded ? "ok" : "error",
        },
      ],
      tokenUsage: {
        inputTokens: 100 + index * 50,
        outputTokens: 50 + index * 25,
        totalTokens: 150 + index * 75,
        estimatedCost: 0.001 + index * 0.0005,
        model: `agent-${index}`,
        provider: "demo",
      },
      duration: 50 + index * 20,
    };
  };
}

function printArenaTable(result: ArenaResult): void {
  console.log(chalk.bold("\n  Arena Rankings\n"));

  const header = `  ${"Rank".padEnd(6)}${"Agent".padEnd(20)}${"Elo".padEnd(8)}${"W".padEnd(5)}${"L".padEnd(5)}${"D".padEnd(5)}${"Avg Score".padEnd(12)}${"Avg Cost".padEnd(10)}`;
  console.log(chalk.dim(header));
  console.log(chalk.dim("  " + "─".repeat(header.length - 2)));

  result.agents.forEach((agent, i) => {
    const rank = `#${i + 1}`.padEnd(6);
    const name = agent.agentName.padEnd(20);
    const elo = String(agent.elo).padEnd(8);
    const wins = String(agent.wins).padEnd(5);
    const losses = String(agent.losses).padEnd(5);
    const draws = String(agent.draws).padEnd(5);
    const avgScore = `${(agent.avgScore * 100).toFixed(1)}%`.padEnd(12);
    const avgCost = `$${agent.avgCost.toFixed(4)}`.padEnd(10);

    const color = i === 0 ? chalk.green : i === result.agents.length - 1 ? chalk.red : chalk.white;
    console.log(color(`  ${rank}${name}${elo}${wins}${losses}${draws}${avgScore}${avgCost}`));
  });

  console.log(`\n  Total matchups: ${result.matchups.length}\n`);
}
