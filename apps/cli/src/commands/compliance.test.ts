import { describe, it, expect, vi, beforeEach } from "vitest";
import { complianceCommand } from "./compliance.js";

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
      id: "comp-run",
      name: "compliance-eval",
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
        scoreSummaries: {
          task_completion: { name: "task_completion", mean: 0.9, min: 0.5, max: 1.0, stddev: 0.1 },
        },
      },
    }),
    generateComplianceReport: vi.fn().mockReturnValue({
      systemInfo: {
        name: "compliance-test",
        domain: "healthcare",
        evaluatedAt: "2026-01-01T00:00:00Z",
        scenarioCount: 10,
        trialCount: 10,
      },
      riskClassification: {
        level: "high",
        reason: "Healthcare domain",
        articles: ["Art. 6", "Art. 9"],
      },
      testingSummary: {
        accuracy: { score: 0.9, status: "met", details: "90% pass rate" },
        robustness: { score: 0.85, status: "met", details: "85% robust" },
        fairness: { score: 0.8, status: "partial", details: "Limited diversity testing" },
      },
      checks: [
        { article: "Art. 9(2)", status: "met", requirement: "Risk management", severity: "critical" },
        { article: "Art. 10", status: "partial", requirement: "Data governance", severity: "major" },
      ],
      overallStatus: "partial",
      recommendations: ["Add more diverse test scenarios"],
    }),
  };
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("complianceCommand", () => {
  it("runs evaluation and displays compliance report", async () => {
    await complianceCommand({
      domain: "healthcare",
      scenarios: "10",
      trials: "1",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Compliance");
    expect(logs).toContain("healthcare");
  });

  it("outputs JSON when requested", async () => {
    await complianceCommand({
      domain: "healthcare",
      scenarios: "10",
      trials: "1",
      output: "json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("systemInfo");
    expect(logs).toContain("riskClassification");
  });
});
