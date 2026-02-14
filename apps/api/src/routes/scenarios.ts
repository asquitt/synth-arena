import { Hono } from "hono";
import type { Scenario } from "@syntharena/shared";
import { generateScenarios, getTemplate, validateScenarioQuality } from "@syntharena/scenarios";
import { generateAdversarialScenarios, type AdversarialCategory } from "@syntharena/replay";

/**
 * Scenario API routes.
 *
 * POST /scenarios/generate    - Generate scenarios for a domain
 * POST /scenarios/validate    - Validate scenario quality
 * POST /scenarios/adversarial - Generate adversarial variants
 */

const ALL_ADVERSARIAL_CATEGORIES: AdversarialCategory[] = [
  "input-perturbation", "prompt-injection", "tool-misuse",
  "state-confusion", "resource-exhaustion", "data-exfiltration",
  "multi-turn-manipulation",
];

export const scenarioRoutes = new Hono();

scenarioRoutes.post("/generate", async (c) => {
  const body = await c.req.json<{
    domain: string;
    count?: number;
    complexity?: "low" | "medium" | "high" | "adversarial";
  }>();

  if (!body.domain) {
    return c.json({ error: "domain is required" }, 400);
  }

  const template = getTemplate(body.domain);
  if (!template) {
    return c.json({ error: `Unknown domain: ${body.domain}` }, 400);
  }

  const apiKey = c.req.header("x-anthropic-key") ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return c.json({ error: "ANTHROPIC_API_KEY required (env var or x-anthropic-key header)" }, 400);
  }

  try {
    const scenarios = await generateScenarios({
      template,
      count: body.count ?? 10,
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
    return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500);
  }
});

scenarioRoutes.post("/validate", async (c) => {
  const body = await c.req.json<{ scenarios: Scenario[] }>();

  if (!body.scenarios || !Array.isArray(body.scenarios) || body.scenarios.length === 0) {
    return c.json({ error: "scenarios array is required and must not be empty" }, 400);
  }

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
});

scenarioRoutes.post("/adversarial", async (c) => {
  const body = await c.req.json<{
    baseScenarios: Scenario[];
    categories?: string[];
    count?: number;
    intensity?: "low" | "medium" | "high";
  }>();

  if (!body.baseScenarios || !Array.isArray(body.baseScenarios) || body.baseScenarios.length === 0) {
    return c.json({ error: "baseScenarios array is required and must not be empty" }, 400);
  }

  const categories = (body.categories ?? ALL_ADVERSARIAL_CATEGORIES) as AdversarialCategory[];
  const invalid = categories.filter((cat) => !ALL_ADVERSARIAL_CATEGORIES.includes(cat));
  if (invalid.length > 0) {
    return c.json({ error: `Invalid categories: ${invalid.join(", ")}` }, 400);
  }

  const adversarial = generateAdversarialScenarios({
    baseScenarios: body.baseScenarios,
    categories,
    intensityLevel: body.intensity ?? "medium",
    count: body.count ?? 10,
  });

  return c.json({
    data: {
      count: adversarial.length,
      categories,
      scenarios: adversarial,
    },
  });
});
