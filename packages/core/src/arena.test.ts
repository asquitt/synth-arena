import { describe, it, expect } from "vitest";
import { runArena } from "./arena.js";
import type { AgentConfig, Scenario, TaskResult, Scorer, ScorerContext, ScorerResult } from "@syntharena/shared";

function makeScenario(id: string): Scenario {
  return {
    id,
    domain: "test",
    name: `Scenario ${id}`,
    description: "Test scenario",
    input: { query: id },
    expected: { success: true },
    metadata: {
      complexity: "low",
      tags: ["test"],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0",
    },
  };
}

function makeTaskResult(score: number): TaskResult {
  return {
    output: { success: true, value: score },
    trace: [],
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.001,
      model: "test",
      provider: "test",
    },
    duration: 50,
  };
}

function makeAgent(name: string, scoreValue: number): AgentConfig {
  return {
    name,
    task: async () => makeTaskResult(scoreValue),
  };
}

const alwaysOneScorer: Scorer = async (ctx: ScorerContext): Promise<ScorerResult> => ({
  name: "test_scorer",
  score: ctx.output && typeof ctx.output === "object" && "value" in ctx.output
    ? (ctx.output as { value: number }).value
    : 0,
  passed: true,
});

describe("runArena", () => {
  it("runs a basic 2-agent arena", async () => {
    const result = await runArena({
      agents: [makeAgent("agent-a", 0.9), makeAgent("agent-b", 0.3)],
      scenarios: [makeScenario("s1")],
      scorers: [alwaysOneScorer],
      trials: 1,
    });

    expect(result.agents).toHaveLength(2);
    expect(result.matchups).toHaveLength(1);
    expect(result.scenarios).toHaveLength(1);
    expect(result.id).toBeDefined();
  });

  it("ranks the better agent higher in Elo", async () => {
    const result = await runArena({
      agents: [makeAgent("strong", 0.9), makeAgent("weak", 0.1)],
      scenarios: [makeScenario("s1"), makeScenario("s2"), makeScenario("s3")],
      scorers: [alwaysOneScorer],
      trials: 2,
    });

    const strong = result.agents.find((a) => a.agentName === "strong")!;
    const weak = result.agents.find((a) => a.agentName === "weak")!;

    expect(strong.elo).toBeGreaterThan(weak.elo);
    expect(strong.wins).toBeGreaterThan(0);
    expect(weak.losses).toBeGreaterThan(0);
  });

  it("handles tied scores as draws", async () => {
    const result = await runArena({
      agents: [makeAgent("equal-a", 0.5), makeAgent("equal-b", 0.5)],
      scenarios: [makeScenario("s1")],
      scorers: [alwaysOneScorer],
      trials: 1,
    });

    const a = result.agents.find((a) => a.agentName === "equal-a")!;
    const b = result.agents.find((a) => a.agentName === "equal-b")!;

    expect(a.draws).toBe(1);
    expect(b.draws).toBe(1);
    expect(a.wins).toBe(0);
    expect(b.wins).toBe(0);
  });

  it("handles 3+ agents with all pairwise matchups", async () => {
    const result = await runArena({
      agents: [makeAgent("a", 0.9), makeAgent("b", 0.5), makeAgent("c", 0.1)],
      scenarios: [makeScenario("s1")],
      scorers: [alwaysOneScorer],
      trials: 1,
    });

    // 3 agents → 3 pairwise matchups: (a,b), (a,c), (b,c)
    expect(result.matchups).toHaveLength(3);
    expect(result.agents).toHaveLength(3);
    // Best agent should be ranked first
    expect(result.agents[0]!.agentName).toBe("a");
  });

  it("computes avgScore and avgCost correctly", async () => {
    const result = await runArena({
      agents: [makeAgent("solo-a", 0.8), makeAgent("solo-b", 0.2)],
      scenarios: [makeScenario("s1")],
      scorers: [alwaysOneScorer],
      trials: 1,
    });

    const agentA = result.agents.find((a) => a.agentName === "solo-a")!;
    expect(agentA.avgCost).toBe(0.001);
    expect(agentA.avgScore).toBeCloseTo(0.8, 5);
  });

  it("handles multiple trials per matchup", async () => {
    const result = await runArena({
      agents: [makeAgent("a", 0.9), makeAgent("b", 0.1)],
      scenarios: [makeScenario("s1")],
      scorers: [alwaysOneScorer],
      trials: 5,
    });

    // 1 pair × 1 scenario × 5 trials = 5 matchups
    expect(result.matchups).toHaveLength(5);
    const a = result.agents.find((a) => a.agentName === "a")!;
    expect(a.wins).toBe(5);
  });

  it("handles scorer errors gracefully", async () => {
    const errorScorer: Scorer = async () => {
      throw new Error("Scorer exploded");
    };

    const result = await runArena({
      agents: [makeAgent("a", 0.9), makeAgent("b", 0.1)],
      scenarios: [makeScenario("s1")],
      scorers: [errorScorer],
      trials: 1,
    });

    // Both agents score 0 due to error → draw
    expect(result.matchups[0]!.winner).toBeNull();
  });

  it("handles multiple scenarios across multiple trials", async () => {
    const result = await runArena({
      agents: [makeAgent("a", 0.7), makeAgent("b", 0.3)],
      scenarios: [makeScenario("s1"), makeScenario("s2"), makeScenario("s3")],
      scorers: [alwaysOneScorer],
      trials: 2,
    });

    // 1 pair × 3 scenarios × 2 trials = 6 matchups
    expect(result.matchups).toHaveLength(6);
  });

  it("initializes all agents with Elo 1500", async () => {
    const result = await runArena({
      agents: [makeAgent("equal-a", 0.5), makeAgent("equal-b", 0.5)],
      scenarios: [makeScenario("s1")],
      scorers: [alwaysOneScorer],
      trials: 1,
    });

    // Both drew, so Elo stays at 1500
    for (const agent of result.agents) {
      expect(agent.elo).toBe(1500);
    }
  });

  it("produces matchups with correct agent names and scenario IDs", async () => {
    const result = await runArena({
      agents: [makeAgent("alpha", 0.9), makeAgent("beta", 0.1)],
      scenarios: [makeScenario("scenario-42")],
      scorers: [alwaysOneScorer],
      trials: 1,
    });

    const matchup = result.matchups[0]!;
    expect(matchup.scenarioId).toBe("scenario-42");
    expect(matchup.agentA).toBe("alpha");
    expect(matchup.agentB).toBe("beta");
    expect(matchup.winner).toBe("alpha");
    expect(matchup.scoreA).toBeGreaterThan(matchup.scoreB);
  });
});
