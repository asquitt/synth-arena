import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import type { EvaluationRun, EvaluationProgress } from "@syntharena/shared";
import { evaluate, taskCompletion, costThreshold, safetyCheck } from "@syntharena/core";
import { compareRuns } from "@syntharena/replay";
import { generateDemoScenarios } from "./demo-scenarios.js";
import { createEvaluationSchema, compareRunsSchema } from "../schemas.js";
import * as evalRepo from "../repositories/evaluations.js";
import { submitJob, setJobStatus, getJobStatus } from "../queue.js";

/**
 * Evaluation API routes.
 *
 * Persists to PostgreSQL when DATABASE_URL is configured,
 * falls back to in-memory Map for local dev without Docker.
 */

const useDb = !!process.env["DATABASE_URL"];
const memoryStore = new Map<string, EvaluationRun>();

async function persistRun(run: EvaluationRun): Promise<void> {
  if (useDb) {
    await evalRepo.saveEvaluationRun(run);
  } else {
    memoryStore.set(run.id, run);
  }
}

async function getRun(id: string): Promise<EvaluationRun | null> {
  if (useDb) {
    return evalRepo.getEvaluationRun(id);
  }
  return memoryStore.get(id) ?? null;
}

async function getAllRuns() {
  if (useDb) {
    return evalRepo.listEvaluationRuns();
  }
  const allRuns = Array.from(memoryStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      summary: run.summary,
    }));
  return { runs: allRuns, total: allRuns.length };
}

async function removeRun(id: string): Promise<boolean> {
  if (useDb) {
    return evalRepo.deleteEvaluationRun(id);
  }
  return memoryStore.delete(id);
}

export const evaluationRoutes = new Hono();

evaluationRoutes.get("/", async (c) => {
  const { runs, total } = await getAllRuns();
  return c.json({ data: runs, metadata: { total } });
});

evaluationRoutes.get("/:id", async (c) => {
  const run = await getRun(c.req.param("id"));
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

      await persistRun(run);

      return c.json({ data: run }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Evaluation failed" }, 500);
    }
  }
);

evaluationRoutes.post("/stream",
  zValidator("json", createEvaluationSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  }),
  (c) => {
    const body = c.req.valid("json");
    const scenarios = generateDemoScenarios(body.domain, body.scenarioCount);

    const demoTask = async (input: Record<string, unknown>) => {
      const startTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
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

    return streamSSE(c, async (stream) => {
      let eventId = 0;

      const onProgress = (event: EvaluationProgress) => {
        stream.writeSSE({
          id: String(eventId++),
          event: event.type,
          data: JSON.stringify(event),
        });
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
          onProgress,
        });

        await persistRun(run);

        await stream.writeSSE({
          id: String(eventId++),
          event: "done",
          data: JSON.stringify({ runId: run.id }),
        });
      } catch (err) {
        await stream.writeSSE({
          id: String(eventId++),
          event: "error",
          data: JSON.stringify({ error: err instanceof Error ? err.message : "Evaluation failed" }),
        });
      }
    });
  }
);

evaluationRoutes.post("/:id/compare",
  zValidator("json", compareRunsSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    const currentRun = await getRun(c.req.param("id"));
    if (!currentRun) return c.json({ error: "Current run not found" }, 404);

    const body = c.req.valid("json");

    const baselineRun = await getRun(body.baselineId);
    if (!baselineRun) return c.json({ error: "Baseline run not found" }, 404);

    const report = compareRuns(baselineRun, currentRun);

    return c.json({ data: report });
  }
);

// Async evaluation (queued via Redis Streams when available)
evaluationRoutes.post("/async",
  zValidator("json", createEvaluationSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    if (!process.env["REDIS_URL"]) {
      return c.json({ error: "Async evaluation requires REDIS_URL to be configured" }, 503);
    }

    const body = c.req.valid("json");
    const jobId = crypto.randomUUID();

    const submittedAt = new Date().toISOString();

    await submitJob({
      id: jobId,
      name: body.name,
      domain: body.domain,
      scenarioCount: body.scenarioCount,
      trials: body.trials ?? 1,
      maxConcurrency: body.maxConcurrency ?? 5,
      timeout: body.timeout ?? 300_000,
      submittedAt,
    });

    await setJobStatus(jobId, { jobId, status: "queued", attempts: 0, submittedAt });

    return c.json({
      data: {
        jobId,
        status: "queued",
        message: "Evaluation queued for async processing",
      },
    }, 202);
  }
);

evaluationRoutes.get("/jobs/:jobId", async (c) => {
  if (!process.env["REDIS_URL"]) {
    return c.json({ error: "Job status requires REDIS_URL" }, 503);
  }

  const jobId = c.req.param("jobId");
  const status = await getJobStatus(jobId);
  if (!status) return c.json({ error: "Job not found" }, 404);
  return c.json({ data: status });
});

evaluationRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await removeRun(id);
  if (!deleted) return c.json({ error: "Not Found" }, 404);
  return c.json({ data: { deleted: true, id } });
});
