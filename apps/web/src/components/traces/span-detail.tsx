import type { TraceSpan } from "./types";
import { formatDuration, formatNumber } from "./utils";

export function SpanDetail({ span }: { span: TraceSpan }) {
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
