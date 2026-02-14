import { Hono } from "hono";
import { listPresets, getPreset, getPresetPatterns } from "@syntharena/core";
import { notFound } from "../errors.js";

/**
 * Red Team Presets API routes.
 *
 * Provides access to OWASP LLM Top 10 and NIST AI RMF preset configurations.
 * Used by the dashboard to populate red-team configuration forms.
 */

export const redTeamPresetRoutes = new Hono();

/** List all available red team presets. */
redTeamPresetRoutes.get("/", (c) => {
  const presets = listPresets().map((p) => ({
    id: p.id,
    name: p.name,
    framework: p.framework,
    description: p.description,
    categoryCount: p.categories.length,
    categories: p.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      scorerCount: cat.scorers.length,
      patternCount: cat.attackPatterns.length,
    })),
  }));

  return c.json({ data: presets, metadata: { total: presets.length } });
});

/** Get a specific preset with full attack patterns. */
redTeamPresetRoutes.get("/:presetId", (c) => {
  const presetId = c.req.param("presetId");
  const preset = getPreset(presetId);
  if (!preset) throw notFound("Red team preset", presetId);

  return c.json({
    data: {
      id: preset.id,
      name: preset.name,
      framework: preset.framework,
      description: preset.description,
      categories: preset.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        scorerCount: cat.scorers.length,
        attackPatterns: cat.attackPatterns.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          severity: p.severity,
          template: p.template,
        })),
      })),
    },
  });
});

/** Get all attack patterns from a preset. */
redTeamPresetRoutes.get("/:presetId/patterns", (c) => {
  const presetId = c.req.param("presetId");
  const patterns = getPresetPatterns(presetId);
  if (patterns.length === 0 && !getPreset(presetId)) {
    throw notFound("Red team preset", presetId);
  }

  return c.json({
    data: patterns,
    metadata: { total: patterns.length, presetId },
  });
});
