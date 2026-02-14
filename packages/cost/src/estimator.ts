import type { CostEstimate, CostBreakdownItem, TraceSpan } from "@syntharena/shared";

/**
 * Cost modeling engine for pre-deployment cost estimation.
 *
 * Approaches:
 * 1. Tokenizer pre-estimation: estimate input tokens from prompt templates
 * 2. Historical modeling: use past trace data to project costs
 * 3. Simulation sampling: run a few scenarios, extrapolate
 */

// ─── Pricing Data (as of Feb 2026) ──────────────────────────────────

export interface ModelPricing {
  model: string;
  provider: string;
  inputPer1M: number; // $ per 1M input tokens
  outputPer1M: number; // $ per 1M output tokens
  cachedInputPer1M?: number; // $ per 1M cached input tokens
  batchInputPer1M?: number; // $ per 1M batch input tokens
  batchOutputPer1M?: number; // $ per 1M batch output tokens
}

export const MODEL_PRICING: ModelPricing[] = [
  // Anthropic
  { model: "claude-opus-4-20250514", provider: "anthropic", inputPer1M: 15.0, outputPer1M: 75.0, cachedInputPer1M: 1.5 },
  { model: "claude-sonnet-4-20250514", provider: "anthropic", inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.3 },
  { model: "claude-haiku-3-5-20241022", provider: "anthropic", inputPer1M: 0.80, outputPer1M: 4.0, cachedInputPer1M: 0.08 },
  // OpenAI
  { model: "gpt-4.1", provider: "openai", inputPer1M: 2.0, outputPer1M: 8.0, cachedInputPer1M: 0.5 },
  { model: "gpt-4.1-mini", provider: "openai", inputPer1M: 0.4, outputPer1M: 1.6, cachedInputPer1M: 0.1 },
  { model: "gpt-4.1-nano", provider: "openai", inputPer1M: 0.1, outputPer1M: 0.4, cachedInputPer1M: 0.025 },
  { model: "o3", provider: "openai", inputPer1M: 10.0, outputPer1M: 40.0, cachedInputPer1M: 2.5 },
  { model: "o4-mini", provider: "openai", inputPer1M: 1.1, outputPer1M: 4.4, cachedInputPer1M: 0.275 },
  // Google
  { model: "gemini-2.5-pro", provider: "google", inputPer1M: 1.25, outputPer1M: 10.0 },
  { model: "gemini-2.5-flash", provider: "google", inputPer1M: 0.15, outputPer1M: 0.60 },
];

export function getPricing(model: string): ModelPricing | undefined {
  return MODEL_PRICING.find((p) => p.model === model);
}

// ─── Cost Estimation ─────────────────────────────────────────────────

export interface EstimateConfig {
  model: string;
  scenarioCount: number;
  trialsPerScenario: number;
  avgInputTokensPerCall: number;
  avgOutputTokensPerCall: number;
  avgCallsPerScenario: number;
  cacheHitRate?: number; // 0-1, portion of input tokens served from cache
  useBatchApi?: boolean;
}

export function estimateCost(config: EstimateConfig): CostEstimate {
  const pricing = getPricing(config.model);
  if (!pricing) {
    throw new Error(`Unknown model: ${config.model}. Available: ${MODEL_PRICING.map((p) => p.model).join(", ")}`);
  }

  const totalScenarioRuns = config.scenarioCount * config.trialsPerScenario;
  const totalCalls = totalScenarioRuns * config.avgCallsPerScenario;

  const totalInputTokens = totalCalls * config.avgInputTokensPerCall;
  const totalOutputTokens = totalCalls * config.avgOutputTokensPerCall;

  const cacheHitRate = config.cacheHitRate ?? 0;
  const cachedInputTokens = totalInputTokens * cacheHitRate;
  const uncachedInputTokens = totalInputTokens - cachedInputTokens;

  let inputCost: number;
  let outputCost: number;

  if (config.useBatchApi && pricing.batchInputPer1M && pricing.batchOutputPer1M) {
    inputCost = (uncachedInputTokens / 1_000_000) * pricing.batchInputPer1M;
    outputCost = (totalOutputTokens / 1_000_000) * pricing.batchOutputPer1M;
  } else {
    inputCost = (uncachedInputTokens / 1_000_000) * pricing.inputPer1M;
    outputCost = (totalOutputTokens / 1_000_000) * pricing.outputPer1M;
  }

  // Add cached input cost
  const cachedCost = pricing.cachedInputPer1M
    ? (cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M
    : (cachedInputTokens / 1_000_000) * pricing.inputPer1M;

  const estimatedCost = inputCost + outputCost + cachedCost;

  const breakdown: CostBreakdownItem[] = [
    {
      category: "Input tokens (uncached)",
      inputTokens: uncachedInputTokens,
      outputTokens: 0,
      cost: inputCost,
      percentage: (inputCost / estimatedCost) * 100,
    },
    {
      category: "Output tokens",
      inputTokens: 0,
      outputTokens: totalOutputTokens,
      cost: outputCost,
      percentage: (outputCost / estimatedCost) * 100,
    },
  ];

  if (cachedInputTokens > 0) {
    breakdown.push({
      category: "Input tokens (cached)",
      inputTokens: cachedInputTokens,
      outputTokens: 0,
      cost: cachedCost,
      percentage: (cachedCost / estimatedCost) * 100,
    });
  }

  return {
    scenarioCount: config.scenarioCount,
    trialsPerScenario: config.trialsPerScenario,
    estimatedInputTokens: totalInputTokens,
    estimatedOutputTokens: totalOutputTokens,
    estimatedCost,
    model: config.model,
    provider: pricing.provider,
    breakdown,
  };
}

// ─── Cost from Traces ────────────────────────────────────────────────

/**
 * Calculate actual cost from recorded trace spans.
 */
export function costFromTraces(spans: TraceSpan[], model: string): CostEstimate {
  const pricing = getPricing(model);
  if (!pricing) {
    throw new Error(`Unknown model: ${model}`);
  }

  let totalInput = 0;
  let totalOutput = 0;

  for (const span of spans) {
    if (span.type === "llm_call") {
      totalInput += (span.attributes["inputTokens"] as number) ?? 0;
      totalOutput += (span.attributes["outputTokens"] as number) ?? 0;
    }
  }

  const inputCost = (totalInput / 1_000_000) * pricing.inputPer1M;
  const outputCost = (totalOutput / 1_000_000) * pricing.outputPer1M;

  return {
    scenarioCount: 1,
    trialsPerScenario: 1,
    estimatedInputTokens: totalInput,
    estimatedOutputTokens: totalOutput,
    estimatedCost: inputCost + outputCost,
    model,
    provider: pricing.provider,
    breakdown: [
      { category: "Input tokens", inputTokens: totalInput, outputTokens: 0, cost: inputCost, percentage: (inputCost / (inputCost + outputCost)) * 100 || 0 },
      { category: "Output tokens", inputTokens: 0, outputTokens: totalOutput, cost: outputCost, percentage: (outputCost / (inputCost + outputCost)) * 100 || 0 },
    ],
  };
}

// ─── Cost Optimization Recommendations ───────────────────────────────

export interface CostRecommendation {
  type: "model-routing" | "prompt-caching" | "batch-api" | "context-optimization";
  description: string;
  estimatedSavings: number;
  estimatedSavingsPercent: number;
}

export function generateCostRecommendations(estimate: CostEstimate): CostRecommendation[] {
  const recommendations: CostRecommendation[] = [];
  const pricing = getPricing(estimate.model);
  if (!pricing) return recommendations;

  // Check if a cheaper model could work
  const cheaperModels = MODEL_PRICING
    .filter((p) => p.provider === pricing.provider && p.inputPer1M < pricing.inputPer1M)
    .sort((a, b) => a.inputPer1M - b.inputPer1M);

  if (cheaperModels.length > 0) {
    const cheapest = cheaperModels[0]!;
    const cheaperCost = estimateCost({
      model: cheapest.model,
      scenarioCount: estimate.scenarioCount,
      trialsPerScenario: estimate.trialsPerScenario,
      avgInputTokensPerCall: estimate.estimatedInputTokens / (estimate.scenarioCount * estimate.trialsPerScenario),
      avgOutputTokensPerCall: estimate.estimatedOutputTokens / (estimate.scenarioCount * estimate.trialsPerScenario),
      avgCallsPerScenario: 1,
    });

    const savings = estimate.estimatedCost - cheaperCost.estimatedCost;
    if (savings > 0) {
      recommendations.push({
        type: "model-routing",
        description: `Route simple subtasks to ${cheapest.model} (${cheapest.provider})`,
        estimatedSavings: savings,
        estimatedSavingsPercent: (savings / estimate.estimatedCost) * 100,
      });
    }
  }

  // Prompt caching recommendation
  if (pricing.cachedInputPer1M && estimate.estimatedInputTokens > 10000) {
    const cacheSavings = (estimate.estimatedInputTokens * 0.7 / 1_000_000) * (pricing.inputPer1M - pricing.cachedInputPer1M);
    recommendations.push({
      type: "prompt-caching",
      description: `Enable prompt caching for repeated system prompts (${pricing.provider} supports ${((1 - pricing.cachedInputPer1M / pricing.inputPer1M) * 100).toFixed(0)}% savings)`,
      estimatedSavings: cacheSavings,
      estimatedSavingsPercent: (cacheSavings / estimate.estimatedCost) * 100,
    });
  }

  return recommendations;
}
