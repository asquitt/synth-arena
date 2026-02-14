import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import type { EvaluationRun, EvaluationProgress } from "@syntharena/shared";
import { evaluate, taskCompletion, costThreshold, safetyCheck, generateComplianceReport } from "@syntharena/core";
import { compareRuns } from "@syntharena/replay";
import { generateDemoScenarios } from "./demo-scenarios.js";
import { createEvaluationSchema, compareRunsSchema } from "../schemas.js";
import * as evalRepo from "../repositories/evaluations.js";
import { submitJob, setJobStatus, getJobStatus } from "../queue.js";
import { ApiError, notFound, validationError, serviceUnavailable } from "../errors.js";

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

async function getAllRuns(opts?: { limit?: number; offset?: number; domain?: string; status?: string }) {
  if (useDb) {
    return evalRepo.listEvaluationRuns(opts);
  }
  let allRuns = Array.from(memoryStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (opts?.domain) {
    allRuns = allRuns.filter((r) => (r.config.metadata as Record<string, unknown> | undefined)?.["domain"] === opts.domain);
  }
  if (opts?.status) {
    allRuns = allRuns.filter((r) => r.status === opts.status);
  }

  const total = allRuns.length;
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 50;
  const sliced = allRuns.slice(offset, offset + limit);

  return {
    runs: sliced.map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      summary: run.summary,
    })),
    total,
  };
}

async function removeRun(id: string): Promise<boolean> {
  if (useDb) {
    return evalRepo.deleteEvaluationRun(id);
  }
  return memoryStore.delete(id);
}

export const evaluationRoutes = new Hono();

evaluationRoutes.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const domain = c.req.query("domain") || undefined;
  const status = c.req.query("status") || undefined;
  const { runs, total } = await getAllRuns({ limit, offset, domain, status });
  return c.json({ data: runs, metadata: { total, limit, offset } });
});

evaluationRoutes.get("/:id", async (c) => {
  const run = await getRun(c.req.param("id"));
  if (!run) throw notFound("Evaluation", c.req.param("id"));
  return c.json({ data: run });
});

evaluationRoutes.post("/",
  zValidator("json", createEvaluationSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
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
      throw new ApiError("EVALUATION_FAILED", err instanceof Error ? err.message : "Evaluation failed", 500);
    }
  }
);

evaluationRoutes.post("/stream",
  zValidator("json", createEvaluationSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
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
  zValidator("json", compareRunsSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
    }
  }),
  async (c) => {
    const currentRun = await getRun(c.req.param("id"));
    if (!currentRun) throw notFound("Evaluation", c.req.param("id"));

    const body = c.req.valid("json");

    const baselineRun = await getRun(body.baselineId);
    if (!baselineRun) throw notFound("Baseline evaluation", body.baselineId);

    const report = compareRuns(baselineRun, currentRun);

    return c.json({ data: report });
  }
);

// Async evaluation (queued via Redis Streams when available)
evaluationRoutes.post("/async",
  zValidator("json", createEvaluationSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
    }
  }),
  async (c) => {
    if (!process.env["REDIS_URL"]) {
      throw serviceUnavailable("Redis (required for async evaluation)");
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
    throw serviceUnavailable("Redis (required for job status)");
  }

  const jobId = c.req.param("jobId");
  const status = await getJobStatus(jobId);
  if (!status) throw new ApiError("JOB_NOT_FOUND", `Job '${jobId}' not found`, 404);
  return c.json({ data: status });
});

// EU AI Act compliance report
evaluationRoutes.get("/:id/compliance", async (c) => {
  const run = await getRun(c.req.param("id"));
  if (!run) throw notFound("Evaluation", c.req.param("id"));
  if (run.status !== "completed") {
    throw new ApiError("EVALUATION_NOT_COMPLETE", "Compliance reports require a completed evaluation", 400);
  }
  const report = generateComplianceReport(run);
  return c.json({ data: report });
});

evaluationRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await removeRun(id);
  if (!deleted) throw notFound("Evaluation", id);
  return c.json({ data: { deleted: true, id } });
});
