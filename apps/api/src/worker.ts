import { evaluate, taskCompletion, costThreshold, safetyCheck, generateId } from "@syntharena/core";
import type { EvaluationRun } from "@syntharena/shared";
import { generateDemoScenarios } from "./routes/demo-scenarios.js";
import { initQueue, readJobs, ackJob, claimStalePending, setJobStatus, getJobStatus, closeRedis } from "./queue.js";
import * as evalRepo from "./repositories/evaluations.js";
import * as traceRepo from "./repositories/traces.js";
import { closeDatabase } from "./db.js";
import { deliverWebhook } from "./webhooks.js";
import type { EvalJob } from "./queue.js";

/**
 * Evaluation worker — processes jobs from the Redis Streams queue.
 *
 * Runs as a separate process alongside the API server.
 * Picks up evaluation jobs, runs them, and saves results to PostgreSQL.
 *
 * Usage: npx tsx src/worker.ts
 */

const MAX_RETRIES = 3;
let running = true;

async function processJob(job: EvalJob): Promise<void> {
  console.log(JSON.stringify({ level: "info", message: "Processing job", jobId: job.id, name: job.name }));

  await setJobStatus(job.id, { jobId: job.id, status: "processing", startedAt: new Date().toISOString() });

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

  // Write trace spans to ClickHouse if configured
  if (process.env["CLICKHOUSE_URL"]) {
    const spans = buildTraceSpans(run, job.domain);
    if (spans.length > 0) {
      await traceRepo.insertSpans(spans);
      console.log(JSON.stringify({ level: "info", message: "Traces written", jobId: job.id, spans: spans.length }));
    }
  }

  // Deliver webhook notifications (fire and forget, log on failure)
  const event = run.status === "completed" ? "evaluation.completed" : "evaluation.failed";
  deliverWebhook(event, run, job.domain).catch((err) => {
    console.error(JSON.stringify({
      level: "error",
      message: "Webhook delivery failed",
      event,
      jobId: job.id,
      runId: run.id,
      error: err instanceof Error ? err.message : String(err),
    }));
  });

  await setJobStatus(job.id, {
    status: "completed",
    runId: run.id,
    completedAt: new Date().toISOString(),
  });

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
      // Process new jobs
      const entries = await readJobs(3, 5000);
      for (const { streamId, job } of entries) {
        await handleJob(streamId, job);
      }

      // Reclaim stale pending jobs (idle > 60s = likely crashed worker)
      const stale = await claimStalePending(60_000, 3);
      for (const { streamId, job } of stale) {
        console.log(JSON.stringify({ level: "info", message: "Reclaimed stale job", jobId: job.id }));
        await handleJob(streamId, job);
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        message: "Worker loop error",
        error: err instanceof Error ? err.message : String(err),
      }));
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/** Handle a job with retry tracking. Dead-letters after MAX_RETRIES. */
async function handleJob(streamId: string, job: EvalJob): Promise<void> {
  const status = await getJobStatus(job.id);
  const attempts = (status?.attempts ?? 0) + 1;

  if (attempts > MAX_RETRIES) {
    console.error(JSON.stringify({
      level: "error",
      message: "Job exceeded max retries, dead-lettering",
      jobId: job.id,
      attempts,
    }));
    await setJobStatus(job.id, { status: "dead", attempts, error: "Max retries exceeded" });
    await ackJob(streamId);
    return;
  }

  await setJobStatus(job.id, { attempts });

  try {
    await processJob(job);
    await ackJob(streamId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await setJobStatus(job.id, { status: "failed", error: errorMsg });
    console.error(JSON.stringify({
      level: "error",
      message: "Job processing failed",
      jobId: job.id,
      attempt: attempts,
      maxRetries: MAX_RETRIES,
      error: errorMsg,
    }));
    // Don't ack — will be reclaimed via claimStalePending on next cycle
  }
}

/** Convert an EvaluationRun into ClickHouse trace span rows. */
function buildTraceSpans(run: EvaluationRun, domain: string): traceRepo.TraceSpanRow[] {
  const spans: traceRepo.TraceSpanRow[] = [];
  const traceId = generateId();
  const now = new Date().toISOString();

  for (const scenarioResult of run.results) {
    for (const trial of scenarioResult.trials) {
      const spanId = generateId();
      const { tokenUsage, duration } = trial.taskResult;
      const startTime = new Date(Date.now() - duration).toISOString();

      spans.push({
        trace_id: traceId,
        span_id: spanId,
        parent_id: "",
        name: `eval:${run.name}`,
        type: "llm_call",
        start_time: startTime,
        end_time: now,
        duration_ms: duration,
        status: trial.passed ? "ok" : "error",
        run_id: run.id,
        scenario_id: scenarioResult.scenarioId,
        trial_number: trial.trialNumber,
        model: tokenUsage.model,
        provider: tokenUsage.provider,
        input_tokens: tokenUsage.inputTokens,
        output_tokens: tokenUsage.outputTokens,
        cost: tokenUsage.estimatedCost,
        attributes: JSON.stringify({ domain, scores: trial.scores }),
        events: JSON.stringify([]),
      });
    }
  }

  return spans;
}

async function shutdown() {
  console.log(JSON.stringify({ level: "info", message: "Worker shutting down" }));
  running = false;
  await Promise.all([
    closeRedis().catch((err) => {
      console.error(JSON.stringify({ level: "error", message: "Redis close failed during shutdown", error: String(err) }));
    }),
    closeDatabase().catch((err) => {
      console.error(JSON.stringify({ level: "error", message: "Database close failed during shutdown", error: String(err) }));
    }),
  ]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

workerLoop().catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
