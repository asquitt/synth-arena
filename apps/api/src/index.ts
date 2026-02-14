// OTel must initialize before other imports to hook instrumentation
import { initTracing, shutdownTracing } from "./tracing.js";
initTracing();

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { bodyLimit } from "hono/body-limit";
import { evaluationRoutes } from "./routes/evaluations.js";
import { scenarioRoutes } from "./routes/scenarios.js";
import { domainRoutes } from "./routes/domains.js";
import { costRoutes } from "./routes/cost.js";
import { authenticate, requirePermission } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { adminRoutes } from "./routes/admin.js";
import { traceRoutes } from "./routes/traces.js";
import { checkClickHouse } from "./repositories/traces.js";
import { validateEnv } from "./middleware/env.js";
import { checkDatabase, closeDatabase } from "./db.js";
import { checkRedis, closeRedis, initQueue } from "./queue.js";
import { ApiError } from "./errors.js";
import { trackHttpRequest, renderMetrics } from "./metrics.js";
import { trace, SpanStatusCode } from "@opentelemetry/api";

// Validate environment at startup (fail fast)
const env = validateEnv();

const app = new Hono();

// Middleware
app.use("*", cors({
  origin: env.allowedOrigins,
  credentials: true,
}));
app.use("*", requestId());
app.use("*", bodyLimit({ maxSize: 10 * 1024 * 1024 })); // 10MB

// Structured JSON logging + metrics + OTel span middleware
app.use("*", async (c, next) => {
  const tracer = trace.getTracer("syntharena.api", "0.1.0");
  await tracer.startActiveSpan(`${c.req.method} ${c.req.path}`, async (span) => {
    span.setAttribute("http.method", c.req.method);
    span.setAttribute("http.url", c.req.url);
    span.setAttribute("http.route", c.req.path);
    const rid = c.get("requestId");
    if (rid) span.setAttribute("request.id", rid);

    const start = Date.now();
    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      span.setAttribute("http.status_code", c.res.status);
      span.setAttribute("http.duration_ms", duration);
      if (c.res.status >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${c.res.status}` });
      }
      span.end();

      trackHttpRequest(c.req.method, c.req.path, c.res.status, duration);
      const log = {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration,
        requestId: rid,
      };
      if (c.res.status >= 400) {
        console.error(JSON.stringify(log));
      } else {
        console.log(JSON.stringify(log));
      }
    }
  });
});

// Health check (unauthenticated)
app.get("/health", (c) => c.json({
  status: "ok",
  version: "0.1.0",
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
}));

// Deep health check (unauthenticated)
app.get("/health/deep", async (c) => {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Memory check
  const mem = process.memoryUsage();
  checks["memory"] = {
    status: mem.heapUsed / mem.heapTotal < 0.9 ? "healthy" : "warning",
    latency: 0,
  };

  // Event loop check (basic)
  const loopStart = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const loopLatency = Date.now() - loopStart;
  checks["event_loop"] = {
    status: loopLatency < 100 ? "healthy" : "degraded",
    latency: loopLatency,
  };

  // PostgreSQL check
  if (process.env["DATABASE_URL"]) {
    try {
      const dbLatency = await checkDatabase();
      checks["postgres"] = { status: "healthy", latency: dbLatency };
    } catch {
      checks["postgres"] = { status: "unhealthy", latency: -1 };
    }
  }

  // Redis check
  if (process.env["REDIS_URL"]) {
    try {
      const redisLatency = await checkRedis();
      checks["redis"] = { status: "healthy", latency: redisLatency };
    } catch {
      checks["redis"] = { status: "unhealthy", latency: -1 };
    }
  }

  // ClickHouse check
  if (process.env["CLICKHOUSE_URL"]) {
    try {
      const chLatency = await checkClickHouse();
      checks["clickhouse"] = { status: "healthy", latency: chLatency };
    } catch {
      checks["clickhouse"] = { status: "unhealthy", latency: -1 };
    }
  }

  const overall = Object.values(checks).every((ch) => ch.status === "healthy")
    ? "healthy"
    : "degraded";

  return c.json({ status: overall, checks, timestamp: new Date().toISOString() });
});

// Prometheus metrics (unauthenticated)
app.get("/metrics", (c) => {
  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.text(renderMetrics());
});

// API v1 routes (authenticated + rate limited)
const v1 = new Hono();
v1.use("*", authenticate);
v1.use("*", rateLimit);
v1.route("/evaluations", evaluationRoutes);
v1.route("/scenarios", scenarioRoutes);
v1.route("/domains", domainRoutes);
v1.route("/cost", costRoutes);
v1.route("/traces", traceRoutes);

// Admin routes (require "admin" permission)
const admin = new Hono();
admin.use("*", authenticate);
admin.use("*", requirePermission("admin"));
admin.route("/", adminRoutes);
v1.route("/admin", admin);

app.route("/api/v1", v1);

// 404 handler
app.notFound((c) => c.json({
  error: { code: "NOT_FOUND", message: `Route ${c.req.method} ${c.req.path} not found` },
}, 404));

// Error handler
app.onError((err, c) => {
  const rid = c.get("requestId");

  // Structured ApiError — return code + message
  if (err instanceof ApiError) {
    console.error(JSON.stringify({
      level: "error",
      code: err.code,
      message: err.message,
      requestId: rid,
      path: c.req.path,
    }));
    return c.json({ ...err.toJSON(), requestId: rid }, err.statusCode as 400);
  }

  // Unhandled error — log stack, return generic message
  console.error(JSON.stringify({
    level: "error",
    message: err.message,
    stack: env.nodeEnv !== "production" ? err.stack : undefined,
    requestId: rid,
    path: c.req.path,
  }));
  return c.json({
    error: {
      code: "INTERNAL_ERROR",
      message: env.nodeEnv !== "production" ? err.message : "An unexpected error occurred",
    },
    requestId: rid,
  }, 500);
});

// Start server
let server: ServerType;

async function startServer() {
  // Initialize Redis queue if REDIS_URL is configured
  if (process.env["REDIS_URL"]) {
    await initQueue().catch((err) => {
      console.warn(JSON.stringify({ level: "warn", message: "Redis queue init failed, async jobs unavailable", error: String(err) }));
    });
  }

  server = serve({ fetch: app.fetch, port: env.port });
  console.log(JSON.stringify({
    level: "info",
    message: `SynthArena API started`,
    port: env.port,
    env: env.nodeEnv,
    auth: env.apiKeys.length > 0 ? "enabled" : "disabled",
    cors: env.allowedOrigins,
    database: process.env["DATABASE_URL"] ? "connected" : "in-memory",
    redis: process.env["REDIS_URL"] ? "connected" : "disabled",
    clickhouse: process.env["CLICKHOUSE_URL"] ? "connected" : "disabled",
    otel: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ? "enabled" : "disabled",
  }));
}

// Graceful shutdown
function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", message: `Received ${signal}, shutting down` }));
  server?.close(async () => {
    await Promise.all([
      closeDatabase().catch(() => {}),
      closeRedis().catch(() => {}),
      shutdownTracing().catch(() => {}),
    ]);
    console.log(JSON.stringify({ level: "info", message: "Server closed" }));
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => {
    console.error(JSON.stringify({ level: "error", message: "Forced shutdown after timeout" }));
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();
