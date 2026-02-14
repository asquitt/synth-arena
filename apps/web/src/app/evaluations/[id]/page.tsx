"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "../../../components/nav";

interface ScorerResult {
  name: string;
  score: number;
  passed: boolean;
  reason?: string;
}

interface TrialResult {
  trialNumber: number;
  scores: ScorerResult[];
  passed: boolean;
  taskResult: {
    output: unknown;
    duration: number;
    tokenUsage: { totalTokens: number; estimatedCost: number; model: string };
  };
}

interface ScenarioResult {
  scenarioId: string;
  trials: TrialResult[];
  aggregatedScores: Record<string, { name: string; mean: number; stddev: number }>;
  passAtK: number;
  passToTheK: number;
  gPassAtK: number;
}

interface EvalSummary {
  totalScenarios: number;
  totalTrials: number;
  overallPassRate: number;
  passAtK: number;
  passToTheK: number;
  gPassAtK: number;
  totalCost: number;
  totalDuration: number;
  avgTokensPerScenario: number;
  scoreSummaries: Record<string, { name: string; mean: number; stddev: number }>;
}

interface EvalRun {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  results: ScenarioResult[];
  summary: EvalSummary;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export default function EvaluationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<EvalRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRun() {
      try {
        const res = await fetch(`${API_BASE}/evaluations/${id}`);
        const json = await res.json();
        if (json.data) setRun(json.data);
      } catch {
        // Demo data for offline viewing
        setRun(buildDemoRun(id));
      } finally {
        setLoading(false);
      }
    }
    fetchRun();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-gray-800" />
            <div className="h-4 w-96 rounded bg-gray-800" />
            <div className="mt-8 grid grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-gray-800" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-10">
          <h1 className="text-2xl font-bold">Evaluation not found</h1>
          <p className="mt-2 text-gray-400">ID: {id}</p>
          <a href="/evaluations" className="mt-4 inline-block text-orange-400 hover:underline">Back to evaluations</a>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <a href="/evaluations" className="text-sm text-gray-500 hover:text-gray-300">&larr; Back to evaluations</a>
            <h1 className="mt-2 text-3xl font-bold">{run.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{run.id} &middot; {new Date(run.createdAt).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-3">
            {run.status === "completed" && (
              <>
                <a
                  href={`/evaluations/${run.id}/compare`}
                  className="rounded-lg border border-orange-500/30 px-3 py-1 text-xs font-medium text-orange-400 transition hover:bg-orange-500/10"
                >
                  Compare / Regression
                </a>
                <a
                  href={`/evaluations/${run.id}/state-diff`}
                  className="rounded-lg border border-orange-500/30 px-3 py-1 text-xs font-medium text-orange-400 transition hover:bg-orange-500/10"
                >
                  State-Diff
                </a>
                <a
                  href={`/evaluations/${run.id}/compliance`}
                  className="rounded-lg border border-orange-500/30 px-3 py-1 text-xs font-medium text-orange-400 transition hover:bg-orange-500/10"
                >
                  Compliance
                </a>
              </>
            )}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              run.status === "completed" ? "bg-green-900/50 text-green-400" : "bg-yellow-900/50 text-yellow-400"
            }`}>
              {run.status}
            </span>
          </div>
        </div>

        {/* Summary metrics */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <MetricCard label="Pass Rate" value={`${(run.summary.overallPassRate * 100).toFixed(1)}%`} color={run.summary.overallPassRate >= 0.9 ? "green" : run.summary.overallPassRate >= 0.7 ? "yellow" : "red"} />
          <MetricCard label="pass@k" value={`${(run.summary.passAtK * 100).toFixed(1)}%`} color="cyan" />
          <MetricCard label="pass^k" value={`${(run.summary.passToTheK * 100).toFixed(1)}%`} color="cyan" />
          <MetricCard label="G-pass@k" value={`${(run.summary.gPassAtK * 100).toFixed(1)}%`} color="cyan" />
          <MetricCard label="Cost" value={`$${run.summary.totalCost.toFixed(4)}`} color="yellow" />
          <MetricCard label="Duration" value={`${(run.summary.totalDuration / 1000).toFixed(1)}s`} color="gray" />
          <MetricCard label="Scenarios" value={String(run.summary.totalScenarios)} color="gray" />
          <MetricCard label="Avg Tokens" value={String(Math.round(run.summary.avgTokensPerScenario))} color="gray" />
        </div>

        {/* Score summaries */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold">Score Breakdown</h2>
          <div className="mt-4 space-y-3">
            {Object.entries(run.summary.scoreSummaries).map(([name, score]) => (
              <div key={name} className="flex items-center gap-4">
                <span className="w-44 text-sm text-gray-400">{name}</span>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-gray-800">
                    <div
                      className={`h-3 rounded-full ${
                        score.mean >= 0.9 ? "bg-green-500" : score.mean >= 0.7 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${score.mean * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-20 text-right text-sm font-medium text-gray-300">{(score.mean * 100).toFixed(1)}%</span>
                <span className="w-20 text-right text-xs text-gray-500">&plusmn;{(score.stddev * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scenario results table */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Scenario Results</h2>
          <p className="mt-1 text-sm text-gray-500">Click a scenario to see trial-level details</p>

          <div className="mt-4 space-y-2">
            {run.results.map((result) => {
              const isExpanded = expandedScenario === result.scenarioId;
              const passedTrials = result.trials.filter((t) => t.passed).length;
              const totalTrials = result.trials.length;
              const allPassed = passedTrials === totalTrials;

              return (
                <div key={result.scenarioId}>
                  <button
                    onClick={() => setExpandedScenario(isExpanded ? null : result.scenarioId)}
                    className="flex w-full items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-left transition hover:border-gray-700"
                  >
                    <span className={`text-lg ${allPassed ? "text-green-400" : "text-red-400"}`}>
                      {allPassed ? "\u2713" : "\u2717"}
                    </span>
                    <span className="w-48 font-mono text-xs text-gray-500 truncate">{result.scenarioId}</span>
                    <div className="flex-1 flex gap-4 text-xs text-gray-400">
                      <span>Trials: <span className="text-gray-300">{passedTrials}/{totalTrials}</span></span>
                      <span>pass@k: <span className="text-cyan-400">{(result.passAtK * 100).toFixed(0)}%</span></span>
                      <span>pass^k: <span className="text-cyan-400">{(result.passToTheK * 100).toFixed(0)}%</span></span>
                    </div>
                    {/* Score pills */}
                    <div className="flex gap-1">
                      {Object.entries(result.aggregatedScores).map(([name, score]) => (
                        <span
                          key={name}
                          className={`rounded px-2 py-0.5 text-xs ${
                            score.mean >= 0.9 ? "bg-green-900/50 text-green-400" :
                            score.mean >= 0.7 ? "bg-yellow-900/50 text-yellow-400" :
                            "bg-red-900/50 text-red-400"
                          }`}
                        >
                          {name}: {(score.mean * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                    <span className="text-gray-500">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                  </button>

                  {/* Expanded trial details */}
                  {isExpanded && (
                    <div className="mt-1 ml-4 space-y-2 border-l border-gray-800 pl-4">
                      {result.trials.map((trial) => (
                        <div key={trial.trialNumber} className="rounded-lg border border-gray-800/50 bg-gray-950 p-4">
                          <div className="flex items-center gap-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              trial.passed ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                            }`}>
                              Trial {trial.trialNumber + 1}: {trial.passed ? "PASS" : "FAIL"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {trial.taskResult.duration.toFixed(0)}ms &middot; {trial.taskResult.tokenUsage.totalTokens} tokens &middot; ${trial.taskResult.tokenUsage.estimatedCost.toFixed(4)}
                            </span>
                          </div>

                          {/* Individual scores */}
                          <div className="mt-3 space-y-1">
                            {trial.scores.map((score) => (
                              <div key={score.name} className="flex items-center gap-3 text-xs">
                                <span className={score.passed ? "text-green-400" : "text-red-400"}>
                                  {score.passed ? "\u2713" : "\u2717"}
                                </span>
                                <span className="w-36 text-gray-400">{score.name}</span>
                                <div className="w-20">
                                  <div className="h-1.5 rounded-full bg-gray-800">
                                    <div
                                      className={`h-1.5 rounded-full ${score.passed ? "bg-green-500" : "bg-red-500"}`}
                                      style={{ width: `${score.score * 100}%` }}
                                    />
                                  </div>
                                </div>
                                <span className="text-gray-300">{(score.score * 100).toFixed(1)}%</span>
                                {score.reason && (
                                  <span className="text-gray-600 truncate max-w-md">{score.reason}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    cyan: "text-cyan-400",
    gray: "text-gray-300",
  };
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <div className={`text-lg font-bold ${colorClasses[color] ?? "text-gray-300"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function buildDemoRun(id: string): EvalRun {
  const scenarios = 5;
  const trialsPerScenario = 3;
  const scorerNames = ["task_completion", "cost_threshold", "safety_check"];

  const results: ScenarioResult[] = Array.from({ length: scenarios }, (_, i) => {
    const trials: TrialResult[] = Array.from({ length: trialsPerScenario }, (_, t) => {
      const scores: ScorerResult[] = scorerNames.map((name) => {
        const score = 0.6 + Math.random() * 0.4;
        const threshold = name === "safety_check" ? 0.95 : 0.7;
        return { name, score, passed: score >= threshold, reason: score < threshold ? `Below ${threshold} threshold` : undefined };
      });
      return {
        trialNumber: t,
        scores,
        passed: scores.every((s) => s.passed),
        taskResult: {
          output: { processed: true },
          duration: 100 + Math.random() * 500,
          tokenUsage: { totalTokens: 300 + Math.floor(Math.random() * 400), estimatedCost: 0.001 + Math.random() * 0.003, model: "claude-sonnet-4-20250514" },
        },
      };
    });

    const passedCount = trials.filter((t) => t.passed).length;
    const p = passedCount / trialsPerScenario;

    const aggregatedScores: Record<string, { name: string; mean: number; stddev: number }> = {};
    for (const name of scorerNames) {
      const values = trials.map((t) => t.scores.find((s) => s.name === name)?.score ?? 0);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
      aggregatedScores[name] = { name, mean, stddev: Math.sqrt(variance) };
    }

    return {
      scenarioId: `scenario-${i + 1}`,
      trials,
      aggregatedScores,
      passAtK: 1 - Math.pow(1 - p, trialsPerScenario),
      passToTheK: Math.pow(p, trialsPerScenario),
      gPassAtK: p >= 0.5 ? 1 : 0,
    };
  });

  const totalTrials = scenarios * trialsPerScenario;
  const passedTrials = results.reduce((sum, r) => sum + r.trials.filter((t) => t.passed).length, 0);

  const scoreSummaries: Record<string, { name: string; mean: number; stddev: number }> = {};
  for (const name of scorerNames) {
    const means = results.map((r) => r.aggregatedScores[name]?.mean ?? 0);
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    const variance = means.reduce((a, v) => a + (v - mean) ** 2, 0) / means.length;
    scoreSummaries[name] = { name, mean, stddev: Math.sqrt(variance) };
  }

  return {
    id,
    name: `demo-evaluation-${id.slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    status: "completed",
    results,
    summary: {
      totalScenarios: scenarios,
      totalTrials,
      overallPassRate: passedTrials / totalTrials,
      passAtK: results.reduce((s, r) => s + r.passAtK, 0) / scenarios,
      passToTheK: results.reduce((s, r) => s + r.passToTheK, 0) / scenarios,
      gPassAtK: results.reduce((s, r) => s + r.gPassAtK, 0) / scenarios,
      totalCost: results.reduce((s, r) => s + r.trials.reduce((ts, t) => ts + t.taskResult.tokenUsage.estimatedCost, 0), 0),
      totalDuration: results.reduce((s, r) => s + r.trials.reduce((ts, t) => ts + t.taskResult.duration, 0), 0),
      avgTokensPerScenario: results.reduce((s, r) => s + r.trials.reduce((ts, t) => ts + t.taskResult.tokenUsage.totalTokens, 0), 0) / scenarios,
      scoreSummaries,
    },
  };
}
