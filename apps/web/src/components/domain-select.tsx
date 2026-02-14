const DOMAINS = [
  { value: "web-scraping", label: "Web Scraping" },
  { value: "government", label: "Government" },
  { value: "healthcare", label: "Healthcare" },
  { value: "legal", label: "Legal" },
  { value: "energy", label: "Energy" },
];

export function DomainSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400">Domain</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
      >
        {DOMAINS.map((d) => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
    </div>
  );
}
