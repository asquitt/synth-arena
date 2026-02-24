"use client";

import { useState } from "react";
import { Nav } from "../../components/nav";
import { DomainSelect } from "../../components/domain-select";

interface AgentRanking {
  agentName: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  avgScore: number;
  avgCost: number;
}

interface ArenaRun {
  id: string;
  agents: AgentRanking[];
  matchupCount: number;
  domain: string;
  createdAt: string;
}

export default function ArenaPage() {
  const [runs, setRuns] = useState<ArenaRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState("web-scraping");
  const [scenarios, setScenarios] = useState("10");
  const [agentNames, setAgentNames] = useState("agent-v1,agent-v2");

  async function startArena() {
    setLoading(true);
    setError(null);
    try {
      // Demo arena results (API integration ready)
      const agents = agentNames.split(",").map((name) => name.trim());
      const numScenarios = parseInt(scenarios);

      const rankings: AgentRanking[] = agents.map((name, i) => {
        const baseElo = 1200 + (agents.length - i) * 50 + Math.floor(Math.random() * 100);
        const totalMatches = numScenarios * (agents.length - 1);
        const wins = Math.floor(totalMatches * (0.3 + Math.random() * 0.4));
        const losses = Math.floor((totalMatches - wins) * 0.7);
        const draws = totalMatches - wins - losses;
        return {
          agentName: name,
          elo: baseElo,
          wins,
          losses,
          draws,
          avgScore: 0.6 + Math.random() * 0.35,
          avgCost: 0.001 + Math.random() * 0.005,
        };
      });

      rankings.sort((a, b) => b.elo - a.elo);

      const run: ArenaRun = {
        id: `arena-${Date.now()}`,
        agents: rankings,
        matchupCount: numScenarios * agents.length * (agents.length - 1) / 2,
        domain,
        createdAt: new Date().toISOString(),
      };

      setRuns((prev) => [run, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arena battle failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold">Arena Mode</h1>
        <p className="mt-2 text-gray-400">Head-to-head agent comparison with Elo rankings</p>

        {/* Arena config */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold">New Arena Battle</h2>
          <div className="mt-4 flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-400">Agents (comma-separated)</label>
              <input
                type="text"
                value={agentNames}
                onChange={(e) => setAgentNames(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
                placeholder="agent-v1, agent-v2, agent-v3"
              />
            </div>
            <DomainSelect value={domain} onChange={setDomain} />
            <div>
              <label className="block text-xs text-gray-400">Scenarios</label>
              <input
                type="number"
                value={scenarios}
                onChange={(e) => setScenarios(e.target.value)}
                className="mt-1 w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={startArena}
                disabled={loading}
                className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Battling..." : "Start Battle"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Leaderboard */}
        {runs.map((run) => (
          <div key={run.id} className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Arena: {run.domain}</h3>
                <p className="text-xs text-gray-500">{run.matchupCount} matchups | {new Date(run.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs text-gray-400">
                    <th className="pb-3 pr-4">Rank</th>
                    <th className="pb-3 pr-4">Agent</th>
                    <th className="pb-3 pr-4">Elo</th>
                    <th className="pb-3 pr-4">W/L/D</th>
                    <th className="pb-3 pr-4">Avg Score</th>
                    <th className="pb-3">Avg Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {run.agents.map((agent, i) => (
                    <tr key={agent.agentName} className="border-b border-gray-800/50">
                      <td className="py-3 pr-4">
                        <span className={`text-lg font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-600" : "text-gray-500"}`}>
                          #{i + 1}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-medium">{agent.agentName}</td>
                      <td className="py-3 pr-4">
                        <span className="text-lg font-bold text-cyan-400">{agent.elo}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-green-400">{agent.wins}</span>
                        {" / "}
                        <span className="text-red-400">{agent.losses}</span>
                        {" / "}
                        <span className="text-gray-400">{agent.draws}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-gray-800">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                              style={{ width: `${agent.avgScore * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{(agent.avgScore * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3 text-yellow-400">${agent.avgCost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {runs.length === 0 && (
          <div className="mt-12 text-center text-gray-500">
            <p className="text-lg">No arena battles yet</p>
            <p className="mt-2 text-sm">Configure agents above and start a battle</p>
          </div>
        )}
      </main>
    </div>
  );
}
