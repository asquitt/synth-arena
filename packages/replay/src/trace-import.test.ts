import { describe, it, expect } from "vitest";
import {
  convertOTLPSpans,
  classifyTrace,
  importTraces,
  summarizeImport,
} from "./trace-import.js";
import type { ProductionTrace, OTLPSpan } from "./trace-import.js";
import type { TraceSpan } from "@syntharena/shared";

function makeSpan(overrides?: Partial<TraceSpan>): TraceSpan {
  return {
    id: "span-1",
    name: "test-span",
    type: "environment_interaction",
    startTime: 1000,
    endTime: 2000,
    attributes: {},
    events: [],
    status: "ok",
    ...overrides,
  };
}

function makeTrace(overrides?: Partial<ProductionTrace>): ProductionTrace {
  return {
    traceId: "trace-abc123",
    spans: [makeSpan()],
    outcome: "success",
    duration: 1000,
    cost: 0.05,
    ...overrides,
  };
}

// ─── convertOTLPSpans ───────────────────────────────────────────────

describe("convertOTLPSpans", () => {
  it("converts basic OTLP spans to SynthArena format", () => {
    const otlp: OTLPSpan[] = [{
      traceId: "abc",
      spanId: "span-1",
      operationName: "llm_chat_completion",
      startTimeUnixNano: "1000000000000",
      endTimeUnixNano: "2000000000000",
      attributes: [
        { key: "gen_ai.system", value: { stringValue: "anthropic" } },
        { key: "gen_ai.usage.input_tokens", value: { intValue: "150" } },
      ],
      status: { code: 1 },
    }];

    const spans = convertOTLPSpans(otlp);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.id).toBe("span-1");
    expect(spans[0]!.type).toBe("llm_call");
    expect(spans[0]!.status).toBe("ok");
    expect(spans[0]!.attributes["gen_ai.system"]).toBe("anthropic");
  });

  it("converts error status", () => {
    const otlp: OTLPSpan[] = [{
      traceId: "abc",
      spanId: "span-err",
      operationName: "http_request",
      startTimeUnixNano: "1000000000000",
      endTimeUnixNano: "2000000000000",
      status: { code: 2, message: "timeout" },
    }];

    const spans = convertOTLPSpans(otlp);
    expect(spans[0]!.status).toBe("error");
  });

  it("infers span types from operation names", () => {
    const otlpSpans: OTLPSpan[] = [
      { traceId: "a", spanId: "1", operationName: "chat_completion", startTimeUnixNano: "0", endTimeUnixNano: "0" },
      { traceId: "a", spanId: "2", operationName: "tool_use_search", startTimeUnixNano: "0", endTimeUnixNano: "0" },
      { traceId: "a", spanId: "3", operationName: "http_get", startTimeUnixNano: "0", endTimeUnixNano: "0" },
      { traceId: "a", spanId: "4", operationName: "decision_router", startTimeUnixNano: "0", endTimeUnixNano: "0" },
    ];

    const spans = convertOTLPSpans(otlpSpans);
    expect(spans[0]!.type).toBe("llm_call");
    expect(spans[1]!.type).toBe("tool_invocation");
    expect(spans[2]!.type).toBe("environment_interaction");
    expect(spans[3]!.type).toBe("decision");
  });
});

// ─── classifyTrace ──────────────────────────────────────────────────

describe("classifyTrace", () => {
  it("classifies a successful fast trace", () => {
    const result = classifyTrace(makeTrace());
    expect(result.outcome).toBe("success");
    expect(result.isSloww).toBe(false);
    expect(result.isExpensive).toBe(false);
    expect(result.complexity).toBe("low");
  });

  it("classifies a slow trace", () => {
    const result = classifyTrace(makeTrace({ duration: 60_000 }));
    expect(result.isSloww).toBe(true);
    expect(result.complexity).toBe("medium");
  });

  it("classifies an expensive trace", () => {
    const result = classifyTrace(makeTrace({ cost: 5.0 }));
    expect(result.isExpensive).toBe(true);
  });

  it("classifies error traces", () => {
    const result = classifyTrace(makeTrace({
      outcome: undefined,
      spans: [makeSpan({ status: "error" })],
    }));
    expect(result.outcome).toBe("failure");
    expect(result.complexity).toBe("high");
  });

  it("uses custom thresholds", () => {
    const result = classifyTrace(
      makeTrace({ duration: 5_000 }),
      { slowThresholdMs: 3_000 },
    );
    expect(result.isSloww).toBe(true);
  });
});

// ─── importTraces ───────────────────────────────────────────────────

describe("importTraces", () => {
  it("converts traces to scenarios", () => {
    const traces = [
      makeTrace({ input: { query: "find hotels in Paris" } }),
    ];

    const scenarios = importTraces(traces, { domain: "web-scraping" });
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]!.domain).toBe("web-scraping");
    expect(scenarios[0]!.input.query).toBe("find hotels in Paris");
    expect(scenarios[0]!.id).toMatch(/^imported-/);
    expect(scenarios[0]!.metadata.tags).toContain("imported");
  });

  it("uses trace output as expected state for successful traces", () => {
    const traces = [
      makeTrace({
        output: { hotels: ["Hotel A", "Hotel B"], count: 2 },
        outcome: "success",
      }),
    ];

    const scenarios = importTraces(traces, { domain: "test" });
    expect(scenarios[0]!.expected).toEqual({ hotels: ["Hotel A", "Hotel B"], count: 2 });
  });

  it("filters by outcome", () => {
    const traces = [
      makeTrace({ traceId: "success-1", outcome: "success" }),
      makeTrace({ traceId: "failure-1", outcome: "failure" }),
      makeTrace({ traceId: "success-2", outcome: "success" }),
    ];

    const scenarios = importTraces(traces, { domain: "test", filterOutcome: "failure" });
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]!.metadata.tags).toContain("outcome:failure");
  });

  it("limits max scenarios", () => {
    const traces = Array.from({ length: 100 }, (_, i) =>
      makeTrace({ traceId: `trace-${i}` })
    );

    const scenarios = importTraces(traces, { domain: "test", maxScenarios: 5 });
    expect(scenarios).toHaveLength(5);
  });

  it("includes original trace when requested", () => {
    const span = makeSpan({ name: "original-span" });
    const traces = [makeTrace({ spans: [span] })];

    const scenarios = importTraces(traces, { domain: "test", includeTrace: true });
    const meta = scenarios[0]!.metadata as unknown as Record<string, unknown>;
    expect(meta["originalTrace"]).toBeDefined();
  });

  it("adds custom tags", () => {
    const traces = [makeTrace()];
    const scenarios = importTraces(traces, { domain: "test", tags: ["production", "v2.1"] });
    expect(scenarios[0]!.metadata.tags).toContain("production");
    expect(scenarios[0]!.metadata.tags).toContain("v2.1");
  });

  it("extracts input from root span when no explicit input", () => {
    const traces = [makeTrace({
      input: undefined,
      spans: [makeSpan({ parentId: undefined, attributes: { input: { url: "https://example.com" } } })],
    })];

    const scenarios = importTraces(traces, { domain: "test" });
    expect(scenarios[0]!.input).toEqual({ url: "https://example.com" });
  });
});

// ─── summarizeImport ────────────────────────────────────────────────

describe("summarizeImport", () => {
  it("summarizes imported scenarios", () => {
    const traces = [
      makeTrace({ outcome: "success", duration: 500 }),
      makeTrace({ outcome: "success", duration: 60_000 }),
      makeTrace({ outcome: "failure", spans: [makeSpan({ status: "error" })] }),
    ];

    const scenarios = importTraces(traces, { domain: "test" });
    const summary = summarizeImport(scenarios);

    expect(summary.total).toBe(3);
    expect(summary.byOutcome["success"]).toBe(2);
    expect(summary.byOutcome["failure"]).toBe(1);
  });

  it("counts scenarios with expected values", () => {
    const traces = [
      makeTrace({ output: { data: "result" }, outcome: "success" }),
      makeTrace({ output: undefined, outcome: "failure" }),
    ];

    const scenarios = importTraces(traces, { domain: "test" });
    const summary = summarizeImport(scenarios);
    expect(summary.withExpected).toBe(1);
  });
});
