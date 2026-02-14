import chalk from "chalk";
import ora from "ora";
import { evaluate, taskCompletion, costThreshold, safetyCheck, generateComplianceReport } from "@syntharena/core";
import type { ComplianceReport } from "@syntharena/core";
import { generateDemoScenarios } from "../demo.js";

interface ComplianceOptions {
  domain: string;
  scenarios: string;
  trials: string;
  output: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "met":
    case "compliant":
    case "pass":
      return chalk.green(status);
    case "partial":
    case "warning":
      return chalk.yellow(status);
    case "not-met":
    case "non-compliant":
    case "fail":
      return chalk.red(status);
    default:
      return chalk.gray(status);
  }
}

function printReport(report: ComplianceReport) {
  console.log();
  console.log(chalk.bold("═══ EU AI Act Compliance Report ═══"));
  console.log();

  // System info
  console.log(chalk.dim("System:"), report.systemInfo.name);
  console.log(chalk.dim("Domain:"), report.systemInfo.domain);
  console.log(chalk.dim("Evaluated:"), report.systemInfo.evaluatedAt);
  console.log(chalk.dim("Scenarios:"), report.systemInfo.scenarioCount, chalk.dim("Trials:"), report.systemInfo.trialCount);
  console.log();

  // Risk classification
  const riskColor = report.riskClassification.level === "high" ? chalk.red : chalk.yellow;
  console.log(chalk.bold("Risk Classification:"), riskColor(report.riskClassification.level.toUpperCase()));
  console.log(chalk.dim("  Reason:"), report.riskClassification.reason);
  console.log(chalk.dim("  Applicable:"), report.riskClassification.articles.join(", "));
  console.log();

  // Testing summary
  console.log(chalk.bold("Testing Summary"));
  for (const [name, metric] of Object.entries(report.testingSummary)) {
    const m = metric as ComplianceReport["testingSummary"]["accuracy"];
    console.log(`  ${chalk.dim(name.padEnd(16))} ${statusColor(m.status.padEnd(10))} ${(m.score * 100).toFixed(1)}%  ${chalk.dim(m.details)}`);
  }
  console.log();

  // Compliance checks
  console.log(chalk.bold("Compliance Checks"));
  for (const check of report.checks) {
    const sev = check.severity === "critical" ? chalk.red("●") : check.severity === "major" ? chalk.yellow("●") : chalk.dim("●");
    console.log(`  ${sev} ${chalk.dim(check.article.padEnd(16))} ${statusColor(check.status.padEnd(12))} ${check.requirement}`);
  }
  console.log();

  // Overall status
  const overall = report.overallStatus === "compliant"
    ? chalk.green.bold("✓ COMPLIANT")
    : report.overallStatus === "partial"
      ? chalk.yellow.bold("⚠ PARTIALLY COMPLIANT")
      : chalk.red.bold("✗ NON-COMPLIANT");
  console.log(chalk.bold("Overall Status:"), overall);
  console.log();

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log(chalk.bold("Recommendations"));
    for (const rec of report.recommendations) {
      console.log(`  ${chalk.dim("→")} ${rec}`);
    }
    console.log();
  }
}

export async function complianceCommand(opts: ComplianceOptions) {
  const scenarioCount = parseInt(opts.scenarios, 10);
  const trials = parseInt(opts.trials, 10);

  const spinner = ora("Running compliance evaluation...").start();

  const scenarios = generateDemoScenarios(opts.domain, scenarioCount);

  const demoTask = async (input: Record<string, unknown>) => {
    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      output: { success: true, data: input },
      trace: [],
      tokenUsage: { inputTokens: 150, outputTokens: 50, totalTokens: 200, estimatedCost: 0.001, model: "demo", provider: "demo" },
      duration: Date.now() - startTime,
    };
  };

  const run = await evaluate({
    name: `compliance-${opts.domain}`,
    dataset: scenarios,
    task: demoTask,
    scorers: [taskCompletion, costThreshold(0.50), safetyCheck()],
    trials,
    metadata: { domain: opts.domain },
  });

  spinner.succeed("Evaluation complete");

  const report = generateComplianceReport(run);

  if (opts.output === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}
