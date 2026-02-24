import { describe, it, expect } from "vitest";
import { hashKey } from "./api-keys.js";

/**
 * API key repository tests — tests the hashKey utility.
 *
 * Database operations (findByHash, createKey, etc.) require PostgreSQL
 * and are tested via the admin route integration tests.
 */

describe("hashKey", () => {
  it("returns a SHA-256 hex string", () => {
    const hash = hashKey("sa_test_key_12345");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const h1 = hashKey("sa_my_key");
    const h2 = hashKey("sa_my_key");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different keys", () => {
    const h1 = hashKey("sa_key_one");
    const h2 = hashKey("sa_key_two");
    expect(h1).not.toBe(h2);
  });

  it("handles empty string", () => {
    const hash = hashKey("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles very long keys", () => {
    const longKey = "sa_" + "a".repeat(10000);
    const hash = hashKey(longKey);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
