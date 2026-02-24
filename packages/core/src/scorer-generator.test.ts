import { describe, it, expect } from "vitest";
import { generateScorer, generateScorerSuite } from "./scorer-generator.js";

describe("generateScorer (deterministic mode)", () => {
  it("detects 'must contain' criteria", async () => {
    const scorer = generateScorer({
      criteria: "Output must contain the word hello",
      name: "contains_hello",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "hello world" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "goodbye world" });
    expect(fail.passed).toBe(false);
  });

  it("detects 'should include' criteria", async () => {
    const scorer = generateScorer({
      criteria: "Response should include a greeting",
      name: "has_greeting",
      mode: "deterministic",
    });
    const result = await scorer({ input: {}, output: "Here is a greeting for you" });
    expect(result.passed).toBe(true);
  });

  it("detects 'must not contain' criteria", async () => {
    const scorer = generateScorer({
      criteria: "Must not contain profanity",
      name: "no_profanity",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "This is clean text" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "This has profanity in it" });
    expect(fail.passed).toBe(false);
  });

  it("detects 'should not mention' criteria", async () => {
    const scorer = generateScorer({
      criteria: "Should not mention competitor",
      name: "no_competitor",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "We are the best" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "Unlike our competitor, we are better" });
    expect(fail.passed).toBe(false);
  });

  it("detects word limit criteria", async () => {
    const scorer = generateScorer({
      criteria: "Output length must be less than 10 words",
      name: "word_limit",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "Short response here" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({
      input: {},
      output: "This is a very long response that exceeds the ten word limit by quite a bit",
    });
    expect(fail.passed).toBe(false);
  });

  it("detects character limit criteria", async () => {
    const scorer = generateScorer({
      criteria: "Output length must be less than 20 characters",
      name: "char_limit",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "Short" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "This is way too long for the character limit" });
    expect(fail.passed).toBe(false);
  });

  it("detects 'valid JSON' criteria", async () => {
    const scorer = generateScorer({
      criteria: "Output must be valid JSON",
      name: "valid_json",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: '{"key": "value"}' });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "not json at all" });
    expect(fail.passed).toBe(false);
  });

  it("detects regex match criteria", async () => {
    const scorer = generateScorer({
      criteria: "Output must match /^\\d{3}-\\d{4}$/",
      name: "phone_format",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "555-1234" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "not a phone" });
    expect(fail.passed).toBe(false);
  });

  it("detects 'not be empty' criteria", async () => {
    const scorer = generateScorer({
      criteria: "Output must not be empty",
      name: "non_empty",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "some content" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "   " });
    expect(fail.passed).toBe(false);
  });

  it("handles multiple criteria separated by periods", async () => {
    const scorer = generateScorer({
      criteria: "Must contain greeting. Must not contain goodbye. Output must not be empty",
      name: "multi_check",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "Hello, welcome to our greeting service" });
    expect(pass.passed).toBe(true);

    const fail = await scorer({ input: {}, output: "Hello and goodbye" });
    expect(fail.passed).toBe(false);
  });

  it("handles multiple criteria separated by semicolons", async () => {
    const scorer = generateScorer({
      criteria: "Must contain hello; Must not contain world",
      name: "semicolon_check",
      mode: "deterministic",
    });
    const pass = await scorer({ input: {}, output: "hello there" });
    expect(pass.passed).toBe(true);
  });

  it("returns score 1 when no parseable criteria found", async () => {
    const scorer = generateScorer({
      criteria: "This is just some random text that has no actionable criteria",
      name: "no_checks",
      mode: "deterministic",
    });
    const result = await scorer({ input: {}, output: "anything" });
    expect(result.score).toBe(1);
  });

  it("handles JSON-stringified objects as output", async () => {
    const scorer = generateScorer({
      criteria: "Must contain success",
      name: "json_output",
      mode: "deterministic",
    });
    const result = await scorer({ input: {}, output: { status: "success" } });
    expect(result.passed).toBe(true);
  });

  it("uses custom threshold", async () => {
    const scorer = generateScorer({
      criteria: "Must contain a. Must contain b. Must contain c",
      name: "threshold_test",
      mode: "deterministic",
      threshold: 0.3,
    });
    // Only "a" is present → 1/3 ≈ 0.33 ≥ 0.3 threshold
    const result = await scorer({ input: {}, output: "only a here" });
    expect(result.passed).toBe(true);
  });

  it("includes metadata with check counts", async () => {
    const scorer = generateScorer({
      criteria: "Must contain x. Must contain y",
      name: "metadata_test",
      mode: "deterministic",
    });
    const result = await scorer({ input: {}, output: "has x in it" });
    expect(result.metadata).toMatchObject({
      mode: "deterministic",
      totalChecks: 2,
      passedChecks: 1,
    });
  });
});

describe("generateScorerSuite", () => {
  it("creates multiple scorers from config list", () => {
    const suite = generateScorerSuite([
      { criteria: "Must contain hello", name: "check_hello", mode: "deterministic" },
      { criteria: "Must not contain error", name: "no_error", mode: "deterministic" },
    ]);
    expect(suite).toHaveLength(2);
  });

  it("each scorer in suite works independently", async () => {
    const suite = generateScorerSuite([
      { criteria: "Must contain hello", name: "check_hello", mode: "deterministic" },
      { criteria: "Must contain world", name: "check_world", mode: "deterministic" },
    ]);

    const r1 = await suite[0]!({ input: {}, output: "hello" });
    const r2 = await suite[1]!({ input: {}, output: "hello" });

    expect(r1.passed).toBe(true);
    expect(r2.passed).toBe(false);
  });
});
