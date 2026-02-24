export interface EvalSummary {
  totalScenarios: number;
  totalTrials: number;
  overallPassRate: number;
  passAtK: number;
  passToTheK: number;
  gPassAtK: number;
  totalCost: number;
  totalDuration: number;
  avgTokensPerScenario: number;
  latencyPercentiles?: { p50: number; p95: number; p99: number };
  scoreSummaries: Record<string, { name: string; mean: number; stddev: number }>;
}

export interface EvalRun {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  summary: EvalSummary;
}

export interface StreamProgress {
  completed: number;
  total: number;
  latestScenarioId?: string;
}
