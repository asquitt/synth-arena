"use client";

import { useState } from "react";
import { Nav } from "../../components/nav";
import type { TestResult, ScorerConfig } from "../../components/scorer-lab/types";
import { EXAMPLE_CRITERIA } from "../../components/scorer-lab/types";
import { runLocalDeterministic, generateExportCode } from "../../components/scorer-lab/utils";
import { ScorerCard } from "../../components/scorer-lab/scorer-card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export default function ScorerLabPage() {
  const [scorers, setScorers] = useState<Array<ScorerConfig & { testResult?: TestResult }>>([]);
  const [newCriteria, setNewCriteria] = useState("");
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"llm" | "deterministic">("deterministic");
  const [threshold, setThreshold] = useState("0.7");
  const [testInput, setTestInput] = useState('{"query": "What is the capital of France?"}');
  const [testOutput, setTestOutput] = useState('"The capital of France is Paris, located in the Île-de-France region."');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addScorer() {
    if (!newCriteria.trim() || !newName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/scorers/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: newCriteria,
          name: newName,
          mode,
          threshold: parseFloat(threshold),
          testInput: JSON.parse(testInput),
          testOutput: JSON.parse(testOutput),
        }),
      });
      const json = await res.json();

      setScorers((prev) => [...prev, {
        criteria: newCriteria,
        name: newName,
        mode,
        threshold: parseFloat(threshold),
        testResult: json.data,
      }]);
      setNewCriteria("");
      setNewName("");
    } catch {
      const scorer: ScorerConfig & { testResult?: TestResult } = {
        criteria: newCriteria,
        name: newName,
        mode,
        threshold: parseFloat(threshold),
        testResult: runLocalDeterministic(newCriteria, newName, parseFloat(threshold), testOutput),
      };
      setScorers((prev) => [...prev, scorer]);
      setNewCriteria("");
      setNewName("");
      setError("API unavailable — ran deterministic scorer locally");
    } finally {
      setLoading(false);
    }
  }

  function loadExample(ex: typeof EXAMPLE_CRITERIA[number]) {
    setNewCriteria(ex.criteria);
    setNewName(ex.name);
    setMode("deterministic");
  }

  function removeScorer(index: number) {
    setScorers((prev) => prev.filter((_, i) => i !== index));
  }

  async function retestAll() {
    setLoading(true);
    const updated = await Promise.all(
      scorers.map(async (s) => {
        try {
          const res = await fetch(`${API_BASE}/scorers/test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              criteria: s.criteria,
              name: s.name,
              mode: s.mode,
              threshold: s.threshold,
              testInput: JSON.parse(testInput),
              testOutput: JSON.parse(testOutput),
            }),
          });
          const json = await res.json();
          return { ...s, testResult: json.data };
        } catch {
          return { ...s, testResult: runLocalDeterministic(s.criteria, s.name, s.threshold, testOutput) };
        }
      })
    );
    setScorers(updated);
    setLoading(false);
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Scorer Lab</h1>
            <p className="mt-2 text-gray-400">
              Generate evaluation scorers from natural language — no code required
            </p>
          </div>
          <span className="rounded-full bg-gradient-to-r from-orange-500/20 to-red-600/20 px-3 py-1 text-xs font-medium text-orange-400">
            AI-Powered
          </span>
        </div>

        {/* Quick examples */}
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Quick start:</span>
          {EXAMPLE_CRITERIA.map((ex) => (
            <button
              key={ex.name}
              onClick={() => loadExample(ex)}
              className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400 transition hover:border-orange-500/50 hover:text-orange-400"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Scorer builder */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold">New Scorer</h2>
          <p className="mt-1 text-xs text-gray-500">
            Describe what you want to evaluate in plain English
          </p>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400">Scorer Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. no_competitor_mentions"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400">Mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "llm" | "deterministic")}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  >
                    <option value="deterministic">Deterministic (free, fast)</option>
                    <option value="llm">LLM-backed (flexible, costs per eval)</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-400">Threshold</label>
                  <input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    min="0"
                    max="1"
                    step="0.1"
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400">Evaluation Criteria (plain English)</label>
              <textarea
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                placeholder='e.g. "Must not mention competitor products like Acme or FooCorp. Output length must be under 500 words. Must be valid JSON."'
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>

            <button
              onClick={addScorer}
              disabled={loading || !newCriteria.trim() || !newName.trim()}
              className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate & Test Scorer"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-400">
            {error}
          </div>
        )}

        {/* Test data panel */}
        <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Test Data</h2>
            {scorers.length > 0 && (
              <button
                onClick={retestAll}
                disabled={loading}
                className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:border-orange-500/50 hover:text-orange-400 disabled:opacity-50"
              >
                Re-test All Scorers
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400">Test Input (JSON)</label>
              <textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400">Test Output (JSON)</label>
              <textarea
                value={testOutput}
                onChange={(e) => setTestOutput(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Scorer results */}
        {scorers.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">Generated Scorers ({scorers.length})</h2>
            <div className="mt-4 space-y-4">
              {scorers.map((scorer, i) => (
                <ScorerCard key={i} scorer={scorer} onRemove={() => removeScorer(i)} />
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h3 className="text-sm font-semibold">Export as Code</h3>
              <p className="mt-1 text-xs text-gray-500">Copy this to use in your evaluation config</p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-300">
                <code>{generateExportCode(scorers)}</code>
              </pre>
            </div>
          </div>
        )}

        {scorers.length === 0 && (
          <div className="mt-12 text-center text-gray-500">
            <p className="text-lg">No scorers yet</p>
            <p className="mt-2 text-sm">
              Describe your evaluation criteria above or pick a quick-start example
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
