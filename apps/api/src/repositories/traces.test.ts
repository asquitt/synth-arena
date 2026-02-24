import { describe, it, expect, vi, beforeEach } from "vitest";

// Must set env before module loads (vi.hoisted runs before imports)
const mockFetch = vi.hoisted(() => {
  process.env["CLICKHOUSE_URL"] = "http://localhost:8123";
  return vi.fn();
});
vi.stubGlobal("fetch", mockFetch);

import {
  insertSpans,
  getSpansByRunId,
  getSpansByTraceId,
  getCostAnalytics,
  getLatencyPercentiles,
  getErrorAnalytics,
  getTokenUsageTrends,
  getScenarioPerformance,
  getModelComparison,
  getSlowestSpans,
  getTraceTimeline,
  checkClickHouse,
  type TraceSpanRow,
} from "./traces.js";

function chResponse(data: unknown[]): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

function chTextResponse(text: string): Response {
  return new Response(text, { status: 200 });
}

function makeSpan(overrides?: Partial<TraceSpanRow>): TraceSpanRow {
  return {
    trace_id: "trace-1",
    span_id: "span-1",
    parent_id: "",
    name: "eval:test",
    type: "llm_call",
    start_time: "2026-01-01T00:00:00Z",
    end_time: "2026-01-01T00:00:01Z",
    duration_ms: 100,
    status: "ok",
    run_id: "run-1",
    scenario_id: "s1",
    trial_number: 1,
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    input_tokens: 100,
    output_tokens: 50,
    cost: 0.001,
    attributes: "{}",
    events: "[]",
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("insertSpans", () => {
  it("sends JSONEachRow batch to ClickHouse", async () => {
    mockFetch.mockResolvedValue(chTextResponse(""));
    const spans = [makeSpan(), makeSpan({ span_id: "span-2" })];
    await insertSpans(spans);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0]!;
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toContain("span-1");
    expect(call[1].body).toContain("span-2");
  });

  it("skips empty array", async () => {
    await insertSpans([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("getSpansByRunId", () => {
  it("returns parsed spans", async () => {
    mockFetch.mockResolvedValue(chResponse([makeSpan()]));
    const spans = await getSpansByRunId("run-1");
    expect(spans).toHaveLength(1);
    expect(spans[0]!.run_id).toBe("run-1");
  });

  it("passes limit parameter", async () => {
    mockFetch.mockResolvedValue(chResponse([]));
    await getSpansByRunId("run-1", 500);
    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain("param_lim=500");
  });
});

describe("getSpansByTraceId", () => {
  it("returns spans for a trace", async () => {
    mockFetch.mockResolvedValue(chResponse([makeSpan(), makeSpan({ span_id: "span-2" })]));
    const spans = await getSpansByTraceId("trace-1");
    expect(spans).toHaveLength(2);
  });
});

describe("getCostAnalytics", () => {
  it("returns grouped cost data", async () => {
    mockFetch.mockResolvedValue(chResponse([{
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      total_calls: "10",
      total_input_tokens: "1000",
      total_output_tokens: "500",
      total_cost: "0.01",
    }]));

    const analytics = await getCostAnalytics("run-1");
    expect(analytics).toHaveLength(1);
    expect(analytics[0]!.model).toBe("claude-sonnet-4-20250514");
    expect(analytics[0]!.totalCalls).toBe(10);
    expect(analytics[0]!.totalCost).toBe(0.01);
  });
});

describe("getLatencyPercentiles", () => {
  it("returns percentiles grouped by model", async () => {
    mockFetch.mockResolvedValue(chResponse([{
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      p50: "50",
      p75: "75",
      p95: "150",
      p99: "200",
      min_val: "10",
      max_val: "250",
      mean_val: "80",
      cnt: "100",
    }]));

    const result = await getLatencyPercentiles("run-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.p50).toBe(50);
    expect(result[0]!.p95).toBe(150);
    expect(result[0]!.count).toBe(100);
  });
});

describe("getErrorAnalytics", () => {
  it("returns error rates per scenario", async () => {
    mockFetch.mockResolvedValue(chResponse([{
      scenario_id: "s1",
      model: "claude-sonnet-4-20250514",
      total_spans: "10",
      error_spans: "3",
      error_rate: "0.3",
    }]));

    const result = await getErrorAnalytics("run-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.errorRate).toBe(0.3);
    expect(result[0]!.errorSpans).toBe(3);
  });
});

describe("getTokenUsageTrends", () => {
  it("returns time-bucketed token usage", async () => {
    mockFetch.mockResolvedValue(chResponse([{
      bucket: "2026-01-01 00:00:00",
      model: "claude-sonnet-4-20250514",
      input_tokens: "5000",
      output_tokens: "2000",
      total_tokens: "7000",
      total_cost: "0.05",
      call_count: "50",
    }]));

    const result = await getTokenUsageTrends("run-1", 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.totalTokens).toBe(7000);
    expect(result[0]!.callCount).toBe(50);
  });
});

describe("getScenarioPerformance", () => {
  it("returns pass rate per scenario across runs", async () => {
    mockFetch.mockResolvedValue(chResponse([
      { scenario_id: "s1", run_id: "run-1", total_trials: "5", passed_trials: "4", pass_rate: "0.8", avg_duration: "100", avg_cost: "0.001" },
      { scenario_id: "s1", run_id: "run-2", total_trials: "5", passed_trials: "5", pass_rate: "1.0", avg_duration: "90", avg_cost: "0.001" },
    ]));

    const result = await getScenarioPerformance("s1");
    expect(result).toHaveLength(2);
    expect(result[0]!.passRate).toBe(0.8);
    expect(result[1]!.passRate).toBe(1.0);
  });
});

describe("getModelComparison", () => {
  it("returns side-by-side model metrics", async () => {
    mockFetch.mockResolvedValue(chResponse([
      { model: "claude-sonnet-4-20250514", provider: "anthropic", total_calls: "50", pass_rate: "0.95", avg_duration: "80", p95_duration: "150", total_cost: "0.05", avg_input_tokens: "100", avg_output_tokens: "50" },
      { model: "gpt-4o", provider: "openai", total_calls: "50", pass_rate: "0.90", avg_duration: "120", p95_duration: "200", total_cost: "0.08", avg_input_tokens: "120", avg_output_tokens: "60" },
    ]));

    const result = await getModelComparison("run-1");
    expect(result).toHaveLength(2);
    expect(result[0]!.model).toBe("claude-sonnet-4-20250514");
    expect(result[0]!.passRate).toBe(0.95);
    expect(result[1]!.model).toBe("gpt-4o");
    expect(result[1]!.totalCost).toBe(0.08);
  });
});

describe("getSlowestSpans", () => {
  it("returns top N slowest spans", async () => {
    mockFetch.mockResolvedValue(chResponse([
      { span_id: "s1", trace_id: "t1", name: "slow-eval", type: "llm_call", scenario_id: "sc1", model: "claude-sonnet-4-20250514", duration_ms: "5000", status: "ok" },
      { span_id: "s2", trace_id: "t1", name: "fast-eval", type: "llm_call", scenario_id: "sc2", model: "claude-sonnet-4-20250514", duration_ms: "3000", status: "ok" },
    ]));

    const result = await getSlowestSpans("run-1", 10);
    expect(result).toHaveLength(2);
    expect(result[0]!.durationMs).toBe(5000);
    expect(result[0]!.name).toBe("slow-eval");
  });
});

describe("getTraceTimeline", () => {
  it("builds hierarchical span tree", async () => {
    mockFetch.mockResolvedValue(chResponse([
      makeSpan({ span_id: "root", parent_id: "", name: "root-span" }),
      makeSpan({ span_id: "child-1", parent_id: "root", name: "child-1" }),
      makeSpan({ span_id: "child-2", parent_id: "root", name: "child-2" }),
      makeSpan({ span_id: "grandchild", parent_id: "child-1", name: "grandchild" }),
    ]));

    const timeline = await getTraceTimeline("trace-1");
    expect(timeline).toHaveLength(1); // One root
    expect(timeline[0]!.name).toBe("root-span");
    expect(timeline[0]!.children).toHaveLength(2);
    expect(timeline[0]!.children[0]!.children).toHaveLength(1); // grandchild
    expect(timeline[0]!.children[0]!.children[0]!.name).toBe("grandchild");
  });

  it("handles flat spans (no parent relationships)", async () => {
    mockFetch.mockResolvedValue(chResponse([
      makeSpan({ span_id: "a", parent_id: "", name: "span-a" }),
      makeSpan({ span_id: "b", parent_id: "", name: "span-b" }),
    ]));

    const timeline = await getTraceTimeline("trace-1");
    expect(timeline).toHaveLength(2); // Both are roots
  });
});

describe("checkClickHouse", () => {
  it("returns latency in ms", async () => {
    mockFetch.mockResolvedValue(chResponse([{ "1": 1 }]));
    const latency = await checkClickHouse();
    expect(latency).toBeGreaterThanOrEqual(0);
  });
});

describe("error handling", () => {
  it("throws on ClickHouse HTTP error", async () => {
    mockFetch.mockResolvedValue(new Response("DB error", { status: 500 }));
    await expect(getSpansByRunId("run-1")).rejects.toThrow("ClickHouse error (500)");
  });
});
