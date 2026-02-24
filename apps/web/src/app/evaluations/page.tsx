"use client";

import { useState, useEffect } from "react";
import { Nav } from "../../components/nav";
import { DomainSelect } from "../../components/domain-select";
import type { EvalRun, StreamProgress } from "../../components/evaluations/types";
import { RunCard } from "../../components/evaluations/run-card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export default function EvaluationsPage() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState("web-scraping");
  const [scenarios, setScenarios] = useState("10");
  const [trials, setTrials] = useState("3");
  const [useStreaming, setUseStreaming] = useState(true);

  useEffect(() => {
    async function loadRuns() {
      try {
        const res = await fetch(`${API_BASE}/evaluations?limit=20`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          setRuns(json.data);
        }
      } catch {
        // API not available
      }
    }
    loadRuns();
  }, []);

  async function startEval() {
    setLoading(true);
    setProgress(null);
    setError(null);

    if (useStreaming) {
      await startStreamingEval();
    } else {
      await startBatchEval();
    }

    setLoading(false);
  }

  async function startStreamingEval() {
    try {
      const res = await fetch(`${API_BASE}/evaluations/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${domain}-eval-${Date.now()}`,
          domain,
          scenarioCount: parseInt(scenarios),
          trials: parseInt(trials),
        }),
      });

      if (!res.body) throw new Error("No stream body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "scenario_complete") {
              setProgress({ completed: event.scenarioIndex, total: event.totalScenarios, latestScenarioId: event.scenarioId });
            } else if (event.type === "run_complete" && event.summary) {
              setProgress(null);
              const runRes = await fetch(`${API_BASE}/evaluations`);
              const runJson = await runRes.json();
              if (runJson.data?.[0]) {
                setRuns((prev) => [runJson.data[0], ...prev]);
              }
            }
          } catch { /* skip parse errors */ }
        }
      }
    } catch {
      setError("API unavailable — showing demo data. Start the API server or set NEXT_PUBLIC_API_URL.");
      showDemoRun();
    }
    setProgress(null);
  }

  async function startBatchEval() {
    try {
      const res = await fetch(`${API_BASE}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${domain}-eval-${Date.now()}`,
          domain,
          scenarioCount: parseInt(scenarios),
          trials: parseInt(trials),
        }),
      });
      const json = await res.json();
      if (json.data) {
        setRuns((prev) => [json.data, ...prev]);
      }
    } catch {
      setError("API unavailable — showing demo data. Start the API server or set NEXT_PUBLIC_API_URL.");
      showDemoRun();
    }
  }

  function showDemoRun() {
    const demo: EvalRun = {
      id: `demo-${Date.now()}`,
      name: `${domain}-eval-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "completed",
      summary: {
        totalScenarios: parseInt(scenarios),
        totalTrials: parseInt(scenarios) * parseInt(trials),
        overallPassRate: 0.85 + Math.random() * 0.15,
        passAtK: 0.9 + Math.random() * 0.1,
        passToTheK: 0.7 + Math.random() * 0.2,
        gPassAtK: 0.75 + Math.random() * 0.2,
        totalCost: parseInt(scenarios) * 0.003,
        totalDuration: parseInt(scenarios) * 150,
        avgTokensPerScenario: 300 + Math.floor(Math.random() * 200),
        latencyPercentiles: { p50: 150 + Math.random() * 100, p95: 400 + Math.random() * 200, p99: 500 + Math.random() * 300 },
        scoreSummaries: {
          task_completion: { name: "task_completion", mean: 0.9 + Math.random() * 0.1, stddev: 0.05 },
          cost_threshold: { name: "cost_threshold", mean: 0.95 + Math.random() * 0.05, stddev: 0.02 },
          safety_check: { name: "safety_check", mean: 0.98 + Math.random() * 0.02, stddev: 0.01 },
        },
      },
    };
    setRuns((prev) => [demo, ...prev]);
  }

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold">Evaluations</h1>
        <p className="mt-2 text-gray-400">Run and compare agent evaluations</p>

        {/* New evaluation form */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold">New Evaluation</h2>
          <div className="mt-4 flex flex-wrap gap-4">
            <DomainSelect value={domain} onChange={setDomain} />
            <div>
              <label className="block text-xs text-gray-400">Scenarios</label>
              <input
                type="number"
                value={scenarios}
                onChange={(e) => setScenarios(e.target.value)}
                className="mt-1 w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400">Trials</label>
              <input
                type="number"
                value={trials}
                onChange={(e) => setTrials(e.target.value)}
                className="mt-1 w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={useStreaming}
                  onChange={(e) => setUseStreaming(e.target.checked)}
                  className="rounded border-gray-700"
                />
                Stream
              </label>
              <button
                onClick={startEval}
                disabled={loading}
                className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Running..." : "Start Evaluation"}
              </button>
            </div>
          </div>

          {progress && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Scenario {progress.completed}/{progress.total}</span>
                <span>{Math.round((progress.completed / progress.total) * 100)}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-gray-800">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>
              {progress.latestScenarioId && (
                <p className="mt-1 text-xs text-gray-500">Latest: {progress.latestScenarioId}</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3">
            <p className="text-sm text-yellow-400">{error}</p>
          </div>
        )}

        {runs.length > 0 && (
          <div className="mt-8 space-y-6">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        )}

        {runs.length === 0 && (
          <div className="mt-12 text-center text-gray-500">
            <p className="text-lg">No evaluations yet</p>
            <p className="mt-2 text-sm">Start an evaluation above to see results here</p>
          </div>
        )}
      </main>
    </div>
  );
}
