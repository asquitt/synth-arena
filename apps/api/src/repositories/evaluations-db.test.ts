import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Evaluation repository DB code path tests.
 *
 * Tests the SQL mapping logic by mocking the postgres driver.
 * Verifies that repository functions construct correct queries
 * and transform rows properly.
 */

const { mockSql, mockBegin } = vi.hoisted(() => {
  const mockSql = vi.fn();
  const mockBegin = vi.fn();
  return { mockSql, mockBegin };
});

vi.mock("../db.js", () => {
  const handler = {
    get(_target: unknown, prop: string | symbol) {
      if (prop === "begin") return mockBegin;
      if (prop === "then") return undefined; // prevent Promise-like behavior
      return Reflect.get(mockSql, prop);
    },
    apply(_target: unknown, _thisArg: unknown, args: unknown[]) {
      return mockSql(...args);
    },
  };
  return { sql: new Proxy(mockSql, handler) };
});

import * as evalRepo from "./evaluations.js";
import type { EvaluationRun } from "@syntharena/shared";

function makeMockRun(overrides?: Partial<EvaluationRun>): EvaluationRun {
  return {
    id: "run-123",
    name: "test-run",
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
    config: { dataset: [], metadata: { domain: "web-scraping" } } as EvaluationRun["config"],
    results: [
      {
        scenarioId: "sc-1",
        passAtK: 0.8,
        passToTheK: 0.64,
        gPassAtK: 0.75,
        aggregatedScores: { task_completion: { mean: 0.8, stddev: 0.1, min: 0.6, max: 1.0 } },
        trials: [
          {
            trialNumber: 1,
            passed: true,
            scores: [{ name: "task_completion", score: 0.8, passed: true }],
            taskResult: {
              output: { result: "done" },
              trace: [],
              tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.001, model: "demo", provider: "demo" },
              duration: 500,
            },
          },
        ],
      },
    ],
    summary: {
      totalScenarios: 1,
      totalTrials: 1,
      overallPassRate: 0.8,
      passAtK: 0.8,
      passToTheK: 0.64,
      gPassAtK: 0.75,
      totalCost: 0.001,
      totalDuration: 500,
      avgTokensPerScenario: 150,
      latencyPercentiles: { p50: 500, p90: 500, p95: 500, p99: 500 },
      scoreSummaries: {},
    },
    ...overrides,
  };
}

describe("evaluations repository (DB code paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveEvaluationRun", () => {
    it("calls sql.begin for transactional insert", async () => {
      const txMock = vi.fn().mockResolvedValue([{ id: "sr-1" }]);
      mockBegin.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        await cb(txMock);
      });

      const run = makeMockRun();
      await evalRepo.saveEvaluationRun(run);

      expect(mockBegin).toHaveBeenCalledOnce();
    });
  });

  describe("listEvaluationRuns", () => {
    it("returns mapped rows with total count", async () => {
      const mockRows = [
        {
          id: "run-1",
          name: "test",
          status: "completed",
          domain: "web-scraping",
          summary: { totalScenarios: 5, overallPassRate: 0.9 },
          created_at: new Date("2026-01-01"),
          completed_at: new Date("2026-01-01"),
        },
      ];

      // First call returns rows, second returns count
      mockSql.mockResolvedValueOnce(mockRows).mockResolvedValueOnce([{ total: 1 }]);

      const result = await evalRepo.listEvaluationRuns({ limit: 10, offset: 0 });

      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].id).toBe("run-1");
      expect(result.runs[0].status).toBe("completed");
      expect(result.runs[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
      expect(result.total).toBe(1);
    });

    it("applies default limit and offset", async () => {
      mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      const result = await evalRepo.listEvaluationRuns();

      expect(result.runs).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("getEvaluationRun", () => {
    it("returns null when run not found", async () => {
      mockSql.mockResolvedValueOnce([]);

      const result = await evalRepo.getEvaluationRun("nonexistent");
      expect(result).toBeNull();
    });

    it("reconstructs full run with scenario and trial results", async () => {
      // First query: evaluation_runs
      mockSql.mockResolvedValueOnce([{
        id: "run-1",
        name: "test",
        status: "completed",
        domain: "web-scraping",
        config: { metadata: { domain: "web-scraping" } },
        summary: { totalScenarios: 1, overallPassRate: 0.9 },
        created_at: new Date("2026-01-01"),
        completed_at: new Date("2026-01-02"),
      }]);

      // Second query: scenario_results
      mockSql.mockResolvedValueOnce([{
        id: "sr-1",
        run_id: "run-1",
        scenario_id: "sc-1",
        pass_at_k: 0.9,
        pass_to_the_k: 0.81,
        g_pass_at_k: 0.85,
        aggregated_scores: { task_completion: { mean: 0.9 } },
        trial_count: 1,
      }]);

      // Third query: trial_results
      mockSql.mockResolvedValueOnce([{
        id: "tr-1",
        scenario_result_id: "sr-1",
        trial_number: 1,
        passed: true,
        scores: [{ name: "task_completion", score: 0.9, passed: true }],
        token_usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        duration_ms: 200,
        trace_id: null,
      }]);

      const result = await evalRepo.getEvaluationRun("run-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("run-1");
      expect(result!.results).toHaveLength(1);
      expect(result!.results[0].scenarioId).toBe("sc-1");
      expect(result!.results[0].passAtK).toBe(0.9);
      expect(result!.results[0].trials).toHaveLength(1);
      expect(result!.results[0].trials[0].passed).toBe(true);
    });
  });

  describe("deleteEvaluationRun", () => {
    it("returns true when row deleted", async () => {
      mockSql.mockResolvedValueOnce({ count: 1 });

      const result = await evalRepo.deleteEvaluationRun("run-1");
      expect(result).toBe(true);
    });

    it("returns false when no row found", async () => {
      mockSql.mockResolvedValueOnce({ count: 0 });

      const result = await evalRepo.deleteEvaluationRun("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("updateEvaluationStatus", () => {
    it("updates status with summary", async () => {
      mockSql.mockResolvedValueOnce({});

      await evalRepo.updateEvaluationStatus("run-1", "completed", {
        totalScenarios: 1,
        totalTrials: 1,
        overallPassRate: 1.0,
        passAtK: 1.0,
        passToTheK: 1.0,
        gPassAtK: 1.0,
        totalCost: 0.001,
        totalDuration: 100,
        avgTokensPerScenario: 50,
        latencyPercentiles: { p50: 100, p90: 100, p95: 100, p99: 100 },
        scoreSummaries: {},
      });

      expect(mockSql).toHaveBeenCalled();
    });

    it("updates status without summary", async () => {
      mockSql.mockResolvedValueOnce({});

      await evalRepo.updateEvaluationStatus("run-1", "failed");
      expect(mockSql).toHaveBeenCalled();
    });
  });
});
