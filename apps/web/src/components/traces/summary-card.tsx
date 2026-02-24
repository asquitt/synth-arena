export function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color ?? "text-white"}`}>{value}</div>
    </div>
  );
}
