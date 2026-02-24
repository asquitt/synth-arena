/**
 * Arena comparison example — pit two agents head-to-head on the same scenarios.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/arena-comparison.ts
 *   npx tsx examples/arena-comparison.ts   # demo mode
 */

import {
  runArena,
  createAgent,
  createOpenAIProvider,
  createClaudeProvider,
  createDemoProvider,
  createAgentTask,
  scorers,
  type Scenario,
} from "../src/index.js";

const scenarios: Scenario[] = Array.from({ length: 5 }, (_, i) => ({
  id: `gov-${i + 1}`,
  domain: "government",
  name: `RFP analysis ${i + 1}`,
  description: `Analyze government RFP document and extract key requirements`,
  input: {
    documentId: `SAM-2025-${1000 + i}`,
    sections: ["scope", "requirements", "evaluation-criteria"],
  },
  expected: { sectionsExtracted: 3 },
  metadata: {
    complexity: i < 3 ? "medium" : "high",
    tags: ["rfp", "extraction"],
    generatedAt: new Date().toISOString(),
    generatorVersion: "1.0.0",
  },
}));

async function main() {
  // Build agents — uses demo providers if no API keys set
  const agentA = createAgentTask({
    provider: process.env["OPENAI_API_KEY"]
      ? createOpenAIProvider({ apiKey: process.env["OPENAI_API_KEY"], model: "gpt-4.1-mini" })
      : createDemoProvider("agent-a-demo"),
    systemPrompt: "You are a government contract analysis assistant. Be thorough.",
  });

  const agentB = createAgentTask({
    provider: process.env["ANTHROPIC_API_KEY"]
      ? createClaudeProvider({ apiKey: process.env["ANTHROPIC_API_KEY"], model: "claude-haiku-3.5" })
      : createDemoProvider("agent-b-demo"),
    systemPrompt: "You are a government contract analysis assistant. Be concise.",
  });

  const result = await runArena({
    name: "rfp-analysis-arena",
    agents: [
      { name: "thorough-agent", task: agentA },
      { name: "concise-agent", task: agentB },
    ],
    dataset: scenarios,
    scorers: [scorers.taskCompletion, scorers.costThreshold(0.10)],
    trials: 3,
  });

  console.log("\n--- Arena Results ---");
  console.log(`Arena ID: ${result.id}`);
  console.log(`Matchups: ${result.matchupCount}\n`);

  console.log("Leaderboard:");
  result.rankings.forEach((agent, i) => {
    console.log(
      `  #${i + 1} ${agent.agentName.padEnd(20)} ` +
      `Elo: ${agent.elo}  ` +
      `W/L/D: ${agent.wins}/${agent.losses}/${agent.draws}  ` +
      `Score: ${(agent.avgScore * 100).toFixed(1)}%  ` +
      `Cost: $${agent.avgCost.toFixed(4)}`
    );
  });
}

main().catch(console.error);
