import chalk from "chalk";
import ora from "ora";
import type { Scenario, ScenarioMetadata } from "@syntharena/shared";
import {
  loadTemplate,
  generateScenarios,
  validateScenarioQuality,
  formatQualityReport,
  exportScenarios,
} from "@syntharena/scenarios";

interface GenerateOptions {
  domain: string;
  scenarios: string;
  complexity?: string;
  output?: string;
  quality: boolean;
  domainsDir?: string;
}

export async function generateCommand(opts: GenerateOptions): Promise<void> {
  const count = parseInt(opts.scenarios, 10);

  console.log(chalk.bold("\n  SynthArena - Scenario Generation\n"));
  console.log(`  Domain:     ${chalk.cyan(opts.domain)}`);
  console.log(`  Count:      ${chalk.cyan(String(count))}`);
  if (opts.complexity) {
    console.log(`  Complexity: ${chalk.cyan(opts.complexity)}`);
  }
  console.log();

  // Load domain template
  const templateSpinner = ora("Loading domain template...").start();
  let loaded;
  try {
    loaded = loadTemplate(opts.domain, opts.domainsDir);
    templateSpinner.succeed(`Loaded template: ${loaded.template.name} v${loaded.template.version}`);
  } catch (err) {
    templateSpinner.fail(`Failed to load template: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Check for API key
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.log(chalk.red("\n  Error: ANTHROPIC_API_KEY environment variable required for LLM generation"));
    console.log(chalk.dim("  Set it with: export ANTHROPIC_API_KEY=your-key-here\n"));
    process.exit(1);
  }

  // Generate scenarios
  const genSpinner = ora(`Generating ${count} scenarios...`).start();
  let scenarios: Scenario[];
  try {
    scenarios = await generateScenarios({
      template: loaded.template,
      count,
      complexity: opts.complexity as ScenarioMetadata["complexity"] | undefined,
      apiKey: process.env["ANTHROPIC_API_KEY"],
    });
    genSpinner.succeed(`Generated ${scenarios.length} scenarios`);
  } catch (err) {
    genSpinner.fail(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Quality validation
  if (opts.quality) {
    const qualitySpinner = ora("Validating scenario quality...").start();
    const report = validateScenarioQuality(scenarios);
    qualitySpinner.succeed("Quality validation complete");
    console.log();
    console.log(formatQualityReport(report));
  }

  // Export
  if (opts.output) {
    const exportSpinner = ora(`Exporting to ${opts.output}...`).start();
    exportScenarios(scenarios, opts.output);
    exportSpinner.succeed(`Exported ${scenarios.length} scenarios to ${opts.output}`);
  }

  // Summary
  console.log(chalk.bold("\n  Summary\n"));
  console.log(`  Generated: ${chalk.green(String(scenarios.length))} scenarios`);

  const complexityCounts: Record<string, number> = {};
  for (const s of scenarios) {
    complexityCounts[s.metadata.complexity] = (complexityCounts[s.metadata.complexity] ?? 0) + 1;
  }
  for (const [level, count] of Object.entries(complexityCounts)) {
    console.log(`  ${level.padEnd(12)} ${chalk.dim(String(count))}`);
  }

  if (!opts.output) {
    console.log(chalk.dim("\n  Tip: Use -o scenarios.json to export scenarios to a file\n"));
  }
  console.log();
}
