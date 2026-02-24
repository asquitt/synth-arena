import type { TestResult, ScorerConfig } from "./types";

/** Run deterministic scorer checks locally (no API needed). */
export function runLocalDeterministic(criteria: string, name: string, threshold: number, output: string): TestResult {
  const lines = criteria.split(/[.;\n]+/).map((l) => l.trim()).filter(Boolean);
  let passedChecks = 0;
  const failures: string[] = [];
  let totalChecks = 0;

  const outputStr = typeof output === "string" ? output : JSON.stringify(output);
  const cleanOutput = outputStr.startsWith('"') ? outputStr.slice(1, -1) : outputStr;

  for (const line of lines) {
    const lower = line.toLowerCase();

    const notMatch = lower.match(/(?:must not|should not|penalize|avoid)\s+(?:contain|mention|include|reference)?\s*(.+)/);
    if (notMatch?.[1]) {
      const targets = notMatch[1].replace(/[""'"]/g, "").split(/\s+(?:or|and|,)\s+/).filter(Boolean);
      for (const target of targets) {
        totalChecks++;
        if (!cleanOutput.toLowerCase().includes(target.toLowerCase().trim())) {
          passedChecks++;
        } else {
          failures.push(`Contains "${target.trim()}"`);
        }
      }
      continue;
    }

    const containsMatch = lower.match(/(?:must|should)\s+(?:contain|include|have)\s+(.+)/);
    if (containsMatch?.[1]) {
      totalChecks++;
      if (cleanOutput.toLowerCase().includes(containsMatch[1].replace(/[""'"]/g, "").trim().toLowerCase())) {
        passedChecks++;
      } else {
        failures.push(`Missing "${containsMatch[1].trim()}"`);
      }
      continue;
    }

    if (lower.includes("valid json")) {
      totalChecks++;
      try { JSON.parse(cleanOutput); passedChecks++; } catch { failures.push("Not valid JSON"); }
      continue;
    }

    if (lower.includes("not be empty") || lower.includes("non-empty")) {
      totalChecks++;
      if (cleanOutput.trim().length > 0) passedChecks++;
      else failures.push("Output is empty");
      continue;
    }

    const wordMatch = lower.match(/under\s+(\d+)\s+words/);
    if (wordMatch?.[1]) {
      totalChecks++;
      if (cleanOutput.split(/\s+/).length < parseInt(wordMatch[1])) passedChecks++;
      else failures.push(`Exceeds ${wordMatch[1]} word limit`);
      continue;
    }
  }

  const score = totalChecks > 0 ? passedChecks / totalChecks : 1;

  return {
    name,
    score,
    passed: score >= threshold,
    reason: failures.length > 0 ? `Failed: ${failures.join("; ")}` : undefined,
    metadata: { mode: "deterministic", totalChecks, passedChecks, failures },
  };
}

export function generateExportCode(scorers: ScorerConfig[]): string {
  const lines = [
    `import { generateScorerSuite } from "@syntharena/sdk";`,
    ``,
    `const scorers = generateScorerSuite([`,
  ];

  for (const s of scorers) {
    lines.push(`  {`);
    lines.push(`    criteria: ${JSON.stringify(s.criteria)},`);
    lines.push(`    name: ${JSON.stringify(s.name)},`);
    lines.push(`    mode: ${JSON.stringify(s.mode)},`);
    lines.push(`    threshold: ${s.threshold},`);
    lines.push(`  },`);
  }

  lines.push(`]);`);
  lines.push(``);
  lines.push(`// Use in evaluation config:`);
  lines.push(`// evaluate({ dataset, task, scorers, trials: 3 });`);

  return lines.join("\n");
}
