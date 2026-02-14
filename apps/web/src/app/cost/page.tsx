"use client";

import { useState } from "react";
import { Nav } from "../../components/nav";

interface CostEstimate {
  scenarioCount: number;
  trialsPerScenario: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  model: string;
  breakdown: { category: string; cost: number; percentage: number }[];
}

const MODELS = [
  { name: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", input: 3.0, output: 15.0 },
  { name: "claude-haiku-3.5", label: "Claude Haiku 3.5", input: 0.80, output: 4.0 },
  { name: "claude-opus-4-0", label: "Claude Opus 4", input: 15.0, output: 75.0 },
  { name: "gpt-4o", label: "GPT-4o", input: 2.5, output: 10.0 },
  { name: "gpt-4o-mini", label: "GPT-4o Mini", input: 0.15, output: 0.6 },
  { name: "gemini-2.0-flash", label: "Gemini 2.0 Flash", input: 0.075, output: 0.3 },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export default function CostPage() {
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [scenarios, setScenarios] = useState("100");
  const [trials, setTrials] = useState("3");
  const [callsPerScenario, setCallsPerScenario] = useState("3");
  const [cacheRate, setCacheRate] = useState("0");
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [comparison, setComparison] = useState<{ model: string; cost: number }[]>([]);

  async function estimateCost() {
    const numScenarios = parseInt(scenarios);
    const numTrials = parseInt(trials);
    const numCalls = parseInt(callsPerScenario);
    const cache = parseFloat(cacheRate);

    try {
      const res = await fetch(`${API_BASE}/cost/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          scenarioCount: numScenarios,
          trialsPerScenario: numTrials,
          avgCallsPerScenario: numCalls,
          cacheHitRate: cache,
        }),
      });
      const json = await res.json();
      if (json.data?.estimate) {
        setEstimate(json.data.estimate);
      }
    } catch {
      // Local estimation
      const modelInfo = MODELS.find((m) => m.name === model) ?? MODELS[0]!;
      const inputTokens = numScenarios * numTrials * numCalls * 2000;
      const outputTokens = numScenarios * numTrials * numCalls * 500;
      const cachedInput = inputTokens * cache;
      const uncachedInput = inputTokens - cachedInput;
      const inputCost = (uncachedInput / 1_000_000) * modelInfo.input + (cachedInput / 1_000_000) * (modelInfo.input * 0.1);
      const outputCost = (outputTokens / 1_000_000) * modelInfo.output;
      const totalCost = inputCost + outputCost;

      setEstimate({
        scenarioCount: numScenarios,
        trialsPerScenario: numTrials,
        estimatedInputTokens: inputTokens,
        estimatedOutputTokens: outputTokens,
        estimatedCost: totalCost,
        model,
        breakdown: [
          { category: "Input tokens", cost: inputCost, percentage: (inputCost / totalCost) * 100 },
          { category: "Output tokens", cost: outputCost, percentage: (outputCost / totalCost) * 100 },
        ],
      });
    }

    // Compare across models
    const comparisons = MODELS.map((m) => {
      const inputTokens = numScenarios * numTrials * numCalls * 2000;
      const outputTokens = numScenarios * numTrials * numCalls * 500;
      const cachedInput = inputTokens * cache;
      const uncachedInput = inputTokens - cachedInput;
      const cost = (uncachedInput / 1_000_000) * m.input + (cachedInput / 1_000_000) * (m.input * 0.1) + (outputTokens / 1_000_000) * m.output;
      return { model: m.label, cost };
    });
    comparisons.sort((a, b) => a.cost - b.cost);
    setComparison(comparisons);
  }

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold">Cost Estimator</h1>
        <p className="mt-2 text-gray-400">Estimate token spend before running evaluations</p>

        {/* Estimator form */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs text-gray-400">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              >
                {MODELS.map((m) => (
                  <option key={m.name} value={m.name}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400">Scenarios</label>
              <input type="number" value={scenarios} onChange={(e) => setScenarios(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400">Trials</label>
              <input type="number" value={trials} onChange={(e) => setTrials(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400">Calls/Scenario</label>
              <input type="number" value={callsPerScenario} onChange={(e) => setCallsPerScenario(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-400">Cache Rate</label>
              <input type="number" step="0.1" min="0" max="1" value={cacheRate} onChange={(e) => setCacheRate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={estimateCost}
              className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Estimate Cost
            </button>
          </div>
        </div>

        {/* Estimate result */}
        {estimate && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h3 className="text-sm font-medium text-gray-400">Total Estimated Cost</h3>
              <div className="mt-2 text-4xl font-bold text-yellow-400">${estimate.estimatedCost.toFixed(2)}</div>
              <div className="mt-4 space-y-2 text-sm text-gray-400">
                <div className="flex justify-between">
                  <span>Input tokens</span>
                  <span>{(estimate.estimatedInputTokens / 1000).toFixed(0)}K</span>
                </div>
                <div className="flex justify-between">
                  <span>Output tokens</span>
                  <span>{(estimate.estimatedOutputTokens / 1000).toFixed(0)}K</span>
                </div>
                <div className="flex justify-between">
                  <span>Per scenario</span>
                  <span>${(estimate.estimatedCost / estimate.scenarioCount).toFixed(4)}</span>
                </div>
              </div>
              {estimate.breakdown.length > 0 && (
                <div className="mt-4">
                  {estimate.breakdown.map((item) => (
                    <div key={item.category} className="mt-2">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{item.category}</span>
                        <span>${item.cost.toFixed(4)} ({item.percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-gray-800">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Model comparison */}
            {comparison.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
                <h3 className="text-sm font-medium text-gray-400">Model Comparison</h3>
                <div className="mt-4 space-y-3">
                  {comparison.map((c, i) => {
                    const maxCost = comparison[comparison.length - 1]?.cost ?? 1;
                    return (
                      <div key={c.model}>
                        <div className="flex justify-between text-sm">
                          <span className={c.model === MODELS.find(m => m.name === model)?.label ? "font-bold text-white" : "text-gray-400"}>
                            {i === 0 ? "* " : ""}{c.model}
                          </span>
                          <span className="text-yellow-400">${c.cost.toFixed(2)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-gray-800">
                          <div
                            className={`h-2 rounded-full ${i === 0 ? "bg-green-500" : "bg-gray-600"}`}
                            style={{ width: `${(c.cost / maxCost) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
