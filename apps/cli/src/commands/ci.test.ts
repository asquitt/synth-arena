import { describe, it, expect, vi, beforeEach } from "vitest";
import { ciCommand } from "./ci.js";

vi.mock("@syntharena/core", async () => {
  const actual = await vi.importActual<typeof import("@syntharena/core")>("@syntharena/core");
  return {
    ...actual,
    evaluate: vi.fn().mockResolvedValue({
      id: "ci-run",
      name: "ci-eval",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 10,
        totalTrials: 10,
        overallPassRate: 0.9,
        passAtK: 0.85,
        passToTheK: 0.85,
        gPassAtK: 0.85,
        totalCost: 0.01,
        totalDuration: 500,
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {},
      },
    }),
  };
});

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  process.exitCode = undefined;
});

describe("ciCommand", () => {
  it("runs evaluation and outputs pass status in table mode", async () => {
    await ciCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      concurrency: "5",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("SynthArena CI");
    expect(logs).toContain("Pass rate");
    expect(process.exitCode).toBe(0);
  });

  it("outputs JSON when requested", async () => {
    await ciCommand({
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
      concurrency: "5",
      output: "json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("ci-run");
    expect(logs).toContain('"status"');
  });

  it("sets exit code 0 when all gates pass", async () => {
    await ciCommand({
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
      concurrency: "5",
      minPassRate: "0.5",
      output: "table",
    });

    // 0.9 pass rate > 0.5 threshold = pass
    expect(process.exitCode).toBe(0);
  });

  it("displays gate information in table mode", async () => {
    await ciCommand({
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
      concurrency: "5",
      minPassRate: "0.5",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Gates");
    expect(logs).toContain("min_pass_rate");
  });

  it("includes run ID in output", async () => {
    await ciCommand({
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
      concurrency: "5",
      output: "json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("ci-run");
  });
});
