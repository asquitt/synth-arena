import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { estimateCost, generateCostRecommendations, MODEL_PRICING } from "@syntharena/cost";
import { costEstimateSchema } from "../schemas.js";

/**
 * Cost estimation API routes.
 *
 * POST /cost/estimate    - Estimate costs for an evaluation
 * GET  /cost/models      - List available model pricing
 */

export const costRoutes = new Hono();

costRoutes.post("/estimate",
  zValidator("json", costEstimateSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    try {
      const estimate = estimateCost({
        model: body.model,
        scenarioCount: body.scenarioCount,
        trialsPerScenario: body.trialsPerScenario,
        avgInputTokensPerCall: body.avgInputTokensPerCall,
        avgOutputTokensPerCall: body.avgOutputTokensPerCall,
        avgCallsPerScenario: body.avgCallsPerScenario,
        cacheHitRate: body.cacheHitRate,
        useBatchApi: body.useBatchApi,
      });

      const recommendations = generateCostRecommendations(estimate);

      return c.json({ data: { estimate, recommendations } });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Estimation failed" }, 400);
    }
  }
);

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
