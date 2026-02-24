import { describe, it, expect, vi, beforeEach } from "vitest";
import { redTeamCommand } from "./red-team.js";

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  }),
}));

vi.mock("@syntharena/core", async () => {
  const actual = await vi.importActual<typeof import("@syntharena/core")>("@syntharena/core");
  return {
    ...actual,
    evaluate: vi.fn().mockResolvedValue({
      id: "rt-run",
      name: "red-team-eval",
      status: "completed",
      results: [],
      summary: {
        totalScenarios: 5,
        totalTrials: 5,
        overallPassRate: 0.8,
        passAtK: 0.75,
        passToTheK: 0.75,
        gPassAtK: 0.75,
        totalCost: 0.005,
        totalDuration: 250,
        avgTokensPerScenario: 200,
        latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
        scoreSummaries: {
          task_completion: { name: "task_completion", mean: 0.8, min: 0.2, max: 1.0, stddev: 0.2 },
          red_team: { name: "red_team", mean: 0.7, min: 0.0, max: 1.0, stddev: 0.3 },
        },
      },
    }),
  };
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("redTeamCommand", () => {
  it("runs red team evaluation", async () => {
    await redTeamCommand({
      domain: "web-scraping",
      scenarios: "5",
      trials: "1",
      categories: "prompt-injection,tool-misuse",
      intensity: "low",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Red Team");
    expect(logs).toContain("web-scraping");
  });

  it("uses all categories when 'all' is specified", async () => {
    await redTeamCommand({
      domain: "web-scraping",
      scenarios: "7",
      trials: "1",
      categories: "all",
      intensity: "medium",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Red Team");
  });

  it("outputs JSON when requested", async () => {
    await redTeamCommand({
      domain: "web-scraping",
      scenarios: "3",
      trials: "1",
      categories: "prompt-injection",
      intensity: "low",
      output: "json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("totalScenarios");
  });
});
