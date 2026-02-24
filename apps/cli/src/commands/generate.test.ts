import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ora
vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  }),
}));

// Mock scenarios package
vi.mock("@syntharena/scenarios", () => ({
  loadTemplate: vi.fn().mockReturnValue({
    template: {
      name: "web-scraping",
      version: "1.0",
      scenarioGenerators: [{ name: "gen1", type: "llm", config: {} }],
    },
    seeds: [],
  }),
  generateScenarios: vi.fn().mockResolvedValue([
    { id: "s1", domain: "web-scraping", name: "test", description: "test", input: {}, metadata: { complexity: "medium", tags: ["test"], generatedAt: "2026-01-01", generatorVersion: "1.0" } },
  ]),
  validateScenarioQuality: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
  formatQualityReport: vi.fn().mockReturnValue("Quality: Good"),
  exportScenarios: vi.fn(),
}));

import { generateCommand } from "./generate.js";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
});

describe("generateCommand", () => {
  it("fails without ANTHROPIC_API_KEY", async () => {
    const original = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];

    await generateCommand({
      domain: "web-scraping",
      scenarios: "10",
      quality: false,
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("ANTHROPIC_API_KEY");

    if (original) process.env["ANTHROPIC_API_KEY"] = original;
  });

  it("generates and displays summary with API key", async () => {
    const original = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "test-key";

    await generateCommand({
      domain: "web-scraping",
      scenarios: "10",
      quality: false,
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Summary");
    expect(logs).toContain("Generated");

    if (original) {
      process.env["ANTHROPIC_API_KEY"] = original;
    } else {
      delete process.env["ANTHROPIC_API_KEY"];
    }
  });
});
