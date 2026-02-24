import { describe, it, expect } from "vitest";
import { Tracer } from "./tracing.js";

describe("Tracer", () => {
  it("generates unique trace IDs", () => {
    const t1 = new Tracer();
    const t2 = new Tracer();
    expect(t1.getTraceId()).not.toBe(t2.getTraceId());
    expect(t1.getTraceId()).toHaveLength(32);
  });

  describe("startSpan / endSpan", () => {
    it("creates and completes a span", () => {
      const tracer = new Tracer();
      const spanId = tracer.startSpan("test-span", "llm_call");

      expect(spanId).toBeTruthy();
      expect(tracer.getSpans()).toHaveLength(0); // Not yet ended

      tracer.endSpan(spanId);

      expect(tracer.getSpans()).toHaveLength(1);
      expect(tracer.getSpans()[0]!.name).toBe("test-span");
      expect(tracer.getSpans()[0]!.type).toBe("llm_call");
      expect(tracer.getSpans()[0]!.status).toBe("ok");
      expect(tracer.getSpans()[0]!.endTime).toBeGreaterThan(0);
    });

    it("supports parent-child relationships", () => {
      const tracer = new Tracer();
      const parentId = tracer.startSpan("parent", "decision");
      const childId = tracer.startSpan("child", "tool_invocation", parentId);

      tracer.endSpan(childId);
      tracer.endSpan(parentId);

      const spans = tracer.getSpans();
      expect(spans).toHaveLength(2);
      expect(spans[0]!.parentId).toBe(parentId);
    });

    it("sets error status", () => {
      const tracer = new Tracer();
      const spanId = tracer.startSpan("failing", "llm_call");
      tracer.endSpan(spanId, "error", { errorMessage: "timeout" });

      const span = tracer.getSpans()[0]!;
      expect(span.status).toBe("error");
      expect(span.attributes["errorMessage"]).toBe("timeout");
    });

    it("ignores endSpan for unknown spanId", () => {
      const tracer = new Tracer();
      tracer.endSpan("nonexistent"); // Should not throw
      expect(tracer.getSpans()).toHaveLength(0);
    });

    it("includes traceId in span attributes", () => {
      const tracer = new Tracer();
      const spanId = tracer.startSpan("test", "llm_call");
      tracer.endSpan(spanId);

      expect(tracer.getSpans()[0]!.attributes["traceId"]).toBe(tracer.getTraceId());
    });

    it("merges custom attributes", () => {
      const tracer = new Tracer();
      const spanId = tracer.startSpan("test", "llm_call", undefined, { custom: "value" });
      tracer.endSpan(spanId, "ok", { extra: "data" });

      const span = tracer.getSpans()[0]!;
      expect(span.attributes["custom"]).toBe("value");
      expect(span.attributes["extra"]).toBe("data");
    });
  });

  describe("addEvent", () => {
    it("adds events to an active span", () => {
      const tracer = new Tracer();
      const spanId = tracer.startSpan("test", "llm_call");
      tracer.addEvent(spanId, "retry", { attempt: 2 });
      tracer.endSpan(spanId);

      const span = tracer.getSpans()[0]!;
      expect(span.events).toHaveLength(1);
      expect(span.events[0]!.name).toBe("retry");
      expect(span.events[0]!.attributes["attempt"]).toBe(2);
      expect(span.events[0]!.timestamp).toBeGreaterThan(0);
    });

    it("ignores events for unknown spanId", () => {
      const tracer = new Tracer();
      tracer.addEvent("nonexistent", "event"); // Should not throw
    });
  });

  describe("recordLlmCall", () => {
    it("records a complete LLM call span", () => {
      const tracer = new Tracer();
      const span = tracer.recordLlmCall({
        model: "claude-sonnet-4-20250514",
        provider: "anthropic",
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.001,
        durationMs: 500,
        prompt: "Hello world",
        response: "Hi there",
      });

      expect(span.name).toBe("llm_call");
      expect(span.type).toBe("llm_call");
      expect(span.attributes["model"]).toBe("claude-sonnet-4-20250514");
      expect(span.attributes["inputTokens"]).toBe(100);
      expect(span.attributes["cost"]).toBe(0.001);
      expect(span.attributes["promptPreview"]).toBe("Hello world");
      expect(span.status).toBe("ok");
    });

    it("truncates long prompt/response previews to 200 chars", () => {
      const tracer = new Tracer();
      const longText = "x".repeat(500);
      const span = tracer.recordLlmCall({
        model: "test",
        provider: "test",
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        durationMs: 0,
        prompt: longText,
        response: longText,
      });

      expect((span.attributes["promptPreview"] as string).length).toBe(200);
      expect((span.attributes["responsePreview"] as string).length).toBe(200);
    });
  });

  describe("recordToolCall", () => {
    it("records a successful tool call", () => {
      const tracer = new Tracer();
      const span = tracer.recordToolCall({
        toolName: "web_search",
        parameters: { query: "test" },
        result: { results: [] },
        durationMs: 200,
        success: true,
      });

      expect(span.name).toBe("tool:web_search");
      expect(span.type).toBe("tool_invocation");
      expect(span.status).toBe("ok");
    });

    it("records a failed tool call", () => {
      const tracer = new Tracer();
      const span = tracer.recordToolCall({
        toolName: "web_search",
        parameters: { query: "test" },
        result: { error: "timeout" },
        durationMs: 5000,
        success: false,
      });

      expect(span.status).toBe("error");
    });
  });

  describe("recordEnvInteraction", () => {
    it("records an environment interaction", () => {
      const tracer = new Tracer();
      const span = tracer.recordEnvInteraction({
        action: "http_request",
        target: "https://api.example.com/data",
        request: { method: "GET" },
        response: { status: 200 },
        durationMs: 150,
      });

      expect(span.name).toBe("env:http_request");
      expect(span.type).toBe("environment_interaction");
      expect(span.attributes["target"]).toBe("https://api.example.com/data");
    });
  });

  describe("getTokenUsage", () => {
    it("aggregates token usage from all LLM spans", () => {
      const tracer = new Tracer();
      tracer.recordLlmCall({ model: "claude", provider: "anthropic", inputTokens: 100, outputTokens: 50, cost: 0.001, durationMs: 100 });
      tracer.recordLlmCall({ model: "claude", provider: "anthropic", inputTokens: 200, outputTokens: 80, cost: 0.002, durationMs: 200 });
      tracer.recordToolCall({ toolName: "search", parameters: {}, result: {}, durationMs: 50, success: true });

      const usage = tracer.getTokenUsage();

      expect(usage.inputTokens).toBe(300);
      expect(usage.outputTokens).toBe(130);
      expect(usage.totalTokens).toBe(430);
      expect(usage.estimatedCost).toBeCloseTo(0.003);
      expect(usage.model).toBe("claude");
      expect(usage.provider).toBe("anthropic");
    });

    it("returns zeros when no LLM calls made", () => {
      const tracer = new Tracer();
      const usage = tracer.getTokenUsage();

      expect(usage.inputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.estimatedCost).toBe(0);
    });
  });

  describe("toJSON / fromJSON", () => {
    it("serializes and deserializes a trace", () => {
      const tracer = new Tracer();
      tracer.recordLlmCall({ model: "claude", provider: "anthropic", inputTokens: 100, outputTokens: 50, cost: 0.001, durationMs: 100 });
      tracer.recordToolCall({ toolName: "search", parameters: { q: "test" }, result: [], durationMs: 50, success: true });

      const json = tracer.toJSON();

      expect(json.traceId).toBe(tracer.getTraceId());
      expect(json.spanCount).toBe(2);
      expect(json.spans).toHaveLength(2);
      expect(json.tokenUsage.inputTokens).toBe(100);

      const restored = Tracer.fromJSON(json);
      expect(restored.getTraceId()).toBe(tracer.getTraceId());
      expect(restored.getSpans()).toHaveLength(2);
    });

    it("handles empty traces", () => {
      const tracer = new Tracer();
      const json = tracer.toJSON();

      expect(json.spanCount).toBe(0);
      expect(json.startTime).toBe(0);
      expect(json.endTime).toBe(0);
    });
  });

  describe("getSpans", () => {
    it("returns a copy not a reference", () => {
      const tracer = new Tracer();
      tracer.recordLlmCall({ model: "m", provider: "p", inputTokens: 0, outputTokens: 0, cost: 0, durationMs: 0 });

      const spans1 = tracer.getSpans();
      const spans2 = tracer.getSpans();
      expect(spans1).not.toBe(spans2);
      expect(spans1).toEqual(spans2);
    });
  });
});
