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
