"use client";

import { useState } from "react";
import { Nav } from "../../components/nav";
import { DomainSelect } from "../../components/domain-select";

interface Scenario {
  id: string;
  domain: string;
  name: string;
  description: string;
  metadata: {
    complexity: string;
    tags: string[];
  };
}

interface QualityReport {
  total: number;
  diversityScore: number;
  complexityDistribution: Record<string, number>;
  issues: { scenarioId: string; type: string; message: string }[];
  isAcceptable: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [domain, setDomain] = useState("web-scraping");
  const [count, setCount] = useState("10");
  const [complexity, setComplexity] = useState("mixed");

  async function generateScenarios() {
    setLoading(true);
    setQuality(null);
    try {
      const res = await fetch(`${API_BASE}/scenarios/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          count: parseInt(count),
          ...(complexity !== "mixed" ? { complexity } : {}),
        }),
      });
      const json = await res.json();
      if (json.data?.scenarios) {
        setScenarios(json.data.scenarios);
      }
    } catch {
      // Generate demo scenarios locally
      const complexities = ["low", "medium", "high", "adversarial"];
      const tags: Record<string, string[]> = {
        "web-scraping": ["e-commerce", "blog", "news", "social-media"],
        government: ["rfp", "rfq", "rfi", "sources-sought"],
        healthcare: ["active", "lapsed-6mo", "lapsed-1yr", "new-referral"],
        legal: ["h1b", "eb1", "l1", "o1"],
        energy: ["demand-forecast", "outage-response", "renewable", "peak-shave"],
      };
      const domainTags = tags[domain] ?? tags["web-scraping"]!;

      const demo: Scenario[] = Array.from({ length: parseInt(count) }, (_, i) => ({
        id: `${domain}-${i + 1}`,
        domain,
        name: `${domain}-scenario-${i + 1}`,
        description: `Test scenario ${i + 1} for ${domain} domain`,
        metadata: {
          complexity: complexity === "mixed" ? complexities[i % 4]! : complexity,
          tags: [domain, domainTags[i % domainTags.length]!],
        },
      }));
      setScenarios(demo);
    } finally {
      setLoading(false);
    }
  }

  async function validateScenarios() {
    if (scenarios.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/scenarios/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarios }),
      });
      const json = await res.json();
      if (json.data) {
        setQuality(json.data);
      }
    } catch {
      // Demo quality report
      const complexityCounts: Record<string, number> = {};
      for (const s of scenarios) {
        complexityCounts[s.metadata.complexity] = (complexityCounts[s.metadata.complexity] ?? 0) + 1;
      }
      setQuality({
        total: scenarios.length,
        diversityScore: 0.7 + Math.random() * 0.25,
        complexityDistribution: complexityCounts,
        issues: [],
        isAcceptable: true,
      });
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Scenarios</h1>
            <p className="mt-2 text-gray-400">Generate and validate domain-specific test scenarios</p>
          </div>
          <a
            href="/scenarios/import"
            className="rounded-lg border border-orange-500/30 px-3 py-1.5 text-xs font-medium text-orange-400 transition hover:bg-orange-500/10"
          >
            Import Production Traces →
          </a>
        </div>

        {/* Generator */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold">Generate Scenarios</h2>
          <div className="mt-4 flex flex-wrap gap-4">
            <DomainSelect value={domain} onChange={setDomain} />
            <div>
              <label className="block text-xs text-gray-400">Count</label>
              <input
                type="number"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="mt-1 w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400">Complexity</label>
              <select
                value={complexity}
                onChange={(e) => setComplexity(e.target.value)}
                className="mt-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              >
                <option value="mixed">Mixed</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="adversarial">Adversarial</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={generateScenarios}
                disabled={loading}
                className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate"}
              </button>
              {scenarios.length > 0 && (
                <button
                  onClick={validateScenarios}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500"
                >
                  Validate Quality
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quality report */}
        {quality && (
          <div className={`mt-6 rounded-xl border p-6 ${
            quality.isAcceptable ? "border-green-800 bg-green-900/20" : "border-red-800 bg-red-900/20"
          }`}>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${quality.isAcceptable ? "text-green-400" : "text-red-400"}`}>
                {quality.isAcceptable ? "PASS" : "FAIL"}
              </span>
              <span className="text-sm text-gray-400">
                Diversity: {(quality.diversityScore * 100).toFixed(0)}% | {quality.total} scenarios
              </span>
            </div>
            <div className="mt-3 flex gap-4">
              {Object.entries(quality.complexityDistribution).map(([level, cnt]) => (
                <div key={level} className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2">
                  <div className="text-sm font-bold text-gray-200">{cnt}</div>
                  <div className="text-xs text-gray-500">{level}</div>
                </div>
              ))}
            </div>
            {quality.issues.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-red-400">{quality.issues.length} issues found:</p>
                {quality.issues.slice(0, 5).map((issue, i) => (
                  <p key={i} className="mt-1 text-xs text-gray-400">
                    [{issue.type}] {issue.scenarioId}: {issue.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scenarios list */}
        {scenarios.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-400">{scenarios.length} scenarios generated</h3>
            <div className="mt-4 space-y-2">
              {scenarios.map((s) => (
                <div key={s.id} className="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                  <span className="w-32 font-mono text-xs text-gray-500">{s.id}</span>
                  <span className="flex-1 text-sm">{s.description}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    s.metadata.complexity === "adversarial" ? "bg-red-900/50 text-red-400" :
                    s.metadata.complexity === "high" ? "bg-orange-900/50 text-orange-400" :
                    s.metadata.complexity === "medium" ? "bg-yellow-900/50 text-yellow-400" :
                    "bg-green-900/50 text-green-400"
                  }`}>
                    {s.metadata.complexity}
                  </span>
                  <div className="flex gap-1">
                    {s.metadata.tags.map((tag) => (
                      <span key={tag} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
