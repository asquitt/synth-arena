import type { Scorer, ScorerContext, ScorerResult } from "@syntharena/shared";

/**
 * Built-in graders for SynthArena evaluation.
 *
 * Grader types (per Anthropic methodology):
 * - Code-based: Deterministic state checks (fast, highest reliability)
 * - Threshold-based: Pass/fail against configurable limits
 * - Comparison-based: Match output against expected values
 */

// ─── Task Completion ─────────────────────────────────────────────────

/**
 * Checks if the task produced any non-null, non-error output.
 */
export const taskCompletion: Scorer = async (ctx: ScorerContext): Promise<ScorerResult> => {
  const hasOutput = ctx.output !== null && ctx.output !== undefined;
  const hasError = ctx.trace?.some((span) => span.status === "error") ?? false;

  const score = hasOutput && !hasError ? 1.0 : 0.0;

  return {
    name: "task_completion",
    score,
    passed: score === 1.0,
    reason: !hasOutput ? "No output produced" : hasError ? "Trace contains errors" : undefined,
  };
};

// ─── Exact Match ─────────────────────────────────────────────────────

/**
 * Checks if the output exactly matches the expected value.
 * Supports deep equality for objects.
 */
export const exactMatch: Scorer = async (ctx: ScorerContext): Promise<ScorerResult> => {
  if (ctx.expected === undefined) {
    return { name: "exact_match", score: 0, passed: false, reason: "No expected value provided" };
  }

  const matches = deepEqual(ctx.output, ctx.expected);

  return {
    name: "exact_match",
    score: matches ? 1.0 : 0.0,
    passed: matches,
    reason: matches ? undefined : "Output does not match expected value",
  };
};

// ─── Contains ────────────────────────────────────────────────────────

/**
 * Checks if the output (stringified) contains specific substrings.
 */
export function contains(...substrings: string[]): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const outputStr = typeof ctx.output === "string" ? ctx.output : JSON.stringify(ctx.output);
    const found = substrings.filter((s) => outputStr.includes(s));
    const score = found.length / substrings.length;

    return {
      name: "contains",
      score,
      passed: score === 1.0,
      reason: score < 1.0 ? `Missing: ${substrings.filter((s) => !outputStr.includes(s)).join(", ")}` : undefined,
      metadata: { found, total: substrings.length },
    };
  };
}

// ─── Cost Threshold ──────────────────────────────────────────────────

/**
 * Fails if the estimated cost exceeds the threshold.
 */
export function costThreshold(maxCost: number): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const cost = ctx.tokenUsage?.estimatedCost ?? 0;
    const passed = cost <= maxCost;

    return {
      name: "cost_threshold",
      score: passed ? 1.0 : Math.max(0, 1 - (cost - maxCost) / maxCost),
      passed,
      reason: passed ? undefined : `Cost $${cost.toFixed(4)} exceeds threshold $${maxCost.toFixed(4)}`,
      metadata: { actualCost: cost, maxCost },
    };
  };
}

// ─── Token Threshold ─────────────────────────────────────────────────

/**
 * Fails if total token usage exceeds limits.
 */
export function tokenThreshold(opts: { maxInput?: number; maxOutput?: number; maxTotal?: number }): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const usage = ctx.tokenUsage;
    if (!usage) {
      return { name: "token_threshold", score: 1.0, passed: true, reason: "No token usage data" };
    }

    const violations: string[] = [];
    if (opts.maxInput && usage.inputTokens > opts.maxInput) {
      violations.push(`Input tokens ${usage.inputTokens} > ${opts.maxInput}`);
    }
    if (opts.maxOutput && usage.outputTokens > opts.maxOutput) {
      violations.push(`Output tokens ${usage.outputTokens} > ${opts.maxOutput}`);
    }
    if (opts.maxTotal && usage.totalTokens > opts.maxTotal) {
      violations.push(`Total tokens ${usage.totalTokens} > ${opts.maxTotal}`);
    }

    const passed = violations.length === 0;

    return {
      name: "token_threshold",
      score: passed ? 1.0 : 0.0,
      passed,
      reason: passed ? undefined : violations.join("; "),
      metadata: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens },
    };
  };
}

// ─── Latency Threshold ───────────────────────────────────────────────

/**
 * Fails if the task duration exceeds the threshold (in ms).
 */
export function latencyThreshold(maxDurationMs: number): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const duration = ctx.trace?.reduce((total, span) => total + (span.endTime - span.startTime), 0) ?? 0;
    const passed = duration <= maxDurationMs;

    return {
      name: "latency_threshold",
      score: passed ? 1.0 : Math.max(0, 1 - (duration - maxDurationMs) / maxDurationMs),
      passed,
      reason: passed ? undefined : `Duration ${duration}ms exceeds threshold ${maxDurationMs}ms`,
      metadata: { actualDuration: duration, maxDuration: maxDurationMs },
    };
  };
}

// ─── Safety Check ────────────────────────────────────────────────────

/**
 * Checks for safety violations in the trace: data leakage patterns,
 * excessive tool calls, or unauthorized environment interactions.
 */
export function safetyCheck(opts?: {
  maxToolCalls?: number;
  blockedPatterns?: RegExp[];
}): Scorer {
  const maxToolCalls = opts?.maxToolCalls ?? 100;
  const blockedPatterns = opts?.blockedPatterns ?? [];

  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const violations: string[] = [];

    if (ctx.trace) {
      // Check tool call count
      const toolCalls = ctx.trace.filter((s) => s.type === "tool_invocation");
      if (toolCalls.length > maxToolCalls) {
        violations.push(`Excessive tool calls: ${toolCalls.length} > ${maxToolCalls}`);
      }

      // Check for blocked patterns in trace attributes
      for (const span of ctx.trace) {
        const attrStr = JSON.stringify(span.attributes);
        for (const pattern of blockedPatterns) {
          if (pattern.test(attrStr)) {
            violations.push(`Blocked pattern detected in span ${span.name}: ${pattern.source}`);
          }
        }
      }
    }

    // Check output for blocked patterns
    const outputStr = typeof ctx.output === "string" ? ctx.output : JSON.stringify(ctx.output);
    for (const pattern of blockedPatterns) {
      if (pattern.test(outputStr)) {
        violations.push(`Blocked pattern in output: ${pattern.source}`);
      }
    }

    const passed = violations.length === 0;

    return {
      name: "safety_check",
      score: passed ? 1.0 : 0.0,
      passed,
      reason: passed ? undefined : violations.join("; "),
      metadata: { violationCount: violations.length },
    };
  };
}

// ─── State Diff ──────────────────────────────────────────────────────

/**
 * Compares the final environment state against expected state.
 * Also detects collateral damage (unexpected state changes).
 */
export function stateDiff(opts: {
  expectedKeys: string[];
  collateralKeys?: string[];
}): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    if (!ctx.expected || typeof ctx.output !== "object" || ctx.output === null) {
      return { name: "state_diff", score: 0, passed: false, reason: "Missing expected or output state" };
    }

    const output = ctx.output as Record<string, unknown>;
    const expected = ctx.expected;

    // Check expected keys match
    const mismatches: string[] = [];
    for (const key of opts.expectedKeys) {
      if (!deepEqual(output[key], expected[key])) {
        mismatches.push(`${key}: got ${JSON.stringify(output[key])}, expected ${JSON.stringify(expected[key])}`);
      }
    }

    // Check for collateral damage
    const collateral: string[] = [];
    if (opts.collateralKeys) {
      for (const key of opts.collateralKeys) {
        if (output[key] !== undefined && expected[key] === undefined) {
          collateral.push(`Unexpected change to ${key}: ${JSON.stringify(output[key])}`);
        }
      }
    }

    const passed = mismatches.length === 0 && collateral.length === 0;
    const issues = [...mismatches, ...collateral];

    return {
      name: "state_diff",
      score: passed ? 1.0 : 1 - issues.length / (opts.expectedKeys.length + (opts.collateralKeys?.length ?? 0)),
      passed,
      reason: passed ? undefined : issues.join("; "),
      metadata: { mismatches: mismatches.length, collateralDamage: collateral.length },
    };
  };
}

// ─── Policy Adherence ───────────────────────────────────────────────

/**
 * Checks that agent actions comply with domain-specific policies.
 * Inspired by tau-bench (Sierra Research) — grade on policy adherence,
 * not just task completion.
 *
 * @example
 * policyAdherence({
 *   rules: [
 *     { name: "no-pii-in-logs", check: (ctx) => !JSON.stringify(ctx.trace).match(/\d{3}-\d{2}-\d{4}/) },
 *     { name: "max-retries", check: (ctx) => (ctx.trace?.length ?? 0) <= 10 },
 *   ]
 * })
 */
export function policyAdherence(opts: {
  rules: Array<{ name: string; check: (ctx: ScorerContext) => boolean; severity?: "error" | "warning" }>;
}): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const violations: Array<{ rule: string; severity: string }> = [];

    for (const rule of opts.rules) {
      try {
        if (!rule.check(ctx)) {
          violations.push({ rule: rule.name, severity: rule.severity ?? "error" });
        }
      } catch (err) {
        violations.push({ rule: rule.name, severity: "error" });
      }
    }

    const errors = violations.filter((v) => v.severity === "error");
    const warnings = violations.filter((v) => v.severity === "warning");
    const passed = errors.length === 0;
    const score = 1 - violations.length / opts.rules.length;

    return {
      name: "policy_adherence",
      score: Math.max(0, score),
      passed,
      reason: violations.length > 0
        ? violations.map((v) => `[${v.severity}] ${v.rule}`).join("; ")
        : undefined,
      metadata: {
        totalRules: opts.rules.length,
        errors: errors.length,
        warnings: warnings.length,
        violatedRules: violations.map((v) => v.rule),
      },
    };
  };
}

// ─── No Regression ──────────────────────────────────────────────────

/**
 * Verifies the agent doesn't break existing functionality.
 * Inspired by SWE-bench — check that pass-to-pass tests still pass
 * after the agent completes its task.
 *
 * Provide assertion functions that should remain true after agent execution.
 *
 * @example
 * noRegression({
 *   assertions: [
 *     { name: "db-intact", check: (output) => output.existingRecords === 10 },
 *     { name: "no-side-effects", check: (output) => !output.unexpectedChanges },
 *   ]
 * })
 */
export function noRegression(opts: {
  assertions: Array<{ name: string; check: (output: unknown) => boolean }>;
}): Scorer {
  return async (ctx: ScorerContext): Promise<ScorerResult> => {
    const failures: string[] = [];

    for (const assertion of opts.assertions) {
      try {
        if (!assertion.check(ctx.output)) {
          failures.push(assertion.name);
        }
      } catch (err) {
        failures.push(`${assertion.name} (threw: ${err instanceof Error ? err.message : String(err)})`);
      }
    }

    const passed = failures.length === 0;
    const score = 1 - failures.length / opts.assertions.length;

    return {
      name: "no_regression",
      score: Math.max(0, score),
      passed,
      reason: failures.length > 0
        ? `Regressions detected: ${failures.join(", ")}`
        : undefined,
      metadata: {
        totalAssertions: opts.assertions.length,
        failed: failures.length,
        failedAssertions: failures,
      },
    };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}
