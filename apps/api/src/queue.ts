import Redis from "ioredis";
import { CircuitBreaker } from "./circuit-breaker.js";

/**
 * Redis-based job queue using Redis Streams.
 *
 * Provides async evaluation job submission and processing
 * with consumer groups for reliable delivery.
 * Protected by a circuit breaker to fail fast when Redis is down.
 */

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const STREAM_KEY = "syntharena:eval:jobs";
const GROUP_NAME = "eval-workers";
const CONSUMER_NAME = `worker-${process.pid}`;

let redis: Redis | null = null;

export const redisCircuitBreaker = new CircuitBreaker({
  name: "redis-queue",
  failureThreshold: 5,
  cooldownMs: 30_000,
});

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return redis;
}

export interface EvalJob {
  id: string;
  name: string;
  domain: string;
  scenarioCount: number;
  trials: number;
  maxConcurrency: number;
  timeout: number;
  submittedAt: string;
}

/** Initialize the consumer group (idempotent). */
export async function initQueue(): Promise<void> {
  const r = getRedis();
  await r.connect().catch((err) => {
    console.error(JSON.stringify({
      level: "error",
      message: "Redis connection failed during queue init",
      error: err instanceof Error ? err.message : String(err),
    }));
  });
  try {
    await r.xgroup("CREATE", STREAM_KEY, GROUP_NAME, "0", "MKSTREAM");
  } catch (err) {
    // Group already exists — fine
    if (!(err instanceof Error && err.message.includes("BUSYGROUP"))) throw err;
  }
}

/** Submit an evaluation job to the queue. Returns the stream entry ID. */
export async function submitJob(job: EvalJob): Promise<string> {
  return redisCircuitBreaker.execute(async () => {
    const r = getRedis();
    const entryId = await r.xadd(
      STREAM_KEY,
      "*",
      "payload", JSON.stringify(job),
    );
    if (!entryId) throw new Error("Failed to submit job to Redis stream");
    return entryId;
  });
}

/** Read pending jobs from the stream. Returns parsed jobs with their stream IDs. */
export async function readJobs(count: number = 5, blockMs: number = 2000): Promise<Array<{ streamId: string; job: EvalJob }>> {
  return redisCircuitBreaker.execute(async () => {
    const r = getRedis();
    const results = await r.xreadgroup(
      "GROUP", GROUP_NAME, CONSUMER_NAME,
      "COUNT", count,
      "BLOCK", blockMs,
      "STREAMS", STREAM_KEY, ">"
    ) as Array<[string, Array<[string, string[]]>]> | null;

    if (!results) return [];

    const jobs: Array<{ streamId: string; job: EvalJob }> = [];
    for (const [, entries] of results) {
      for (const [streamId, fields] of entries) {
        const payloadIdx = fields.indexOf("payload");
        const payload = payloadIdx >= 0 ? fields[payloadIdx + 1] : undefined;
        if (payload) {
          jobs.push({
            streamId,
            job: JSON.parse(payload) as EvalJob,
          });
        }
      }
    }
    return jobs;
  });
}

/** Acknowledge a processed job. */
export async function ackJob(streamId: string): Promise<void> {
  const r = getRedis();
  await r.xack(STREAM_KEY, GROUP_NAME, streamId);
}

/** Get queue depth (pending messages). */
export async function getQueueDepth(): Promise<number> {
  const r = getRedis();
  const len = await r.xlen(STREAM_KEY);
  return len;
}

// ─── Job Status Tracking ────────────────────────────────────────────

const JOB_STATUS_PREFIX = "syntharena:job:status:";
const JOB_STATUS_TTL = 86400; // 24 hours

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "dead";

export interface JobStatusRecord {
  jobId: string;
  status: JobStatus;
  attempts: number;
  runId?: string;
  error?: string;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
}

/** Set job status in Redis. */
export async function setJobStatus(jobId: string, record: Partial<JobStatusRecord>): Promise<void> {
  const r = getRedis();
  const key = `${JOB_STATUS_PREFIX}${jobId}`;
  const entries = Object.entries(record).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  await r.hset(key, ...entries.flatMap(([k, v]) => [k, String(v)]));
  await r.expire(key, JOB_STATUS_TTL);
}

/** Get job status from Redis. */
export async function getJobStatus(jobId: string): Promise<JobStatusRecord | null> {
  const r = getRedis();
  const data = await r.hgetall(`${JOB_STATUS_PREFIX}${jobId}`);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    jobId: data["jobId"] ?? jobId,
    status: (data["status"] as JobStatus) ?? "queued",
    attempts: parseInt(data["attempts"] ?? "0", 10),
    runId: data["runId"],
    error: data["error"],
    submittedAt: data["submittedAt"] ?? "",
    startedAt: data["startedAt"],
    completedAt: data["completedAt"],
  };
}

/** Claim pending entries that have been idle too long (retry mechanism). */
export async function claimStalePending(idleTimeMs: number = 60_000, count: number = 5): Promise<Array<{ streamId: string; job: EvalJob }>> {
  const r = getRedis();

  const claimed = await r.xautoclaim(
    STREAM_KEY, GROUP_NAME, CONSUMER_NAME,
    idleTimeMs, "0-0", "COUNT", count,
  ) as [string, Array<[string, string[]]>, string[]];

  if (!claimed || !claimed[1]) return [];

  const jobs: Array<{ streamId: string; job: EvalJob }> = [];
  for (const [streamId, fields] of claimed[1]) {
    const payloadIdx = fields.indexOf("payload");
    const payload = payloadIdx >= 0 ? fields[payloadIdx + 1] : undefined;
    if (payload) {
      jobs.push({ streamId, job: JSON.parse(payload) as EvalJob });
    }
  }
  return jobs;
}

/** Check Redis connectivity. Returns latency in ms or throws. */
export async function checkRedis(): Promise<number> {
  const r = getRedis();
  const start = Date.now();
  await r.ping();
  return Date.now() - start;
}

/** Close Redis connection. */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
