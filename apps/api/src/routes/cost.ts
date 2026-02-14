import { Hono } from "hono";
import { estimateCost, generateCostRecommendations, MODEL_PRICING } from "@syntharena/cost";

/**
 * Cost estimation API routes.
 *
 * POST /cost/estimate    - Estimate costs for an evaluation
 * GET  /cost/models      - List available model pricing
 */

export const costRoutes = new Hono();

costRoutes.post("/estimate", async (c) => {
  const body = await c.req.json<{
    model: string;
    scenarioCount: number;
    trialsPerScenario?: number;
    avgInputTokensPerCall?: number;
    avgOutputTokensPerCall?: number;
    avgCallsPerScenario?: number;
    cacheHitRate?: number;
    useBatchApi?: boolean;
  }>();

  try {
    const estimate = estimateCost({
      model: body.model,
      scenarioCount: body.scenarioCount,
      trialsPerScenario: body.trialsPerScenario ?? 1,
      avgInputTokensPerCall: body.avgInputTokensPerCall ?? 2000,
      avgOutputTokensPerCall: body.avgOutputTokensPerCall ?? 500,
      avgCallsPerScenario: body.avgCallsPerScenario ?? 3,
      cacheHitRate: body.cacheHitRate,
      useBatchApi: body.useBatchApi,
    });

    const recommendations = generateCostRecommendations(estimate);

    return c.json({ data: { estimate, recommendations } });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Estimation failed" }, 400);
  }
});

costRoutes.get("/models", (c) => {
  return c.json({
    data: MODEL_PRICING.map((p) => ({
      model: p.model,
      provider: p.provider,
      inputPer1M: p.inputPer1M,
      outputPer1M: p.outputPer1M,
      cachedInputPer1M: p.cachedInputPer1M,
    })),
  });
});
