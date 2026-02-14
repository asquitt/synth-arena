import { trace, SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";

/**
 * OpenTelemetry instrumentation for the evaluation engine.
 *
 * When an OTel SDK is configured (e.g., @opentelemetry/sdk-node),
 * spans are recorded automatically. Without an SDK, this is a no-op.
 *
 * Span hierarchy:
 *   evaluate (root)
 *   └── scenario:{id}
 *       └── trial:{number}
 *           ├── task_execution
 *           └── scoring
 */

const TRACER_NAME = "syntharena.core";

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME, "0.1.0");
}

export function setSpanError(span: Span, error: unknown): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
  if (error instanceof Error) {
    span.recordException(error);
  }
}

export { SpanStatusCode };
