import { describe, it, expect } from "vitest";
import { getTracer, setSpanError, SpanStatusCode } from "./tracing.js";

describe("tracing", () => {
  it("getTracer returns a tracer instance", () => {
    const tracer = getTracer();
    expect(tracer).toBeDefined();
    expect(tracer).toHaveProperty("startSpan");
  });

  it("setSpanError handles Error instances", () => {
    const span = {
      setStatus: (status: { code: number; message: string }) => {
        expect(status.code).toBe(SpanStatusCode.ERROR);
        expect(status.message).toBe("test error");
      },
      recordException: (err: Error) => {
        expect(err.message).toBe("test error");
      },
    };
    setSpanError(span as any, new Error("test error"));
  });

  it("setSpanError handles string errors", () => {
    let statusSet = false;
    const span = {
      setStatus: (status: { code: number; message: string }) => {
        expect(status.code).toBe(SpanStatusCode.ERROR);
        expect(status.message).toBe("string error");
        statusSet = true;
      },
      recordException: () => {
        throw new Error("Should not be called for non-Error");
      },
    };
    setSpanError(span as any, "string error");
    expect(statusSet).toBe(true);
  });

  it("exports SpanStatusCode", () => {
    expect(SpanStatusCode).toBeDefined();
    expect(SpanStatusCode.ERROR).toBeDefined();
  });
});
