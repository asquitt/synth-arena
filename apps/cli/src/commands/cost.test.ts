import { describe, it, expect, vi, beforeEach } from "vitest";
import { costCommand } from "./cost.js";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("costCommand", () => {
  it("displays cost estimate for valid model", async () => {
    await costCommand({
      domain: "web-scraping",
      scenarios: "100",
      trials: "3",
      model: "claude-sonnet-4-20250514",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Cost");
    expect(logs).toContain("$");
    expect(logs).toContain("claude-sonnet-4-20250514");
  });

  it("shows error for unknown model", async () => {
    await costCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      model: "nonexistent-model",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Unknown model");
  });

  it("includes model comparison section", async () => {
    await costCommand({
      domain: "web-scraping",
      scenarios: "50",
      trials: "3",
      model: "claude-sonnet-4-20250514",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Model Comparison");
    expect(logs).toContain("selected");
  });

  it("handles cache rate option", async () => {
    await costCommand({
      domain: "web-scraping",
      scenarios: "100",
      trials: "3",
      model: "claude-sonnet-4-20250514",
      cacheRate: "0.5",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Cache rate");
    expect(logs).toContain("50%");
  });

  it("shows optimization recommendations for expensive models", async () => {
    await costCommand({
      domain: "web-scraping",
      scenarios: "100",
      trials: "3",
      model: "claude-opus-4-20250514",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Optimization Recommendations");
  });

  it("handles calls-per-scenario option", async () => {
    await costCommand({
      domain: "web-scraping",
      scenarios: "10",
      trials: "1",
      model: "claude-sonnet-4-20250514",
      callsPerScenario: "5",
    });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Calls/scen");
    expect(logs).toContain("5");
  });
});
