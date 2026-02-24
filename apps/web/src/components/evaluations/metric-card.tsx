const COLOR_CLASSES: Record<string, string> = {
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  cyan: "text-cyan-400",
  gray: "text-gray-300",
};

export function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <div className={`text-lg font-bold ${COLOR_CLASSES[color] ?? "text-gray-300"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
