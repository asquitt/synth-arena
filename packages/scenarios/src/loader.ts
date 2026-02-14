import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import type { DomainTemplate } from "@syntharena/shared";

/**
 * Load domain templates from disk. Templates live in domains/<name>/template.json
 * with optional seeds.json alongside.
 */

const DEFAULT_DOMAINS_DIR = resolve(process.cwd(), "domains");

export interface LoadedTemplate {
  template: DomainTemplate;
  seeds: Record<string, unknown>;
  path: string;
}

export function loadTemplate(domain: string, domainsDir?: string): LoadedTemplate {
  const dir = domainsDir ?? DEFAULT_DOMAINS_DIR;
  const templatePath = join(dir, domain, "template.json");
  const seedsPath = join(dir, domain, "seeds.json");

  if (!existsSync(templatePath)) {
    throw new Error(`Domain template not found: ${templatePath}. Available domains: ${listDomainDirs(dir).join(", ")}`);
  }

  const templateRaw = readFileSync(templatePath, "utf-8");
  const template = JSON.parse(templateRaw) as DomainTemplate;

  let seeds: Record<string, unknown> = {};
  if (existsSync(seedsPath)) {
    const seedsRaw = readFileSync(seedsPath, "utf-8");
    seeds = JSON.parse(seedsRaw) as Record<string, unknown>;
  }

  return { template, seeds, path: join(dir, domain) };
}

export function listDomainDirs(domainsDir?: string): string[] {
  const dir = domainsDir ?? DEFAULT_DOMAINS_DIR;
  if (!existsSync(dir)) return [];

  return readdirSync(dir).filter((name: string) => {
    const fullPath = join(dir, name);
    return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "template.json"));
  });
}

/**
 * Validate a template has required fields and constraints are well-formed.
 */
export function validateTemplate(template: DomainTemplate): string[] {
  const errors: string[] = [];

  if (!template.name) errors.push("Template missing 'name'");
  if (!template.description) errors.push("Template missing 'description'");
  if (!template.version) errors.push("Template missing 'version'");
  if (!template.scenarioGenerators?.length) errors.push("Template has no scenario generators");
  if (!template.constraints?.length) errors.push("Template has no constraints");

  for (const gen of template.scenarioGenerators ?? []) {
    if (!gen.name) errors.push("Generator missing 'name'");
    if (!gen.type) errors.push(`Generator '${gen.name}' missing 'type'`);
    if (gen.type === "llm" && !gen.prompt) {
      errors.push(`LLM generator '${gen.name}' missing 'prompt'`);
    }
  }

  return errors;
}
