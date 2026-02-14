import { Hono } from "hono";
import type { EvaluationRun } from "@syntharena/shared";
import { evaluate, taskCompletion, costThreshold, safetyCheck } from "@syntharena/core";
import { compareRuns } from "@syntharena/replay";
import { generateDemoScenarios } from "./demo-scenarios.js";

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

evaluationRoutes.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    domain: string;
    scenarioCount?: number;
    trials?: number;
    maxConcurrency?: number;
    timeout?: number;
  }>();

  if (!body.name || !body.domain) {
    return c.json({ error: "name and domain are required" }, 400);
  }

  const scenarioCount = body.scenarioCount ?? 10;
  const trials = body.trials ?? 1;

  // Generate demo scenarios for the domain
  const scenarios = generateDemoScenarios(body.domain, scenarioCount);

  // Run the evaluation with built-in scorers and a demo task
  const demoTask = async (input: Record<string, unknown>) => {
    const startTime = Date.now();
    // Simulate agent work
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
      trials,
      maxConcurrency: body.maxConcurrency ?? 5,
      timeout: body.timeout ?? 300_000,
      metadata: { domain: body.domain },
    });

    runs.set(run.id, run);

    return c.json({ data: run }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Evaluation failed" }, 500);
  }
});

evaluationRoutes.post("/:id/compare", async (c) => {
  const currentRun = runs.get(c.req.param("id"));
  if (!currentRun) return c.json({ error: "Current run not found" }, 404);

  const body = await c.req.json<{ baselineId: string }>();
  if (!body.baselineId) {
    return c.json({ error: "baselineId is required" }, 400);
  }

  const baselineRun = runs.get(body.baselineId);
  if (!baselineRun) return c.json({ error: "Baseline run not found" }, 404);

  const report = compareRuns(baselineRun, currentRun);

  return c.json({ data: report });
});

evaluationRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  if (!runs.has(id)) return c.json({ error: "Not Found" }, 404);
  runs.delete(id);
  return c.json({ data: { deleted: true, id } });
});
