import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { generateScenarios, getTemplate, validateScenarioQuality } from "@syntharena/scenarios";
import { generateAdversarialScenarios, type AdversarialCategory } from "@syntharena/replay";
import { generateScenariosSchema, validateScenariosSchema, adversarialSchema } from "../schemas.js";
import { ApiError, validationError, domainNotFound } from "../errors.js";

/**
 * Scenario API routes.
 *
 * POST /scenarios/generate    - Generate scenarios for a domain
 * POST /scenarios/validate    - Validate scenario quality
 * POST /scenarios/adversarial - Generate adversarial variants
 */

export const scenarioRoutes = new Hono();

scenarioRoutes.post("/generate",
  zValidator("json", generateScenariosSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    const template = getTemplate(body.domain);
    if (!template) {
      throw domainNotFound(body.domain);
    }

    const apiKey = c.req.header("x-anthropic-key") ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw validationError("ANTHROPIC_API_KEY required (env var or x-anthropic-key header)");
    }

    try {
      const scenarios = await generateScenarios({
        template,
        count: body.count,
        complexity: body.complexity,
        apiKey,
      });

      return c.json({
        data: {
          domain: body.domain,
          count: scenarios.length,
          scenarios,
        },
      });
    } catch (err) {
      throw new ApiError("EVALUATION_FAILED", err instanceof Error ? err.message : "Scenario generation failed", 500);
    }
  }
);

scenarioRoutes.post("/validate",
  zValidator("json", validateScenariosSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    const report = validateScenarioQuality(body.scenarios);

    return c.json({
      data: {
        total: body.scenarios.length,
        diversityScore: report.diversityScore,
        complexityDistribution: report.complexityDistribution,
        issues: report.issues,
        isAcceptable: report.diversityScore >= 0.5 && report.issues.length === 0,
      },
    });
  }
);

scenarioRoutes.post("/adversarial",
  zValidator("json", adversarialSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    const ALL_CATEGORIES: AdversarialCategory[] = [
      "input-perturbation", "prompt-injection", "tool-misuse",
      "state-confusion", "resource-exhaustion", "data-exfiltration",
      "multi-turn-manipulation",
    ];

    const adversarial = generateAdversarialScenarios({
      baseScenarios: body.baseScenarios,
      categories: (body.categories ?? ALL_CATEGORIES) as AdversarialCategory[],
      intensityLevel: body.intensity,
      count: body.count,
    });

    return c.json({
      data: {
        count: adversarial.length,
        categories: body.categories,
        scenarios: adversarial,
      },
    });
  }
);
