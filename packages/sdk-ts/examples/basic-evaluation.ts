/**
 * Basic evaluation example — run an agent against scenarios and see results.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/basic-evaluation.ts
 *   ANTHROPIC_API_KEY=sk-... npx tsx examples/basic-evaluation.ts
 *   npx tsx examples/basic-evaluation.ts   # falls back to demo provider
 */

import {
  evaluate,
  createAgent,
  scorers,
  type Scenario,
} from "../src/index.js";

const scenarios: Scenario[] = [
  {
    id: "scrape-1",
    domain: "web-scraping",
    name: "Extract product prices",
    description: "Scrape product prices from an e-commerce listing page",
    input: {
      url: "https://example.com/products",
      target: "prices",
      format: "json",
    },
    expected: { itemCount: 10, format: "json" },
    metadata: {
      complexity: "medium",
      tags: ["e-commerce", "extraction"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "1.0.0",
    },
  },
  {
    id: "scrape-2",
    domain: "web-scraping",
    name: "Navigate paginated results",
    description: "Follow pagination links and aggregate data across pages",
    input: {
      url: "https://example.com/search?q=laptop",
      pages: 3,
      target: "listings",
    },
    expected: { pagesCrawled: 3 },
    metadata: {
      complexity: "high",
      tags: ["pagination", "aggregation"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "1.0.0",
    },
  },
];

async function main() {
  // createAgent auto-detects provider from env vars:
  //   ANTHROPIC_API_KEY → Claude
  //   OPENAI_API_KEY → OpenAI
  //   neither → demo (instant, no cost)
  const task = createAgent({
    systemPrompt: "You are a web scraping agent. Process the input and return results as JSON.",
  });

  const run = await evaluate({
    name: "web-scraping-eval",
    dataset: scenarios,
    task,
    scorers: [
      scorers.taskCompletion,
      scorers.costThreshold(0.50),
      scorers.safetyCheck(),
    ],
    trials: 3,
  });

  console.log("\n--- Evaluation Results ---");
  console.log(`Run ID:     ${run.id}`);
  console.log(`Status:     ${run.status}`);
  console.log(`pass@k:     ${(run.summary.passAtK * 100).toFixed(1)}% (capability)`);
  console.log(`pass^k:     ${(run.summary.passToTheK * 100).toFixed(1)}% (reliability)`);
  console.log(`Cost:       $${run.summary.totalCost.toFixed(4)}`);
  console.log(`Duration:   ${run.summary.totalDuration}ms`);

  if (run.summary.scoreSummaries) {
    console.log("\nScorer Breakdown:");
    for (const [name, score] of Object.entries(run.summary.scoreSummaries)) {
      console.log(`  ${name}: ${(score.mean * 100).toFixed(1)}% (±${(score.stddev * 100).toFixed(1)}%)`);
    }
  }
}

main().catch(console.error);
