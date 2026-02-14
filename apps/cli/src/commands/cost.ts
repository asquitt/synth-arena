import chalk from "chalk";
import { estimateCost, generateCostRecommendations, MODEL_PRICING } from "@syntharena/cost";

interface CostOptions {
  domain: string;
  scenarios: string;
  trials: string;
  model: string;
  callsPerScenario?: string;
  cacheRate?: string;
}

export async function costCommand(opts: CostOptions): Promise<void> {
  const scenarioCount = parseInt(opts.scenarios, 10);
  const trials = parseInt(opts.trials, 10);
  const callsPerScenario = parseInt(opts.callsPerScenario ?? "3", 10);
  const cacheRate = parseFloat(opts.cacheRate ?? "0");

  const pricing = MODEL_PRICING.find((p) => p.model === opts.model);
  if (!pricing) {
    console.log(chalk.red(`Unknown model: ${opts.model}`));
    console.log(chalk.gray(`Available models: ${MODEL_PRICING.map((p) => p.model).join(", ")}`));
    return;
  }

  console.log(chalk.bold("\nSynthArena Cost Estimator\n"));
  console.log(chalk.gray(`Domain:     ${opts.domain}`));
  console.log(chalk.gray(`Model:      ${opts.model} (${pricing.provider})`));
  console.log(chalk.gray(`Scenarios:  ${scenarioCount}`));
  console.log(chalk.gray(`Trials:     ${trials}`));
  console.log(chalk.gray(`Calls/scen: ${callsPerScenario}`));
  if (cacheRate > 0) console.log(chalk.gray(`Cache rate: ${(cacheRate * 100).toFixed(0)}%`));
  console.log();

  try {
    const estimate = estimateCost({
      model: opts.model,
      scenarioCount,
      trialsPerScenario: trials,
      avgInputTokensPerCall: 2000,
      avgOutputTokensPerCall: 500,
      avgCallsPerScenario: callsPerScenario,
      cacheHitRate: cacheRate || undefined,
    });

    // Cost breakdown table
    console.log(chalk.bold("Cost Breakdown"));
    console.log("─".repeat(60));

    for (const item of estimate.breakdown) {
      const tokens = item.inputTokens + item.outputTokens;
      console.log(
        `  ${item.category.padEnd(30)} ${formatTokens(tokens).padStart(12)}  ${chalk.green(`$${item.cost.toFixed(4)}`.padStart(10))}  ${chalk.gray(`${item.percentage.toFixed(1)}%`)}`
      );
    }

    console.log("─".repeat(60));
    console.log(
      chalk.bold(
        `  ${"Total".padEnd(30)} ${formatTokens(estimate.estimatedInputTokens + estimate.estimatedOutputTokens).padStart(12)}  ${chalk.green(`$${estimate.estimatedCost.toFixed(4)}`.padStart(10))}`
      )
    );

    // Per-scenario cost
    const perScenario = estimate.estimatedCost / scenarioCount;
    console.log(chalk.gray(`\n  Per scenario: $${perScenario.toFixed(4)}`));
    console.log(chalk.gray(`  Per trial:    $${(estimate.estimatedCost / (scenarioCount * trials)).toFixed(4)}`));

    // Recommendations
    const recommendations = generateCostRecommendations(estimate);
    if (recommendations.length > 0) {
      console.log(chalk.bold("\nOptimization Recommendations"));
      console.log("─".repeat(60));
      for (const rec of recommendations) {
        console.log(`  ${chalk.yellow("→")} ${rec.description}`);
        console.log(chalk.green(`    Saves ~$${rec.estimatedSavings.toFixed(4)} (${rec.estimatedSavingsPercent.toFixed(1)}%)`));
      }
    }

    // Model comparison
    console.log(chalk.bold("\nModel Comparison (same workload)"));
    console.log("─".repeat(60));

    const comparisons = MODEL_PRICING
      .map((p) => {
        try {
          const est = estimateCost({
            model: p.model,
            scenarioCount,
            trialsPerScenario: trials,
            avgInputTokensPerCall: 2000,
            avgOutputTokensPerCall: 500,
            avgCallsPerScenario: callsPerScenario,
          });
          return { model: p.model, provider: p.provider, cost: est.estimatedCost };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ model: string; provider: string; cost: number }>;

    comparisons.sort((a, b) => a.cost - b.cost);

    for (const comp of comparisons) {
      const isCurrent = comp.model === opts.model;
      const marker = isCurrent ? chalk.cyan(" ◄ selected") : "";
      const costStr = `$${comp.cost.toFixed(4)}`;
      console.log(
        `  ${comp.model.padEnd(35)} ${chalk.green(costStr.padStart(10))}  ${chalk.gray(comp.provider)}${marker}`
      );
    }

    console.log();
  } catch (err) {
    console.log(chalk.red(err instanceof Error ? err.message : "Cost estimation failed"));
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}
