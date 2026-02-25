import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Webhook repository DB tests.
 *
 * Tests SQL mapping and row transformation by mocking the postgres driver.
 */

const { mockSql } = vi.hoisted(() => {
  const mockSql = vi.fn();
  return { mockSql };
});

vi.mock("../db.js", () => {
  const handler = {
    get(_target: unknown, prop: string | symbol) {
      if (prop === "then") return undefined;
      return Reflect.get(mockSql, prop);
    },
    apply(_target: unknown, _thisArg: unknown, args: unknown[]) {
      return mockSql(...args);
    },
  };
  return { sql: new Proxy(mockSql, handler) };
});

import * as webhookRepo from "./webhooks.js";

const NOW = new Date("2026-02-01T00:00:00Z");

function makeWebhookRow(overrides?: Record<string, unknown>) {
  return {
    id: "wh-1",
    url: "https://example.com/hook",
    secret: "whsec_abc123",
    events: ["evaluation.completed", "evaluation.failed"],
    active: true,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeDeliveryRow(overrides?: Record<string, unknown>) {
  return {
    id: "del-1",
    webhook_id: "wh-1",
    event: "evaluation.completed",
    payload: { runId: "run-1" },
    status_code: 200,
    response_body: "OK",
    error: null,
    duration_ms: 150,
    delivered_at: NOW,
    ...overrides,
  };
}

describe("webhooks repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("inserts webhook and returns mapped record", async () => {
      mockSql.mockResolvedValueOnce([makeWebhookRow()]);

      const result = await webhookRepo.create({
        url: "https://example.com/hook",
        secret: "whsec_abc123",
        events: ["evaluation.completed"],
      });

      expect(result.id).toBe("wh-1");
      expect(result.url).toBe("https://example.com/hook");
      expect(result.secret).toBe("whsec_abc123");
      expect(result.events).toEqual(["evaluation.completed", "evaluation.failed"]);
      expect(result.active).toBe(true);
      expect(result.createdAt).toBe("2026-02-01T00:00:00.000Z");
      expect(result.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    });
  });

  describe("listActive", () => {
    it("returns only active webhooks mapped to records", async () => {
      mockSql.mockResolvedValueOnce([
        makeWebhookRow({ id: "wh-1" }),
        makeWebhookRow({ id: "wh-2", url: "https://other.com/hook" }),
      ]);

      const result = await webhookRepo.listActive();
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("wh-1");
      expect(result[1]!.id).toBe("wh-2");
    });

    it("returns empty array when no active webhooks", async () => {
      mockSql.mockResolvedValueOnce([]);
      const result = await webhookRepo.listActive();
      expect(result).toEqual([]);
    });
  });

  describe("listAll", () => {
    it("returns both active and inactive webhooks", async () => {
      mockSql.mockResolvedValueOnce([
        makeWebhookRow({ id: "wh-1", active: true }),
        makeWebhookRow({ id: "wh-2", active: false }),
      ]);

      const result = await webhookRepo.listAll();
      expect(result).toHaveLength(2);
      expect(result[0]!.active).toBe(true);
      expect(result[1]!.active).toBe(false);
    });
  });

  describe("findById", () => {
    it("returns mapped webhook when found", async () => {
      mockSql.mockResolvedValueOnce([makeWebhookRow()]);

      const result = await webhookRepo.findById("wh-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("wh-1");
      expect(result!.url).toBe("https://example.com/hook");
    });

    it("returns null when not found", async () => {
      mockSql.mockResolvedValueOnce([]);

      const result = await webhookRepo.findById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("deactivate", () => {
    it("returns true when webhook deactivated", async () => {
      mockSql.mockResolvedValueOnce({ count: 1 });

      const result = await webhookRepo.deactivate("wh-1");
      expect(result).toBe(true);
    });

    it("returns false when webhook not found or already inactive", async () => {
      mockSql.mockResolvedValueOnce({ count: 0 });

      const result = await webhookRepo.deactivate("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("logDelivery", () => {
    it("inserts delivery log without throwing", async () => {
      mockSql.mockResolvedValueOnce([]);

      await expect(
        webhookRepo.logDelivery({
          webhookId: "wh-1",
          event: "evaluation.completed",
          payload: { runId: "run-1" },
          statusCode: 200,
          responseBody: "OK",
          error: null,
          durationMs: 150,
        }),
      ).resolves.toBeUndefined();

      expect(mockSql).toHaveBeenCalledOnce();
    });

    it("handles delivery with error (null status code)", async () => {
      mockSql.mockResolvedValueOnce([]);

      await expect(
        webhookRepo.logDelivery({
          webhookId: "wh-1",
          event: "evaluation.completed",
          payload: { runId: "run-1" },
          statusCode: null,
          responseBody: null,
          error: "Connection refused",
          durationMs: null,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("getDeliveries", () => {
    it("returns mapped delivery records", async () => {
      mockSql.mockResolvedValueOnce([
        makeDeliveryRow(),
        makeDeliveryRow({ id: "del-2", status_code: 500, error: "Server Error" }),
      ]);

      const result = await webhookRepo.getDeliveries("wh-1");
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("del-1");
      expect(result[0]!.webhookId).toBe("wh-1");
      expect(result[0]!.statusCode).toBe(200);
      expect(result[0]!.deliveredAt).toBe("2026-02-01T00:00:00.000Z");
      expect(result[1]!.statusCode).toBe(500);
      expect(result[1]!.error).toBe("Server Error");
    });

    it("returns empty array when no deliveries", async () => {
      mockSql.mockResolvedValueOnce([]);

      const result = await webhookRepo.getDeliveries("wh-1");
      expect(result).toEqual([]);
    });

    it("respects custom limit", async () => {
      mockSql.mockResolvedValueOnce([]);

      await webhookRepo.getDeliveries("wh-1", 10);
      expect(mockSql).toHaveBeenCalledOnce();
    });
  });
});
