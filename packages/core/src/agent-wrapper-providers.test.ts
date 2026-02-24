import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAgent,
  createAgentTask,
  createDemoProvider,
  createOpenAIProvider,
  createClaudeProvider,
  type AgentProvider,
} from "./agent-wrapper.js";

describe("createAgent auto-detection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  });

  it("returns a function", () => {
    const task = createAgent();
    expect(typeof task).toBe("function");
  });

  it("uses demo provider when no env vars or config", async () => {
    const task = createAgent();
    const result = await task({ test: "input" });
    // Demo provider returns quickly with processed: true
    expect(result.output).toBeDefined();
    expect(result.tokenUsage.provider).toBe("demo");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("uses demo provider with explicit provider config", async () => {
    const task = createAgent({ provider: "demo" });
    const result = await task({ query: "hello" });
    expect(result.tokenUsage.provider).toBe("demo");
    expect(result.tokenUsage.model).toBe("demo");
  });

  it("uses demo with custom model name", async () => {
    const task = createAgent({ provider: "demo", model: "test-model" });
    const result = await task({ test: true });
    expect(result.tokenUsage.model).toBe("test-model");
  });
});

describe("createDemoProvider", () => {
  it("returns an AgentProvider with correct name and model", () => {
    const provider = createDemoProvider();
    expect(provider.name).toBe("demo");
    expect(provider.model).toBe("demo");
  });

  it("accepts custom model name", () => {
    const provider = createDemoProvider("custom-demo");
    expect(provider.model).toBe("custom-demo");
  });

  it("returns valid response shape", async () => {
    const provider = createDemoProvider();
    const response = await provider.call("test prompt");
    expect(response.content).toBeDefined();
    expect(typeof response.inputTokens).toBe("number");
    expect(typeof response.outputTokens).toBe("number");
    expect(response.model).toBe("demo");
    expect(response.stopReason).toBe("end_turn");
  });

  it("returns JSON-parseable content", async () => {
    const provider = createDemoProvider();
    const response = await provider.call("some input");
    const parsed = JSON.parse(response.content);
    expect(parsed.processed).toBe(true);
  });

  it("estimates input tokens from prompt length", async () => {
    const provider = createDemoProvider();
    const shortRes = await provider.call("hi");
    const longRes = await provider.call("a".repeat(400));
    expect(longRes.inputTokens).toBeGreaterThan(shortRes.inputTokens);
  });
});

describe("createAgentTask", () => {
  it("wraps a provider into a TaskFunction", async () => {
    const mockProvider: AgentProvider = {
      name: "test",
      model: "test-1",
      async call(prompt: string) {
        return {
          content: JSON.stringify({ result: prompt.length }),
          inputTokens: 10,
          outputTokens: 5,
          model: "test-1",
          stopReason: "end_turn",
        };
      },
    };

    const task = createAgentTask({ provider: mockProvider });
    const result = await task({ input: "hello" });

    expect(result.output).toBeDefined();
    expect(result.tokenUsage.inputTokens).toBe(10);
    expect(result.tokenUsage.outputTokens).toBe(5);
    expect(result.tokenUsage.totalTokens).toBe(15);
    expect(result.tokenUsage.provider).toBe("test");
    expect(result.trace.length).toBe(1);
    expect(result.trace[0].type).toBe("llm_call");
    expect(result.trace[0].status).toBe("ok");
  });

  it("uses custom buildPrompt", async () => {
    let capturedPrompt = "";
    const mockProvider: AgentProvider = {
      name: "test",
      model: "test-1",
      async call(prompt: string) {
        capturedPrompt = prompt;
        return { content: "ok", inputTokens: 1, outputTokens: 1, model: "test-1" };
      },
    };

    const task = createAgentTask({
      provider: mockProvider,
      buildPrompt: (input) => `Custom: ${input.key}`,
    });

    await task({ key: "value" });
    expect(capturedPrompt).toBe("Custom: value");
  });

  it("passes systemPrompt to provider", async () => {
    let capturedSystem = "";
    const mockProvider: AgentProvider = {
      name: "test",
      model: "test-1",
      async call(_prompt: string, systemPrompt?: string) {
        capturedSystem = systemPrompt ?? "";
        return { content: "ok", inputTokens: 1, outputTokens: 1, model: "test-1" };
      },
    };

    const task = createAgentTask({
      provider: mockProvider,
      systemPrompt: "You are a test agent",
    });

    await task({ test: true });
    expect(capturedSystem).toBe("You are a test agent");
  });

  it("handles provider errors gracefully", async () => {
    const failProvider: AgentProvider = {
      name: "fail",
      model: "fail-1",
      async call() {
        throw new Error("API rate limited");
      },
    };

    const task = createAgentTask({ provider: failProvider });
    const result = await task({ test: true });

    expect(result.output).toBeNull();
    expect(result.error).toBe("API rate limited");
    expect(result.trace[0].status).toBe("error");
    expect(result.tokenUsage.inputTokens).toBe(0);
    expect(result.tokenUsage.provider).toBe("fail");
  });

  it("handles non-Error throws", async () => {
    const failProvider: AgentProvider = {
      name: "fail",
      model: "fail-1",
      async call() {
        throw "string error";
      },
    };

    const task = createAgentTask({ provider: failProvider });
    const result = await task({ test: true });
    expect(result.error).toBe("string error");
  });

  it("parses JSON output when valid", async () => {
    const provider: AgentProvider = {
      name: "test",
      model: "test-1",
      async call() {
        return {
          content: '{"answer": 42}',
          inputTokens: 5,
          outputTokens: 3,
          model: "test-1",
        };
      },
    };

    const task = createAgentTask({ provider });
    const result = await task({});
    expect(result.output).toEqual({ answer: 42 });
  });

  it("falls back to string output for invalid JSON", async () => {
    const provider: AgentProvider = {
      name: "test",
      model: "test-1",
      async call() {
        return {
          content: "Just a plain text response",
          inputTokens: 5,
          outputTokens: 3,
          model: "test-1",
        };
      },
    };

    const task = createAgentTask({ provider });
    const result = await task({});
    expect(result.output).toBe("Just a plain text response");
  });

  it("calculates cost estimation", async () => {
    const provider: AgentProvider = {
      name: "openai",
      model: "gpt-4.1",
      async call() {
        return {
          content: "response",
          inputTokens: 1000,
          outputTokens: 500,
          model: "gpt-4.1",
        };
      },
    };

    const task = createAgentTask({ provider });
    const result = await task({});
    // gpt-4.1: input $2/M, output $8/M
    // 1000 * 2/1M + 500 * 8/1M = 0.002 + 0.004 = 0.006
    expect(result.tokenUsage.estimatedCost).toBeCloseTo(0.006, 5);
  });

  it("uses default pricing for unknown models", async () => {
    const provider: AgentProvider = {
      name: "custom",
      model: "unknown-model-v9",
      async call() {
        return {
          content: "ok",
          inputTokens: 1000,
          outputTokens: 1000,
          model: "unknown-model-v9",
        };
      },
    };

    const task = createAgentTask({ provider });
    const result = await task({});
    // Default: input $3/M, output $15/M
    // 1000 * 3/1M + 1000 * 15/1M = 0.003 + 0.015 = 0.018
    expect(result.tokenUsage.estimatedCost).toBeCloseTo(0.018, 5);
  });

  it("records timing in trace spans", async () => {
    const provider: AgentProvider = {
      name: "test",
      model: "test-1",
      async call() {
        await new Promise((r) => setTimeout(r, 20));
        return { content: "ok", inputTokens: 1, outputTokens: 1, model: "test-1" };
      },
    };

    const task = createAgentTask({ provider });
    const result = await task({});
    const span = result.trace[0];
    expect(span.endTime).toBeGreaterThan(span.startTime);
    expect(result.duration).toBeGreaterThanOrEqual(15);
  });
});

describe("createOpenAIProvider shape", () => {
  it("returns provider with correct name and model", () => {
    const provider = createOpenAIProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("openai");
    expect(provider.model).toBe("gpt-4.1");
  });

  it("accepts custom model", () => {
    const provider = createOpenAIProvider({ apiKey: "test", model: "gpt-4.1-mini" });
    expect(provider.model).toBe("gpt-4.1-mini");
  });
});

describe("createClaudeProvider shape", () => {
  it("returns provider with correct name and model", () => {
    const provider = createClaudeProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("anthropic");
    expect(provider.model).toBe("claude-sonnet-4-20250514");
  });

  it("accepts custom model", () => {
    const provider = createClaudeProvider({ apiKey: "test", model: "claude-haiku-3.5" });
    expect(provider.model).toBe("claude-haiku-3.5");
  });
});
