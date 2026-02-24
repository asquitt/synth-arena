import Anthropic from "@anthropic-ai/sdk";
import type { Scorer, ScorerContext, ScorerResult } from "@syntharena/shared";

/**
 * Natural Language Scorer Generator.
 *
 * Converts plain English evaluation criteria into executable scorer functions.
 * Competitive with Braintrust's "Loop" — but built into the eval engine.
 *
 * Two modes:
 * 1. **LLM-backed**: Each evaluation call uses an LLM to score against the criteria
 * 2. **Code-gen**: Generates a deterministic TypeScript check function (no LLM at eval time)
 *
 * @example
 * ```ts
 * const scorer = generateScorer({
 *   criteria: "Penalize responses that mention competitor products like Acme or FooCorp",
 *   name: "no_competitor_mentions",
 * });
 * ```
 */

export interface ScorerGeneratorConfig {
  /** Plain English description of what to evaluate. */
  criteria: string;
  /** Scorer name (used in results). */
  name: string;
  /** Mode: "llm" runs LLM per evaluation, "deterministic" generates a code check. */
  mode?: "llm" | "deterministic";
  /** Pass threshold (0-1). Default: 0.7 */
  threshold?: number;
  /** Model for LLM-backed scoring. Default: claude-sonnet-4-20250514 */
  model?: string;
  /** API key override. Falls back to ANTHROPIC_API_KEY env. */
  apiKey?: string;
}

/**
 * Generate a scorer from natural language criteria.
 *
 * In "llm" mode (default), each evaluation sends the output to an LLM
 * with the criteria as a rubric. Fast to set up, but costs per eval.
 *
 * In "deterministic" mode, the criteria is analyzed once and converted
 * into a set of string/regex checks that run without LLM calls.
 */
export function generateScorer(config: ScorerGeneratorConfig): Scorer {
  const mode = config.mode ?? "llm";
  const threshold = config.threshold ?? 0.7;

  if (mode === "deterministic") {
    return buildDeterministicScorer(config.criteria, config.name, threshold);
  }

  return buildLlmScorer(config);
}

/** LLM-backed scorer: sends criteria + output to judge each time. */
function buildLlmScorer(config: ScorerGeneratorConfig): Scorer {
  const threshold = config.threshold ?? 0.7;

  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const client = new Anthropic({ apiKey: config.apiKey });
    const model = config.model ?? "claude-sonnet-4-20250514";

    const prompt = `You are an evaluation judge for an AI agent.

EVALUATION CRITERIA (provided by the user):
${config.criteria}

AGENT INPUT:
${JSON.stringify(ctx.input, null, 2)}

AGENT OUTPUT:
${JSON.stringify(ctx.output, null, 2)}

${ctx.expected ? `EXPECTED/REFERENCE:\n${JSON.stringify(ctx.expected, null, 2)}` : ""}

Score the agent output according to the criteria above.
Respond with ONLY a JSON object: {"score": <0.0 to 1.0>, "reason": "<1-2 sentence explanation>"}
- 1.0 = fully meets criteria
- 0.0 = completely fails criteria`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") {
        return { name: config.name, score: 0, passed: false, reason: "LLM returned no text" };
      }

      const parsed = parseScoreResponse(text.text);

      return {
        name: config.name,
        score: parsed.score,
        passed: parsed.score >= threshold,
        reason: parsed.reason ?? (parsed.score < threshold ? `Score ${parsed.score.toFixed(2)} below threshold ${threshold}` : undefined),
        metadata: { mode: "llm", model, criteria: config.criteria },
      };
    } catch (err) {
      return {
        name: config.name,
        score: 0,
        passed: false,
        reason: `LLM scorer error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}

/**
 * Deterministic scorer: parses criteria into string/regex checks.
 * No LLM calls at eval time — fast and free.
 *
 * Supports common patterns:
 * - "must contain X" / "should include X"
 * - "must not contain X" / "should not mention X" / "penalize X"
 * - "output length must be < N words/chars"
 * - "must be valid JSON"
 * - "must match pattern /regex/"
 */
function buildDeterministicScorer(criteria: string, name: string, threshold: number): Scorer {
  const checks = parseCriteriaToChecks(criteria);

  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const outputStr = typeof ctx.output === "string" ? ctx.output : JSON.stringify(ctx.output);
    const failures: string[] = [];
    let passedChecks = 0;

    for (const check of checks) {
      const result = check.fn(outputStr, ctx);
      if (result) {
        passedChecks++;
      } else {
        failures.push(check.description);
      }
    }

    const score = checks.length > 0 ? passedChecks / checks.length : 1;

    return {
      name,
      score,
      passed: score >= threshold,
      reason: failures.length > 0 ? `Failed: ${failures.join("; ")}` : undefined,
      metadata: {
        mode: "deterministic",
        totalChecks: checks.length,
        passedChecks,
        failures,
      },
    };
  };
}

interface Check {
  description: string;
  fn: (output: string, ctx: ScorerContext) => boolean;
}

/** Parse natural language criteria into executable checks. */
function parseCriteriaToChecks(criteria: string): Check[] {
  const checks: Check[] = [];
  const lines = criteria.split(/[.;\n]+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // "must not be empty" / "non-empty" — check BEFORE notContains to avoid false match
    if (lower.includes("not be empty") || lower.includes("non-empty")) {
      checks.push({
        description: "Must not be empty",
        fn: (output) => output.trim().length > 0,
      });
      continue;
    }

    // "must contain X" / "should include X" / "output should have X"
    const containsMatch = lower.match(/(?:must|should|needs? to)\s+(?:contain|include|have|mention)\s+["""]?(.+?)["""]?\s*$/);
    if (containsMatch?.[1]) {
      const target = containsMatch[1]
        .replace(/[""'"]/g, "")
        .replace(/^(?:the\s+(?:word|phrase|text|string|term)\s+)/i, "")
        .trim();
      checks.push({
        description: `Must contain "${target}"`,
        fn: (output) => output.toLowerCase().includes(target.toLowerCase()),
      });
      continue;
    }

    // "must not contain X" / "should not mention X" / "penalize mentions of X"
    const notContainsMatch = lower.match(/(?:must not|should not|shouldn't|cannot|penalize|avoid|no)\s+(?:contain|include|mention|reference|use|have)?\s*["""]?(.+?)["""]?\s*$/);
    if (notContainsMatch?.[1]) {
      const targets = notContainsMatch[1].replace(/[""'"]/g, "").split(/\s+(?:or|and|,)\s+/).map((t) => t.trim()).filter(Boolean);
      for (const target of targets) {
        checks.push({
          description: `Must not contain "${target}"`,
          fn: (output) => !output.toLowerCase().includes(target.toLowerCase()),
        });
      }
      continue;
    }

    // "length must be < N words"
    const wordLimitMatch = lower.match(/(?:length|output)\s+(?:must|should)\s+be\s+(?:less than|under|<|fewer than)\s+(\d+)\s+words/);
    if (wordLimitMatch?.[1]) {
      const maxWords = parseInt(wordLimitMatch[1]);
      checks.push({
        description: `Must be under ${maxWords} words`,
        fn: (output) => output.split(/\s+/).length < maxWords,
      });
      continue;
    }

    // "length must be < N characters"
    const charLimitMatch = lower.match(/(?:length|output)\s+(?:must|should)\s+be\s+(?:less than|under|<|fewer than)\s+(\d+)\s+char/);
    if (charLimitMatch?.[1]) {
      const maxChars = parseInt(charLimitMatch[1]);
      checks.push({
        description: `Must be under ${maxChars} characters`,
        fn: (output) => output.length < maxChars,
      });
      continue;
    }

    // "must be valid JSON"
    if (lower.includes("valid json")) {
      checks.push({
        description: "Must be valid JSON",
        fn: (output) => {
          try { JSON.parse(output); return true; } catch { return false; }
        },
      });
      continue;
    }

    // "must match /pattern/"
    const regexMatch = line.match(/must\s+match\s+\/(.+?)\//i);
    if (regexMatch?.[1]) {
      const pattern = new RegExp(regexMatch[1], "i");
      checks.push({
        description: `Must match /${regexMatch[1]}/`,
        fn: (output) => pattern.test(output),
      });
      continue;
    }

  }

  return checks;
}

function parseScoreResponse(text: string): { score: number; reason?: string } {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const score = typeof parsed["score"] === "number" ? parsed["score"] : 0;
      const reason = typeof parsed["reason"] === "string" ? parsed["reason"] : undefined;
      return { score: Math.max(0, Math.min(1, score)), reason };
    }
  } catch { /* fall through */ }

  // Fallback: look for a number
  const numMatch = text.match(/([0-9]*\.?[0-9]+)/);
  if (numMatch?.[1]) {
    const num = parseFloat(numMatch[1]);
    if (num >= 0 && num <= 1) return { score: num };
    if (num >= 0 && num <= 10) return { score: num / 10 };
  }

  return { score: 0, reason: "Could not parse score from LLM response" };
}

/**
 * Batch-generate multiple scorers from a list of criteria descriptions.
 * Useful for building evaluation suites from product requirements.
 *
 * @example
 * ```ts
 * const suite = generateScorerSuite([
 *   { criteria: "Response must be in English", name: "language_check" },
 *   { criteria: "Must not mention competitor products", name: "no_competitors" },
 *   { criteria: "Output length must be under 500 words", name: "conciseness" },
 * ]);
 * ```
 */
export function generateScorerSuite(
  configs: Array<Omit<ScorerGeneratorConfig, "apiKey" | "model"> & { apiKey?: string; model?: string }>,
): Scorer[] {
  return configs.map((c) => generateScorer(c));
}
