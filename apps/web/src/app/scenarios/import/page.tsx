"use client";

import { useState } from "react";
import { Nav } from "../../../components/nav";

interface ImportSummary {
  totalImported: number;
  byOutcome: Record<string, number>;
  byDomain: Record<string, number>;
  avgComplexity: number;
}

interface ImportedScenario {
  id: string;
  input: Record<string, unknown>;
  metadata: { domain: string; tags: string[] };
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001/api/v1";

const SAMPLE_TRACES = JSON.stringify([
  {
    id: "trace-001",
    spans: [
      {
        traceId: "t1",
        spanId: "s1",
        operationName: "agent.execute",
        serviceName: "my-agent",
        startTimeUnixNano: "1706745600000000000",
        endTimeUnixNano: "1706745601500000000",
        attributes: [
          { key: "task.input", value: { stringValue: "Find pricing for product X" } },
          { key: "task.output", value: { stringValue: "Price is $49.99" } },
        ],
        status: { code: 1 },
      },
    ],
    outcome: "success",
    durationMs: 1500,
    tokenUsage: { totalTokens: 350, estimatedCost: 0.002 },
  },
  {
    id: "trace-002",
    spans: [
      {
        traceId: "t2",
        spanId: "s2",
        operationName: "agent.execute",
        serviceName: "my-agent",
        startTimeUnixNano: "1706745700000000000",
        endTimeUnixNano: "1706745705000000000",
        attributes: [
          { key: "task.input", value: { stringValue: "Submit form with user data" } },
        ],
        status: { code: 2, message: "Timeout" },
      },
    ],
    outcome: "failure",
    durationMs: 5000,
    tokenUsage: { totalTokens: 800, estimatedCost: 0.005 },
  },
], null, 2);

export default function TraceImportPage() {
  const [tracesJson, setTracesJson] = useState(SAMPLE_TRACES);
  const [domain, setDomain] = useState("web-scraping");
  const [filterOutcome, setFilterOutcome] = useState<string>("");
  const [maxScenarios, setMaxScenarios] = useState(100);
  const [includeTrace, setIncludeTrace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ scenarios: ImportedScenario[]; summary: ImportSummary } | null>(null);

  async function handleImport() {
    setLoading(true);
    setError(null);
    try {
      const traces = JSON.parse(tracesJson);
      const res = await fetch(`${API_BASE}/scenarios/import-traces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traces,
          domain,
          filterOutcome: filterOutcome || undefined,
          maxScenarios,
          includeTrace,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      setResult(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
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
            <h1 className="text-2xl font-bold">Import Production Traces</h1>
            <p className="mt-1 text-sm text-gray-400">
              Convert OpenTelemetry-compatible production traces into regression test scenarios
            </p>
          </div>
          <a href="/scenarios" className="text-sm text-orange-400 hover:text-orange-300">
            ← Back to Scenarios
          </a>
        </div>

        {/* Input Form */}
        <div className="mb-6">
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Production Traces (JSON array)
          </label>
          <textarea
            value={tracesJson}
            onChange={(e) => setTracesJson(e.target.value)}
            className="h-48 w-full rounded-lg border border-gray-800 bg-gray-900 p-3 font-mono text-xs text-gray-300 focus:border-orange-500 focus:outline-none"
          />
        </div>

        <div className="mb-6 grid grid-cols-4 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Domain</label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
            >
              <option value="web-scraping">Web Scraping</option>
              <option value="government">Government</option>
              <option value="healthcare">Healthcare</option>
              <option value="legal">Legal</option>
              <option value="energy">Energy</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Filter by Outcome</label>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="success">Success Only</option>
              <option value="failure">Failures Only</option>
              <option value="slow">Slow Only</option>
              <option value="expensive">Expensive Only</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Max Scenarios</label>
            <input
              type="number"
              value={maxScenarios}
              onChange={(e) => setMaxScenarios(parseInt(e.target.value, 10) || 100)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={includeTrace}
                onChange={(e) => setIncludeTrace(e.target.checked)}
                className="rounded border-gray-700 bg-gray-800"
              />
              Embed original traces
            </label>
          </div>
        </div>

        <button
          onClick={handleImport}
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import Traces"}
        </button>

        {error && (
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-8">
            {/* Summary Cards */}
            <div className="mb-6 grid grid-cols-4 gap-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold text-green-400">{result.summary.totalImported}</div>
                <div className="text-xs text-gray-400">Scenarios Created</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold">{result.summary.avgComplexity.toFixed(1)}</div>
                <div className="text-xs text-gray-400">Avg Complexity</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold">{Object.keys(result.summary.byOutcome).length}</div>
                <div className="text-xs text-gray-400">Outcome Types</div>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="text-2xl font-bold">{Object.keys(result.summary.byDomain).length}</div>
                <div className="text-xs text-gray-400">Domains</div>
              </div>
            </div>

            {/* Outcome Distribution */}
            {Object.keys(result.summary.byOutcome).length > 0 && (
              <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="mb-3 text-sm font-semibold">Outcome Distribution</h3>
                <div className="flex gap-4">
                  {Object.entries(result.summary.byOutcome).map(([outcome, count]) => {
                    const colors: Record<string, string> = {
                      success: "text-green-400",
                      failure: "text-red-400",
                      slow: "text-yellow-400",
                      expensive: "text-orange-400",
                    };
                    return (
                      <div key={outcome} className="flex items-center gap-2">
                        <span className={`font-mono text-lg font-bold ${colors[outcome] ?? "text-gray-400"}`}>
                          {count}
                        </span>
                        <span className="text-xs text-gray-500">{outcome}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Imported Scenarios Table */}
            <div className="rounded-xl border border-gray-800 bg-gray-900">
              <div className="border-b border-gray-800 px-6 py-3">
                <h3 className="text-sm font-semibold">Imported Scenarios ({result.scenarios.length})</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {result.scenarios.slice(0, 50).map((scenario) => (
                  <div key={scenario.id} className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <code className="text-xs font-medium text-gray-400">{scenario.id}</code>
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-500">
                        {scenario.metadata.domain}
                      </span>
                      {scenario.metadata.tags.map((tag) => (
                        <span key={tag} className="rounded bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 font-mono text-xs text-gray-600 truncate">
                      {JSON.stringify(scenario.input).slice(0, 120)}
                    </div>
                  </div>
                ))}
                {result.scenarios.length > 50 && (
                  <div className="px-6 py-4 text-center text-xs text-gray-500">
                    +{result.scenarios.length - 50} more scenarios
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
