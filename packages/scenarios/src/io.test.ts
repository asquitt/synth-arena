import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportScenarios, importScenarios } from "./io.js";
import type { Scenario } from "@syntharena/shared";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { readFileSync, writeFileSync, mkdirSync } from "fs";

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);

const SAMPLE_SCENARIO: Scenario = {
  id: "test-1",
  domain: "test",
  name: "Test scenario",
  description: "A test scenario",
  input: { query: "test" },
  expected: { success: true },
  metadata: {
    complexity: "low",
    tags: ["test"],
    generatedAt: "2026-01-01T00:00:00Z",
    generatorVersion: "0.1.0",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exportScenarios", () => {
  it("writes scenarios to JSON file", () => {
    exportScenarios([SAMPLE_SCENARIO], "/tmp/output/scenarios.json");

    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/output", { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/output/scenarios.json",
      expect.stringContaining('"id": "test-1"'),
      "utf-8",
    );
  });

  it("exports empty array as valid JSON", () => {
    exportScenarios([], "/tmp/output/empty.json");

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/output/empty.json",
      "[]",
      "utf-8",
    );
  });

  it("creates parent directories recursively", () => {
    exportScenarios([SAMPLE_SCENARIO], "/tmp/deeply/nested/dir/file.json");

    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/deeply/nested/dir", { recursive: true });
  });
});

describe("importScenarios", () => {
  it("imports valid scenario array", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify([SAMPLE_SCENARIO]));

    const scenarios = importScenarios("/tmp/input/scenarios.json");

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]!.id).toBe("test-1");
    expect(scenarios[0]!.domain).toBe("test");
    expect(scenarios[0]!.metadata.complexity).toBe("low");
  });

  it("throws for non-array JSON", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ not: "array" }));

    expect(() => importScenarios("/tmp/bad.json")).toThrow("Expected JSON array");
  });

  it("throws for invalid JSON", () => {
    mockReadFileSync.mockReturnValue("not json {{{");

    expect(() => importScenarios("/tmp/bad.json")).toThrow();
  });

  it("throws for scenario missing id", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify([{ domain: "test" }]));

    expect(() => importScenarios("/tmp/bad.json")).toThrow("missing string 'id'");
  });

  it("throws for scenario missing domain", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify([{ id: "s-1" }]));

    expect(() => importScenarios("/tmp/bad.json")).toThrow("missing string 'domain'");
  });

  it("throws for non-object scenario", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(["not an object"]));

    expect(() => importScenarios("/tmp/bad.json")).toThrow("not an object");
  });

  it("applies defaults for missing optional fields", () => {
    const minimal = [{ id: "s-1", domain: "test" }];
    mockReadFileSync.mockReturnValue(JSON.stringify(minimal));

    const scenarios = importScenarios("/tmp/minimal.json");

    expect(scenarios[0]!.name).toBe("scenario-0");
    expect(scenarios[0]!.description).toBe("");
    expect(scenarios[0]!.input).toEqual({});
    expect(scenarios[0]!.metadata.complexity).toBe("medium");
    expect(scenarios[0]!.metadata.tags).toEqual([]);
  });

  it("preserves metadata when present", () => {
    const withMeta = [{
      id: "s-1",
      domain: "test",
      metadata: { complexity: "high", tags: ["edge", "auth"], generatedAt: "2026-01-01" },
    }];
    mockReadFileSync.mockReturnValue(JSON.stringify(withMeta));

    const scenarios = importScenarios("/tmp/meta.json");

    expect(scenarios[0]!.metadata.complexity).toBe("high");
    expect(scenarios[0]!.metadata.tags).toEqual(["edge", "auth"]);
  });

  it("imports multiple scenarios", () => {
    const multiple = [
      { id: "s-1", domain: "test", name: "First" },
      { id: "s-2", domain: "test", name: "Second" },
      { id: "s-3", domain: "test", name: "Third" },
    ];
    mockReadFileSync.mockReturnValue(JSON.stringify(multiple));

    const scenarios = importScenarios("/tmp/multi.json");

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0]!.name).toBe("First");
    expect(scenarios[2]!.name).toBe("Third");
  });
});
