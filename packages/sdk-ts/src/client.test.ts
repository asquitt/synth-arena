import { describe, it, expect, vi, beforeEach } from "vitest";
import { SynthArenaClient, SynthArenaError } from "./client.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: vi.fn().mockResolvedValue({ data }),
    body: null,
  };
}

function errorResponse(error: string, status: number) {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: vi.fn().mockResolvedValue({ error }),
    body: null,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("SynthArenaClient", () => {
  describe("constructor", () => {
    it("uses default URL when none provided", () => {
      const client = new SynthArenaClient();
      // Internal - verify by making a request
      mockFetch.mockResolvedValue(jsonResponse([]));
      client.listEvaluations();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/evaluations",
        expect.any(Object),
      );
    });

    it("strips trailing slash from URL", () => {
      const client = new SynthArenaClient({ apiUrl: "http://myserver.com/" });
      mockFetch.mockResolvedValue(jsonResponse([]));
      client.listEvaluations();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://myserver.com/api/v1/evaluations",
        expect.any(Object),
      );
    });

    it("includes authorization header when API key provided", async () => {
      const client = new SynthArenaClient({ apiKey: "sk-test-123" });
      mockFetch.mockResolvedValue(jsonResponse([]));
      await client.listEvaluations();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-123",
          }),
        }),
      );
    });

    it("omits authorization header when no API key", async () => {
      const client = new SynthArenaClient();
      mockFetch.mockResolvedValue(jsonResponse([]));
      await client.listEvaluations();
      const headers = mockFetch.mock.calls[0]![1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe("listEvaluations", () => {
    it("returns evaluation list", async () => {
      const evals = [{ id: "eval-1", name: "Test" }];
      mockFetch.mockResolvedValue(jsonResponse(evals));

      const client = new SynthArenaClient();
      const result = await client.listEvaluations();

      expect(result).toEqual(evals);
    });
  });

  describe("getEvaluation", () => {
    it("fetches a single evaluation by ID", async () => {
      const evalData = { id: "eval-1", name: "Test", status: "completed" };
      mockFetch.mockResolvedValue(jsonResponse(evalData));

      const client = new SynthArenaClient();
      const result = await client.getEvaluation("eval-1");

      expect(result).toEqual(evalData);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/evaluations/eval-1",
        expect.any(Object),
      );
    });
  });

  describe("createEvaluation", () => {
    it("sends POST with evaluation options", async () => {
      const created = { id: "eval-new", name: "my-eval", status: "running" };
      mockFetch.mockResolvedValue(jsonResponse(created));

      const client = new SynthArenaClient();
      const result = await client.createEvaluation({
        name: "my-eval",
        domain: "web-scraping",
        scenarioCount: 10,
      });

      expect(result).toEqual(created);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/evaluations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "my-eval", domain: "web-scraping", scenarioCount: 10 }),
        }),
      );
    });
  });

  describe("deleteEvaluation", () => {
    it("sends DELETE request", async () => {
      const deleteResult = { deleted: true, id: "eval-1" };
      mockFetch.mockResolvedValue(jsonResponse(deleteResult));

      const client = new SynthArenaClient();
      const result = await client.deleteEvaluation("eval-1");

      expect(result).toEqual(deleteResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/evaluations/eval-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("error handling", () => {
    it("throws SynthArenaError on non-OK response", async () => {
      mockFetch.mockResolvedValue(errorResponse("Not found", 404));

      const client = new SynthArenaClient();

      await expect(client.getEvaluation("missing")).rejects.toThrow(SynthArenaError);
      await expect(client.getEvaluation("missing")).rejects.toThrow("Not found");
    });

    it("includes status code in error", async () => {
      mockFetch.mockResolvedValue(errorResponse("Forbidden", 403));

      const client = new SynthArenaClient();

      try {
        await client.listEvaluations();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(SynthArenaError);
        expect((e as SynthArenaError).statusCode).toBe(403);
      }
    });

    it("handles json parse failure in error response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
        body: null,
      });

      const client = new SynthArenaClient();

      await expect(client.listEvaluations()).rejects.toThrow("Internal Server Error");
    });
  });

  describe("createAsyncEvaluation", () => {
    it("returns job ID and status", async () => {
      const job = { jobId: "job-1", status: "queued" };
      mockFetch.mockResolvedValue(jsonResponse(job));

      const client = new SynthArenaClient();
      const result = await client.createAsyncEvaluation({
        name: "async-eval",
        domain: "healthcare",
      });

      expect(result.jobId).toBe("job-1");
      expect(result.status).toBe("queued");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/evaluations/async",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("getJobStatus", () => {
    it("fetches job status by ID", async () => {
      const status = { jobId: "job-1", status: "completed", runId: "run-1", attempts: 1, submittedAt: "2026-01-01" };
      mockFetch.mockResolvedValue(jsonResponse(status));

      const client = new SynthArenaClient();
      const result = await client.getJobStatus("job-1");

      expect(result.status).toBe("completed");
      expect(result.runId).toBe("run-1");
    });
  });

  describe("waitForJob", () => {
    it("polls until job completes and returns run", async () => {
      const client = new SynthArenaClient();

      // First poll: queued
      // Second poll: completed
      // Third call: getEvaluation
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ jobId: "j1", status: "queued", attempts: 0, submittedAt: "2026-01-01" }))
        .mockResolvedValueOnce(jsonResponse({ jobId: "j1", status: "completed", runId: "run-1", attempts: 1, submittedAt: "2026-01-01" }))
        .mockResolvedValueOnce(jsonResponse({ id: "run-1", name: "eval", status: "completed" }));

      const result = await client.waitForJob("j1", 10); // 10ms poll interval

      expect(result).toEqual({ id: "run-1", name: "eval", status: "completed" });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("throws on dead job", async () => {
      const client = new SynthArenaClient();

      mockFetch.mockResolvedValue(
        jsonResponse({ jobId: "j1", status: "dead", error: "Max retries exceeded", attempts: 3, submittedAt: "2026-01-01" }),
      );

      await expect(client.waitForJob("j1", 10)).rejects.toThrow("Max retries exceeded");
    });

    it("throws on failed job", async () => {
      const client = new SynthArenaClient();

      mockFetch.mockResolvedValue(
        jsonResponse({ jobId: "j1", status: "failed", error: "Task error", attempts: 1, submittedAt: "2026-01-01" }),
      );

      await expect(client.waitForJob("j1", 10)).rejects.toThrow("Task error");
    });
  });

  describe("compareRuns", () => {
    it("sends POST with baseline ID", async () => {
      const comparison = { verdict: "pass" };
      mockFetch.mockResolvedValue(jsonResponse(comparison));

      const client = new SynthArenaClient();
      const result = await client.compareRuns("current-1", "baseline-1");

      expect(result).toEqual(comparison);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/evaluations/current-1/compare",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ baselineId: "baseline-1" }),
        }),
      );
    });
  });

  describe("estimateCost", () => {
    it("sends POST with cost estimation options", async () => {
      const costResult = { estimate: { estimatedCost: 5.0 }, recommendations: [] };
      mockFetch.mockResolvedValue(jsonResponse(costResult));

      const client = new SynthArenaClient();
      const result = await client.estimateCost({
        model: "claude-sonnet-4-20250514",
        scenarioCount: 100,
      });

      expect(result.estimate.estimatedCost).toBe(5.0);
    });
  });

  describe("listModels", () => {
    it("fetches available models", async () => {
      const models = [
        { model: "claude-sonnet-4-20250514", provider: "anthropic", inputPer1M: 3.0, outputPer1M: 15.0 },
      ];
      mockFetch.mockResolvedValue(jsonResponse(models));

      const client = new SynthArenaClient();
      const result = await client.listModels();

      expect(result).toHaveLength(1);
      expect(result[0]!.provider).toBe("anthropic");
    });
  });

  describe("health", () => {
    it("returns health status", async () => {
      const health = { status: "ok", version: "0.1.0" };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(health),
      });

      const client = new SynthArenaClient();
      const result = await client.health();

      expect(result.status).toBe("ok");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/health");
    });
  });

  describe("streamEvaluation", () => {
    it("yields progress events from SSE stream", async () => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode('data: {"type":"scenario_complete","scenarioIndex":0,"totalScenarios":2}\n\n'),
        encoder.encode('data: {"type":"scenario_complete","scenarioIndex":1,"totalScenarios":2}\n\n'),
        encoder.encode('data: {"type":"run_complete","totalScenarios":2}\n\n'),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => mockReader },
      });

      const client = new SynthArenaClient();
      const events: unknown[] = [];

      for await (const event of client.streamEvaluation({ name: "test", domain: "web-scraping" })) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect((events[0] as Record<string, unknown>).type).toBe("scenario_complete");
      expect((events[2] as Record<string, unknown>).type).toBe("run_complete");
    });

    it("throws on non-OK stream response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        body: null,
      });

      const client = new SynthArenaClient();

      await expect(async () => {
        for await (const _ of client.streamEvaluation({ name: "test", domain: "web-scraping" })) {
          // Should not reach here
        }
      }).rejects.toThrow(SynthArenaError);
    });
  });
});

describe("SynthArenaError", () => {
  it("has correct name and status code", () => {
    const error = new SynthArenaError("Test error", 404);

    expect(error.name).toBe("SynthArenaError");
    expect(error.message).toBe("Test error");
    expect(error.statusCode).toBe(404);
    expect(error).toBeInstanceOf(Error);
  });
});
