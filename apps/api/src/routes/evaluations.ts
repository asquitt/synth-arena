import { Hono } from "hono";
import type { EvaluationRun } from "@syntharena/shared";

/**
 * Evaluation API routes.
 *
 * POST /evaluations          - Start a new evaluation run
 * GET  /evaluations          - List evaluation runs
 * GET  /evaluations/:id      - Get evaluation run details
 * POST /evaluations/:id/compare - Compare with another run (regression)
 */

// In-memory store (replace with PostgreSQL in production)
const runs = new Map<string, EvaluationRun>();

export const evaluationRoutes = new Hono();

evaluationRoutes.get("/", (c) => {
  const allRuns = Array.from(runs.values()).map((run) => ({
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
  }>();

  // In production, this would:
  // 1. Generate scenarios from the domain template
  // 2. Queue evaluation jobs via Redis Streams
  // 3. Return a run ID for polling

  const runId = `run-${Date.now()}`;
  const placeholder: EvaluationRun = {
    id: runId,
    name: body.name,
    createdAt: new Date().toISOString(),
    status: "running",
    config: {
      name: body.name,
      dataset: [],
      scorers: [],
      trials: body.trials ?? 1,
    },
    results: [],
    summary: {
      totalScenarios: body.scenarioCount ?? 10,
      totalTrials: 0,
      overallPassRate: 0,
      passAtK: 0,
      passToTheK: 0,
      totalCost: 0,
      totalDuration: 0,
      avgTokensPerScenario: 0,
      scoreSummaries: {},
    },
  };

  runs.set(runId, placeholder);

  return c.json({ data: { id: runId, status: "running" } }, 201);
});

evaluationRoutes.post("/:id/compare", async (c) => {
  const currentRun = runs.get(c.req.param("id"));
  if (!currentRun) return c.json({ error: "Current run not found" }, 404);

  const body = await c.req.json<{ baselineId: string }>();
  const baselineRun = runs.get(body.baselineId);
  if (!baselineRun) return c.json({ error: "Baseline run not found" }, 404);

  // In production, this calls compareRuns from @syntharena/replay
  return c.json({
    data: {
      baselineId: body.baselineId,
      currentId: c.req.param("id"),
      verdict: "pass",
      message: "Regression comparison placeholder",
    },
  });
});
