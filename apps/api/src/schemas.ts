import { z } from "zod";

export const createEvaluationSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(100),
  scenarioCount: z.number().int().min(1).max(10_000).optional().default(10),
  trials: z.number().int().min(1).max(100).optional().default(1),
  maxConcurrency: z.number().int().min(1).max(50).optional().default(5),
  timeout: z.number().int().min(1000).max(3_600_000).optional().default(300_000),
});

export const compareRunsSchema = z.object({
  baselineId: z.string().min(1),
});

export const generateScenariosSchema = z.object({
  domain: z.string().min(1).max(100),
  count: z.number().int().min(1).max(10_000).optional().default(10),
  complexity: z.enum(["low", "medium", "high", "adversarial"]).optional(),
});

export const validateScenariosSchema = z.object({
  scenarios: z.array(z.object({
    id: z.string(),
    domain: z.string(),
    name: z.string(),
    description: z.string(),
    input: z.record(z.string(), z.unknown()),
    expected: z.record(z.string(), z.unknown()).optional(),
    metadata: z.object({
      complexity: z.enum(["low", "medium", "high", "adversarial"]),
      tags: z.array(z.string()),
      generatedAt: z.string(),
      generatorVersion: z.string(),
    }),
  })).min(1).max(10_000),
});

export const adversarialSchema = z.object({
  baseScenarios: z.array(z.object({
    id: z.string(),
    domain: z.string(),
    name: z.string(),
    description: z.string(),
    input: z.record(z.string(), z.unknown()),
    metadata: z.object({
      complexity: z.enum(["low", "medium", "high", "adversarial"]),
      tags: z.array(z.string()),
      generatedAt: z.string(),
      generatorVersion: z.string(),
    }),
  })).min(1).max(1000),
  categories: z.array(z.enum([
    "input-perturbation", "prompt-injection", "tool-misuse",
    "state-confusion", "resource-exhaustion", "data-exfiltration",
    "multi-turn-manipulation",
  ])).optional(),
  count: z.number().int().min(1).max(10_000).optional().default(10),
  intensity: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(z.enum(["read", "write", "admin"])).optional().default(["read", "write"]),
  rateLimitPerMinute: z.number().int().min(1).max(10_000).optional().default(60),
});

export const costEstimateSchema = z.object({
  model: z.string().min(1),
  scenarioCount: z.number().int().min(1).max(1_000_000),
  trialsPerScenario: z.number().int().min(1).max(100).optional().default(1),
  avgInputTokensPerCall: z.number().int().min(1).optional().default(2000),
  avgOutputTokensPerCall: z.number().int().min(1).optional().default(500),
  avgCallsPerScenario: z.number().int().min(1).optional().default(3),
  cacheHitRate: z.number().min(0).max(1).optional(),
  useBatchApi: z.boolean().optional(),
});
