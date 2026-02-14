"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "../../../../components/nav";

interface ClassifiedDelta {
  path: string;
  type: "added" | "removed" | "modified";
  before?: unknown;
  after?: unknown;
  classification: "intended" | "collateral" | "unknown";
  severity: "critical" | "warning" | "info";
  reason?: string;
}

interface StateDiffSummary {
  totalChanges: number;
  intended: number;
  collateral: number;
  unknown: number;
  criticalIssues: number;
  completenessScore: number;
  sideEffectScore: number;
  overallScore: number;
}

interface StateDiffReport {
  id: string;
  runId: string;
  scenarioId: string;
  deltas: ClassifiedDelta[];
  summary: StateDiffSummary;
  generatedAt: string;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1";

function ClassificationBadge({ classification }: { classification: string }) {
  const colors: Record<string, string> = {
    intended: "bg-green-500/20 text-green-400 border-green-500/30",
    collateral: "bg-red-500/20 text-red-400 border-red-500/30",
    unknown: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${colors[classification] ?? colors["unknown"]}`}>
      {classification}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === "critical" ? "bg-red-500" : severity === "warning" ? "bg-yellow-500" : "bg-gray-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function TypeIcon({ type }: { type: string }) {
  if (type === "added") return <span className="text-green-400">+</span>;
  if (type === "removed") return <span className="text-red-400">−</span>;
  return <span className="text-yellow-400">~</span>;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono text-white">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function StateDiffPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<StateDiffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Interactive demo: user provides before/after state
  const [scenarioId, setScenarioId] = useState("demo-scenario");
  const [beforeJson, setBeforeJson] = useState('{\n  "cart": [],\n  "total": 0,\n  "userSession": "active"\n}');
  const [afterJson, setAfterJson] = useState('{\n  "cart": ["item-1", "item-2"],\n  "total": 49.99,\n  "userSession": "active",\n  "cache": "cleared"\n}');
  const [expectedKeys, setExpectedKeys] = useState("cart,total");

  async function runDiff() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/evaluations/${id}/state-diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          before: { state: JSON.parse(beforeJson) },
          after: { state: JSON.parse(afterJson) },
          expectedKeys: expectedKeys.split(",").map((k) => k.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      setReport(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compute diff");
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
            <h1 className="text-2xl font-bold">State-Diff Analysis</h1>
            <p className="mt-1 text-sm text-gray-400">
              Compare environment snapshots before and after agent execution
            </p>
          </div>
          <a href={`/evaluations/${id}`} className="text-sm text-orange-400 hover:text-orange-300">
            ← Back to Evaluation
          </a>
        </div>

        {/* Input Form */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Before State (JSON)</label>
            <textarea
              value={beforeJson}
              onChange={(e) => setBeforeJson(e.target.value)}
              className="h-32 w-full rounded-lg border border-gray-800 bg-gray-900 p-3 font-mono text-xs text-gray-300 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">After State (JSON)</label>
            <textarea
              value={afterJson}
              onChange={(e) => setAfterJson(e.target.value)}
              className="h-32 w-full rounded-lg border border-gray-800 bg-gray-900 p-3 font-mono text-xs text-gray-300 focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-8 flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-400">Expected Keys (comma-separated)</label>
            <input
              value={expectedKeys}
              onChange={(e) => setExpectedKeys(e.target.value)}
              className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Scenario ID</label>
            <input
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              className="w-48 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <button
            onClick={runDiff}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Computing..." : "Compute Diff"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {report && (
          <>
            {/* Summary Cards */}
            <div className="mb-8 grid grid-cols-4 gap-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold">{report.summary.totalChanges}</div>
                <div className="text-xs text-gray-400">Total Changes</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold text-green-400">{report.summary.intended}</div>
                <div className="text-xs text-gray-400">Intended</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold text-red-400">{report.summary.collateral}</div>
                <div className="text-xs text-gray-400">Collateral</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold text-gray-400">{report.summary.unknown}</div>
                <div className="text-xs text-gray-400">Unknown</div>
              </div>
            </div>

            {/* Score Bars */}
            <div className="mb-8 grid grid-cols-3 gap-6">
              <ScoreBar score={report.summary.completenessScore} label="Completeness" />
              <ScoreBar score={report.summary.sideEffectScore} label="Side-Effect Safety" />
              <ScoreBar score={report.summary.overallScore} label="Overall Score" />
            </div>

            {/* Delta Table */}
            <div className="rounded-xl border border-gray-800 bg-gray-900">
              <div className="border-b border-gray-800 px-6 py-3">
                <h3 className="text-sm font-semibold">Changes Detected</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {report.deltas.map((delta, i) => (
                  <div key={i} className="flex items-start gap-4 px-6 py-3">
                    <div className="flex items-center gap-2 pt-0.5">
                      <SeverityDot severity={delta.severity} />
                      <TypeIcon type={delta.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-medium text-white">{delta.path}</code>
                        <ClassificationBadge classification={delta.classification} />
                      </div>
                      {delta.type === "modified" && (
                        <div className="mt-1 flex gap-4 font-mono text-xs">
                          <span className="text-red-400">- {JSON.stringify(delta.before)}</span>
                          <span className="text-green-400">+ {JSON.stringify(delta.after)}</span>
                        </div>
                      )}
                      {delta.type === "added" && (
                        <div className="mt-1 font-mono text-xs text-green-400">+ {JSON.stringify(delta.after)}</div>
                      )}
                      {delta.type === "removed" && (
                        <div className="mt-1 font-mono text-xs text-red-400">- {JSON.stringify(delta.before)}</div>
                      )}
                      {delta.reason && (
                        <div className="mt-1 text-xs text-gray-500">{delta.reason}</div>
                      )}
                    </div>
                  </div>
                ))}
                {report.deltas.length === 0 && (
                  <div className="px-6 py-8 text-center text-sm text-gray-500">
                    No changes detected between snapshots
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
