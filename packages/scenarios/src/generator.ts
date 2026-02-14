import Anthropic from "@anthropic-ai/sdk";
import type { Scenario, DomainTemplate, ScenarioMetadata } from "@syntharena/shared";

/**
 * LLM-based scenario generation pipeline.
 *
 * Three-stage pipeline (per academic research):
 * 1. Generate: LLM creates scenarios from domain template + seed data
 * 2. Curate: Filter and re-weight for quality and diversity
 * 3. Validate: Check fidelity, utility, and privacy metrics
 */

interface GenerateOptions {
  template: DomainTemplate;
  count: number;
  complexity?: ScenarioMetadata["complexity"];
  apiKey?: string;
  model?: string;
}

export async function generateScenarios(opts: GenerateOptions): Promise<Scenario[]> {
  const { template, count, complexity, model = "claude-sonnet-4-20250514" } = opts;

  const client = new Anthropic({ apiKey: opts.apiKey });
  const scenarios: Scenario[] = [];
  const batchSize = Math.min(count, 10); // Generate up to 10 per LLM call
  const batches = Math.ceil(count / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const remaining = count - scenarios.length;
    const thisCount = Math.min(batchSize, remaining);

    const prompt = buildGenerationPrompt(template, thisCount, complexity, batch);

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") continue;

    const parsed = parseScenarioResponse(textBlock.text, template.name, batch * batchSize);
    scenarios.push(...parsed);
  }

  // Curate: deduplicate and filter
  const curated = curateScenarios(scenarios);

  return curated.slice(0, count);
}

function buildGenerationPrompt(
  template: DomainTemplate,
  count: number,
  complexity: ScenarioMetadata["complexity"] | undefined,
  batchIndex: number
): string {
  const complexityInstruction = complexity
    ? `All scenarios should be "${complexity}" complexity.`
    : "Mix complexity levels: 40% low, 30% medium, 20% high, 10% adversarial.";

  const constraints = template.constraints
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");

  return `You are a test scenario generator for the "${template.name}" domain.

Domain: ${template.description}
${constraints ? `\nDomain Constraints:\n${constraints}` : ""}

Generate exactly ${count} realistic test scenarios as a JSON array. Each scenario must have:
- id: unique string (use "${template.name}-batch${batchIndex}-{index}")
- domain: "${template.name}"
- name: short descriptive name
- description: what the agent needs to accomplish
- input: object with all data the agent receives
- expected: object with expected outcomes/state after completion
- metadata.complexity: one of "low", "medium", "high", "adversarial"
- metadata.tags: relevant categorization tags

${complexityInstruction}

${batchIndex > 0 ? `This is batch ${batchIndex + 1}. Ensure scenarios are different from previous batches. Increase variety in edge cases, data patterns, and difficulty.` : ""}

Respond ONLY with a valid JSON array. No markdown, no explanation.`;
}

function parseScenarioResponse(text: string, domain: string, startIndex: number): Scenario[] {
  try {
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;

    return parsed.map((item, i) => ({
      id: (item["id"] as string) ?? `${domain}-${startIndex + i}`,
      domain,
      name: (item["name"] as string) ?? `${domain}-scenario-${startIndex + i}`,
      description: (item["description"] as string) ?? "",
      input: (item["input"] as Record<string, unknown>) ?? {},
      expected: item["expected"] as Record<string, unknown> | undefined,
      metadata: {
        complexity: ((item["metadata"] as Record<string, unknown>)?.["complexity"] as ScenarioMetadata["complexity"]) ?? "medium",
        tags: ((item["metadata"] as Record<string, unknown>)?.["tags"] as string[]) ?? [domain],
        generatedAt: new Date().toISOString(),
        generatorVersion: "0.1.0",
        seedId: `batch-${Math.floor(startIndex / 10)}`,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Curate scenarios: remove duplicates, ensure diversity.
 * Per research: curation > volume.
 */
function curateScenarios(scenarios: Scenario[]): Scenario[] {
  const seen = new Set<string>();
  const curated: Scenario[] = [];

  for (const scenario of scenarios) {
    // Deduplicate by description similarity (simple hash)
    const key = scenario.description.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);

    // Validate structure
    if (!scenario.input || Object.keys(scenario.input).length === 0) continue;
    if (!scenario.description) continue;

    curated.push(scenario);
  }

  return curated;
}

/**
 * Evolve scenarios to increase difficulty and diversity.
 * Three evolution types per research:
 * - In-depth: increase complexity
 * - In-breadth: diversify across dimensions
 * - Elimination: remove trivially solvable
 */
export async function evolveScenarios(
  scenarios: Scenario[],
  type: "in-depth" | "in-breadth" | "elimination",
  opts: { apiKey?: string; model?: string }
): Promise<Scenario[]> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const model = opts.model ?? "claude-sonnet-4-20250514";

  const prompts: Record<string, string> = {
    "in-depth": `Take these test scenarios and make each one MORE complex. Add multi-step requirements, ambiguous inputs, edge cases, and adversarial elements. Return a JSON array of evolved scenarios.`,
    "in-breadth": `Take these test scenarios and create VARIATIONS that cover different dimensions: different data types, cultural contexts, error conditions, and boundary values. Return a JSON array.`,
    "elimination": `Review these test scenarios and REMOVE any that are trivially solvable (a simple deterministic algorithm could solve them without AI). Return only the non-trivial scenarios as a JSON array.`,
  };

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${prompts[type]}\n\nScenarios:\n${JSON.stringify(scenarios.slice(0, 20), null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return scenarios;

  return parseScenarioResponse(textBlock.text, scenarios[0]?.domain ?? "unknown", 0);
}
