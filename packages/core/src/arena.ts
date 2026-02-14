import type {
  ArenaConfig,
  ArenaResult,
  AgentRanking,
  Matchup,
  ScorerContext,
  ScorerResult,
} from "@syntharena/shared";
import { generateId } from "./utils.js";

/**
 * Arena mode: head-to-head comparison of agent implementations.
 *
 * Uses Bradley-Terry (Elo-like) ranking where agents compete on identical
 * scenarios and are ranked by pairwise win rates.
 */

const INITIAL_ELO = 1500;
const K_FACTOR = 32;

export async function runArena(config: ArenaConfig): Promise<ArenaResult> {
  const { agents, scenarios, scorers, trials } = config;

  const matchups: Matchup[] = [];
  const eloScores = new Map<string, number>();
  const stats = new Map<string, { wins: number; losses: number; draws: number; totalScore: number; totalCost: number; count: number }>();

  // Initialize
  for (const agent of agents) {
    eloScores.set(agent.name, INITIAL_ELO);
    stats.set(agent.name, { wins: 0, losses: 0, draws: 0, totalScore: 0, totalCost: 0, count: 0 });
  }

  // Run all pairwise matchups
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const agentA = agents[i]!;
      const agentB = agents[j]!;

      for (const scenario of scenarios) {
        for (let t = 0; t < trials; t++) {
          // Run both agents on the same scenario
          const [resultA, resultB] = await Promise.all([
            agentA.task(scenario.input),
            agentB.task(scenario.input),
          ]);

          // Score both
          const ctxA: ScorerContext = {
            input: scenario.input,
            output: resultA.output,
            expected: scenario.expected,
            trace: resultA.trace,
            tokenUsage: resultA.tokenUsage,
          };

          const ctxB: ScorerContext = {
            input: scenario.input,
            output: resultB.output,
            expected: scenario.expected,
            trace: resultB.trace,
            tokenUsage: resultB.tokenUsage,
          };

          const scoresA = await runScorers(scorers, ctxA);
          const scoresB = await runScorers(scorers, ctxB);

          const avgA = average(scoresA.map((s) => s.score));
          const avgB = average(scoresB.map((s) => s.score));

          // Determine winner
          const winner = avgA > avgB ? agentA.name : avgB > avgA ? agentB.name : null;

          matchups.push({
            scenarioId: scenario.id,
            agentA: agentA.name,
            agentB: agentB.name,
            winner,
            scoreA: avgA,
            scoreB: avgB,
          });

          // Update Elo
          updateElo(eloScores, agentA.name, agentB.name, winner);

          // Update stats
          const statsA = stats.get(agentA.name)!;
          const statsB = stats.get(agentB.name)!;

          statsA.totalScore += avgA;
          statsA.totalCost += resultA.tokenUsage.estimatedCost;
          statsA.count++;

          statsB.totalScore += avgB;
          statsB.totalCost += resultB.tokenUsage.estimatedCost;
          statsB.count++;

          if (winner === agentA.name) {
            statsA.wins++;
            statsB.losses++;
          } else if (winner === agentB.name) {
            statsB.wins++;
            statsA.losses++;
          } else {
            statsA.draws++;
            statsB.draws++;
          }
        }
      }
    }
  }

  // Build rankings sorted by Elo
  const rankings: AgentRanking[] = agents
    .map((agent) => {
      const s = stats.get(agent.name)!;
      return {
        agentName: agent.name,
        elo: Math.round(eloScores.get(agent.name)!),
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        avgScore: s.count > 0 ? s.totalScore / s.count : 0,
        avgCost: s.count > 0 ? s.totalCost / s.count : 0,
      };
    })
    .sort((a, b) => b.elo - a.elo);

  return {
    id: generateId(),
    agents: rankings,
    matchups,
    scenarios,
  };
}

async function runScorers(
  scorers: ArenaConfig["scorers"],
  ctx: ScorerContext
): Promise<ScorerResult[]> {
  const results: ScorerResult[] = [];
  for (const scorer of scorers) {
    try {
      results.push(await scorer(ctx));
    } catch {
      results.push({ name: "scorer_error", score: 0, passed: false });
    }
  }
  return results;
}

function updateElo(
  elos: Map<string, number>,
  agentA: string,
  agentB: string,
  winner: string | null
): void {
  const eloA = elos.get(agentA)!;
  const eloB = elos.get(agentB)!;

  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const expectedB = 1 - expectedA;

  let actualA: number;
  let actualB: number;

  if (winner === agentA) {
    actualA = 1;
    actualB = 0;
  } else if (winner === agentB) {
    actualA = 0;
    actualB = 1;
  } else {
    actualA = 0.5;
    actualB = 0.5;
  }

  elos.set(agentA, eloA + K_FACTOR * (actualA - expectedA));
  elos.set(agentB, eloB + K_FACTOR * (actualB - expectedB));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
