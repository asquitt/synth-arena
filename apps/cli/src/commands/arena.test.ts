import { describe, it, expect, vi, beforeEach } from "vitest";
import { arenaCommand } from "./arena.js";

vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  }),
}));

vi.mock("@syntharena/core", async () => {
  const actual = await vi.importActual<typeof import("@syntharena/core")>("@syntharena/core");
  return {
    ...actual,
    runArena: vi.fn().mockResolvedValue({
      id: "arena-1",
      agents: [
        { agentName: "agent-a", elo: 1200, wins: 3, losses: 1, draws: 1, avgScore: 0.8, avgCost: 0.002 },
        { agentName: "agent-b", elo: 1100, wins: 1, losses: 3, draws: 1, avgScore: 0.6, avgCost: 0.003 },
      ],
      matchups: [
        { scenarioId: "s1", agentA: "agent-a", agentB: "agent-b", winner: "agent-a", scoreA: 0.9, scoreB: 0.5 },
      ],
      scenarios: [],
    }),
  };
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("arenaCommand", () => {
  it("runs arena and displays rankings", async () => {
    await arenaCommand({
      agents: "agent-a,agent-b",
      scenarios: "5",
      trials: "1",
      domain: "web-scraping",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Arena");
    expect(logs).toContain("agent-a");
    expect(logs).toContain("agent-b");
  });

  it("displays header with agent names", async () => {
    await arenaCommand({
      agents: "fast-agent,smart-agent,cheap-agent",
      scenarios: "3",
      trials: "1",
      domain: "government",
      output: "table",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("fast-agent");
    expect(logs).toContain("smart-agent");
    expect(logs).toContain("cheap-agent");
  });

  it("outputs JSON when requested", async () => {
    await arenaCommand({
      agents: "a,b",
      scenarios: "3",
      trials: "1",
      domain: "web-scraping",
      output: "json",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("arena-1");
  });
});
