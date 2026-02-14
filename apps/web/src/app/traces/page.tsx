"use client";

import { useState, useCallback } from "react";
import { Nav } from "../../components/nav";

interface TraceSpan {
  id: string;
  parentId: string;
  name: string;
  type: "llm_call" | "tool_invocation" | "decision" | "environment_interaction" | "state_transition";
  startTime: string;
  endTime: string;
  durationMs: number;
  status: "ok" | "error";
  runId: string;
  scenarioId: string;
  trialNumber: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  attributes: string;
  events: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const TYPE_COLORS: Record<string, string> = {
  llm_call: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  tool_invocation: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  decision: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  environment_interaction: "bg-green-500/20 text-green-400 border-green-500/30",
  state_transition: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const TYPE_ICONS: Record<string, string> = {
  llm_call: "🧠",
  tool_invocation: "🔧",
  decision: "🤔",
  environment_interaction: "🌐",
  state_transition: "🔄",
};

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

      // Fetch cost summary if searching by run
      if (searchType === "run") {
        const costRes = await fetch(`${API_BASE}/traces/run/${searchId}/cost`);
        if (costRes.ok) {
          const costJson = await costRes.json();
          setCostSummary(costJson.data ?? null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch traces");
      // Load demo data for development
      setSpans(DEMO_SPANS);
    } finally {
      setLoading(false);
    }
  }, [searchId, searchType]);

  // Build a tree from flat spans
  const rootSpans = spans.filter((s) => !s.parentId);
  const childMap = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    if (span.parentId) {
      const children = childMap.get(span.parentId) ?? [];
      children.push(span);
      childMap.set(span.parentId, children);
    }
  }

  const totalDuration = spans.length > 0
    ? Math.max(...spans.map((s) => s.durationMs))
    : 0;

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

        {/* Summary cards */}
        {spans.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Total Spans" value={String(spans.length)} />
            <SummaryCard label="Duration" value={formatDuration(totalDuration)} />
            <SummaryCard label="Total Cost" value={`$${totalCost.toFixed(4)}`} color="text-yellow-400" />
            <SummaryCard label="Total Tokens" value={formatNumber(totalTokens)} />
            <SummaryCard label="Errors" value={String(errorCount)} color={errorCount > 0 ? "text-red-400" : "text-green-400"} />
          </div>
        )}

        {/* Cost breakdown */}
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

        {/* Trace timeline + detail split */}
        {spans.length > 0 && (
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* Span tree */}
            <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4 max-h-[700px] overflow-y-auto">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Span Tree</h3>
              {rootSpans.length > 0
                ? rootSpans.map((span) => (
                    <SpanNode
                      key={span.id}
                      span={span}
                      childMap={childMap}
                      totalDuration={totalDuration}
                      selectedId={selectedSpan?.id ?? null}
                      onSelect={setSelectedSpan}
                      depth={0}
                    />
                  ))
                : spans.map((span) => (
                    <SpanNode
                      key={span.id}
                      span={span}
                      childMap={childMap}
                      totalDuration={totalDuration}
                      selectedId={selectedSpan?.id ?? null}
                      onSelect={setSelectedSpan}
                      depth={0}
                    />
                  ))
              }
            </div>

            {/* Detail panel */}
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

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function SpanNode({
  span,
  childMap,
  totalDuration,
  selectedId,
  onSelect,
  depth,
}: {
  span: TraceSpan;
  childMap: Map<string, TraceSpan[]>;
  totalDuration: number;
  selectedId: string | null;
  onSelect: (s: TraceSpan) => void;
  depth: number;
}) {
  const children = childMap.get(span.id) ?? [];
  const widthPct = totalDuration > 0 ? Math.max(2, (span.durationMs / totalDuration) * 100) : 100;
  const isSelected = selectedId === span.id;
  const typeColor = TYPE_COLORS[span.type] ?? "bg-gray-500/20 text-gray-400";
  const icon = TYPE_ICONS[span.type] ?? "📌";

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <button
        onClick={() => onSelect(span)}
        className={`w-full text-left rounded-lg p-2 mb-1 transition-colors ${
          isSelected ? "bg-gray-700 ring-1 ring-orange-500" : "hover:bg-gray-800"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-sm font-medium truncate flex-1">{span.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${typeColor}`}>
            {span.type.replace(/_/g, " ")}
          </span>
          {span.status === "error" && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">error</span>
          )}
          <span className="text-xs text-gray-500 tabular-nums">{span.durationMs}ms</span>
        </div>
        {/* Duration bar */}
        <div className="mt-1 h-1.5 rounded-full bg-gray-800">
          <div
            className={`h-1.5 rounded-full ${span.status === "error" ? "bg-red-500" : "bg-blue-500"}`}
            style={{ width: `${widthPct}%` }}
          />
        </div>
        {/* Token/cost info for LLM calls */}
        {span.type === "llm_call" && (span.inputTokens > 0 || span.cost > 0) && (
          <div className="mt-1 flex gap-3 text-xs text-gray-500">
            {span.model && <span>{span.model}</span>}
            <span>{span.inputTokens + span.outputTokens} tok</span>
            {span.cost > 0 && <span className="text-yellow-500">${span.cost.toFixed(4)}</span>}
          </div>
        )}
      </button>
      {children.map((child) => (
        <SpanNode
          key={child.id}
          span={child}
          childMap={childMap}
          totalDuration={totalDuration}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function SpanDetail({ span }: { span: TraceSpan }) {
  let attributes: Record<string, unknown> = {};
  let events: Array<{ name: string; timestamp: string; attributes: Record<string, unknown> }> = [];
  try { attributes = JSON.parse(span.attributes || "{}"); } catch { /* ignore */ }
  try { events = JSON.parse(span.events || "[]"); } catch { /* ignore */ }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-gray-400">Name</div>
        <div className="text-sm font-medium">{span.name}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-400">Type</div>
          <div className="text-sm">{span.type.replace(/_/g, " ")}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Status</div>
          <div className={`text-sm ${span.status === "error" ? "text-red-400" : "text-green-400"}`}>
            {span.status}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Duration</div>
          <div className="text-sm">{formatDuration(span.durationMs)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Trial</div>
          <div className="text-sm">#{span.trialNumber}</div>
        </div>
      </div>

      {span.type === "llm_call" && (
        <div>
          <div className="text-xs text-gray-400 mb-2">LLM Details</div>
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Model</span>
              <span>{span.model || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Provider</span>
              <span>{span.provider || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Input tokens</span>
              <span>{formatNumber(span.inputTokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Output tokens</span>
              <span>{formatNumber(span.outputTokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Cost</span>
              <span className="text-yellow-400">${span.cost.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-gray-400 mb-2">IDs</div>
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-1 text-xs font-mono">
          <div><span className="text-gray-400">span: </span>{span.id}</div>
          {span.parentId && <div><span className="text-gray-400">parent: </span>{span.parentId}</div>}
          <div><span className="text-gray-400">run: </span>{span.runId}</div>
          <div><span className="text-gray-400">scenario: </span>{span.scenarioId}</div>
        </div>
      </div>

      {Object.keys(attributes).length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2">Attributes</div>
          <pre className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-xs overflow-x-auto max-h-48">
            {JSON.stringify(attributes, null, 2)}
          </pre>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2">Events ({events.length})</div>
          <div className="space-y-2">
            {events.map((ev, i) => (
              <div key={i} className="rounded-lg border border-gray-700 bg-gray-800/50 p-2 text-xs">
                <div className="font-medium">{ev.name}</div>
                {ev.timestamp && <div className="text-gray-500">{ev.timestamp}</div>}
                {Object.keys(ev.attributes ?? {}).length > 0 && (
                  <pre className="mt-1 overflow-x-auto text-gray-400">
                    {JSON.stringify(ev.attributes, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Demo spans for development (when ClickHouse isn't available)
const DEMO_SPANS: TraceSpan[] = [
  {
    id: "span-001", parentId: "", name: "agent.run", type: "decision",
    startTime: "2025-01-15T10:00:00Z", endTime: "2025-01-15T10:00:05Z",
    durationMs: 5000, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "", provider: "", inputTokens: 0, outputTokens: 0,
    cost: 0, attributes: "{}", events: "[]",
  },
  {
    id: "span-002", parentId: "span-001", name: "llm.chat", type: "llm_call",
    startTime: "2025-01-15T10:00:00Z", endTime: "2025-01-15T10:00:02Z",
    durationMs: 2000, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "claude-sonnet-4-20250514", provider: "anthropic",
    inputTokens: 1200, outputTokens: 350, cost: 0.0089,
    attributes: JSON.stringify({ systemPrompt: "You are a helpful assistant", temperature: 0.7 }),
    events: JSON.stringify([{ name: "first_token", timestamp: "2025-01-15T10:00:00.500Z", attributes: {} }]),
  },
  {
    id: "span-003", parentId: "span-001", name: "tool.web_scrape", type: "tool_invocation",
    startTime: "2025-01-15T10:00:02Z", endTime: "2025-01-15T10:00:03.5Z",
    durationMs: 1500, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "", provider: "", inputTokens: 0, outputTokens: 0,
    cost: 0, attributes: JSON.stringify({ url: "https://example.com/products", method: "GET" }),
    events: "[]",
  },
  {
    id: "span-004", parentId: "span-001", name: "llm.chat (follow-up)", type: "llm_call",
    startTime: "2025-01-15T10:00:03.5Z", endTime: "2025-01-15T10:00:04.8Z",
    durationMs: 1300, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "claude-sonnet-4-20250514", provider: "anthropic",
    inputTokens: 2400, outputTokens: 180, cost: 0.0099,
    attributes: JSON.stringify({ toolResults: true }),
    events: "[]",
  },
  {
    id: "span-005", parentId: "span-001", name: "state.update_cart", type: "state_transition",
    startTime: "2025-01-15T10:00:04.8Z", endTime: "2025-01-15T10:00:05Z",
    durationMs: 200, status: "ok", runId: "run-demo", scenarioId: "scenario-1",
    trialNumber: 1, model: "", provider: "", inputTokens: 0, outputTokens: 0,
    cost: 0,
    attributes: JSON.stringify({ before: { cart: [] }, after: { cart: ["product-1"] } }),
    events: "[]",
  },
];
