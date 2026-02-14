import { evaluate, taskCompletion, costThreshold, safetyCheck } from "@syntharena/core";
import { generateDemoScenarios } from "./routes/demo-scenarios.js";
import { initQueue, readJobs, ackJob, closeRedis } from "./queue.js";
import * as evalRepo from "./repositories/evaluations.js";
import { closeDatabase } from "./db.js";
import type { EvalJob } from "./queue.js";

/**
 * Evaluation worker — processes jobs from the Redis Streams queue.
 *
 * Runs as a separate process alongside the API server.
 * Picks up evaluation jobs, runs them, and saves results to PostgreSQL.
 *
 * Usage: npx tsx src/worker.ts
 */

let running = true;

async function processJob(job: EvalJob): Promise<void> {
  console.log(JSON.stringify({ level: "info", message: "Processing job", jobId: job.id, name: job.name }));

  const scenarios = generateDemoScenarios(job.domain, job.scenarioCount);

  const demoTask = async (input: Record<string, unknown>) => {
    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
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

  const run = await evaluate({
    name: job.name,
    dataset: scenarios,
    task: demoTask,
    scorers: [taskCompletion, costThreshold(0.50), safetyCheck()],
    trials: job.trials,
    maxConcurrency: job.maxConcurrency,
    timeout: job.timeout,
    metadata: { domain: job.domain, queueJobId: job.id },
  });

  // Persist to PostgreSQL if configured
  if (process.env["DATABASE_URL"]) {
    await evalRepo.saveEvaluationRun(run);
    console.log(JSON.stringify({ level: "info", message: "Job persisted", jobId: job.id, runId: run.id }));
  }

  console.log(JSON.stringify({
    level: "info",
    message: "Job completed",
    jobId: job.id,
    runId: run.id,
    scenarios: run.results.length,
    passRate: run.summary.overallPassRate,
  }));
}

async function workerLoop(): Promise<void> {
  console.log(JSON.stringify({ level: "info", message: "Worker started", pid: process.pid }));

  await initQueue();

  while (running) {
    try {
      const entries = await readJobs(3, 5000);

      for (const { streamId, job } of entries) {
        try {
          await processJob(job);
          await ackJob(streamId);
        } catch (err) {
          console.error(JSON.stringify({
            level: "error",
            message: "Job processing failed",
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
          }));
          // Don't ack — job will be retried via pending entries
        }
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        message: "Worker loop error",
        error: err instanceof Error ? err.message : String(err),
      }));
      // Back off on persistent errors
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function shutdown() {
  console.log(JSON.stringify({ level: "info", message: "Worker shutting down" }));
  running = false;
  await Promise.all([
    closeRedis().catch(() => {}),
    closeDatabase().catch(() => {}),
  ]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

workerLoop().catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
