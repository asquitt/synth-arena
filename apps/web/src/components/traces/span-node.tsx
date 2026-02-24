import type { TraceSpan } from "./types";
import { TYPE_COLORS, TYPE_ICONS } from "./types";

export function SpanNode({
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
