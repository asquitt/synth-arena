import Anthropic from "@anthropic-ai/sdk";
import type { Scorer, ScorerContext, ScorerResult } from "@syntharena/shared";

/**
 * LLM-as-judge graders for flexible, rubric-based evaluation.
 *
 * Anti-bias measures (per research):
 * - Position debiasing: run with output/expected swapped, average results
 * - ChainPoll: multiple independent judges with majority vote
 * - Multi-model jury: use judges from different model families
 * - Calibration against human-labeled gold standard
 */

export interface LlmJudgeConfig {
  rubric: string;
  name: string;
  model?: string;
  apiKey?: string;
  threshold?: number;
  runs?: number;
  positionDebias?: boolean; // Run with swapped positions to cancel position bias
}

/**
 * Create an LLM-as-judge scorer with a custom rubric.
 * Supports position debiasing by running with output/expected swapped.
 */
export function llmJudge(config: LlmJudgeConfig): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const client = new Anthropic({ apiKey: config.apiKey });
    const model = config.model ?? "claude-sonnet-4-20250514";
    const runs = config.runs ?? 1;
    const threshold = config.threshold ?? 0.7;
    const debias = config.positionDebias ?? false;

    const scores: number[] = [];

    for (let run = 0; run < runs; run++) {
      const prompt = buildJudgePrompt(config.rubric, ctx, run);
      const score = await callJudge(client, model, prompt);
      if (score !== null) scores.push(score);

      // Position debiasing: re-run with output/expected swapped
      if (debias && ctx.expected) {
        const swappedPrompt = buildJudgePrompt(config.rubric, {
          ...ctx,
          output: ctx.expected,
          expected: ctx.output as Record<string, unknown>,
        }, run);
        const swappedScore = await callJudge(client, model, swappedPrompt);
        // Invert the swapped score (if judge gave 0.8 to expected, the original deserves 0.2)
        if (swappedScore !== null) scores.push(1 - swappedScore);
      }
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
        positionDebiased: debias,
      },
    };
  };
}

export interface ChainPollConfig {
  rubric: string;
  name: string;
  /** Models to use as judges (default: 3 runs of the same model) */
  models?: string[];
  apiKey?: string;
  threshold?: number;
  /** Minimum judges that must agree for consensus (default: majority) */
  consensusThreshold?: number;
  positionDebias?: boolean;
}

/**
 * ChainPoll: Multi-judge consensus scoring.
 * Runs multiple independent judges and takes majority vote.
 * Reduces variance by ~50% compared to single judge (per research).
 */
export function chainPollJudge(config: ChainPollConfig): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const client = new Anthropic({ apiKey: config.apiKey });
    const models = config.models ?? [
      "claude-sonnet-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-sonnet-4-20250514",
    ];
    const threshold = config.threshold ?? 0.7;
    const debias = config.positionDebias ?? true;
    const consensusMin = config.consensusThreshold ?? Math.ceil(models.length / 2);

    const judgements: { model: string; score: number; passed: boolean }[] = [];

    for (const model of models) {
      const scores: number[] = [];

      const prompt = buildJudgePrompt(config.rubric, ctx, 0);
      const score = await callJudge(client, model, prompt);
      if (score !== null) scores.push(score);

      if (debias && ctx.expected) {
        const swappedPrompt = buildJudgePrompt(config.rubric, {
          ...ctx,
          output: ctx.expected,
          expected: ctx.output as Record<string, unknown>,
        }, 0);
        const swappedScore = await callJudge(client, model, swappedPrompt);
        if (swappedScore !== null) scores.push(1 - swappedScore);
      }

      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        judgements.push({ model, score: avg, passed: avg >= threshold });
      }
    }

    if (judgements.length === 0) {
      return { name: config.name, score: 0, passed: false, reason: "No judges returned valid scores" };
    }

    const passCount = judgements.filter((j) => j.passed).length;
    const consensusPassed = passCount >= consensusMin;
    const avgScore = judgements.reduce((s, j) => s + j.score, 0) / judgements.length;

    return {
      name: config.name,
      score: avgScore,
      passed: consensusPassed,
      reason: !consensusPassed
        ? `${passCount}/${judgements.length} judges passed (need ${consensusMin})`
        : undefined,
      metadata: {
        judgements,
        consensusThreshold: consensusMin,
        positionDebiased: debias,
      },
    };
  };
}

async function callJudge(client: Anthropic, model: string, prompt: string): Promise<number | null> {
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  return parseJudgeResponse(textBlock.text);
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
