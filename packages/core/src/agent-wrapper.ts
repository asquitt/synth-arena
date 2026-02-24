/**
 * Agent wrapper — converts LLM API calls into TaskFunction.
 *
 * Supports any provider that implements the AgentProvider interface.
 * Built-in providers: OpenAI-compatible, Anthropic Claude.
 */

import type { TaskFunction, TaskResult, TraceSpan, TokenUsage } from "@syntharena/shared";
import { generateId } from "./utils.js";

// ─── Provider Interface ─────────────────────────────────────────

export interface AgentProvider {
  name: string;
  model: string;
  call(prompt: string, systemPrompt?: string): Promise<AgentResponse>;
}

export interface AgentResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason?: string;
}

export interface AgentWrapperConfig {
  provider: AgentProvider;
  systemPrompt?: string;
  buildPrompt?: (input: Record<string, unknown>) => string;
}

// ─── Agent Wrapper ──────────────────────────────────────────────

export function createAgentTask(config: AgentWrapperConfig): TaskFunction {
  const { provider, systemPrompt, buildPrompt } = config;

  return async (input: Record<string, unknown>): Promise<TaskResult> => {
    const prompt = buildPrompt
      ? buildPrompt(input)
      : JSON.stringify(input);

    const spanId = generateId();
    const startTime = Date.now();

    try {
      const response = await provider.call(prompt, systemPrompt);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const costPerInputToken = estimateCostPerToken(provider.name, response.model, "input");
      const costPerOutputToken = estimateCostPerToken(provider.name, response.model, "output");
      const estimatedCost =
        (response.inputTokens * costPerInputToken) +
        (response.outputTokens * costPerOutputToken);

      const tokenUsage: TokenUsage = {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.inputTokens + response.outputTokens,
        estimatedCost,
        model: response.model,
        provider: provider.name,
      };

      const trace: TraceSpan[] = [{
        id: spanId,
        name: `${provider.name}.chat`,
        type: "llm_call",
        startTime,
        endTime,
        attributes: {
          model: response.model,
          provider: provider.name,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          stopReason: response.stopReason,
        },
        events: [{
          name: "response_received",
          timestamp: endTime,
          attributes: { contentLength: response.content.length },
        }],
        status: "ok",
      }];

      // Try to parse JSON output, fall back to string
      let output: unknown;
      try {
        output = JSON.parse(response.content);
      } catch {
        output = response.content;
      }

      return { output, trace, tokenUsage, duration };
    } catch (err) {
      const endTime = Date.now();
      return {
        output: null,
        trace: [{
          id: spanId,
          name: `${provider.name}.chat`,
          type: "llm_call",
          startTime,
          endTime,
          attributes: { error: err instanceof Error ? err.message : String(err) },
          events: [],
          status: "error",
        }],
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          model: provider.model,
          provider: provider.name,
        },
        duration: endTime - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

// ─── Built-in Providers ─────────────────────────────────────────

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export function createOpenAIProvider(config: OpenAIProviderConfig): AgentProvider {
  const model = config.model ?? "gpt-4.1";
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";

  return {
    name: "openai",
    model,
    async call(prompt: string, systemPrompt?: string): Promise<AgentResponse> {
      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: prompt });

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens ?? 1024,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${body}`);
      }

      const json = await res.json() as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number };
        model: string;
      };

      return {
        content: json.choices[0]?.message.content ?? "",
        inputTokens: json.usage.prompt_tokens,
        outputTokens: json.usage.completion_tokens,
        model: json.model,
        stopReason: json.choices[0]?.finish_reason,
      };
    },
  };
}

export interface ClaudeProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export function createClaudeProvider(config: ClaudeProviderConfig): AgentProvider {
  const model = config.model ?? "claude-sonnet-4-20250514";

  return {
    name: "anthropic",
    model,
    async call(prompt: string, systemPrompt?: string): Promise<AgentResponse> {
      const body: Record<string, unknown> = {
        model,
        max_tokens: config.maxTokens ?? 1024,
        messages: [{ role: "user", content: prompt }],
      };
      if (systemPrompt) body.system = systemPrompt;
      if (config.temperature !== undefined) body.temperature = config.temperature;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
      }

      const json = await res.json() as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
        model: string;
        stop_reason: string;
      };

      const content = json.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");

      return {
        content,
        inputTokens: json.usage.input_tokens,
        outputTokens: json.usage.output_tokens,
        model: json.model,
        stopReason: json.stop_reason,
      };
    },
  };
}

// ─── Demo Provider (fallback) ───────────────────────────────────

export function createDemoProvider(model = "demo"): AgentProvider {
  return {
    name: "demo",
    model,
    async call(prompt: string): Promise<AgentResponse> {
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
      return {
        content: JSON.stringify({ processed: true, input: prompt.slice(0, 100) }),
        inputTokens: Math.floor(prompt.length / 4),
        outputTokens: 50,
        model,
        stopReason: "end_turn",
      };
    },
  };
}

// ─── Cost Estimation ────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "claude-haiku-3.5": { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  "claude-opus-4-0": { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  "gpt-4.1": { input: 2 / 1_000_000, output: 8 / 1_000_000 },
  "gpt-4.1-mini": { input: 0.4 / 1_000_000, output: 1.6 / 1_000_000 },
  "gpt-4.1-nano": { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
};

function estimateCostPerToken(_provider: string, model: string, type: "input" | "output"): number {
  const pricing = PRICING[model];
  if (pricing) return pricing[type];
  // Default fallback
  return type === "input" ? 3 / 1_000_000 : 15 / 1_000_000;
}

// ─── Utility: Auto-detect Provider ──────────────────────────────

export interface AutoAgentConfig {
  provider?: "anthropic" | "openai" | "demo";
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  buildPrompt?: (input: Record<string, unknown>) => string;
  temperature?: number;
  maxTokens?: number;
}

export function createAgent(config: AutoAgentConfig = {}): TaskFunction {
  let provider: AgentProvider;

  if (config.provider === "anthropic" || (!config.provider && config.apiKey && process.env.ANTHROPIC_API_KEY)) {
    provider = createClaudeProvider({
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  } else if (config.provider === "openai" || (!config.provider && (config.apiKey || process.env.OPENAI_API_KEY))) {
    provider = createOpenAIProvider({
      apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? "",
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  } else {
    provider = createDemoProvider(config.model);
  }

  return createAgentTask({
    provider,
    systemPrompt: config.systemPrompt,
    buildPrompt: config.buildPrompt,
  });
}
