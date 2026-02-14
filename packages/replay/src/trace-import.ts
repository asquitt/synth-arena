import type { Scenario, TraceSpan, ScenarioMetadata } from "@syntharena/shared";
import { randomBytes } from "crypto";

/**
 * Production Trace Import Pipeline
 *
 * Converts real production traces into regression test scenarios.
 * Supports OpenTelemetry-compatible spans and SynthArena's native format.
 *
 * Workflow:
 *   1. Import traces from production (OTLP JSON, SynthArena JSON, or raw spans)
 *   2. Extract scenario inputs, expected outputs, and environment context
 *   3. Generate reproducible scenarios for regression testing
 *   4. Optionally classify traces by outcome (success/failure/slow/expensive)
 */

// ─── Trace Formats ──────────────────────────────────────────────────

/** OpenTelemetry-compatible span from production exports. */
export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }>;
  status?: { code: number; message?: string };
  events?: Array<{ name: string; timeUnixNano: string; attributes?: OTLPSpan["attributes"] }>;
}

/** A production trace group (one complete agent execution). */
export interface ProductionTrace {
  traceId: string;
  spans: TraceSpan[];
  input?: Record<string, unknown>;
  output?: unknown;
  metadata?: Record<string, unknown>;
  outcome?: "success" | "failure" | "timeout" | "error";
  duration?: number;
  cost?: number;
}

/** Options for controlling scenario generation from traces. */
export interface TraceImportOptions {
  domain: string;
  /** Only import traces matching this outcome. */
  filterOutcome?: ProductionTrace["outcome"];
  /** Maximum scenarios to generate. */
  maxScenarios?: number;
  /** Include the original trace as scenario metadata. */
  includeTrace?: boolean;
  /** Minimum duration (ms) to flag as slow. */
  slowThresholdMs?: number;
  /** Maximum cost to flag as expensive. */
  expensiveThreshold?: number;
  /** Tags to add to all generated scenarios. */
  tags?: string[];
}

// ─── OTLP Conversion ────────────────────────────────────────────────

/** Convert OpenTelemetry spans to SynthArena's TraceSpan format. */
export function convertOTLPSpans(otlpSpans: OTLPSpan[]): TraceSpan[] {
  return otlpSpans.map((span) => {
    const attributes: Record<string, unknown> = {};
    if (span.attributes) {
      for (const attr of span.attributes) {
        const val = attr.value;
        attributes[attr.key] = val.stringValue ?? val.intValue ?? val.doubleValue ?? val.boolValue ?? null;
      }
    }

    const startTime = Math.floor(Number(span.startTimeUnixNano) / 1_000_000);
    const endTime = Math.floor(Number(span.endTimeUnixNano) / 1_000_000);

    return {
      id: span.spanId,
      parentId: span.parentSpanId,
      name: span.operationName,
      type: inferSpanType(span.operationName, attributes),
      startTime,
      endTime,
      attributes,
      events: (span.events ?? []).map((e) => ({
        name: e.name,
        timestamp: Math.floor(Number(e.timeUnixNano) / 1_000_000),
        attributes: otlpAttrsToRecord(e.attributes),
      })),
      status: span.status?.code === 2 ? "error" : "ok",
    };
  });
}

function otlpAttrsToRecord(attrs?: OTLPSpan["attributes"]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!attrs) return result;
  for (const attr of attrs) {
    const val = attr.value;
    result[attr.key] = val.stringValue ?? val.intValue ?? val.doubleValue ?? val.boolValue ?? null;
  }
  return result;
}

function inferSpanType(name: string, attrs: Record<string, unknown>): TraceSpan["type"] {
  const lower = name.toLowerCase();
  if (lower.includes("llm") || lower.includes("chat") || lower.includes("completion") || attrs["gen_ai.system"]) {
    return "llm_call";
  }
  if (lower.includes("tool") || lower.includes("function_call")) {
    return "tool_invocation";
  }
  if (lower.includes("http") || lower.includes("api") || lower.includes("fetch")) {
    return "environment_interaction";
  }
  if (lower.includes("decision") || lower.includes("routing")) {
    return "decision";
  }
  return "environment_interaction";
}

// ─── Trace Classification ───────────────────────────────────────────

/** Classify a production trace by its characteristics. */
export function classifyTrace(
  trace: ProductionTrace,
  opts?: { slowThresholdMs?: number; expensiveThreshold?: number },
): {
  outcome: string;
  isSloww: boolean;
  isExpensive: boolean;
  complexity: ScenarioMetadata["complexity"];
} {
  const hasError = trace.spans.some((s) => s.status === "error");
  const totalDuration = trace.duration ?? computeDuration(trace.spans);
  const totalCost = trace.cost ?? 0;
  const spanCount = trace.spans.length;

  const slowThreshold = opts?.slowThresholdMs ?? 30_000;
  const expThreshold = opts?.expensiveThreshold ?? 1.0;

  const isSloww = totalDuration > slowThreshold;
  const isExpensive = totalCost > expThreshold;

  let complexity: ScenarioMetadata["complexity"] = "low";
  if (spanCount > 20 || isSloww) complexity = "medium";
  if (spanCount > 50 || hasError) complexity = "high";

  const outcome = trace.outcome ?? (hasError ? "failure" : "success");

  return { outcome, isSloww, isExpensive, complexity };
}

function computeDuration(spans: TraceSpan[]): number {
  if (spans.length === 0) return 0;
  const start = Math.min(...spans.map((s) => s.startTime));
  const end = Math.max(...spans.map((s) => s.endTime));
  return end - start;
}

// ─── Scenario Generation ────────────────────────────────────────────

/** Extract input from a production trace by analyzing root span and tool calls. */
function extractInput(trace: ProductionTrace): Record<string, unknown> {
  if (trace.input) return trace.input;

  // Try to find input from root span attributes
  const rootSpan = trace.spans.find((s) => !s.parentId);
  if (rootSpan?.attributes["input"]) {
    const input = rootSpan.attributes["input"];
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : { query: input };
  }

  // Fall back to first LLM call's prompt
  const firstLlm = trace.spans.find((s) => s.type === "llm_call");
  if (firstLlm?.attributes["promptPreview"]) {
    return { query: firstLlm.attributes["promptPreview"] };
  }

  return { traceId: trace.traceId };
}

/** Extract expected output from a successful production trace. */
function extractExpected(trace: ProductionTrace): Record<string, unknown> | undefined {
  if (trace.output && typeof trace.output === "object") {
    return trace.output as Record<string, unknown>;
  }

  // For successful traces, the last environment interaction result becomes expected
  if (trace.outcome === "success") {
    const envSpans = trace.spans.filter((s) => s.type === "environment_interaction");
    const lastEnv = envSpans[envSpans.length - 1];
    if (lastEnv?.attributes["response"]) {
      const resp = lastEnv.attributes["response"];
      return typeof resp === "object" && resp !== null
        ? (resp as Record<string, unknown>)
        : { response: resp };
    }
  }

  return undefined;
}

/**
 * Convert production traces into regression test scenarios.
 * Each trace becomes one scenario that can be re-run to detect regressions.
 */
export function importTraces(
  traces: ProductionTrace[],
  opts: TraceImportOptions,
): Scenario[] {
  let filtered = traces;

  // Filter by outcome
  if (opts.filterOutcome) {
    filtered = filtered.filter((t) => {
      const classification = classifyTrace(t, {
        slowThresholdMs: opts.slowThresholdMs,
        expensiveThreshold: opts.expensiveThreshold,
      });
      return classification.outcome === opts.filterOutcome;
    });
  }

  // Limit count
  const limit = opts.maxScenarios ?? filtered.length;
  filtered = filtered.slice(0, limit);

  return filtered.map((trace) => {
    const classification = classifyTrace(trace, {
      slowThresholdMs: opts.slowThresholdMs,
      expensiveThreshold: opts.expensiveThreshold,
    });

    const input = extractInput(trace);
    const expected = extractExpected(trace);

    const tags = [
      "imported",
      `trace:${trace.traceId}`,
      `outcome:${classification.outcome}`,
      ...(classification.isSloww ? ["slow"] : []),
      ...(classification.isExpensive ? ["expensive"] : []),
      ...(opts.tags ?? []),
    ];

    const metadata: ScenarioMetadata = {
      complexity: classification.complexity,
      tags,
      generatedAt: new Date().toISOString(),
      generatorVersion: "trace-import-1.0",
      seedId: trace.traceId,
    };

    const scenario: Scenario = {
      id: `imported-${randomBytes(6).toString("hex")}`,
      domain: opts.domain,
      name: `[Imported] ${trace.traceId.substring(0, 8)}`,
      description: `Regression scenario from production trace ${trace.traceId}`,
      input,
      expected,
      metadata,
    };

    // Optionally embed the original trace for replay
    if (opts.includeTrace) {
      (scenario.metadata as unknown as Record<string, unknown>)["originalTrace"] = trace.spans;
    }

    return scenario;
  });
}

/**
 * Generate a summary of imported traces for reporting.
 */
export function summarizeImport(scenarios: Scenario[]): {
  total: number;
  byComplexity: Record<string, number>;
  byOutcome: Record<string, number>;
  withExpected: number;
} {
  const byComplexity: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  let withExpected = 0;

  for (const s of scenarios) {
    byComplexity[s.metadata.complexity] = (byComplexity[s.metadata.complexity] ?? 0) + 1;
    if (s.expected) withExpected++;

    const outcomeTag = s.metadata.tags.find((t) => t.startsWith("outcome:"));
    if (outcomeTag) {
      const outcome = outcomeTag.split(":")[1]!;
      byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    }
  }

  return { total: scenarios.length, byComplexity, byOutcome, withExpected };
}
