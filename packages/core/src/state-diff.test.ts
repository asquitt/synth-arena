import { describe, it, expect } from "vitest";
import {
  deepDiff,
  classifyDeltas,
  computeDiffSummary,
  computeStateDiff,
  stateDiffScorer,
} from "./state-diff.js";
import type { EnvironmentSnapshot } from "@syntharena/shared";

// ─── deepDiff ───────────────────────────────────────────────────────

describe("deepDiff", () => {
  it("detects added keys", () => {
    const deltas = deepDiff({}, { name: "Alice" });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ path: "name", type: "added", after: "Alice" });
  });

  it("detects removed keys", () => {
    const deltas = deepDiff({ name: "Alice" }, {});
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ path: "name", type: "removed", before: "Alice" });
  });

  it("detects modified values", () => {
    const deltas = deepDiff({ count: 1 }, { count: 5 });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ path: "count", type: "modified", before: 1, after: 5 });
  });

  it("returns empty for identical objects", () => {
    const state = { a: 1, b: "two", c: true };
    expect(deepDiff(state, { ...state })).toHaveLength(0);
  });

  it("diffs nested objects recursively", () => {
    const before = { user: { name: "Alice", age: 30 } };
    const after = { user: { name: "Alice", age: 31 } };
    const deltas = deepDiff(before, after);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ path: "user.age", type: "modified", before: 30, after: 31 });
  });

  it("diffs deeply nested paths", () => {
    const before = { db: { users: { count: 10 } } };
    const after = { db: { users: { count: 11 } } };
    const deltas = deepDiff(before, after);
    expect(deltas[0]!.path).toBe("db.users.count");
  });

  it("detects array modifications", () => {
    const before = { items: [1, 2, 3] };
    const after = { items: [1, 2, 4] };
    const deltas = deepDiff(before, after);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.type).toBe("modified");
  });

  it("treats identical arrays as unchanged", () => {
    const before = { tags: ["a", "b"] };
    const after = { tags: ["a", "b"] };
    expect(deepDiff(before, after)).toHaveLength(0);
  });

  it("handles multiple changes across keys", () => {
    const before = { a: 1, b: 2, c: 3 };
    const after = { a: 1, b: 99, d: 4 };
    const deltas = deepDiff(before, after);
    expect(deltas).toHaveLength(3); // b modified, c removed, d added
    const types = deltas.map((d) => d.type).sort();
    expect(types).toEqual(["added", "modified", "removed"]);
  });

  it("handles null vs object", () => {
    const deltas = deepDiff({ data: null }, { data: "value" });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.type).toBe("modified");
  });
});

// ─── classifyDeltas ─────────────────────────────────────────────────

describe("classifyDeltas", () => {
  it("classifies expected changes as intended", () => {
    const deltas = deepDiff({ status: "pending" }, { status: "complete" });
    const classified = classifyDeltas(deltas, ["status"]);
    expect(classified[0]!.classification).toBe("intended");
    expect(classified[0]!.severity).toBe("info");
  });

  it("classifies watched changes as collateral", () => {
    const deltas = deepDiff({ cache: "old" }, { cache: "cleared" });
    const classified = classifyDeltas(deltas, [], ["cache"]);
    expect(classified[0]!.classification).toBe("collateral");
    expect(classified[0]!.severity).toBe("warning");
  });

  it("marks removed collateral keys as critical", () => {
    const deltas = deepDiff({ important: "data" }, {});
    const classified = classifyDeltas(deltas, [], ["important"]);
    expect(classified[0]!.classification).toBe("collateral");
    expect(classified[0]!.severity).toBe("critical");
  });

  it("classifies unrecognized changes as unknown", () => {
    const deltas = deepDiff({}, { mystery: "value" });
    const classified = classifyDeltas(deltas, ["expected_key"]);
    expect(classified[0]!.classification).toBe("unknown");
  });

  it("matches nested paths by root key", () => {
    const deltas = deepDiff(
      { user: { name: "A" } },
      { user: { name: "B" } },
    );
    const classified = classifyDeltas(deltas, ["user"]);
    expect(classified[0]!.classification).toBe("intended");
  });
});

// ─── computeDiffSummary ─────────────────────────────────────────────

describe("computeDiffSummary", () => {
  it("scores perfectly clean execution", () => {
    const deltas = deepDiff({ status: "pending" }, { status: "done" });
    const classified = classifyDeltas(deltas, ["status"]);
    const summary = computeDiffSummary(classified, ["status"]);

    expect(summary.completenessScore).toBe(1);
    expect(summary.sideEffectScore).toBe(1);
    expect(summary.overallScore).toBe(1);
    expect(summary.collateral).toBe(0);
  });

  it("penalizes incomplete execution", () => {
    const deltas = deepDiff({ a: 1 }, { a: 2 }); // only changed 'a'
    const classified = classifyDeltas(deltas, ["a", "b", "c"]);
    const summary = computeDiffSummary(classified, ["a", "b", "c"]);

    expect(summary.completenessScore).toBeCloseTo(1 / 3, 2);
    expect(summary.intended).toBe(1);
  });

  it("penalizes collateral damage", () => {
    const before = { target: 1, other: "safe" };
    const after = { target: 2, other: "changed" };
    const deltas = deepDiff(before, after);
    const classified = classifyDeltas(deltas, ["target"], ["other"]);
    const summary = computeDiffSummary(classified, ["target"]);

    expect(summary.collateral).toBe(1);
    expect(summary.sideEffectScore).toBe(0.5);
  });

  it("tracks critical issues", () => {
    const deltas = deepDiff({ critical: "data" }, {});
    const classified = classifyDeltas(deltas, [], ["critical"]);
    const summary = computeDiffSummary(classified, []);

    expect(summary.criticalIssues).toBe(1);
  });

  it("handles empty changes", () => {
    const summary = computeDiffSummary([], []);
    expect(summary.totalChanges).toBe(0);
    expect(summary.overallScore).toBeGreaterThanOrEqual(0);
  });
});

// ─── computeStateDiff ───────────────────────────────────────────────

describe("computeStateDiff", () => {
  const makeBefore = (state: Record<string, unknown>): EnvironmentSnapshot => ({
    timestamp: "2026-01-01T00:00:00Z",
    label: "before",
    state,
  });

  const makeAfter = (state: Record<string, unknown>): EnvironmentSnapshot => ({
    timestamp: "2026-01-01T00:01:00Z",
    label: "after",
    state,
  });

  it("produces a complete report", () => {
    const report = computeStateDiff(
      makeBefore({ cart: [], total: 0 }),
      makeAfter({ cart: ["item-1"], total: 29.99 }),
      ["cart", "total"],
      { runId: "run-1", scenarioId: "scenario-1" },
    );

    expect(report.id).toMatch(/^diff-/);
    expect(report.runId).toBe("run-1");
    expect(report.scenarioId).toBe("scenario-1");
    expect(report.deltas.length).toBeGreaterThan(0);
    expect(report.summary.overallScore).toBe(1);
    expect(report.generatedAt).toBeDefined();
  });

  it("detects collateral changes", () => {
    const report = computeStateDiff(
      makeBefore({ target: "old", unrelated: "safe" }),
      makeAfter({ target: "new", unrelated: "damaged" }),
      ["target"],
      { collateralKeys: ["unrelated"] },
    );

    expect(report.summary.collateral).toBe(1);
    expect(report.summary.overallScore).toBeLessThan(1);
  });

  it("handles no changes scenario", () => {
    const state = { a: 1, b: 2 };
    const report = computeStateDiff(makeBefore(state), makeAfter(state), ["a"]);

    expect(report.deltas).toHaveLength(0);
    expect(report.summary.totalChanges).toBe(0);
  });
});

// ─── stateDiffScorer ────────────────────────────────────────────────

describe("stateDiffScorer", () => {
  it("passes for clean intended changes", async () => {
    const scorer = stateDiffScorer({ expectedKeys: ["status", "result"] });
    const result = await scorer({
      input: { task: "update status" },
      output: { status: "done", result: "success" },
      metadata: { beforeState: { status: "pending", result: null } },
    });

    expect(result.name).toBe("state_diff_v2");
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it("fails for critical collateral damage", async () => {
    const scorer = stateDiffScorer({
      expectedKeys: ["target"],
      collateralKeys: ["important_data"],
    });

    const result = await scorer({
      input: {},
      output: { target: "updated" },
      metadata: { beforeState: { target: "old", important_data: "sensitive" } },
    });

    // important_data removed → critical collateral
    expect(result.passed).toBe(false);
    expect(result.metadata?.["criticalIssues"]).toBe(1);
  });

  it("reports partial completeness", async () => {
    const scorer = stateDiffScorer({ expectedKeys: ["a", "b", "c"] });
    const result = await scorer({
      input: {},
      output: { a: "changed" },
      metadata: { beforeState: { a: "old" } },
    });

    expect(result.passed).toBe(false); // completeness < 0.8
    const completeness = result.metadata?.["completenessScore"] as number;
    expect(completeness).toBeCloseTo(1 / 3, 1);
  });

  it("works without beforeState in metadata", async () => {
    const scorer = stateDiffScorer({ expectedKeys: ["data"] });
    const result = await scorer({
      input: {},
      output: { data: "value" },
    });

    // data added (wasn't in empty before) → intended
    expect(result.score).toBeGreaterThan(0);
  });

  it("uses custom weights", async () => {
    const scorer = stateDiffScorer({
      expectedKeys: ["target"],
      completenessWeight: 0.5,
      sideEffectWeight: 0.5,
    });

    const result = await scorer({
      input: {},
      output: { target: "done" },
      metadata: { beforeState: { target: "old" } },
    });

    expect(result.score).toBe(1);
  });
});
