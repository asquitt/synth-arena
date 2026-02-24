import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  UserSimulator,
  DENTAL_PATIENT_LAPSED,
  DENTAL_PATIENT_ANXIOUS,
  GOV_CONTRACTING_OFFICER,
  type UserPersona,
} from "./user-simulator.js";

// Mock the Anthropic SDK
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

function makePersona(overrides?: Partial<UserPersona>): UserPersona {
  return {
    name: "Test User",
    description: "A test persona",
    traits: {
      cooperativeness: 0.5,
      patience: 0.5,
      techSavviness: 0.5,
      verbosity: 0.5,
      emotionalState: "neutral",
    },
    background: "Test background",
    objectives: ["Complete the task"],
    constraints: ["Cannot share secrets"],
    ...overrides,
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("UserSimulator", () => {
  describe("respond", () => {
    it("calls LLM and returns a user turn", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Sure, I can help with that." }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const sim = new UserSimulator({ persona: makePersona(), maxTurns: 10 });
      const turn = await sim.respond("Hello, how can I help you today?");

      expect(turn.role).toBe("user");
      expect(turn.content).toBe("Sure, I can help with that.");
      expect(turn.timestamp).toBeGreaterThan(0);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("records agent message in history", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Reply" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const sim = new UserSimulator({ persona: makePersona(), maxTurns: 10 });
      await sim.respond("Agent message");

      const history = sim.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.role).toBe("agent");
      expect(history[0]!.content).toBe("Agent message");
      expect(history[1]!.role).toBe("user");
    });

    it("ends conversation after maxTurns", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Reply" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const sim = new UserSimulator({ persona: makePersona(), maxTurns: 1 });

      // First user turn
      await sim.respond("First message");

      // Second attempt should trigger end (maxTurns = 1 user turn)
      const endTurn = await sim.respond("Second message");

      expect(endTurn.metadata?.["reason"]).toBe("max_turns_exceeded");
      // LLM should only be called once (first turn)
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("includes token usage in metadata", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Reply" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const sim = new UserSimulator({ persona: makePersona(), maxTurns: 10 });
      const turn = await sim.respond("Hello");

      expect(turn.metadata?.["tokensUsed"]).toBe(150);
      expect(turn.metadata?.["turnNumber"]).toBe(1);
    });

    it("handles LLM response without text block", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "tool_use", id: "t", name: "tool", input: {} }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const sim = new UserSimulator({ persona: makePersona(), maxTurns: 10 });
      const turn = await sim.respond("Hello");

      expect(turn.content).toBe("I'm sorry, I need to go.");
    });
  });

  describe("getHistory", () => {
    it("returns a copy of history", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Reply" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const sim = new UserSimulator({ persona: makePersona(), maxTurns: 10 });
      await sim.respond("Hello");

      const h1 = sim.getHistory();
      const h2 = sim.getHistory();
      expect(h1).not.toBe(h2);
      expect(h1).toEqual(h2);
    });
  });

  describe("reset", () => {
    it("clears conversation history", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Reply" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const sim = new UserSimulator({ persona: makePersona(), maxTurns: 10 });
      await sim.respond("Hello");
      expect(sim.getHistory()).toHaveLength(2);

      sim.reset();
      expect(sim.getHistory()).toHaveLength(0);
    });
  });
});

describe("pre-built personas", () => {
  it("DENTAL_PATIENT_LAPSED has valid structure", () => {
    expect(DENTAL_PATIENT_LAPSED.name).toBeTruthy();
    expect(DENTAL_PATIENT_LAPSED.traits.cooperativeness).toBeGreaterThanOrEqual(0);
    expect(DENTAL_PATIENT_LAPSED.traits.cooperativeness).toBeLessThanOrEqual(1);
    expect(DENTAL_PATIENT_LAPSED.objectives.length).toBeGreaterThan(0);
    expect(DENTAL_PATIENT_LAPSED.constraints.length).toBeGreaterThan(0);
  });

  it("DENTAL_PATIENT_ANXIOUS has anxious emotional state", () => {
    expect(DENTAL_PATIENT_ANXIOUS.traits.emotionalState).toBe("anxious");
    expect(DENTAL_PATIENT_ANXIOUS.traits.cooperativeness).toBeLessThan(0.5);
  });

  it("GOV_CONTRACTING_OFFICER has neutral emotional state", () => {
    expect(GOV_CONTRACTING_OFFICER.traits.emotionalState).toBe("neutral");
    expect(GOV_CONTRACTING_OFFICER.traits.techSavviness).toBeGreaterThan(0.5);
  });

  it("all personas have valid trait ranges (0-1)", () => {
    const personas = [DENTAL_PATIENT_LAPSED, DENTAL_PATIENT_ANXIOUS, GOV_CONTRACTING_OFFICER];
    for (const persona of personas) {
      for (const [key, value] of Object.entries(persona.traits)) {
        if (typeof value === "number") {
          expect(value, `${persona.name}.${key}`).toBeGreaterThanOrEqual(0);
          expect(value, `${persona.name}.${key}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
