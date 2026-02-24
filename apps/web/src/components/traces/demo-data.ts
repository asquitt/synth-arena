import type { TraceSpan } from "./types";

export const DEMO_SPANS: TraceSpan[] = [
  {
    id: "span-001", parentId: "", name: "agent.run", type: "decision",
    startTime: "2025-01-15T10:00:00Z", endTime: "2025-01-15T10:00:05Z",
    durationMs: 5000, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "", provider: "", inputTokens: 0, outputTokens: 0,
    cost: 0, attributes: "{}", events: "[]",
  },
  {
    id: "span-002", parentId: "span-001", name: "llm.chat", type: "llm_call",
    startTime: "2025-01-15T10:00:00Z", endTime: "2025-01-15T10:00:02Z",
    durationMs: 2000, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "claude-sonnet-4-20250514", provider: "anthropic",
    inputTokens: 1200, outputTokens: 350, cost: 0.0089,
    attributes: JSON.stringify({ systemPrompt: "You are a helpful assistant", temperature: 0.7 }),
    events: JSON.stringify([{ name: "first_token", timestamp: "2025-01-15T10:00:00.500Z", attributes: {} }]),
  },
  {
    id: "span-003", parentId: "span-001", name: "tool.web_scrape", type: "tool_invocation",
    startTime: "2025-01-15T10:00:02Z", endTime: "2025-01-15T10:00:03.5Z",
    durationMs: 1500, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "", provider: "", inputTokens: 0, outputTokens: 0,
    cost: 0, attributes: JSON.stringify({ url: "https://example.com/products", method: "GET" }),
    events: "[]",
  },
  {
    id: "span-004", parentId: "span-001", name: "llm.chat (follow-up)", type: "llm_call",
    startTime: "2025-01-15T10:00:03.5Z", endTime: "2025-01-15T10:00:04.8Z",
    durationMs: 1300, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "claude-sonnet-4-20250514", provider: "anthropic",
    inputTokens: 2400, outputTokens: 180, cost: 0.0099,
    attributes: JSON.stringify({ toolResults: true }),
    events: "[]",
  },
  {
    id: "span-005", parentId: "span-001", name: "state.update_cart", type: "state_transition",
    startTime: "2025-01-15T10:00:04.8Z", endTime: "2025-01-15T10:00:05Z",
    durationMs: 200, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "", provider: "", inputTokens: 0, outputTokens: 0,
    cost: 0,
    attributes: JSON.stringify({ before: { cart: [] }, after: { cart: ["product-1"] } }),
    events: "[]",
  },
];
