import { describe, it, expect } from "vitest";
import { generateId } from "./utils.js";

describe("generateId", () => {
  it("returns a 32-character hex string", () => {
    const id = generateId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
