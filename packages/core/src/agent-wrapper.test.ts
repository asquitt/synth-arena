import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentProvider, AgentResponse } from "./agent-wrapper.js";
import {
  createAgentTask,
  createDemoProvider,
  createOpenAIProvider,
  createClaudeProvider,
  createAgent,
} from "./agent-wrapper.js";

// ─── Mock Provider ─────────────────────────────────────────────

function createMockProvider(overrides?: Partial<AgentProvider>): AgentProvider {
  return {
    name: "mock",
    model: "mock-v1",
    call: vi.fn(async (): Promise<AgentResponse> => ({
      content: JSON.stringify({ result: "success" }),
      inputTokens: 100,
      outputTokens: 50,
      model: "mock-v1",
      stopReason: "end_turn",
    })),
    ...overrides,
  };
}

// ─── createAgentTask ───────────────────────────────────────────

describe("createAgentTask", () => {
  it("returns a TaskFunction that calls the provider", async () => {
    const provider = createMockProvider();
    const task = createAgentTask({ provider });

    const result = await task({ query: "test" });

    expect(provider.call).toHaveBeenCalledOnce();
    expect(provider.call).toHaveBeenCalledWith('{"query":"test"}', undefined);
    expect(result.output).toEqual({ result: "success" });
    expect(result.error).toBeUndefined();
  });

  it("passes systemPrompt to provider.call", async () => {
    const provider = createMockProvider();
    const task = createAgentTask({ provider, systemPrompt: "Be helpful" });

    await task({ x: 1 });

    expect(provider.call).toHaveBeenCalledWith('{"x":1}', "Be helpful");
  });

  it("uses custom buildPrompt when provided", async () => {
    const provider = createMockProvider();
    const task = createAgentTask({
      provider,
      buildPrompt: (input) => `Process: ${input["action"]}`,
    });

    await task({ action: "scrape" });

    expect(provider.call).toHaveBeenCalledWith("Process: scrape", undefined);
  });

  it("returns proper TokenUsage with cost estimation", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => ({
        content: '{"ok":true}',
        inputTokens: 1000,
        outputTokens: 500,
        model: "gpt-4.1",
        stopReason: "stop",
      })),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    expect(result.tokenUsage.inputTokens).toBe(1000);
    expect(result.tokenUsage.outputTokens).toBe(500);
    expect(result.tokenUsage.totalTokens).toBe(1500);
    expect(result.tokenUsage.estimatedCost).toBeGreaterThan(0);
    expect(result.tokenUsage.model).toBe("gpt-4.1");
    expect(result.tokenUsage.provider).toBe("mock");
  });

  it("creates proper TraceSpan on success", async () => {
    const provider = createMockProvider();
    const task = createAgentTask({ provider });

    const result = await task({});

    expect(result.trace).toHaveLength(1);
    const span = result.trace[0]!;
    expect(span.name).toBe("mock.chat");
    expect(span.type).toBe("llm_call");
    expect(span.status).toBe("ok");
    expect(span.startTime).toBeLessThanOrEqual(span.endTime!);
    expect(span.attributes).toHaveProperty("model", "mock-v1");
    expect(span.attributes).toHaveProperty("provider", "mock");
    expect(span.events).toHaveLength(1);
    expect(span.events![0]!.name).toBe("response_received");
  });

  it("parses JSON content as structured output", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => ({
        content: '{"items":[1,2,3],"total":3}',
        inputTokens: 50,
        outputTokens: 30,
        model: "mock-v1",
      })),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    expect(result.output).toEqual({ items: [1, 2, 3], total: 3 });
  });

  it("falls back to string when content is not valid JSON", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => ({
        content: "This is plain text response",
        inputTokens: 50,
        outputTokens: 30,
        model: "mock-v1",
      })),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    expect(result.output).toBe("This is plain text response");
  });

  it("handles provider errors gracefully", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => {
        throw new Error("Rate limit exceeded");
      }),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    expect(result.output).toBeNull();
    expect(result.error).toBe("Rate limit exceeded");
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]!.status).toBe("error");
    expect(result.trace[0]!.attributes).toHaveProperty("error", "Rate limit exceeded");
    expect(result.tokenUsage.inputTokens).toBe(0);
    expect(result.tokenUsage.estimatedCost).toBe(0);
  });

  it("handles non-Error throws", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => {
        throw "string error";
      }),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    expect(result.error).toBe("string error");
  });

  it("measures duration correctly", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return {
          content: "ok",
          inputTokens: 10,
          outputTokens: 5,
          model: "mock-v1",
        };
      }),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    expect(result.duration).toBeGreaterThanOrEqual(40); // Allow some timing variance
  });
});

// ─── Cost Estimation ───────────────────────────────────────────

describe("cost estimation", () => {
  it("uses known pricing for gpt-4.1", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => ({
        content: "ok",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        model: "gpt-4.1",
      })),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    // gpt-4.1: $2/1M input + $8/1M output = $10 total
    expect(result.tokenUsage.estimatedCost).toBeCloseTo(10, 1);
  });

  it("uses known pricing for claude-sonnet", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => ({
        content: "ok",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        model: "claude-sonnet-4-20250514",
      })),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    // claude-sonnet: $3/1M input + $15/1M output = $18 total
    expect(result.tokenUsage.estimatedCost).toBeCloseTo(18, 1);
  });

  it("falls back to default pricing for unknown models", async () => {
    const provider = createMockProvider({
      call: vi.fn(async () => ({
        content: "ok",
        inputTokens: 1000,
        outputTokens: 500,
        model: "unknown-model-xyz",
      })),
    });
    const task = createAgentTask({ provider });

    const result = await task({});

    // Default: $3/1M input + $15/1M output
    expect(result.tokenUsage.estimatedCost).toBeGreaterThan(0);
  });
});

// ─── Demo Provider ─────────────────────────────────────────────

describe("createDemoProvider", () => {
  it("returns a provider with correct name and model", () => {
    const provider = createDemoProvider();
    expect(provider.name).toBe("demo");
    expect(provider.model).toBe("demo");
  });

  it("accepts custom model name", () => {
    const provider = createDemoProvider("my-demo");
    expect(provider.model).toBe("my-demo");
  });

  it("returns JSON content with processed input", async () => {
    const provider = createDemoProvider();
    const response = await provider.call("test prompt");

    const parsed = JSON.parse(response.content);
    expect(parsed.processed).toBe(true);
    expect(parsed.input).toBe("test prompt");
    expect(response.inputTokens).toBeGreaterThan(0);
    expect(response.outputTokens).toBe(50);
    expect(response.stopReason).toBe("end_turn");
  });

  it("truncates long input in response", async () => {
    const provider = createDemoProvider();
    const longPrompt = "x".repeat(200);
    const response = await provider.call(longPrompt);

    const parsed = JSON.parse(response.content);
    expect(parsed.input.length).toBeLessThanOrEqual(100);
  });
});

// ─── Built-in Provider Construction ────────────────────────────

describe("createOpenAIProvider", () => {
  it("creates a provider with correct defaults", () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    expect(provider.name).toBe("openai");
    expect(provider.model).toBe("gpt-4.1");
  });

  it("accepts custom model", () => {
    const provider = createOpenAIProvider({ apiKey: "sk-test", model: "gpt-4.1-mini" });
    expect(provider.model).toBe("gpt-4.1-mini");
  });

  it("makes correct API call structure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: "gpt-4.1",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = createOpenAIProvider({ apiKey: "sk-test123" });
    const response = await provider.call("Hi", "Be helpful");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer sk-test123");

    const body = JSON.parse(opts.body);
    expect(body.messages).toEqual([
      { role: "system", content: "Be helpful" },
      { role: "user", content: "Hi" },
    ]);

    expect(response.content).toBe("Hello");
    expect(response.inputTokens).toBe(10);
    expect(response.outputTokens).toBe(5);
    expect(response.stopReason).toBe("stop");

    vi.unstubAllGlobals();
  });

  it("throws on API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    }));

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await expect(provider.call("test")).rejects.toThrow("OpenAI API error 429: Rate limited");

    vi.unstubAllGlobals();
  });

  it("uses custom baseUrl", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
        model: "local-llm",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = createOpenAIProvider({
      apiKey: "local",
      baseUrl: "http://localhost:11434/v1",
    });
    await provider.call("test");

    expect(mockFetch.mock.calls[0]![0]).toBe("http://localhost:11434/v1/chat/completions");

    vi.unstubAllGlobals();
  });
});

describe("createClaudeProvider", () => {
  it("creates a provider with correct defaults", () => {
    const provider = createClaudeProvider({ apiKey: "sk-ant-test" });
    expect(provider.name).toBe("anthropic");
    expect(provider.model).toBe("claude-sonnet-4-20250514");
  });

  it("makes correct API call structure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Hello from Claude" }],
        usage: { input_tokens: 20, output_tokens: 10 },
        model: "claude-sonnet-4-20250514",
        stop_reason: "end_turn",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = createClaudeProvider({ apiKey: "sk-ant-test123" });
    const response = await provider.call("Hi", "Be concise");

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(opts.headers["x-api-key"]).toBe("sk-ant-test123");
    expect(opts.headers["anthropic-version"]).toBe("2023-06-01");

    const body = JSON.parse(opts.body);
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(body.system).toBe("Be concise");

    expect(response.content).toBe("Hello from Claude");
    expect(response.inputTokens).toBe(20);
    expect(response.outputTokens).toBe(10);
    expect(response.stopReason).toBe("end_turn");

    vi.unstubAllGlobals();
  });

  it("concatenates multiple text blocks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "Part 1. " },
          { type: "text", text: "Part 2." },
        ],
        usage: { input_tokens: 10, output_tokens: 8 },
        model: "claude-sonnet-4-20250514",
        stop_reason: "end_turn",
      }),
    }));

    const provider = createClaudeProvider({ apiKey: "test" });
    const response = await provider.call("test");

    expect(response.content).toBe("Part 1. Part 2.");

    vi.unstubAllGlobals();
  });

  it("omits system when no systemPrompt given", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 5, output_tokens: 3 },
        model: "claude-sonnet-4-20250514",
        stop_reason: "end_turn",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = createClaudeProvider({ apiKey: "test" });
    await provider.call("test");

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body).not.toHaveProperty("system");

    vi.unstubAllGlobals();
  });

  it("throws on API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Invalid API key",
    }));

    const provider = createClaudeProvider({ apiKey: "bad-key" });
    await expect(provider.call("test")).rejects.toThrow("Anthropic API error 401: Invalid API key");

    vi.unstubAllGlobals();
  });
});

// ─── createAgent (auto-detect) ─────────────────────────────────

describe("createAgent", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("falls back to demo provider when no keys are set", async () => {
    const task = createAgent();
    const result = await task({ test: true });

    expect(result.output).toBeDefined();
    expect(result.tokenUsage.provider).toBe("demo");
    expect(result.error).toBeUndefined();
  });

  it("uses demo provider with explicit provider config", async () => {
    const task = createAgent({ provider: "demo", model: "my-demo" });
    const result = await task({ test: true });

    expect(result.tokenUsage.provider).toBe("demo");
    expect(result.tokenUsage.model).toBe("my-demo");
  });

  it("creates anthropic provider when explicitly requested", () => {
    // Just verify it doesn't throw during construction
    const task = createAgent({ provider: "anthropic", apiKey: "sk-ant-test" });
    expect(task).toBeTypeOf("function");
  });

  it("creates openai provider when explicitly requested", () => {
    const task = createAgent({ provider: "openai", apiKey: "sk-test" });
    expect(task).toBeTypeOf("function");
  });

  it("passes systemPrompt through to the task", async () => {
    const task = createAgent({ systemPrompt: "Test system prompt" });
    // Demo provider doesn't use systemPrompt, but the task should still work
    const result = await task({ x: 1 });
    expect(result.error).toBeUndefined();
  });

  it("passes buildPrompt through to the task", async () => {
    const task = createAgent({
      buildPrompt: (input) => `custom: ${JSON.stringify(input)}`,
    });
    const result = await task({ action: "test" });
    expect(result.error).toBeUndefined();
  });
});

// ─── Integration: Full pipeline with mock ──────────────────────

describe("integration: agent → evaluate pipeline", () => {
  it("works end-to-end with a mock provider", async () => {
    const { evaluate, taskCompletion, costThreshold, safetyCheck } = await import("./index.js");

    const mockProvider = createMockProvider({
      call: vi.fn(async (prompt: string) => ({
        content: JSON.stringify({
          success: true,
          items: JSON.parse(prompt).items ?? [],
        }),
        inputTokens: 200,
        outputTokens: 100,
        model: "mock-v1",
        stopReason: "end_turn",
      })),
    });

    const task = createAgentTask({ provider: mockProvider });

    const run = await evaluate({
      name: "integration-test",
      dataset: [
        {
          id: "test-1",
          domain: "test",
          name: "Basic test",
          description: "Verify mock provider works in eval pipeline",
          input: { items: [1, 2, 3] },
          expected: { success: true },
          metadata: {
            complexity: "low",
            tags: ["test"],
            generatedAt: new Date().toISOString(),
            generatorVersion: "1.0.0",
          },
        },
      ],
      task,
      scorers: [taskCompletion, costThreshold(1.0), safetyCheck()],
      trials: 2,
    });

    expect(run.status).toBe("completed");
    expect(run.results).toHaveLength(1);
    expect(run.summary.totalTrials).toBe(2);
    expect(run.summary.passAtK).toBeGreaterThan(0);
    expect(run.summary.totalCost).toBeGreaterThan(0);
    expect(mockProvider.call).toHaveBeenCalledTimes(2); // 1 scenario × 2 trials
  });

  it("handles provider failures in eval pipeline", async () => {
    const { evaluate, taskCompletion } = await import("./index.js");

    let callCount = 0;
    const flakyProvider = createMockProvider({
      call: vi.fn(async () => {
        callCount++;
        if (callCount % 2 === 0) throw new Error("Intermittent failure");
        return {
          content: '{"ok":true}',
          inputTokens: 50,
          outputTokens: 25,
          model: "mock-v1",
        };
      }),
    });

    const task = createAgentTask({ provider: flakyProvider });

    const run = await evaluate({
      name: "flaky-test",
      dataset: [{
        id: "flaky-1",
        domain: "test",
        name: "Flaky test",
        description: "Tests provider error handling",
        input: {},
        metadata: {
          complexity: "low",
          tags: ["test"],
          generatedAt: new Date().toISOString(),
          generatorVersion: "1.0.0",
        },
      }],
      task,
      scorers: [taskCompletion],
      trials: 4,
    });

    // Should complete without throwing
    expect(run.status).toBe("completed");
    expect(run.results[0]!.trials).toHaveLength(4);

    // pass@k should reflect mixed results (some trials passed, some failed)
    const passed = run.results[0]!.trials.filter((t) => t.passed).length;
    const failed = run.results[0]!.trials.filter((t) => !t.passed).length;
    expect(passed).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(0);
  });
});
