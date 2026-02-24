export function PassRateBar({ rate, label }: { rate: number; label: string }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <span className="w-48 text-sm text-gray-400">{label}</span>
      <div className="flex-1">
        <div className="h-3 rounded-full bg-gray-800">
          <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="w-16 text-right font-mono text-sm text-white">{pct}%</span>
    </div>
  );
}
