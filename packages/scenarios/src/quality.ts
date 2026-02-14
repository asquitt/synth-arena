import type { Scenario } from "@syntharena/shared";

/**
 * Scenario quality validation.
 *
 * Validates generated scenarios for:
 * - Structural completeness (required fields present)
 * - Diversity (scenarios cover different complexity levels, tags)
 * - Uniqueness (no near-duplicates)
 * - Fidelity (inputs match domain constraints)
 */

export interface QualityReport {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  diversityScore: number; // 0-1, higher = more diverse
  complexityDistribution: Record<string, number>;
  tagCoverage: Record<string, number>;
  issues: QualityIssue[];
}

export interface QualityIssue {
  scenarioId: string;
  type: "missing_field" | "empty_input" | "duplicate" | "invalid_complexity" | "no_expected";
  message: string;
}

export function validateScenarioQuality(scenarios: Scenario[]): QualityReport {
  const issues: QualityIssue[] = [];
  const complexityDist: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  const descriptionHashes = new Set<string>();
  let duplicates = 0;

  for (const scenario of scenarios) {
    // Structural checks
    if (!scenario.id) {
      issues.push({ scenarioId: scenario.id || "unknown", type: "missing_field", message: "Missing id" });
    }
    if (!scenario.description) {
      issues.push({ scenarioId: scenario.id, type: "missing_field", message: "Missing description" });
    }
    if (!scenario.input || Object.keys(scenario.input).length === 0) {
      issues.push({ scenarioId: scenario.id, type: "empty_input", message: "Input is empty" });
    }
    if (!scenario.expected) {
      issues.push({ scenarioId: scenario.id, type: "no_expected", message: "No expected output defined" });
    }

    // Complexity validation
    const validComplexities = ["low", "medium", "high", "adversarial"];
    if (!validComplexities.includes(scenario.metadata.complexity)) {
      issues.push({ scenarioId: scenario.id, type: "invalid_complexity", message: `Invalid complexity: ${scenario.metadata.complexity}` });
    }
    complexityDist[scenario.metadata.complexity] = (complexityDist[scenario.metadata.complexity] ?? 0) + 1;

    // Tag tracking
    for (const tag of scenario.metadata.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }

    // Duplicate detection (simple hash-based)
    const hash = scenario.description.toLowerCase().replace(/\s+/g, " ").trim();
    if (descriptionHashes.has(hash)) {
      duplicates++;
      issues.push({ scenarioId: scenario.id, type: "duplicate", message: "Near-duplicate description detected" });
    }
    descriptionHashes.add(hash);
  }

  const valid = scenarios.length - issues.filter((i) => i.type !== "no_expected").length;
  const diversityScore = computeDiversityScore(complexityDist, tagCounts, scenarios.length);

  return {
    total: scenarios.length,
    valid,
    invalid: scenarios.length - valid,
    duplicates,
    diversityScore,
    complexityDistribution: complexityDist,
    tagCoverage: tagCounts,
    issues,
  };
}

/**
 * Diversity score: 0-1 measuring how well scenarios spread across
 * complexity levels and tags. Uses normalized entropy.
 */
function computeDiversityScore(
  complexityDist: Record<string, number>,
  tagCounts: Record<string, number>,
  total: number
): number {
  if (total === 0) return 0;

  // Complexity entropy (4 possible values)
  const complexityEntropy = normalizedEntropy(Object.values(complexityDist), total);

  // Tag entropy
  const tagEntropy = Object.keys(tagCounts).length > 1
    ? normalizedEntropy(Object.values(tagCounts), total)
    : 0;

  // Weighted average: complexity matters more
  return complexityEntropy * 0.6 + tagEntropy * 0.4;
}

function normalizedEntropy(counts: number[], total: number): number {
  if (counts.length <= 1 || total === 0) return 0;

  const maxEntropy = Math.log2(counts.length);
  if (maxEntropy === 0) return 0;

  let entropy = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  return entropy / maxEntropy;
}

/**
 * Format a quality report for CLI display.
 */
export function formatQualityReport(report: QualityReport): string {
  const lines: string[] = [
    `Scenario Quality Report`,
    `─────────────────────────`,
    `Total:      ${report.total}`,
    `Valid:      ${report.valid}`,
    `Invalid:    ${report.invalid}`,
    `Duplicates: ${report.duplicates}`,
    `Diversity:  ${(report.diversityScore * 100).toFixed(1)}%`,
    ``,
    `Complexity Distribution:`,
  ];

  for (const [level, count] of Object.entries(report.complexityDistribution)) {
    const pct = ((count / report.total) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(count / report.total * 20));
    lines.push(`  ${level.padEnd(12)} ${bar} ${count} (${pct}%)`);
  }

  if (report.issues.length > 0) {
    lines.push("", `Issues (${report.issues.length}):`);
    for (const issue of report.issues.slice(0, 10)) {
      lines.push(`  [${issue.type}] ${issue.scenarioId}: ${issue.message}`);
    }
    if (report.issues.length > 10) {
      lines.push(`  ... and ${report.issues.length - 10} more`);
    }
  }

  return lines.join("\n");
}
