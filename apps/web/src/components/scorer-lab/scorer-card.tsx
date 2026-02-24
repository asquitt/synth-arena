import type { TestResult, ScorerConfig } from "./types";

interface ScorerCardProps {
  scorer: ScorerConfig & { testResult?: TestResult };
  onRemove: () => void;
}

export function ScorerCard({ scorer, onRemove }: ScorerCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {scorer.testResult && (
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              scorer.testResult.passed ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
            }`}>
              {scorer.testResult.passed ? "\u2713" : "\u2717"}
            </span>
          )}
          <div>
            <h3 className="font-semibold">{scorer.name}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {scorer.mode === "llm" ? "LLM-backed" : "Deterministic"} &middot; threshold: {scorer.threshold}
            </p>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-xs text-gray-600 hover:text-red-400"
        >
          Remove
        </button>
      </div>

      <p className="mt-3 rounded-lg bg-gray-800/50 px-3 py-2 text-sm text-gray-300">
        {scorer.criteria}
      </p>

      {scorer.testResult && (
        <div className="mt-3 flex items-center gap-6 text-sm">
          <div>
            <span className="text-xs text-gray-500">Score: </span>
            <span className={`font-mono font-bold ${
              scorer.testResult.score >= 0.7 ? "text-green-400" : scorer.testResult.score >= 0.4 ? "text-yellow-400" : "text-red-400"
            }`}>
              {(scorer.testResult.score * 100).toFixed(0)}%
            </span>
          </div>
          {scorer.testResult.reason && (
            <div className="text-xs text-gray-500">{scorer.testResult.reason}</div>
          )}
          {scorer.testResult.metadata && (
            <div className="text-xs text-gray-600">
              {(scorer.testResult.metadata as Record<string, unknown>)["totalChecks"] !== undefined && (
                <span>{String((scorer.testResult.metadata as Record<string, unknown>)["passedChecks"])}/{String((scorer.testResult.metadata as Record<string, unknown>)["totalChecks"])} checks passed</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
