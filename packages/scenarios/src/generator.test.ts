import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateScenarios, evolveScenarios } from "./generator.js";
import type { DomainTemplate } from "@syntharena/shared";

// Mock the Anthropic SDK - use a class so `new Anthropic()` works
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

const SAMPLE_TEMPLATE: DomainTemplate = {
  name: "test-domain",
  description: "Test domain",
  version: "0.1.0",
  scenarioGenerators: [{ name: "gen1", type: "llm", prompt: "Generate tests", config: {} }],
  environmentDefaults: { services: [] },
  defaultScorers: ["task_completion"],
  constraints: [
    { name: "rule1", description: "A test rule", validator: "validateRule1" },
  ],
};

function makeLLMResponse(scenarios: Array<Record<string, unknown>>): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(scenarios) }],
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("generateScenarios", () => {
  it("generates scenarios from LLM response", async () => {
    mockCreate.mockResolvedValue(
      makeLLMResponse([
        {
          id: "test-domain-0",
          name: "Scrape products",
          description: "Scrape product data from e-commerce site",
          input: { url: "https://example.com" },
          expected: { productCount: 10 },
          metadata: { complexity: "low", tags: ["scraping"] },
        },
        {
          id: "test-domain-1",
          name: "Handle pagination",
          description: "Navigate paginated product listings",
          input: { url: "https://example.com/products", pages: 5 },
          expected: { allProducts: true },
          metadata: { complexity: "medium", tags: ["pagination"] },
        },
      ]),
    );

    const scenarios = await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 2,
      apiKey: "test-key",
    });

    expect(scenarios).toHaveLength(2);
    expect(scenarios[0]!.domain).toBe("test-domain");
    expect(scenarios[0]!.description).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("batches requests for large counts", async () => {
    const batch = Array.from({ length: 10 }, (_, i) => ({
      id: `test-${i}`,
      name: `Scenario ${i}`,
      description: `Description ${i}`,
      input: { idx: i },
      metadata: { complexity: "low", tags: ["test"] },
    }));

    mockCreate.mockResolvedValue(makeLLMResponse(batch));

    const scenarios = await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 15,
    });

    // Should make 2 batches (10 + 5)
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("handles empty LLM response gracefully", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "I cannot generate scenarios right now." }],
    });

    const scenarios = await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 5,
    });

    expect(scenarios).toHaveLength(0);
  });

  it("handles non-text response blocks", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "test", name: "tool", input: {} }],
    });

    const scenarios = await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 5,
    });

    expect(scenarios).toHaveLength(0);
  });

  it("deduplicates scenarios with same description", async () => {
    mockCreate.mockResolvedValue(
      makeLLMResponse([
        { id: "s-1", name: "A", description: "Same description", input: { a: 1 }, metadata: { complexity: "low", tags: [] } },
        { id: "s-2", name: "B", description: "Same description", input: { b: 2 }, metadata: { complexity: "low", tags: [] } },
        { id: "s-3", name: "C", description: "Different description", input: { c: 3 }, metadata: { complexity: "low", tags: [] } },
      ]),
    );

    const scenarios = await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 3,
    });

    expect(scenarios).toHaveLength(2); // One duplicate removed
  });

  it("filters scenarios with empty input", async () => {
    mockCreate.mockResolvedValue(
      makeLLMResponse([
        { id: "s-1", name: "A", description: "Good one", input: { a: 1 }, metadata: { complexity: "low", tags: [] } },
        { id: "s-2", name: "B", description: "Bad one", input: {}, metadata: { complexity: "low", tags: [] } },
      ]),
    );

    const scenarios = await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 2,
    });

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]!.name).toBe("A");
  });

  it("uses provided complexity level", async () => {
    mockCreate.mockResolvedValue(makeLLMResponse([
      { id: "s-1", name: "A", description: "Hard scenario", input: { a: 1 }, metadata: { complexity: "high", tags: [] } },
    ]));

    await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 1,
      complexity: "high",
    });

    const callArgs = mockCreate.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0]!.content).toContain('"high" complexity');
  });

  it("respects custom model parameter", async () => {
    mockCreate.mockResolvedValue(makeLLMResponse([]));

    await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 1,
      model: "claude-haiku-4-20250514",
    });

    const callArgs = mockCreate.mock.calls[0]![0] as { model: string };
    expect(callArgs.model).toBe("claude-haiku-4-20250514");
  });

  it("handles markdown-wrapped JSON in response", async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: '```json\n[{"id": "s-1", "name": "A", "description": "Wrapped", "input": {"a": 1}, "metadata": {"complexity": "low", "tags": []}}]\n```',
      }],
    });

    const scenarios = await generateScenarios({
      template: SAMPLE_TEMPLATE,
      count: 1,
    });

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]!.description).toBe("Wrapped");
  });
});

describe("evolveScenarios", () => {
  const sampleScenarios = [
    {
      id: "s-1",
      domain: "test-domain",
      name: "Base scenario",
      description: "Original scenario",
      input: { url: "https://example.com" },
      metadata: { complexity: "low" as const, tags: ["test"], generatedAt: "", generatorVersion: "" },
    },
  ];

  it("evolves scenarios using in-depth type", async () => {
    mockCreate.mockResolvedValue(
      makeLLMResponse([
        { id: "s-1-evolved", name: "Evolved", description: "More complex version", input: { url: "https://example.com", steps: 5 }, metadata: { complexity: "high", tags: ["test"] } },
      ]),
    );

    const evolved = await evolveScenarios(sampleScenarios, "in-depth", {});

    expect(evolved.length).toBeGreaterThan(0);
    const callArgs = mockCreate.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0]!.content).toContain("MORE complex");
  });

  it("evolves scenarios using in-breadth type", async () => {
    mockCreate.mockResolvedValue(
      makeLLMResponse([
        { id: "s-1-var", name: "Variation", description: "Different approach", input: { data: "alt" }, metadata: { complexity: "medium", tags: ["variation"] } },
      ]),
    );

    const evolved = await evolveScenarios(sampleScenarios, "in-breadth", {});

    expect(evolved.length).toBeGreaterThan(0);
    const callArgs = mockCreate.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0]!.content).toContain("VARIATIONS");
  });

  it("returns original scenarios when LLM returns no text", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "t", name: "tool", input: {} }],
    });

    const evolved = await evolveScenarios(sampleScenarios, "elimination", {});

    expect(evolved).toEqual(sampleScenarios);
  });
});
