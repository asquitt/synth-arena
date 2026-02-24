const STYLES: Record<string, string> = {
  robust: "bg-green-500/20 text-green-400 border-green-500/30",
  moderate_risk: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  vulnerable: "bg-red-500/20 text-red-400 border-red-500/30",
};

const LABELS: Record<string, string> = {
  robust: "ROBUST",
  moderate_risk: "MODERATE RISK",
  vulnerable: "VULNERABLE",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-sm font-bold ${STYLES[verdict] ?? STYLES["vulnerable"]}`}>
      {LABELS[verdict] ?? verdict}
    </span>
  );
}
