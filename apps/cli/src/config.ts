import { readFileSync, existsSync } from "fs";
import { parse } from "yaml";

export interface SynthArenaConfig {
  domain: string;
  scenarios: number;
  trials: number;
  concurrency: number;
  model: string;
  scorers: ScorerConfig[];
  cost: {
    avg_calls_per_scenario: number;
    cache_hit_rate: number;
  };
  regression: {
    baseline_path: string;
    fail_on_regression: boolean;
  };
  output: {
    format: "table" | "json" | "csv";
    save_results: boolean;
    results_dir: string;
  };
}

export type ScorerConfig = string | Record<string, Record<string, unknown>>;

/**
 * Load and parse a syntharena.yaml config file.
 * Returns undefined if path doesn't exist.
 */
export function loadConfig(configPath: string): SynthArenaConfig | undefined {
  if (!existsSync(configPath)) return undefined;

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parse(raw) as Partial<SynthArenaConfig>;

  return {
    domain: parsed.domain ?? "web-scraping",
    scenarios: parsed.scenarios ?? 10,
    trials: parsed.trials ?? 1,
    concurrency: parsed.concurrency ?? 5,
    model: parsed.model ?? "claude-sonnet-4-20250514",
    scorers: parsed.scorers ?? ["task_completion"],
    cost: {
      avg_calls_per_scenario: parsed.cost?.avg_calls_per_scenario ?? 3,
      cache_hit_rate: parsed.cost?.cache_hit_rate ?? 0,
    },
    regression: {
      baseline_path: parsed.regression?.baseline_path ?? ".syntharena/baselines/latest.json",
      fail_on_regression: parsed.regression?.fail_on_regression ?? true,
    },
    output: {
      format: parsed.output?.format ?? "table",
      save_results: parsed.output?.save_results ?? false,
      results_dir: parsed.output?.results_dir ?? ".syntharena/results",
    },
  };
}
