import { describe, it, expect } from "vitest";
import {
  contextRetention,
  conversationCoherence,
  turnEfficiency,
  goalCompletion,
} from "./conversation-scorers.js";
import type { ScorerContext } from "@syntharena/shared";

function makeCtx(messages: Array<{ role: string; content: string }>): ScorerContext {
  return {
    input: { query: "test" },
    output: messages,
  };
}

describe("contextRetention", () => {
  it("passes when agent retains entities from early turns", async () => {
    const scorer = contextRetention();
    const result = await scorer(makeCtx([
      { role: "user", content: "My name is Alice and I live in Portland" },
      { role: "assistant", content: "Nice to meet you, Alice!" },
      { role: "user", content: "What restaurants do you recommend?" },
      { role: "assistant", content: "Alice, here are some great places in Portland." },
    ]));
    expect(result.name).toBe("context_retention");
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("fails when agent forgets entities", async () => {
    const scorer = contextRetention({ minRetention: 0.8 });
    const result = await scorer(makeCtx([
      { role: "user", content: "I need help with Project Mercury for Acme Corp" },
      { role: "assistant", content: "Sure, what do you need?" },
      { role: "user", content: "How is the timeline?" },
      { role: "assistant", content: "The timeline looks fine." },
    ]));
    expect(result.name).toBe("context_retention");
    // "Mercury" and "Acme" should be entities, but assistant doesn't mention them
    expect(result.score).toBeLessThan(1);
  });

  it("passes trivially with too few turns", async () => {
    const scorer = contextRetention();
    const result = await scorer(makeCtx([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ]));
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toContain("Too few turns");
  });

  it("handles output with messages key", async () => {
    const scorer = contextRetention();
    const result = await scorer({
      input: { query: "test" },
      output: {
        messages: [
          { role: "user", content: "I work at Google in Mountain View" },
          { role: "assistant", content: "Got it, Google employee." },
          { role: "user", content: "Find me lunch spots" },
          { role: "assistant", content: "Here are lunch spots near Mountain View for you at Google." },
        ],
      },
    });
    expect(result.passed).toBe(true);
  });

  it("passes when no entities to track", async () => {
    const scorer = contextRetention();
    const result = await scorer(makeCtx([
      { role: "user", content: "hello there" },
      { role: "assistant", content: "hi!" },
      { role: "user", content: "how are you" },
      { role: "assistant", content: "fine thanks" },
    ]));
    expect(result.passed).toBe(true);
    expect(result.reason).toContain("No entities");
  });
});

describe("conversationCoherence", () => {
  it("passes for coherent conversation", async () => {
    const scorer = conversationCoherence();
    const result = await scorer(makeCtx([
      { role: "user", content: "Tell me about machine learning" },
      { role: "assistant", content: "Machine learning is a branch of AI that enables systems to learn from data." },
      { role: "user", content: "What are common algorithms?" },
      { role: "assistant", content: "Common algorithms include decision trees, neural networks, and SVMs." },
    ]));
    expect(result.name).toBe("conversation_coherence");
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("detects repeated responses", async () => {
    const scorer = conversationCoherence();
    const result = await scorer(makeCtx([
      { role: "user", content: "What is the weather?" },
      { role: "assistant", content: "The weather today is sunny and warm with clear skies and no rain expected." },
      { role: "user", content: "What about tomorrow?" },
      { role: "assistant", content: "The weather today is sunny and warm with clear skies and no rain expected." },
    ]));
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(1);
  });

  it("detects trivially short responses", async () => {
    const scorer = conversationCoherence();
    const result = await scorer(makeCtx([
      { role: "user", content: "Explain quantum computing" },
      { role: "assistant", content: "Ok." },
      { role: "user", content: "Can you elaborate?" },
      { role: "assistant", content: "Sure, quantum computing uses quantum mechanics principles like superposition and entanglement to process information." },
    ]));
    expect(result.passed).toBe(false);
    expect(result.metadata?.["issues"]).toBeDefined();
  });

  it("passes with single assistant message", async () => {
    const scorer = conversationCoherence();
    const result = await scorer(makeCtx([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ]));
    expect(result.passed).toBe(true);
    expect(result.reason).toContain("Too few");
  });
});

describe("turnEfficiency", () => {
  it("passes when within turn limits", async () => {
    const scorer = turnEfficiency({ maxTurns: 10 });
    const result = await scorer(makeCtx([
      { role: "user", content: "Book a flight to NYC" },
      { role: "assistant", content: "I found flights. Which one?" },
      { role: "user", content: "The cheapest one" },
      { role: "assistant", content: "Booked! Flight AA123." },
    ]));
    expect(result.name).toBe("turn_efficiency");
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when exceeding turn limit", async () => {
    const scorer = turnEfficiency({ maxTurns: 4 });
    const messages = [];
    for (let i = 0; i < 5; i++) {
      messages.push({ role: "user", content: `Question ${i}` });
      messages.push({ role: "assistant", content: `Answer ${i}` });
    }
    const result = await scorer(makeCtx(messages));
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(1);
  });

  it("respects maxAssistantTurns separately", async () => {
    const scorer = turnEfficiency({ maxTurns: 20, maxAssistantTurns: 2 });
    const result = await scorer(makeCtx([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "A2" },
      { role: "user", content: "Q3" },
      { role: "assistant", content: "A3" },
    ]));
    expect(result.passed).toBe(false);
    expect(result.metadata?.["assistantTurns"]).toBe(3);
  });

  it("scores proportionally", async () => {
    const scorer = turnEfficiency({ maxTurns: 4 });
    const result = await scorer(makeCtx([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "A2" },
      { role: "user", content: "Q3" },
      { role: "assistant", content: "A3" },
      { role: "user", content: "Q4" },
      { role: "assistant", content: "A4" },
    ]));
    // 8 total turns vs max 4 → score = 4/8 = 0.5
    expect(result.score).toBe(0.5);
  });
});

describe("goalCompletion", () => {
  it("detects successful completion", async () => {
    const scorer = goalCompletion();
    const result = await scorer(makeCtx([
      { role: "user", content: "Help me find a recipe" },
      { role: "assistant", content: "Here's a pasta recipe for you." },
      { role: "user", content: "Thanks, that's perfect!" },
    ]));
    expect(result.name).toBe("goal_completion");
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("detects failure signals", async () => {
    const scorer = goalCompletion();
    const result = await scorer(makeCtx([
      { role: "user", content: "Fix my code" },
      { role: "assistant", content: "Here's a fix." },
      { role: "user", content: "That's not what I asked. Never mind." },
    ]));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("scores ambiguous endings as 0.5", async () => {
    const scorer = goalCompletion();
    const result = await scorer(makeCtx([
      { role: "user", content: "Tell me about dogs" },
      { role: "assistant", content: "Dogs are domesticated mammals." },
      { role: "user", content: "Okay" },
    ]));
    // "Okay" is neither a completion nor failure signal
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(false); // 0.5 < 0.7 threshold
  });

  it("handles empty conversation", async () => {
    const scorer = goalCompletion();
    const result = await scorer(makeCtx([]));
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("supports custom signals", async () => {
    const scorer = goalCompletion({
      completionSignals: ["resolved", "closed"],
      failureSignals: ["escalate", "timeout"],
    });
    const result = await scorer(makeCtx([
      { role: "user", content: "Issue #42" },
      { role: "assistant", content: "I've marked issue #42 as resolved." },
    ]));
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("failure signal overrides completion signal", async () => {
    const scorer = goalCompletion();
    const result = await scorer(makeCtx([
      { role: "user", content: "Thanks but this isn't working" },
    ]));
    // Has both "thanks" (completion) and "isn't working" (failure)
    expect(result.score).toBe(0);
  });
});
