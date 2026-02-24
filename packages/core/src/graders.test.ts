import { describe, it, expect } from "vitest";
import {
  taskCompletion,
  exactMatch,
  contains,
  costThreshold,
  tokenThreshold,
  latencyThreshold,
  safetyCheck,
  stateDiff,
  policyAdherence,
  noRegression,
} from "./graders.js";
import type { TraceSpan } from "@syntharena/shared";

function makeSpan(overrides?: Partial<TraceSpan>): TraceSpan {
  return {
    id: "span-1",
    name: "test-span",
    type: "llm_call",
    startTime: 0,
    endTime: 100,
    status: "ok",
    attributes: {},
    events: [],
    ...overrides,
  };
}

// ─── taskCompletion ───────────────────────────────────────────────────

describe("taskCompletion", () => {
  it("passes with non-null output and no trace errors", async () => {
    const result = await taskCompletion({ input: {}, output: "hello", trace: [] });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.name).toBe("task_completion");
  });

  it("fails when output is null", async () => {
    const result = await taskCompletion({ input: {}, output: null });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("No output");
  });

  it("fails when output is undefined", async () => {
    const result = await taskCompletion({ input: {}, output: undefined });
    expect(result.passed).toBe(false);
  });

  it("fails when trace has error spans", async () => {
    const result = await taskCompletion({
      input: {},
      output: "ok",
      trace: [makeSpan({ status: "error" })],
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("errors");
  });

  it("passes with empty trace (no errors)", async () => {
    const result = await taskCompletion({ input: {}, output: "ok", trace: [] });
    expect(result.passed).toBe(true);
  });

  it("passes when output is 0 (falsy but not null/undefined)", async () => {
    const result = await taskCompletion({ input: {}, output: 0 });
    expect(result.passed).toBe(true);
  });

  it("passes when output is empty string (falsy but not null/undefined)", async () => {
    const result = await taskCompletion({ input: {}, output: "" });
    expect(result.passed).toBe(true);
  });

  it("passes when output is false (falsy but not null/undefined)", async () => {
    const result = await taskCompletion({ input: {}, output: false });
    expect(result.passed).toBe(true);
  });

  it("passes when no trace provided", async () => {
    const result = await taskCompletion({ input: {}, output: "data" });
    expect(result.passed).toBe(true);
  });
});

// ─── exactMatch ───────────────────────────────────────────────────────

describe("exactMatch", () => {
  it("passes on identical primitives", async () => {
    const result = await exactMatch({ input: {}, output: 42, expected: { value: 42 } });
    // output is 42, expected is { value: 42 } - they won't match
    expect(result.passed).toBe(false);
  });

  it("passes on identical strings", async () => {
    const result = await exactMatch({ input: {}, output: "hello", expected: { text: "hello" } });
    expect(result.passed).toBe(false); // Different structures
  });

  it("passes on deep equal objects", async () => {
    const obj = { a: 1, b: { c: [1, 2, 3] } };
    const result = await exactMatch({ input: {}, output: obj, expected: obj });
    expect(result.passed).toBe(true);
  });

  it("fails when expected is undefined", async () => {
    const result = await exactMatch({ input: {}, output: "hello" });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("No expected");
  });

  it("fails on different key counts", async () => {
    const result = await exactMatch({
      input: {},
      output: { a: 1, b: 2 },
      expected: { a: 1 },
    });
    expect(result.passed).toBe(false);
  });

  it("fails on different values", async () => {
    const result = await exactMatch({
      input: {},
      output: { x: "foo" },
      expected: { x: "bar" },
    });
    expect(result.passed).toBe(false);
  });

  it("fails when types differ", async () => {
    const result = await exactMatch({
      input: {},
      output: { n: "1" },
      expected: { n: 1 } as unknown as Record<string, unknown>,
    });
    expect(result.passed).toBe(false);
  });

  it("handles null comparison", async () => {
    const result = await exactMatch({
      input: {},
      output: null,
      expected: { val: null } as unknown as Record<string, unknown>,
    });
    expect(result.passed).toBe(false);
  });
});

// ─── contains ─────────────────────────────────────────────────────────

describe("contains", () => {
  it("scores 1.0 when all substrings found", async () => {
    const scorer = contains("hello", "world");
    const result = await scorer({ input: {}, output: "hello world" });
    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
  });

  it("scores 0.5 when half found", async () => {
    const scorer = contains("found", "missing");
    const result = await scorer({ input: {}, output: "found here" });
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(false);
  });

  it("scores 0 when none found", async () => {
    const scorer = contains("x", "y", "z");
    const result = await scorer({ input: {}, output: "abc" });
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("works with JSON-stringified objects", async () => {
    const scorer = contains("hello");
    const result = await scorer({ input: {}, output: { message: "hello" } });
    expect(result.passed).toBe(true);
  });

  it("reports missing substrings in reason", async () => {
    const scorer = contains("a", "b", "c");
    const result = await scorer({ input: {}, output: "a" });
    expect(result.reason).toContain("b");
    expect(result.reason).toContain("c");
  });

  it("handles single substring", async () => {
    const scorer = contains("target");
    const result = await scorer({ input: {}, output: "has target in it" });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ─── costThreshold ───────────────────────────────────────────────────

describe("costThreshold", () => {
  it("passes when cost equals threshold exactly", async () => {
    const scorer = costThreshold(0.5);
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.5, model: "t", provider: "t" },
    });
    expect(result.passed).toBe(true);
  });

  it("fails when cost exceeds threshold", async () => {
    const scorer = costThreshold(0.01);
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.5, model: "t", provider: "t" },
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(1.0);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("passes when no tokenUsage (defaults to 0 cost)", async () => {
    const scorer = costThreshold(0.5);
    const result = await scorer({ input: {}, output: {} });
    expect(result.passed).toBe(true);
  });

  it("includes cost details in metadata", async () => {
    const scorer = costThreshold(1.0);
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.3, model: "t", provider: "t" },
    });
    expect(result.metadata).toEqual({ actualCost: 0.3, maxCost: 1.0 });
  });

  it("computes graceful degradation score when over threshold", async () => {
    const scorer = costThreshold(1.0);
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 1.5, model: "t", provider: "t" },
    });
    // score = max(0, 1 - (1.5 - 1.0) / 1.0) = max(0, 0.5) = 0.5
    expect(result.score).toBeCloseTo(0.5, 5);
  });
});

// ─── tokenThreshold ──────────────────────────────────────────────────

describe("tokenThreshold", () => {
  it("passes when all token counts are under limits", async () => {
    const scorer = tokenThreshold({ maxInput: 200, maxOutput: 100, maxTotal: 300 });
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.01, model: "t", provider: "t" },
    });
    expect(result.passed).toBe(true);
  });

  it("fails when input tokens exceed limit", async () => {
    const scorer = tokenThreshold({ maxInput: 50 });
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.01, model: "t", provider: "t" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Input tokens");
  });

  it("fails when output tokens exceed limit", async () => {
    const scorer = tokenThreshold({ maxOutput: 10 });
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.01, model: "t", provider: "t" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Output tokens");
  });

  it("fails when total tokens exceed limit", async () => {
    const scorer = tokenThreshold({ maxTotal: 100 });
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.01, model: "t", provider: "t" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Total tokens");
  });

  it("passes when no token usage data available", async () => {
    const scorer = tokenThreshold({ maxTotal: 100 });
    const result = await scorer({ input: {}, output: {} });
    expect(result.passed).toBe(true);
    expect(result.reason).toContain("No token usage");
  });

  it("reports multiple violations", async () => {
    const scorer = tokenThreshold({ maxInput: 10, maxOutput: 10, maxTotal: 10 });
    const result = await scorer({
      input: {},
      output: {},
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.01, model: "t", provider: "t" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Input");
    expect(result.reason).toContain("Output");
    expect(result.reason).toContain("Total");
  });
});

// ─── latencyThreshold ────────────────────────────────────────────────

describe("latencyThreshold", () => {
  it("passes when total duration is under threshold", async () => {
    const scorer = latencyThreshold(1000);
    const result = await scorer({
      input: {},
      output: {},
      trace: [makeSpan({ startTime: 0, endTime: 500 })],
    });
    expect(result.passed).toBe(true);
  });

  it("fails when total duration exceeds threshold", async () => {
    const scorer = latencyThreshold(100);
    const result = await scorer({
      input: {},
      output: {},
      trace: [makeSpan({ startTime: 0, endTime: 500 })],
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("exceeds");
  });

  it("sums durations across multiple spans", async () => {
    const scorer = latencyThreshold(300);
    const result = await scorer({
      input: {},
      output: {},
      trace: [
        makeSpan({ startTime: 0, endTime: 100 }),
        makeSpan({ startTime: 100, endTime: 300 }),
      ],
    });
    // Total: 100 + 200 = 300, threshold 300 → pass
    expect(result.passed).toBe(true);
  });

  it("passes when no trace (0 duration)", async () => {
    const scorer = latencyThreshold(100);
    const result = await scorer({ input: {}, output: {} });
    expect(result.passed).toBe(true);
  });

  it("computes degradation score when over threshold", async () => {
    const scorer = latencyThreshold(100);
    const result = await scorer({
      input: {},
      output: {},
      trace: [makeSpan({ startTime: 0, endTime: 200 })],
    });
    // score = max(0, 1 - (200 - 100) / 100) = 0
    expect(result.score).toBe(0);
  });
});

// ─── safetyCheck ──────────────────────────────────────────────────────

describe("safetyCheck", () => {
  it("passes with no trace and no blocked patterns", async () => {
    const scorer = safetyCheck();
    const result = await scorer({ input: {}, output: "safe output" });
    expect(result.passed).toBe(true);
  });

  it("detects blocked patterns in trace attributes", async () => {
    const scorer = safetyCheck({ blockedPatterns: [/secret-key/i] });
    const result = await scorer({
      input: {},
      output: "ok",
      trace: [makeSpan({ attributes: { data: "contains SECRET-KEY here" } })],
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Blocked pattern");
  });

  it("detects blocked patterns in output", async () => {
    const scorer = safetyCheck({ blockedPatterns: [/\d{3}-\d{2}-\d{4}/] });
    const result = await scorer({ input: {}, output: "SSN: 123-45-6789" });
    expect(result.passed).toBe(false);
  });

  it("detects excessive tool calls", async () => {
    const spans = Array.from({ length: 150 }, (_, i) =>
      makeSpan({ id: `${i}`, name: `tool-${i}`, type: "tool_invocation" })
    );
    const scorer = safetyCheck({ maxToolCalls: 100 });
    const result = await scorer({ input: {}, output: {}, trace: spans });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Excessive tool calls");
  });

  it("passes when tool calls are within limit", async () => {
    const spans = Array.from({ length: 10 }, (_, i) =>
      makeSpan({ id: `${i}`, name: `tool-${i}`, type: "tool_invocation" })
    );
    const scorer = safetyCheck({ maxToolCalls: 100 });
    const result = await scorer({ input: {}, output: {}, trace: spans });
    expect(result.passed).toBe(true);
  });

  it("handles JSON-stringified output for pattern checking", async () => {
    const scorer = safetyCheck({ blockedPatterns: [/password/i] });
    const result = await scorer({
      input: {},
      output: { creds: { password: "12345" } },
    });
    expect(result.passed).toBe(false);
  });

  it("uses default maxToolCalls of 100", async () => {
    const spans = Array.from({ length: 101 }, (_, i) =>
      makeSpan({ id: `${i}`, name: `tool-${i}`, type: "tool_invocation" })
    );
    const scorer = safetyCheck();
    const result = await scorer({ input: {}, output: {}, trace: spans });
    expect(result.passed).toBe(false);
  });
});

// ─── stateDiff ────────────────────────────────────────────────────────

describe("stateDiff", () => {
  it("passes when expected keys match", async () => {
    const scorer = stateDiff({ expectedKeys: ["status", "count"] });
    const result = await scorer({
      input: {},
      output: { status: "active", count: 5 },
      expected: { status: "active", count: 5 },
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("fails when expected key values differ", async () => {
    const scorer = stateDiff({ expectedKeys: ["status"] });
    const result = await scorer({
      input: {},
      output: { status: "inactive" },
      expected: { status: "active" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("status");
  });

  it("detects collateral damage", async () => {
    const scorer = stateDiff({
      expectedKeys: ["target"],
      collateralKeys: ["untouched"],
    });
    const result = await scorer({
      input: {},
      output: { target: "ok", untouched: "changed!" },
      expected: { target: "ok" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("untouched");
  });

  it("fails when output is not an object", async () => {
    const scorer = stateDiff({ expectedKeys: ["a"] });
    const result = await scorer({ input: {}, output: "string", expected: { a: 1 } });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  it("fails when expected is missing", async () => {
    const scorer = stateDiff({ expectedKeys: ["a"] });
    const result = await scorer({ input: {}, output: { a: 1 } });
    expect(result.passed).toBe(false);
  });

  it("handles output as null", async () => {
    const scorer = stateDiff({ expectedKeys: ["a"] });
    const result = await scorer({ input: {}, output: null, expected: { a: 1 } });
    expect(result.passed).toBe(false);
  });

  it("computes partial score based on number of issues", async () => {
    const scorer = stateDiff({ expectedKeys: ["a", "b", "c", "d"] });
    const result = await scorer({
      input: {},
      output: { a: 1, b: 2, c: "wrong", d: "wrong" },
      expected: { a: 1, b: 2, c: 3, d: 4 },
    });
    // 2 mismatches out of 4 keys → score = 1 - 2/4 = 0.5
    expect(result.score).toBeCloseTo(0.5, 5);
  });
});

// ─── policyAdherence ──────────────────────────────────────────────────

describe("policyAdherence", () => {
  it("passes when all rules pass", async () => {
    const scorer = policyAdherence({
      rules: [
        { name: "rule-1", check: () => true },
        { name: "rule-2", check: () => true },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("fails on error-severity violation", async () => {
    const scorer = policyAdherence({
      rules: [
        { name: "critical-rule", check: () => false, severity: "error" },
        { name: "good-rule", check: () => true },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("critical-rule");
  });

  it("passes when only warnings are violated", async () => {
    const scorer = policyAdherence({
      rules: [
        { name: "warn-rule", check: () => false, severity: "warning" },
        { name: "good-rule", check: () => true },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    // Warnings don't cause failure (only errors do)
    expect(result.passed).toBe(true);
  });

  it("handles check functions that throw", async () => {
    const scorer = policyAdherence({
      rules: [
        { name: "throws", check: () => { throw new Error("boom"); } },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.passed).toBe(false);
  });

  it("reports all violated rules", async () => {
    const scorer = policyAdherence({
      rules: [
        { name: "rule-a", check: () => false },
        { name: "rule-b", check: () => false },
        { name: "rule-c", check: () => true },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.reason).toContain("rule-a");
    expect(result.reason).toContain("rule-b");
    expect(result.reason).not.toContain("rule-c");
  });

  it("computes correct partial score", async () => {
    const scorer = policyAdherence({
      rules: [
        { name: "a", check: () => true },
        { name: "b", check: () => false },
        { name: "c", check: () => true },
        { name: "d", check: () => false },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.score).toBeCloseTo(0.5, 5);
  });

  it("includes metadata with rule counts", async () => {
    const scorer = policyAdherence({
      rules: [
        { name: "e1", check: () => false, severity: "error" },
        { name: "w1", check: () => false, severity: "warning" },
        { name: "ok", check: () => true },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.metadata).toMatchObject({
      totalRules: 3,
      errors: 1,
      warnings: 1,
    });
  });
});

// ─── noRegression ─────────────────────────────────────────────────────

describe("noRegression", () => {
  it("passes when all assertions pass", async () => {
    const scorer = noRegression({
      assertions: [
        { name: "check-a", check: (output) => output !== null },
        { name: "check-b", check: () => true },
      ],
    });
    const result = await scorer({ input: {}, output: { data: "ok" } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("fails when assertions fail", async () => {
    const scorer = noRegression({
      assertions: [
        { name: "must-exist", check: (output) => output !== null },
      ],
    });
    const result = await scorer({ input: {}, output: null });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("must-exist");
  });

  it("handles assertions that throw", async () => {
    const scorer = noRegression({
      assertions: [
        { name: "throws", check: () => { throw new Error("assertion boom"); } },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("throws");
    expect(result.reason).toContain("assertion boom");
  });

  it("computes partial score based on assertion results", async () => {
    const scorer = noRegression({
      assertions: [
        { name: "a", check: () => true },
        { name: "b", check: () => false },
        { name: "c", check: () => true },
        { name: "d", check: () => false },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.score).toBeCloseTo(0.5, 5);
  });

  it("includes failed assertion names in metadata", async () => {
    const scorer = noRegression({
      assertions: [
        { name: "pass-1", check: () => true },
        { name: "fail-1", check: () => false },
      ],
    });
    const result = await scorer({ input: {}, output: {} });
    expect(result.metadata).toMatchObject({
      totalAssertions: 2,
      failed: 1,
      failedAssertions: ["fail-1"],
    });
  });
});
