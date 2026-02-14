import { Hono } from "hono";
import type { Scenario } from "@syntharena/shared";

/**
 * Scenario API routes.
 *
 * POST /scenarios/generate    - Generate scenarios for a domain
 * GET  /scenarios             - List saved scenario datasets
 * POST /scenarios/validate    - Validate scenario quality
 * POST /scenarios/adversarial - Generate adversarial variants
 */

export const scenarioRoutes = new Hono();

scenarioRoutes.post("/generate", async (c) => {
  const body = await c.req.json<{
    domain: string;
    count?: number;
    complexity?: string;
  }>();

  // In production, this calls generateScenarios from @syntharena/scenarios
  return c.json({
    data: {
      domain: body.domain,
      count: body.count ?? 10,
      status: "generating",
      message: "Scenario generation queued",
    },
  }, 202);
});

scenarioRoutes.post("/validate", async (c) => {
  const body = await c.req.json<{ scenarios: Scenario[] }>();

  // In production, this calls validateScenarioQuality
  return c.json({
    data: {
      total: body.scenarios.length,
      valid: body.scenarios.length,
      diversityScore: 0.85,
      issues: [],
    },
  });
});

scenarioRoutes.post("/adversarial", async (c) => {
  const body = await c.req.json<{
    baseScenarios: Scenario[];
    categories?: string[];
    count?: number;
  }>();

  // In production, this calls generateAdversarialScenarios
  return c.json({
    data: {
      count: body.count ?? 10,
      categories: body.categories ?? ["prompt-injection", "input-perturbation"],
      status: "generating",
    },
  }, 202);
});
