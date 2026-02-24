import { describe, it, expect } from "vitest";
import { app } from "../index.js";

/**
 * Trace route tests — all endpoints require ClickHouse (CLICKHOUSE_URL).
 * In test environment without ClickHouse, all return 503.
 */

function request(path: string) {
  return app.fetch(new Request(`http://localhost${path}`));
}

describe("Trace routes", () => {
  describe("GET /api/v1/traces/run/:runId", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/run/test-run-id");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain("ClickHouse");
    });
  });

  describe("GET /api/v1/traces/:traceId", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/test-trace-id");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("GET /api/v1/traces/run/:runId/cost", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/run/test-run-id/cost");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/v1/traces/run/:runId/latency", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/run/test-run-id/latency");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/v1/traces/run/:runId/errors", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/run/test-run-id/errors");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/v1/traces/run/:runId/tokens", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/run/test-run-id/tokens");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/v1/traces/run/:runId/models", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/run/test-run-id/models");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/v1/traces/run/:runId/slowest", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/run/test-run-id/slowest");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/v1/traces/scenario/:scenarioId/performance", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/scenario/test-scenario-id/performance");
      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/v1/traces/:traceId/timeline", () => {
    it("returns 503 when ClickHouse is not configured", async () => {
      const res = await request("/api/v1/traces/test-trace-id/timeline");
      expect(res.status).toBe(503);
    });
  });
});
