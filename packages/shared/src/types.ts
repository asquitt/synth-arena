/**
 * Core type definitions for SynthArena.
 *
 * These types define the evaluation SDK interface, scenario structure,
 * grading system, and trace format used across all packages.
 */

// ─── Scenarios ───────────────────────────────────────────────────────

export interface Scenario {
  id: string;
  domain: string;
  name: string;
  description: string;
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  metadata: ScenarioMetadata;
  environment?: EnvironmentConfig;
}

export interface ScenarioMetadata {
  complexity: "low" | "medium" | "high" | "adversarial";
  tags: string[];
  generatedAt: string;
  generatorVersion: string;
  seedId?: string;
}

export interface EnvironmentConfig {
  services: ServiceConfig[];
  network?: NetworkConfig;
  timeout?: number;
}

export interface ServiceConfig {
  type: "mock-website" | "mock-api" | "mock-database" | "user-simulator" | "browser";
  name: string;
  config: Record<string, unknown>;
}

export interface NetworkConfig {
  allowedDomains: string[];
  blockExternal: boolean;
}

// ─── Evaluation ──────────────────────────────────────────────────────

export interface EvaluationConfig {
  name: string;
  dataset: Scenario[];
  task: TaskFunction;
  scorers: Scorer[];
  trials?: number;
  maxConcurrency?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export type TaskFunction = (input: Record<string, unknown>) => Promise<TaskResult>;

export interface TaskResult {
  output: unknown;
  trace: TraceSpan[];
  tokenUsage: TokenUsage;
  duration: number;
  error?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  model: string;
  provider: string;
}

// ─── Scoring ─────────────────────────────────────────────────────────

export interface ScorerContext {
  input: Record<string, unknown>;
  output: unknown;
  expected?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  trace?: TraceSpan[];
  tokenUsage?: TokenUsage;
}

export interface ScorerResult {
  name: string;
  score: number; // 0.0 to 1.0
  passed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export type Scorer = (ctx: ScorerContext) => Promise<ScorerResult>;

// ─── Traces ──────────────────────────────────────────────────────────

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  type: SpanType;
  startTime: number;
  endTime: number;
  attributes: Record<string, unknown>;
  events: TraceEvent[];
  status: "ok" | "error";
}

export type SpanType =
  | "llm_call"
  | "tool_invocation"
  | "decision"
  | "environment_interaction"
  | "state_transition";

export interface TraceEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, unknown>;
}

// ─── Evaluation Results ──────────────────────────────────────────────

export interface EvaluationRun {
  id: string;
  name: string;
  createdAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  config: Omit<EvaluationConfig, "task">;
  results: ScenarioResult[];
  summary: EvaluationSummary;
}

export interface ScenarioResult {
  scenarioId: string;
  trials: TrialResult[];
  aggregatedScores: Record<string, AggregatedScore>;
  passAtK: number;
  passToTheK: number;
}

export interface TrialResult {
  trialNumber: number;
  taskResult: TaskResult;
  scores: ScorerResult[];
  passed: boolean;
}

export interface AggregatedScore {
  name: string;
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

export interface EvaluationSummary {
  totalScenarios: number;
  totalTrials: number;
  overallPassRate: number;
  passAtK: number;
  passToTheK: number;
  totalCost: number;
  totalDuration: number;
  avgTokensPerScenario: number;
  scoreSummaries: Record<string, AggregatedScore>;
}

// ─── Domain Templates ────────────────────────────────────────────────

export interface DomainTemplate {
  name: string;
  description: string;
  version: string;
  scenarioGenerators: GeneratorConfig[];
  environmentDefaults: EnvironmentConfig;
  defaultScorers: string[];
  seedDataPath?: string;
  constraints: DomainConstraint[];
}

export interface GeneratorConfig {
  name: string;
  type: "llm" | "statistical" | "template";
  prompt?: string;
  config: Record<string, unknown>;
}

export interface DomainConstraint {
  name: string;
  description: string;
  validator: string; // reference to a validation function
}

// ─── Cost Modeling ───────────────────────────────────────────────────

export interface CostEstimate {
  scenarioCount: number;
  trialsPerScenario: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  model: string;
  provider: string;
  breakdown: CostBreakdownItem[];
}

export interface CostBreakdownItem {
  category: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  percentage: number;
}

// ─── Arena Mode ──────────────────────────────────────────────────────

export interface ArenaConfig {
  agents: AgentConfig[];
  scenarios: Scenario[];
  scorers: Scorer[];
  trials: number;
}

export interface AgentConfig {
  name: string;
  task: TaskFunction;
  metadata?: Record<string, unknown>;
}

export interface ArenaResult {
  id: string;
  agents: AgentRanking[];
  matchups: Matchup[];
  scenarios: Scenario[];
}

export interface AgentRanking {
  agentName: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  avgScore: number;
  avgCost: number;
}

export interface Matchup {
  scenarioId: string;
  agentA: string;
  agentB: string;
  winner: string | null;
  scoreA: number;
  scoreB: number;
}
