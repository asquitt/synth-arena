import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Scenario } from "@syntharena/shared";

/**
 * Import/export scenarios in JSON format.
 * Enables sharing scenario datasets between teams and CI/CD pipelines.
 */

export function exportScenarios(scenarios: Scenario[], filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(scenarios, null, 2), "utf-8");
}

export function importScenarios(filePath: string): Scenario[] {
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`Expected JSON array in ${filePath}, got ${typeof data}`);
  }

  return data.map((item, i) => validateImportedScenario(item, i));
}

function validateImportedScenario(raw: unknown, index: number): Scenario {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Scenario at index ${index} is not an object`);
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj["id"] !== "string") {
    throw new Error(`Scenario at index ${index} missing string 'id'`);
  }
  if (typeof obj["domain"] !== "string") {
    throw new Error(`Scenario at index ${index} missing string 'domain'`);
  }

  return {
    id: obj["id"] as string,
    domain: (obj["domain"] as string) ?? "unknown",
    name: (obj["name"] as string) ?? `scenario-${index}`,
    description: (obj["description"] as string) ?? "",
    input: (obj["input"] as Record<string, unknown>) ?? {},
    expected: obj["expected"] as Record<string, unknown> | undefined,
    metadata: {
      complexity: ((obj["metadata"] as Record<string, unknown>)?.["complexity"] as Scenario["metadata"]["complexity"]) ?? "medium",
      tags: ((obj["metadata"] as Record<string, unknown>)?.["tags"] as string[]) ?? [],
      generatedAt: ((obj["metadata"] as Record<string, unknown>)?.["generatedAt"] as string) ?? new Date().toISOString(),
      generatorVersion: ((obj["metadata"] as Record<string, unknown>)?.["generatorVersion"] as string) ?? "imported",
    },
    environment: obj["environment"] as Scenario["environment"],
  };
}
