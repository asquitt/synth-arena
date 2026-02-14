import { randomBytes } from "crypto";
import type { TraceSpan, TraceEvent, SpanType, TokenUsage } from "@syntharena/shared";

/**
 * OpenTelemetry-compatible tracing for agent execution.
 *
 * Every agent action is recorded as an immutable span, enabling:
 * - Replay (re-execute the same scenario)
 * - Regression (compare traces across versions)
 * - Cost attribution (which spans consumed tokens)
 * - Compliance auditing (full action log)
 */

export class Tracer {
  private spans: TraceSpan[] = [];
  private activeSpans = new Map<string, TraceSpan>();
  private traceId: string;

  constructor() {
    this.traceId = randomBytes(16).toString("hex");
  }

  startSpan(name: string, type: SpanType, parentId?: string, attributes?: Record<string, unknown>): string {
    const spanId = randomBytes(8).toString("hex");
    const span: TraceSpan = {
      id: spanId,
      parentId,
      name,
      type,
      startTime: Date.now(),
      endTime: 0,
      attributes: { traceId: this.traceId, ...attributes },
      events: [],
      status: "ok",
    };

    this.activeSpans.set(spanId, span);
    return spanId;
  }

  endSpan(spanId: string, status?: "ok" | "error", attributes?: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    if (status) span.status = status;
    if (attributes) Object.assign(span.attributes, attributes);

    this.spans.push(span);
    this.activeSpans.delete(spanId);
  }

  addEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    const event: TraceEvent = {
      name,
      timestamp: Date.now(),
      attributes: attributes ?? {},
    };
    span.events.push(event);
  }

  /**
   * Record an LLM call with token usage and cost.
   */
  recordLlmCall(opts: {
    parentId?: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
    prompt?: string;
    response?: string;
  }): TraceSpan {
    const spanId = this.startSpan("llm_call", "llm_call", opts.parentId, {
      model: opts.model,
      provider: opts.provider,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      cost: opts.cost,
      // Store truncated prompt/response for debugging without leaking full content
      promptPreview: opts.prompt?.substring(0, 200),
      responsePreview: opts.response?.substring(0, 200),
    });

    this.endSpan(spanId, "ok", { durationMs: opts.durationMs });
    return this.spans[this.spans.length - 1]!;
  }

  /**
   * Record a tool invocation.
   */
  recordToolCall(opts: {
    parentId?: string;
    toolName: string;
    parameters: Record<string, unknown>;
    result: unknown;
    durationMs: number;
    success: boolean;
  }): TraceSpan {
    const spanId = this.startSpan(`tool:${opts.toolName}`, "tool_invocation", opts.parentId, {
      toolName: opts.toolName,
      parameters: opts.parameters,
      result: opts.result,
    });

    this.endSpan(spanId, opts.success ? "ok" : "error", { durationMs: opts.durationMs });
    return this.spans[this.spans.length - 1]!;
  }

  /**
   * Record an environment interaction (API call, DOM event, etc).
   */
  recordEnvInteraction(opts: {
    parentId?: string;
    action: string;
    target: string;
    request?: unknown;
    response?: unknown;
    durationMs: number;
  }): TraceSpan {
    const spanId = this.startSpan(`env:${opts.action}`, "environment_interaction", opts.parentId, {
      action: opts.action,
      target: opts.target,
      request: opts.request,
      response: opts.response,
    });

    this.endSpan(spanId, "ok", { durationMs: opts.durationMs });
    return this.spans[this.spans.length - 1]!;
  }

  getSpans(): TraceSpan[] {
    return [...this.spans];
  }

  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Compute aggregate token usage from all LLM call spans.
   */
  getTokenUsage(): TokenUsage {
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedCost = 0;
    let model = "unknown";
    let provider = "unknown";

    for (const span of this.spans) {
      if (span.type === "llm_call") {
        inputTokens += (span.attributes["inputTokens"] as number) ?? 0;
        outputTokens += (span.attributes["outputTokens"] as number) ?? 0;
        estimatedCost += (span.attributes["cost"] as number) ?? 0;
        model = (span.attributes["model"] as string) ?? model;
        provider = (span.attributes["provider"] as string) ?? provider;
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost,
      model,
      provider,
    };
  }

  /**
   * Serialize trace for storage/export.
   */
  toJSON(): TraceExport {
    return {
      traceId: this.traceId,
      spans: this.spans,
      tokenUsage: this.getTokenUsage(),
      startTime: this.spans.length > 0 ? Math.min(...this.spans.map((s) => s.startTime)) : 0,
      endTime: this.spans.length > 0 ? Math.max(...this.spans.map((s) => s.endTime)) : 0,
      spanCount: this.spans.length,
    };
  }

  /**
   * Restore a trace from exported JSON.
   */
  static fromJSON(data: TraceExport): Tracer {
    const tracer = new Tracer();
    tracer.traceId = data.traceId;
    tracer.spans = data.spans;
    return tracer;
  }
}

export interface TraceExport {
  traceId: string;
  spans: TraceSpan[];
  tokenUsage: TokenUsage;
  startTime: number;
  endTime: number;
  spanCount: number;
}
