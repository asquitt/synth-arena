/**
 * Custom provider example — integrate any LLM by implementing AgentProvider.
 *
 * This pattern works for local models (Ollama), cloud APIs (Gemini, Mistral),
 * or any custom agent framework.
 *
 * Usage:
 *   npx tsx examples/custom-provider.ts
 */

import {
  evaluate,
  createAgentTask,
  scorers,
  type AgentProvider,
  type AgentResponse,
  type Scenario,
} from "../src/index.js";

// Implement the AgentProvider interface for your LLM
const ollamaProvider: AgentProvider = {
  name: "ollama",
  model: "llama3.2",

  async call(prompt: string, systemPrompt?: string): Promise<AgentResponse> {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        messages,
        stream: false,
      }),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);

    const json = await res.json() as {
      message: { content: string };
      eval_count: number;
      prompt_eval_count: number;
    };

    return {
      content: json.message.content,
      inputTokens: json.prompt_eval_count ?? 0,
      outputTokens: json.eval_count ?? 0,
      model: "llama3.2",
      stopReason: "stop",
    };
  },
};

const scenarios: Scenario[] = [
  {
    id: "legal-1",
    domain: "legal",
    name: "Visa eligibility check",
    description: "Determine H1B visa eligibility based on applicant profile",
    input: {
      applicantType: "software-engineer",
      education: "masters",
      yearsExperience: 5,
      sponsorType: "employer",
    },
    expected: { eligible: true, category: "h1b" },
    metadata: {
      complexity: "medium",
      tags: ["h1b", "eligibility"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "1.0.0",
    },
  },
];

async function main() {
  const task = createAgentTask({
    provider: ollamaProvider,
    systemPrompt: "You are an immigration law assistant. Analyze visa eligibility.",
    buildPrompt: (input) =>
      `Analyze visa eligibility for this applicant:\n${JSON.stringify(input, null, 2)}`,
  });

  const run = await evaluate({
    name: "visa-eligibility-eval",
    dataset: scenarios,
    task,
    scorers: [scorers.taskCompletion, scorers.safetyCheck()],
    trials: 2,
  });

  console.log(`\nResults: pass@k=${(run.summary.passAtK * 100).toFixed(1)}%`);
  console.log(`Cost: $${run.summary.totalCost.toFixed(4)} (local model = ~free)`);
}

main().catch(console.error);
