/**
 * SynthArena TypeScript SDK
 *
 * Pre-deployment simulation platform for AI agents.
 *
 * @example
 * ```ts
 * import { evaluate, scorers } from "syntharena";
 *
 * const results = await evaluate({
 *   name: "my-agent-eval",
 *   dataset: scenarios,
 *   task: async (input) => myAgent.run(input),
 *   scorers: [scorers.taskCompletion, scorers.costThreshold(0.50)],
 *   trials: 3,
 * });
 *
 * console.log(results.summary.passAtK);   // Capability
 * console.log(results.summary.passToTheK); // Reliability
 * ```
 */

// Core evaluation
export { evaluate } from "@syntharena/core";
export { runArena } from "@syntharena/core";

// All graders as a namespace
import {
  taskCompletion,
  exactMatch,
  contains,
  costThreshold,
  tokenThreshold,
  latencyThreshold,
  safetyCheck,
  stateDiff,
  llmJudge,
} from "@syntharena/core";

export const scorers = {
  taskCompletion,
  exactMatch,
  contains,
  costThreshold,
  tokenThreshold,
  latencyThreshold,
  safetyCheck,
  stateDiff,
  llmJudge,
} as const;

// Re-export individual graders for direct import
export {
  taskCompletion,
  exactMatch,
  contains,
  costThreshold,
  tokenThreshold,
  latencyThreshold,
  safetyCheck,
  stateDiff,
  llmJudge,
};

// Types
export type {
  Scenario,
  ScenarioMetadata,
  EvaluationConfig,
  EvaluationRun,
  EvaluationSummary,
  ScenarioResult,
  TrialResult,
  TaskFunction,
  TaskResult,
  Scorer,
  ScorerContext,
  ScorerResult,
  TokenUsage,
  TraceSpan,
  ArenaConfig,
  ArenaResult,
  AgentRanking,
  CostEstimate,
  DomainTemplate,
} from "@syntharena/shared";
