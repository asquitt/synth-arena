import type { EvalRun } from "./types";
import { MetricCard } from "./metric-card";

export function RunCard({ run }: { run: EvalRun }) {
  return (
    <a href={`/evaluations/${run.id}`} className="block rounded-xl border border-gray-800 bg-gray-900/50 p-6 transition hover:border-gray-700">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{run.name}</h3>
          <p className="mt-1 text-xs text-gray-500">{run.id}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
          run.status === "completed" ? "bg-green-900/50 text-green-400" : "bg-yellow-900/50 text-yellow-400"
        }`}>
          {run.status}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <MetricCard label="Pass Rate" value={`${(run.summary.overallPassRate * 100).toFixed(1)}%`} color={run.summary.overallPassRate >= 0.9 ? "green" : run.summary.overallPassRate >= 0.7 ? "yellow" : "red"} />
        <MetricCard label="pass@k" value={`${(run.summary.passAtK * 100).toFixed(1)}%`} color="cyan" />
        <MetricCard label="pass^k" value={`${(run.summary.passToTheK * 100).toFixed(1)}%`} color="cyan" />
        <MetricCard label="G-pass@k" value={`${(run.summary.gPassAtK * 100).toFixed(1)}%`} color="cyan" />
        <MetricCard label="Cost" value={`$${run.summary.totalCost.toFixed(4)}`} color="yellow" />
        <MetricCard label="p95 Latency" value={run.summary.latencyPercentiles ? `${Math.round(run.summary.latencyPercentiles.p95)}ms` : "—"} color={run.summary.latencyPercentiles && run.summary.latencyPercentiles.p95 > 1000 ? "yellow" : "gray"} />
        <MetricCard label="Scenarios" value={String(run.summary.totalScenarios)} color="gray" />
        <MetricCard label="Trials" value={String(run.summary.totalTrials)} color="gray" />
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-medium text-gray-400">Score Breakdown</h4>
        <div className="mt-2 space-y-2">
          {Object.entries(run.summary.scoreSummaries).map(([name, score]) => (
            <div key={name} className="flex items-center gap-3">
              <span className="w-40 text-xs text-gray-400">{name}</span>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                    style={{ width: `${score.mean * 100}%` }}
                  />
                </div>
              </div>
              <span className="w-16 text-right text-xs text-gray-300">{(score.mean * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </a>
  );
}
