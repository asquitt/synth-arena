import { Hono } from "hono";
import { listDomainDirs, loadTemplate, validateTemplate } from "@syntharena/scenarios";

/**
 * Domain template API routes.
 *
 * GET /domains           - List available domain templates
 * GET /domains/:name     - Get domain template details
 */

export const domainRoutes = new Hono();

domainRoutes.get("/", (c) => {
  try {
    const domains = listDomainDirs();
    const templates = domains.map((name) => {
      const { template } = loadTemplate(name);
      return {
        name: template.name,
        description: template.description,
        version: template.version,
        generators: template.scenarioGenerators.length,
        constraints: template.constraints.length,
        scorers: template.defaultScorers,
      };
    });

    return c.json({ data: templates, metadata: { total: templates.length } });
  } catch (err) {
    return c.json({ data: [], metadata: { total: 0, error: err instanceof Error ? err.message : "Unknown error" } });
  }
});

domainRoutes.get("/:name", (c) => {
  try {
    const { template, seeds } = loadTemplate(c.req.param("name"));
    const errors = validateTemplate(template);

    return c.json({
      data: {
        template,
        seeds,
        validation: { valid: errors.length === 0, errors },
      },
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Not found" }, 404);
  }
});
