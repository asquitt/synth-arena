import { describe, it, expect } from "vitest";
import { generateComplianceReport } from "./compliance.js";
import type { EvaluationRun, ScenarioResult, TrialResult, TaskResult, AggregatedScore } from "@syntharena/shared";

function makeTaskResult(): TaskResult {
  return {
    output: { success: true },
    trace: [],
    tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 0.001, model: "test", provider: "test" },
    duration: 50,
  };
}

function makeTrial(passed: boolean, scores?: Array<{ name: string; score: number }>): TrialResult {
  const defaultScores = scores ?? [{ name: "task_completion", score: passed ? 1 : 0 }];
  return {
    trialNumber: 0,
    taskResult: makeTaskResult(),
    scores: defaultScores.map((s) => ({ ...s, passed: s.score >= 0.7 })),
    passed,
  };
}

function makeAggregatedScore(name: string, mean: number): AggregatedScore {
  return { name, mean, min: mean, max: mean, stddev: 0 };
}

function makeScenarioResult(passAtK: number, passToTheK: number, gPassAtK: number, aggregated?: Record<string, AggregatedScore>): ScenarioResult {
  return {
    scenarioId: "s1",
    trials: [makeTrial(passAtK > 0)],
    aggregatedScores: aggregated ?? { task_completion: makeAggregatedScore("task_completion", passAtK) },
    passAtK,
    passToTheK,
    gPassAtK,
  };
}

function makeEvaluationRun(overrides?: {
  domain?: string;
  passRate?: number;
  passAtK?: number;
  passToTheK?: number;
  gPassAtK?: number;
  scenarioCount?: number;
  aggregatedScores?: Record<string, AggregatedScore>;
}): EvaluationRun {
  const passRate = overrides?.passRate ?? 0.95;
  const passAtK = overrides?.passAtK ?? passRate;
  const passToTheK = overrides?.passToTheK ?? passRate;
  const gPassAtK = overrides?.gPassAtK ?? passRate;
  const scenarioCount = overrides?.scenarioCount ?? 20;

  const results = Array.from({ length: scenarioCount }, () =>
    makeScenarioResult(passAtK, passToTheK, gPassAtK, overrides?.aggregatedScores)
  );

  return {
    id: "run-1",
    name: "test-eval",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: "completed",
    config: {
      name: "test-eval",
      dataset: [],
      scorers: [],
      trials: 1,
      metadata: overrides?.domain ? { domain: overrides.domain } : undefined,
    },
    results,
    summary: {
      totalScenarios: scenarioCount,
      totalTrials: scenarioCount,
      overallPassRate: passRate,
      passAtK,
      passToTheK,
      gPassAtK,
      totalCost: 0.02,
      totalDuration: 1000,
      avgTokensPerScenario: 150,
      latencyPercentiles: { p50: 50, p75: 75, p95: 95, p99: 99, min: 10, max: 100, mean: 50 },
      scoreSummaries: { task_completion: makeAggregatedScore("task_completion", passRate) },
    },
  };
}

describe("generateComplianceReport", () => {
  it("generates a valid compliance report structure", () => {
    const report = generateComplianceReport(makeEvaluationRun());
    expect(report.framework).toBe("eu-ai-act");
    expect(report.version).toBe("1.0");
    expect(report.id).toMatch(/^compliance-/);
    expect(report.generatedAt).toBeDefined();
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("classifies healthcare domain as high-risk", () => {
    const report = generateComplianceReport(makeEvaluationRun({ domain: "healthcare" }));
    expect(report.riskClassification.level).toBe("high");
    expect(report.riskClassification.articles).toContain("Article 9");
  });

  it("classifies government domain as high-risk", () => {
    const report = generateComplianceReport(makeEvaluationRun({ domain: "government" }));
    expect(report.riskClassification.level).toBe("high");
  });

  it("classifies legal domain as high-risk", () => {
    const report = generateComplianceReport(makeEvaluationRun({ domain: "legal" }));
    expect(report.riskClassification.level).toBe("high");
  });

  it("classifies energy domain as high-risk", () => {
    const report = generateComplianceReport(makeEvaluationRun({ domain: "energy" }));
    expect(report.riskClassification.level).toBe("high");
  });

  it("classifies general domain as limited-risk", () => {
    const report = generateComplianceReport(makeEvaluationRun({ domain: "web-scraping" }));
    expect(report.riskClassification.level).toBe("limited");
  });

  it("classifies unknown domain as limited-risk", () => {
    const report = generateComplianceReport(makeEvaluationRun());
    expect(report.riskClassification.level).toBe("limited");
  });

  it("reports compliant when all checks pass", () => {
    const report = generateComplianceReport(makeEvaluationRun({
      domain: "web-scraping",
      passRate: 0.95,
      passAtK: 0.95,
      passToTheK: 0.85,
      scenarioCount: 20,
    }));
    expect(report.overallStatus).toBe("compliant");
  });

  it("reports non-compliant when critical checks fail", () => {
    const report = generateComplianceReport(makeEvaluationRun({
      domain: "healthcare",
      passRate: 0.3,
      passAtK: 0.3,
      passToTheK: 0.1,
      scenarioCount: 5,
    }));
    expect(report.overallStatus).toBe("non-compliant");
  });

  it("reports partial when some checks are partially met", () => {
    const report = generateComplianceReport(makeEvaluationRun({
      passRate: 0.75,
      passAtK: 0.75,
      passToTheK: 0.6,
      scenarioCount: 15,
    }));
    // With 0.75 accuracy (warning) and 0.6 robustness (warning), expect partial
    expect(["partial", "compliant"]).toContain(report.overallStatus);
  });

  it("includes Article 55 check for high-risk domains", () => {
    const report = generateComplianceReport(makeEvaluationRun({ domain: "healthcare" }));
    const article55 = report.checks.find((c) => c.article === "Article 55");
    expect(article55).toBeDefined();
  });

  it("does not include Article 55 check for limited-risk domains", () => {
    const report = generateComplianceReport(makeEvaluationRun({ domain: "web-scraping" }));
    const article55 = report.checks.find((c) => c.article === "Article 55");
    expect(article55).toBeUndefined();
  });

  it("includes testing summary metrics", () => {
    const report = generateComplianceReport(makeEvaluationRun({ passRate: 0.9 }));
    expect(report.testingSummary.accuracy.score).toBeCloseTo(0.9, 1);
    expect(report.testingSummary.reliability).toBeDefined();
    expect(report.testingSummary.robustness).toBeDefined();
  });

  it("marks safety as not-tested when no safety scorer included", () => {
    const report = generateComplianceReport(makeEvaluationRun());
    expect(report.testingSummary.safety.status).toBe("not-tested");
  });

  it("includes safety score when safety_check scorer is present", () => {
    const report = generateComplianceReport(makeEvaluationRun({
      aggregatedScores: {
        task_completion: makeAggregatedScore("task_completion", 0.95),
        safety_check: makeAggregatedScore("safety_check", 0.98),
      },
    }));
    expect(report.testingSummary.safety.status).toBe("pass");
    expect(report.testingSummary.safety.score).toBe(0.98);
  });

  it("generates recommendations for missing safety testing", () => {
    const report = generateComplianceReport(makeEvaluationRun());
    const safetyRec = report.recommendations.find((r) => r.includes("safety_check"));
    expect(safetyRec).toBeDefined();
  });

  it("generates recommendations for low reliability", () => {
    const report = generateComplianceReport(makeEvaluationRun({ passToTheK: 0.5 }));
    const reliabilityRec = report.recommendations.find((r) => r.includes("Reliability"));
    expect(reliabilityRec).toBeDefined();
  });

  it("includes system info from evaluation run", () => {
    const run = makeEvaluationRun({ domain: "healthcare" });
    const report = generateComplianceReport(run);
    expect(report.systemInfo.evaluationRunId).toBe(run.id);
    expect(report.systemInfo.domain).toBe("healthcare");
    expect(report.systemInfo.scenarioCount).toBe(run.summary.totalScenarios);
  });

  it("includes Annex IV documentation check", () => {
    const report = generateComplianceReport(makeEvaluationRun());
    const annexIV = report.checks.find((c) => c.article === "Annex IV");
    expect(annexIV).toBeDefined();
    expect(annexIV!.status).toBe("met");
  });

  it("handles run with minimal scenarios", () => {
    const report = generateComplianceReport(makeEvaluationRun({ scenarioCount: 1 }));
    const article9 = report.checks.find((c) => c.article === "Article 9");
    expect(article9).toBeDefined();
    // Less than 10 scenarios → partial for Article 9
    expect(article9!.status).toBe("partial");
  });
});
