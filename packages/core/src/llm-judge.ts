import Anthropic from "@anthropic-ai/sdk";
import type { Scorer, ScorerContext, ScorerResult } from "@syntharena/shared";

/**
 * LLM-as-judge graders for flexible, rubric-based evaluation.
 *
 * Anti-bias measures (per research):
 * - Randomize output positions to counter position bias
 * - Multiple judge runs with score averaging
 * - Avoid using same model family as agent and judge
 * - Calibration against human-labeled gold standard
 */

export interface LlmJudgeConfig {
  rubric: string;
  name: string;
  model?: string;
  apiKey?: string;
  threshold?: number;
  runs?: number; // Multiple runs for averaging (reduces variance)
}

/**
 * Create an LLM-as-judge scorer with a custom rubric.
 */
export function llmJudge(config: LlmJudgeConfig): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const client = new Anthropic({ apiKey: config.apiKey });
    const model = config.model ?? "claude-sonnet-4-20250514";
    const runs = config.runs ?? 1;
    const threshold = config.threshold ?? 0.7;

    const scores: number[] = [];

    for (let run = 0; run < runs; run++) {
      const prompt = buildJudgePrompt(config.rubric, ctx, run);

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") continue;

      const parsed = parseJudgeResponse(textBlock.text);
      if (parsed !== null) scores.push(parsed);
    }

    if (scores.length === 0) {
      return { name: config.name, score: 0, passed: false, reason: "Judge returned no valid scores" };
    }

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - avgScore) ** 2, 0) / scores.length;

    return {
      name: config.name,
      score: avgScore,
      passed: avgScore >= threshold,
      reason: avgScore < threshold ? `Score ${avgScore.toFixed(2)} below threshold ${threshold}` : undefined,
      metadata: {
        runs: scores.length,
        scores,
        variance,
        model,
      },
    };
  };
}

/**
 * Pairwise comparison judge for Arena mode.
 * Returns which output is better given a rubric.
 */
export function pairwiseJudge(config: {
  rubric: string;
  apiKey?: string;
  model?: string;
}): (ctxA: ScorerContext, ctxB: ScorerContext) => Promise<"A" | "B" | "tie"> {
  return async (ctxA: ScorerContext, ctxB: ScorerContext): Promise<"A" | "B" | "tie"> => {
    const client = new Anthropic({ apiKey: config.apiKey });
    const model = config.model ?? "claude-sonnet-4-20250514";

    // Run twice with swapped positions to mitigate position bias
    const results: Array<"A" | "B" | "tie"> = [];

    for (let swap = 0; swap < 2; swap++) {
      const first = swap === 0 ? ctxA : ctxB;
      const second = swap === 0 ? ctxB : ctxA;

      const prompt = `You are evaluating two AI agent outputs. Compare them according to this rubric:

${config.rubric}

INPUT:
${JSON.stringify(first.input, null, 2)}

OUTPUT A:
${JSON.stringify(first.output, null, 2)}

OUTPUT B:
${JSON.stringify(second.output, null, 2)}

Which output is better according to the rubric? Respond with ONLY one of: "A", "B", or "tie"`;

      const response = await client.messages.create({
        model,
        max_tokens: 10,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") continue;

      const answer = textBlock.text.trim().toUpperCase();
      let result: "A" | "B" | "tie";

      if (answer.includes("A")) result = "A";
      else if (answer.includes("B")) result = "B";
      else result = "tie";

      // Un-swap if positions were reversed
      if (swap === 1 && result !== "tie") {
        result = result === "A" ? "B" : "A";
      }

      results.push(result);
    }

    // If both runs agree, return that; otherwise tie
    if (results[0] === results[1]) return results[0] ?? "tie";
    return "tie";
  };
}

function buildJudgePrompt(rubric: string, ctx: ScorerContext, runIndex: number): string {
  return `You are an evaluation judge. Score the following AI agent output according to this rubric.

RUBRIC:
${rubric}

INPUT (what the agent was given):
${JSON.stringify(ctx.input, null, 2)}

OUTPUT (what the agent produced):
${JSON.stringify(ctx.output, null, 2)}

${ctx.expected ? `EXPECTED (reference answer):\n${JSON.stringify(ctx.expected, null, 2)}` : ""}

${runIndex > 0 ? "Note: This is an independent evaluation run. Score based solely on the rubric." : ""}

Respond with a JSON object: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}
Score 1.0 means perfect, 0.0 means completely wrong.`;
}

function parseJudgeResponse(text: string): number | null {
  try {
    // Try JSON parse
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const score = parsed["score"];
      if (typeof score === "number" && score >= 0 && score <= 1) return score;
    }

    // Fallback: look for a number
    const numMatch = text.match(/(?:score|rating)[:\s]*([0-9]*\.?[0-9]+)/i);
    if (numMatch?.[1]) {
      const num = parseFloat(numMatch[1]);
      if (num >= 0 && num <= 1) return num;
      if (num >= 0 && num <= 10) return num / 10; // Normalize 0-10 scale
      if (num >= 0 && num <= 100) return num / 100; // Normalize 0-100 scale
    }

    return null;
  } catch {
    return null;
  }
}
