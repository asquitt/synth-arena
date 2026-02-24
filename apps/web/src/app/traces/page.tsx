"use client";

import { useState, useCallback } from "react";
import { Nav } from "../../components/nav";
import type { TraceSpan } from "../../components/traces/types";
import { SummaryCard } from "../../components/traces/summary-card";
import { SpanNode } from "../../components/traces/span-node";
import { SpanDetail } from "../../components/traces/span-detail";
import { DEMO_SPANS } from "../../components/traces/demo-data";
import { formatDuration, formatNumber } from "../../components/traces/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export default function TracesPage() {
  const [searchType, setSearchType] = useState<"run" | "trace">("run");
  const [searchId, setSearchId] = useState("");
  const [spans, setSpans] = useState<TraceSpan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null);
  const [costSummary, setCostSummary] = useState<{ model: string; totalCalls: number; totalCost: number }[] | null>(null);

  const search = useCallback(async () => {
    if (!searchId.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedSpan(null);
    setCostSummary(null);

    try {
      const endpoint = searchType === "run"
        ? `${API_BASE}/traces/run/${searchId}`
        : `${API_BASE}/traces/${searchId}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        if (res.status === 503) {
          throw new Error("ClickHouse not configured. Set CLICKHOUSE_URL to enable trace storage.");
        }
        throw new Error(`API returned ${res.status}`);
      }
      const json = await res.json();
      setSpans(json.data ?? []);

      if (searchType === "run") {
        const costRes = await fetch(`${API_BASE}/traces/run/${searchId}/cost`);
        if (costRes.ok) {
          const costJson = await costRes.json();
          setCostSummary(costJson.data ?? null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch traces");
      setSpans(DEMO_SPANS);
    } finally {
      setLoading(false);
    }
  }, [searchId, searchType]);

  const rootSpans = spans.filter((s) => !s.parentId);
  const childMap = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    if (span.parentId) {
      const children = childMap.get(span.parentId) ?? [];
      children.push(span);
      childMap.set(span.parentId, children);
    }
  }

  const totalDuration = spans.length > 0 ? Math.max(...spans.map((s) => s.durationMs)) : 0;
  const totalCost = spans.reduce((sum, s) => sum + (s.cost ?? 0), 0);
  const totalTokens = spans.reduce((sum, s) => sum + (s.inputTokens ?? 0) + (s.outputTokens ?? 0), 0);
  const errorCount = spans.filter((s) => s.status === "error").length;

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold">Trace Explorer</h1>
        <p className="mt-2 text-gray-400">
          Inspect agent execution traces — every LLM call, tool invocation, and decision
        </p>

        {/* Search */}
        <div className="mt-8 flex gap-3">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as "run" | "trace")}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
          >
            <option value="run">By Run ID</option>
            <option value="trace">By Trace ID</option>
          </select>
          <input
            type="text"
            placeholder={searchType === "run" ? "Enter evaluation run ID..." : "Enter trace ID..."}
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm"
          />
          <button
            onClick={search}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
            {error}. Showing demo data.
          </div>
        )}

        {spans.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Total Spans" value={String(spans.length)} />
            <SummaryCard label="Duration" value={formatDuration(totalDuration)} />
            <SummaryCard label="Total Cost" value={`$${totalCost.toFixed(4)}`} color="text-yellow-400" />
            <SummaryCard label="Total Tokens" value={formatNumber(totalTokens)} />
            <SummaryCard label="Errors" value={String(errorCount)} color={errorCount > 0 ? "text-red-400" : "text-green-400"} />
          </div>
        )}

        {costSummary && costSummary.length > 0 && (
          <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <h3 className="text-sm font-medium text-gray-400">Cost by Model</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {costSummary.map((c) => (
                <div key={c.model} className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                  <div className="text-sm font-medium">{c.model || "unknown"}</div>
                  <div className="mt-1 flex justify-between text-xs text-gray-400">
                    <span>{c.totalCalls} calls</span>
                    <span className="text-yellow-400">${c.totalCost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {spans.length > 0 && (
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4 max-h-[700px] overflow-y-auto">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Span Tree</h3>
              {(rootSpans.length > 0 ? rootSpans : spans).map((span) => (
                <SpanNode
                  key={span.id}
                  span={span}
                  childMap={childMap}
                  totalDuration={totalDuration}
                  selectedId={selectedSpan?.id ?? null}
                  onSelect={setSelectedSpan}
                  depth={0}
                />
              ))}
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 max-h-[700px] overflow-y-auto">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Span Detail</h3>
              {selectedSpan ? (
                <SpanDetail span={selectedSpan} />
              ) : (
                <p className="text-sm text-gray-500">Click a span to see details</p>
              )}
            </div>
          </div>
        )}

        {spans.length === 0 && !loading && !error && (
          <div className="mt-12 text-center text-gray-500">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-lg">Enter a Run ID or Trace ID to explore execution traces</p>
            <p className="mt-2 text-sm">Traces capture every LLM call, tool invocation, and state transition</p>
          </div>
        )}
      </main>
    </div>
  );
}
