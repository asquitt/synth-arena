import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { estimateCost, generateCostRecommendations, MODEL_PRICING } from "@syntharena/cost";
import { costEstimateSchema } from "../schemas.js";
import { validationError } from "../errors.js";

/**
 * Cost estimation API routes.
 *
 * POST /cost/estimate    - Estimate costs for an evaluation
 * GET  /cost/models      - List available model pricing
 */

export const costRoutes = new Hono();

costRoutes.post("/estimate",
  zValidator("json", costEstimateSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
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
      throw validationError(err instanceof Error ? err.message : "Cost estimation failed");
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
