import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { generateScorer, generateScorerSuite } from "@syntharena/core";
import { generateScorerSchema, generateScorerSuiteSchema } from "../schemas.js";

/**
 * Scorer Generator API routes.
 *
 * Converts natural language evaluation criteria into executable scorers.
 * Supports deterministic (regex/string) and LLM-backed modes.
 */
export const scorerGeneratorRoutes = new Hono();

/**
 * POST /scorers/generate — Generate a single scorer from natural language.
 *
 * In "deterministic" mode, parses the criteria into string/regex checks
 * and returns a test result against sample input/output.
 *
 * In "llm" mode, returns the scorer config (actual scoring happens at eval time).
 */
scorerGeneratorRoutes.post(
  "/generate",
  zValidator("json", generateScorerSchema),
  async (c) => {
    const body = c.req.valid("json");

    const scorer = generateScorer({
      criteria: body.criteria,
      name: body.name,
      mode: body.mode,
      threshold: body.threshold,
    });

    // Run a quick test with sample data to show the scorer works
    const testResult = await scorer({
      input: { query: "test input" },
      output: "sample output for testing",
    });

    return c.json({
      data: {
        name: body.name,
        criteria: body.criteria,
        mode: body.mode,
        threshold: body.threshold,
        testResult: {
          score: testResult.score,
          passed: testResult.passed,
          reason: testResult.reason,
          metadata: testResult.metadata,
        },
      },
    }, 201);
  }
);

/**
 * POST /scorers/generate-suite — Generate multiple scorers from a list.
 *
 * Takes an array of criteria and returns test results for each.
 * Useful for building evaluation suites from product requirements.
 */
scorerGeneratorRoutes.post(
  "/generate-suite",
  zValidator("json", generateScorerSuiteSchema),
  async (c) => {
    const { scorers: configs } = c.req.valid("json");

    const scorers = generateScorerSuite(configs);
    const results = await Promise.all(
      scorers.map(async (scorer, i) => {
        const testResult = await scorer({
          input: { query: "test input" },
          output: "sample output for testing",
        });
        return {
          name: configs[i]!.name,
          criteria: configs[i]!.criteria,
          mode: configs[i]!.mode,
          testResult: {
            score: testResult.score,
            passed: testResult.passed,
            reason: testResult.reason,
          },
        };
      })
    );

    return c.json({
      data: {
        scorers: results,
        total: results.length,
      },
    }, 201);
  }
);

/**
 * POST /scorers/test — Test a scorer against custom input/output.
 */
scorerGeneratorRoutes.post("/test", async (c) => {
  const body = await c.req.json() as {
    criteria: string;
    name: string;
    mode?: "llm" | "deterministic";
    threshold?: number;
    testInput: Record<string, unknown>;
    testOutput: unknown;
    testExpected?: Record<string, unknown>;
  };

  const scorer = generateScorer({
    criteria: body.criteria,
    name: body.name,
    mode: body.mode ?? "deterministic",
    threshold: body.threshold ?? 0.7,
  });

  const result = await scorer({
    input: body.testInput,
    output: body.testOutput,
    expected: body.testExpected,
  });

  return c.json({
    data: {
      name: body.name,
      score: result.score,
      passed: result.passed,
      reason: result.reason,
      metadata: result.metadata,
    },
  });
});
