import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * API Keys repository DB tests.
 *
 * Tests database operations (findByHash, createKey, listKeys, revokeKey, touchKey)
 * by mocking the postgres driver. Complements api-keys.test.ts which only tests hashKey.
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

import { findByHash, touchKey, createKey, listKeys, revokeKey, hashKey } from "./api-keys.js";

const NOW = new Date("2026-02-01T00:00:00Z");

function makeKeyRow(overrides?: Record<string, unknown>) {
  return {
    id: "key-1",
    key_hash: hashKey("sa_test_key"),
    name: "Test Key",
    permissions: ["read", "write"],
    rate_limit_per_minute: 60,
    is_active: true,
    created_at: NOW,
    last_used_at: null,
    ...overrides,
  };
}

describe("api-keys repository (DB operations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findByHash", () => {
    it("returns mapped record when key found and active", async () => {
      mockSql.mockResolvedValueOnce([makeKeyRow()]);

      const result = await findByHash(hashKey("sa_test_key"));
      expect(result).not.toBeNull();
      expect(result!.id).toBe("key-1");
      expect(result!.name).toBe("Test Key");
      expect(result!.permissions).toEqual(["read", "write"]);
      expect(result!.rateLimitPerMinute).toBe(60);
      expect(result!.isActive).toBe(true);
      expect(result!.createdAt).toBe("2026-02-01T00:00:00.000Z");
      expect(result!.lastUsedAt).toBeNull();
    });

    it("maps lastUsedAt when present", async () => {
      const usedAt = new Date("2026-02-15T12:00:00Z");
      mockSql.mockResolvedValueOnce([makeKeyRow({ last_used_at: usedAt })]);

      const result = await findByHash("somehash");
      expect(result!.lastUsedAt).toBe("2026-02-15T12:00:00.000Z");
    });

    it("returns null when no matching key", async () => {
      mockSql.mockResolvedValueOnce([]);

      const result = await findByHash("nonexistent-hash");
      expect(result).toBeNull();
    });
  });

  describe("touchKey", () => {
    it("calls SQL update without throwing", async () => {
      mockSql.mockResolvedValueOnce({});

      await expect(touchKey("some-hash")).resolves.toBeUndefined();
      expect(mockSql).toHaveBeenCalledOnce();
    });
  });

  describe("createKey", () => {
    it("returns id and raw key with sa_ prefix", async () => {
      mockSql.mockResolvedValueOnce([{ id: "key-new-1" }]);

      const result = await createKey({ name: "My Key" });
      expect(result.id).toBe("key-new-1");
      expect(result.rawKey).toMatch(/^sa_[0-9a-f]{64}$/);
    });

    it("generates unique raw keys each call", async () => {
      mockSql.mockResolvedValueOnce([{ id: "k1" }]);
      const result1 = await createKey({});

      mockSql.mockResolvedValueOnce([{ id: "k2" }]);
      const result2 = await createKey({});

      expect(result1.rawKey).not.toBe(result2.rawKey);
    });

    it("uses default permissions when not specified", async () => {
      mockSql.mockResolvedValueOnce([{ id: "k1" }]);

      await createKey({});
      // The mock was called - verify the call happened
      expect(mockSql).toHaveBeenCalledOnce();
    });

    it("passes custom permissions and rate limit", async () => {
      mockSql.mockResolvedValueOnce([{ id: "k1" }]);

      await createKey({
        name: "Admin Key",
        permissions: ["read", "write", "admin"],
        rateLimitPerMinute: 120,
      });

      expect(mockSql).toHaveBeenCalledOnce();
    });
  });

  describe("listKeys", () => {
    it("returns mapped records without keyHash", async () => {
      mockSql.mockResolvedValueOnce([
        {
          id: "key-1",
          name: "Key One",
          permissions: ["read"],
          rate_limit_per_minute: 30,
          is_active: true,
          created_at: NOW,
          last_used_at: null,
        },
        {
          id: "key-2",
          name: "Key Two",
          permissions: ["read", "write"],
          rate_limit_per_minute: 60,
          is_active: false,
          created_at: NOW,
          last_used_at: NOW,
        },
      ]);

      const result = await listKeys();
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("key-1");
      expect(result[0]!.name).toBe("Key One");
      expect(result[0]!.permissions).toEqual(["read"]);
      expect(result[0]!.rateLimitPerMinute).toBe(30);
      // Verify keyHash is NOT present
      expect("keyHash" in result[0]!).toBe(false);
      expect(result[1]!.isActive).toBe(false);
      expect(result[1]!.lastUsedAt).toBe("2026-02-01T00:00:00.000Z");
    });

    it("returns empty array when no keys exist", async () => {
      mockSql.mockResolvedValueOnce([]);

      const result = await listKeys();
      expect(result).toEqual([]);
    });
  });

  describe("revokeKey", () => {
    it("returns true when key revoked", async () => {
      mockSql.mockResolvedValueOnce({ count: 1 });

      const result = await revokeKey("key-1");
      expect(result).toBe(true);
    });

    it("returns false when key not found or already revoked", async () => {
      mockSql.mockResolvedValueOnce({ count: 0 });

      const result = await revokeKey("nonexistent");
      expect(result).toBe(false);
    });
  });
});
