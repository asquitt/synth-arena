import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { EvaluationRun } from "@syntharena/shared";
import { evaluate, taskCompletion, costThreshold, safetyCheck } from "@syntharena/core";
import { compareRuns } from "@syntharena/replay";
import { generateDemoScenarios } from "./demo-scenarios.js";
import { createEvaluationSchema, compareRunsSchema } from "../schemas.js";

/**
 * Evaluation API routes.
 *
 * POST /evaluations          - Start a new evaluation run
 * GET  /evaluations          - List evaluation runs
 * GET  /evaluations/:id      - Get evaluation run details
 * POST /evaluations/:id/compare - Compare with another run (regression)
 */

// In-memory store — will be replaced with PostgreSQL when database layer is added
const runs = new Map<string, EvaluationRun>();

export const evaluationRoutes = new Hono();

evaluationRoutes.get("/", (c) => {
  const allRuns = Array.from(runs.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      summary: run.summary,
    }));

  return c.json({
    data: allRuns,
    metadata: { total: allRuns.length },
  });
});

evaluationRoutes.get("/:id", (c) => {
  const run = runs.get(c.req.param("id"));
  if (!run) return c.json({ error: "Not Found" }, 404);
  return c.json({ data: run });
});

evaluationRoutes.post("/",
  zValidator("json", createEvaluationSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    const scenarios = generateDemoScenarios(body.domain, body.scenarioCount);

    const demoTask = async (input: Record<string, unknown>) => {
      const startTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        output: { success: true, data: input },
        trace: [],
        tokenUsage: {
          inputTokens: 150,
          outputTokens: 50,
          totalTokens: 200,
          estimatedCost: 0.001,
          model: "demo",
          provider: "demo",
        },
        duration: Date.now() - startTime,
      };
    };

    try {
      const run = await evaluate({
        name: body.name,
        dataset: scenarios,
        task: demoTask,
        scorers: [taskCompletion, costThreshold(0.50), safetyCheck()],
        trials: body.trials,
        maxConcurrency: body.maxConcurrency,
        timeout: body.timeout,
        metadata: { domain: body.domain },
      });

      runs.set(run.id, run);

      return c.json({ data: run }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Evaluation failed" }, 500);
    }
  }
);

evaluationRoutes.post("/:id/compare",
  zValidator("json", compareRunsSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const currentRun = runs.get(c.req.param("id"));
    if (!currentRun) return c.json({ error: "Current run not found" }, 404);

    const body = c.req.valid("json");

    const baselineRun = runs.get(body.baselineId);
    if (!baselineRun) return c.json({ error: "Baseline run not found" }, 404);

    const report = compareRuns(baselineRun, currentRun);

    return c.json({ data: report });
  }
);

evaluationRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  if (!runs.has(id)) return c.json({ error: "Not Found" }, 404);
  runs.delete(id);
  return c.json({ data: { deleted: true, id } });
});
