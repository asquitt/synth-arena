"use client";

import { useEffect, useState } from "react";

interface DomainInfo {
  name: string;
  description: string;
  version: string;
  generatorCount: number;
  constraintCount: number;
  defaultScorers: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

const FALLBACK_DOMAINS: DomainInfo[] = [
  {
    name: "web-scraping",
    description: "E-commerce, blog, news, and social media scraping scenarios with pagination, authentication, and rate limiting",
    version: "0.1.0",
    generatorCount: 3,
    constraintCount: 2,
    defaultScorers: ["task_completion", "cost_threshold", "safety_check"],
  },
  {
    name: "government",
    description: "SAM.gov procurement processing: RFPs, RFQs, RFIs, sources sought, and combined synopsis/solicitation scenarios",
    version: "0.1.0",
    generatorCount: 2,
    constraintCount: 3,
    defaultScorers: ["task_completion", "exact_match", "safety_check"],
  },
  {
    name: "healthcare",
    description: "Patient reactivation calls, appointment scheduling, insurance verification with HIPAA-safe synthetic data",
    version: "0.1.0",
    generatorCount: 2,
    constraintCount: 4,
    defaultScorers: ["task_completion", "safety_check"],
  },
];

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainInfo[]>(FALLBACK_DOMAINS);

  useEffect(() => {
    fetch(`${API_BASE}/domains`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data && Array.isArray(json.data)) setDomains(json.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600" />
            <span className="text-xl font-bold">SynthArena</span>
          </a>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="/evaluations" className="hover:text-white">Evaluations</a>
            <a href="/arena" className="hover:text-white">Arena</a>
            <a href="/scenarios" className="hover:text-white">Scenarios</a>
            <a href="/domains" className="text-white">Domains</a>
            <a href="/cost" className="hover:text-white">Cost</a>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold">Domain Templates</h1>
        <p className="mt-2 text-gray-400">Pre-built evaluation templates for specific industries</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {domains.map((d) => (
            <div key={d.name} className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold">{d.name}</h3>
                <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">v{d.version}</span>
              </div>
              <p className="mt-3 text-sm text-gray-400">{d.description}</p>

              <div className="mt-4 flex gap-4 text-xs text-gray-500">
                <span>{d.generatorCount} generators</span>
                <span>{d.constraintCount} constraints</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {d.defaultScorers.map((scorer) => (
                  <span key={scorer} className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{scorer}</span>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <a
                  href={`/evaluations?domain=${d.name}`}
                  className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  Evaluate
                </a>
                <a
                  href={`/scenarios?domain=${d.name}`}
                  className="rounded-lg border border-gray-700 px-4 py-1.5 text-xs text-gray-300 hover:border-gray-500"
                >
                  Generate Scenarios
                </a>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
