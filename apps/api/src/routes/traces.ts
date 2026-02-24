import { Hono } from "hono";
import * as traceRepo from "../repositories/traces.js";
import { notFound, serviceUnavailable } from "../errors.js";

/**
 * Trace query routes.
 *
 * Provides read access to evaluation traces stored in ClickHouse.
 * Returns 503 when CLICKHOUSE_URL is not configured.
 */

const useClickHouse = !!process.env["CLICKHOUSE_URL"];

export const traceRoutes = new Hono();

traceRoutes.get("/run/:runId", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const runId = c.req.param("runId");
  const limit = parseInt(c.req.query("limit") ?? "1000", 10);

  const spans = await traceRepo.getSpansByRunId(runId, limit);
  return c.json({ data: spans, metadata: { total: spans.length } });
});

traceRoutes.get("/:traceId", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const traceId = c.req.param("traceId");
  const spans = await traceRepo.getSpansByTraceId(traceId);
  if (spans.length === 0) throw notFound("Trace", traceId);
  return c.json({ data: spans, metadata: { total: spans.length } });
});

traceRoutes.get("/run/:runId/cost", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const runId = c.req.param("runId");
  const analytics = await traceRepo.getCostAnalytics(runId);
  return c.json({ data: analytics });
});

traceRoutes.get("/run/:runId/latency", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const runId = c.req.param("runId");
  const percentiles = await traceRepo.getLatencyPercentiles(runId);
  return c.json({ data: percentiles });
});

traceRoutes.get("/run/:runId/errors", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const runId = c.req.param("runId");
  const errors = await traceRepo.getErrorAnalytics(runId);
  return c.json({ data: errors });
});

traceRoutes.get("/run/:runId/tokens", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const runId = c.req.param("runId");
  const intervalHours = parseInt(c.req.query("interval") ?? "1", 10);
  const trends = await traceRepo.getTokenUsageTrends(runId, intervalHours);
  return c.json({ data: trends });
});

traceRoutes.get("/run/:runId/models", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const runId = c.req.param("runId");
  const comparison = await traceRepo.getModelComparison(runId);
  return c.json({ data: comparison });
});

traceRoutes.get("/run/:runId/slowest", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const runId = c.req.param("runId");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const slowest = await traceRepo.getSlowestSpans(runId, limit);
  return c.json({ data: slowest });
});

traceRoutes.get("/scenario/:scenarioId/performance", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const scenarioId = c.req.param("scenarioId");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const performance = await traceRepo.getScenarioPerformance(scenarioId, limit);
  return c.json({ data: performance });
});

traceRoutes.get("/:traceId/timeline", async (c) => {
  if (!useClickHouse) {
    throw serviceUnavailable("ClickHouse (required for trace storage)");
  }

  const traceId = c.req.param("traceId");
  const timeline = await traceRepo.getTraceTimeline(traceId);
  if (timeline.length === 0) throw notFound("Trace", traceId);
  return c.json({ data: timeline });
});
