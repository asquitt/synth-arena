"use client";

import { useState } from "react";
import { Nav } from "../../components/nav";

interface CategoryResult {
  category: string;
  scenarioCount: number;
  passRate: number;
}

interface RedTeamReport {
  runId: string;
  redTeamRunId: string;
  categories: CategoryResult[];
  intensity: string;
  totalScenarios: number;
  overallPassRate: number;
  verdict: "robust" | "moderate_risk" | "vulnerable";
  summary: {
    overallPassRate: number;
    passAtK: number;
    passToTheK: number;
    totalScenarios: number;
    totalTrials: number;
    totalCost: number;
    totalDuration: number;
    scoreSummaries: Record<string, { name: string; mean: number; min: number; max: number }>;
  };
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1";

const ALL_CATEGORIES = [
  "prompt-injection",
  "data-exfiltration",
  "tool-misuse",
  "state-confusion",
  "resource-exhaustion",
  "input-perturbation",
  "multi-turn-manipulation",
];

const CATEGORY_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  "prompt-injection": { label: "Prompt Injection", icon: "💉", description: "Tests resistance to instruction override attempts" },
  "data-exfiltration": { label: "Data Exfiltration", icon: "🔓", description: "Tests for sensitive data leakage" },
  "tool-misuse": { label: "Tool Misuse", icon: "🔧", description: "Tests for unauthorized tool or API abuse" },
  "state-confusion": { label: "State Confusion", icon: "🌀", description: "Tests for inconsistent state handling" },
  "resource-exhaustion": { label: "Resource Exhaustion", icon: "💥", description: "Tests for resource limit enforcement" },
  "input-perturbation": { label: "Input Perturbation", icon: "🎭", description: "Tests robustness to malformed inputs" },
  "multi-turn-manipulation": { label: "Multi-Turn Manipulation", icon: "🔗", description: "Tests for gradual trust exploitation" },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    robust: "bg-green-500/20 text-green-400 border-green-500/30",
    moderate_risk: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    vulnerable: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = {
    robust: "ROBUST",
    moderate_risk: "MODERATE RISK",
    vulnerable: "VULNERABLE",
  };
  return (
    <span className={`rounded-full border px-3 py-1 text-sm font-bold ${styles[verdict] ?? styles["vulnerable"]}`}>
      {labels[verdict] ?? verdict}
    </span>
  );
}

function PassRateBar({ rate, label }: { rate: number; label: string }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="w-48 text-sm text-gray-400">{label}</span>
      <div className="flex-1">
        <div className="h-3 rounded-full bg-gray-800">
          <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="w-16 text-right font-mono text-sm text-white">{pct}%</span>
    </div>
  );
}

export default function RedTeamPage() {
  const [runId, setRunId] = useState("");
  const [intensity, setIntensity] = useState<"low" | "medium" | "high">("medium");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(ALL_CATEGORIES);
  const [scenarioCount, setScenarioCount] = useState(20);
  const [report, setReport] = useState<RedTeamReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function runRedTeam() {
    if (!runId.trim()) {
      setError("Evaluation ID is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/evaluations/${runId}/red-team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: selectedCategories,
          intensity,
          scenarioCount,
          trials: 3,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      setReport(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Red team evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Red Team / Adversarial Testing</h1>
          <p className="mt-1 text-sm text-gray-400">
            Evaluate agent robustness against 7 adversarial attack categories (EU AI Act Article 55)
          </p>
        </div>

        {/* Config Form */}
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Evaluation Run ID</label>
              <input
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder="paste evaluation ID..."
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Intensity</label>
              <select
                value={intensity}
                onChange={(e) => setIntensity(e.target.value as "low" | "medium" | "high")}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Scenario Count</label>
              <input
                type="number"
                value={scenarioCount}
                onChange={(e) => setScenarioCount(parseInt(e.target.value, 10) || 20)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Category Selection */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-gray-400">Attack Categories</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map((cat) => {
                const info = CATEGORY_LABELS[cat]!;
                const selected = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      selected
                        ? "border-orange-500/50 bg-orange-500/20 text-orange-300"
                        : "border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-600"
                    }`}
                  >
                    {info.icon} {info.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={runRedTeam}
            disabled={loading || selectedCategories.length === 0}
            className="rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Running Adversarial Tests..." : "Run Red Team Evaluation"}
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
            {/* Verdict Header */}
            <div className="mb-8 flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-6">
              <div>
                <div className="text-sm text-gray-400">Overall Verdict</div>
                <div className="mt-2 flex items-center gap-4">
                  <VerdictBadge verdict={report.verdict} />
                  <span className="text-3xl font-bold">
                    {Math.round(report.overallPassRate * 100)}%
                  </span>
                  <span className="text-sm text-gray-500">pass rate</span>
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <div>{report.totalScenarios} scenarios &middot; intensity: {report.intensity}</div>
                <div className="mt-1 font-mono text-xs text-gray-600">{report.redTeamRunId}</div>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="mb-8 grid grid-cols-4 gap-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold">{report.totalScenarios}</div>
                <div className="text-xs text-gray-400">Total Scenarios</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold text-cyan-400">
                  {Math.round(report.summary.passAtK * 100)}%
                </div>
                <div className="text-xs text-gray-400">pass@k</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold text-cyan-400">
                  {Math.round(report.summary.passToTheK * 100)}%
                </div>
                <div className="text-xs text-gray-400">pass^k</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold">${report.summary.totalCost.toFixed(4)}</div>
                <div className="text-xs text-gray-400">Total Cost</div>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-sm font-semibold">Category Results</h3>
              <div className="space-y-3">
                {report.categories.map((cat) => {
                  const info = CATEGORY_LABELS[cat.category];
                  return (
                    <PassRateBar
                      key={cat.category}
                      rate={cat.passRate}
                      label={`${info?.icon ?? "?"} ${info?.label ?? cat.category} (${cat.scenarioCount})`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Scorer Breakdown */}
            {report.summary.scoreSummaries && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="mb-4 text-sm font-semibold">Scorer Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(report.summary.scoreSummaries).map(([name, score]) => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="w-48 text-sm text-gray-400">{name}</span>
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
                      <span className="w-16 text-right font-mono text-sm text-white">
                        {(score.mean * 100).toFixed(1)}%
                      </span>
                      <span className="w-32 text-right text-xs text-gray-600">
                        min: {(score.min * 100).toFixed(0)}% / max: {(score.max * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
