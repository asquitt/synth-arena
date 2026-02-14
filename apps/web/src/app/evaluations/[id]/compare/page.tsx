"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "../../../../components/nav";

interface ScenarioSnapshot {
  passRate: number;
  avgScore: number;
  avgCost: number;
  avgDuration: number;
  trialCount: number;
}

interface ScenarioRegression {
  scenarioId: string;
  status: "improved" | "regressed" | "unchanged" | "new" | "removed";
  baseline: ScenarioSnapshot | null;
  current: ScenarioSnapshot | null;
  deltas: Record<string, number>;
}

interface RegressionReport {
  baselineRunId: string;
  currentRunId: string;
  timestamp: string;
  verdict: "pass" | "fail" | "warning";
  summary: {
    passRateDelta: number;
    passAtKDelta: number;
    passToTheKDelta: number;
    gPassAtKDelta: number;
    costDelta: number;
    costDeltaPercent: number;
    latencyDelta: number;
    newFailures: number;
    fixedFailures: number;
    safetyRegressions: number;
  };
  scenarioDetails: ScenarioRegression[];
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1";

function VerdictBanner({ verdict }: { verdict: string }) {
  const styles: Record<string, { bg: string; border: string; text: string; label: string }> = {
    pass: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", label: "PASS — No Regressions" },
    warning: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", label: "WARNING — Minor Regressions" },
    fail: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", label: "FAIL — Regressions Detected" },
  };
  const s = styles[verdict] ?? styles["fail"]!;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-6`}>
      <div className={`text-xl font-bold ${s.text}`}>{s.label}</div>
    </div>
  );
}

function DeltaValue({ value, suffix, inverse }: { value: number; suffix: string; inverse?: boolean }) {
  const sign = value > 0 ? "+" : "";
  const isGood = inverse ? value <= 0 : value >= 0;
  const color = Math.abs(value) < 0.005 ? "text-gray-400" : isGood ? "text-green-400" : "text-red-400";
  return (
    <span className={`font-mono ${color}`}>
      {sign}{value.toFixed(2)}{suffix}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    improved: "bg-green-500/20 text-green-400",
    regressed: "bg-red-500/20 text-red-400",
    unchanged: "bg-gray-500/20 text-gray-400",
    new: "bg-blue-500/20 text-blue-400",
    removed: "bg-orange-500/20 text-orange-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-500/20 text-gray-400"}`}>
      {status}
    </span>
  );
}

export default function ComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const [baselineId, setBaselineId] = useState("");
  const [report, setReport] = useState<RegressionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runComparison() {
    if (!baselineId.trim()) {
      setError("Baseline evaluation ID is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/evaluations/${id}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      setReport(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Regression Comparison</h1>
            <p className="mt-1 text-sm text-gray-400">
              Compare this evaluation against a baseline to detect regressions
            </p>
          </div>
          <a href={`/evaluations/${id}`} className="text-sm text-orange-400 hover:text-orange-300">
            ← Back to Evaluation
          </a>
        </div>

        {/* Input */}
        <div className="mb-8 flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Current Evaluation
            </label>
            <input
              value={id}
              disabled
              className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 font-mono text-sm text-gray-500"
            />
          </div>
          <div className="flex items-center px-2 text-gray-600">vs</div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Baseline Evaluation ID
            </label>
            <input
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              placeholder="paste baseline evaluation ID..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <button
            onClick={runComparison}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Comparing..." : "Compare"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {report && (
          <>
            {/* Verdict */}
            <div className="mb-8">
              <VerdictBanner verdict={report.verdict} />
            </div>

            {/* Delta Summary */}
            <div className="mb-8 grid grid-cols-5 gap-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-xs text-gray-400">Pass Rate</div>
                <div className="mt-1 text-lg font-bold">
                  <DeltaValue value={report.summary.passRateDelta * 100} suffix="%" />
                </div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-xs text-gray-400">pass@k</div>
                <div className="mt-1 text-lg font-bold">
                  <DeltaValue value={report.summary.passAtKDelta * 100} suffix="%" />
                </div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-xs text-gray-400">pass^k</div>
                <div className="mt-1 text-lg font-bold">
                  <DeltaValue value={report.summary.passToTheKDelta * 100} suffix="%" />
                </div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-xs text-gray-400">Cost</div>
                <div className="mt-1 text-lg font-bold">
                  <DeltaValue value={report.summary.costDeltaPercent} suffix="%" inverse />
                </div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-xs text-gray-400">Safety</div>
                <div className={`mt-1 text-lg font-bold ${report.summary.safetyRegressions > 0 ? "text-red-400" : "text-green-400"}`}>
                  {report.summary.safetyRegressions > 0 ? `${report.summary.safetyRegressions} issues` : "Clean"}
                </div>
              </div>
            </div>

            {/* Counts */}
            <div className="mb-8 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{report.summary.newFailures}</div>
                <div className="text-xs text-gray-400">New Failures</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{report.summary.fixedFailures}</div>
                <div className="text-xs text-gray-400">Fixed Failures</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
                <div className="text-2xl font-bold text-gray-400">{report.scenarioDetails.filter((s) => s.status === "unchanged").length}</div>
                <div className="text-xs text-gray-400">Unchanged</div>
              </div>
            </div>

            {/* Scenario Details */}
            <div className="rounded-xl border border-gray-800 bg-gray-900">
              <div className="border-b border-gray-800 px-6 py-3">
                <h3 className="text-sm font-semibold">Scenario Details ({report.scenarioDetails.length})</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {report.scenarioDetails.map((s) => (
                  <div key={s.scenarioId} className="flex items-center gap-4 px-6 py-3">
                    <StatusBadge status={s.status} />
                    <code className="w-40 truncate font-mono text-xs text-gray-400">{s.scenarioId}</code>
                    {s.baseline && s.current && (
                      <div className="flex flex-1 gap-6 text-xs text-gray-500">
                        <span>
                          Pass: {(s.baseline.passRate * 100).toFixed(0)}% →{" "}
                          <span className={s.deltas["passRate"]! > 0 ? "text-green-400" : s.deltas["passRate"]! < 0 ? "text-red-400" : "text-gray-400"}>
                            {(s.current.passRate * 100).toFixed(0)}%
                          </span>
                        </span>
                        <span>
                          Cost: ${s.baseline.avgCost.toFixed(4)} → ${s.current.avgCost.toFixed(4)}
                        </span>
                        <span>
                          Latency: {s.baseline.avgDuration.toFixed(0)}ms → {s.current.avgDuration.toFixed(0)}ms
                        </span>
                      </div>
                    )}
                    {s.status === "new" && <span className="text-xs text-blue-400">New scenario (no baseline)</span>}
                    {s.status === "removed" && <span className="text-xs text-orange-400">Removed from current run</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
