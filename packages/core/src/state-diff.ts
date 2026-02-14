import type {
  EnvironmentSnapshot,
  StateDelta,
  ClassifiedDelta,
  StateDiffReport,
  StateDiffSummary,
  EvaluationRun,
} from "@syntharena/shared";
import { generateId } from "./utils.js";

/**
 * State-Diff Evaluation Engine
 *
 * Compares environment snapshots before and after agent execution to
 * determine what actually changed — not just what the agent claimed.
 *
 * Key insight from Agent-Diff research (Feb 2026): Grade agents on
 * observable state mutations, not step sequences. This allows agents
 * to find valid alternative paths while catching unintended side effects.
 *
 * Usage:
 *   const report = computeStateDiff(before, after, expectedKeys);
 *   // report.summary.overallScore → 0.0-1.0
 */

// ─── Deep Diff ──────────────────────────────────────────────────────

/**
 * Recursively computes deltas between two state objects.
 * Returns a flat list of path-based changes.
 */
export function deepDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix = "",
): StateDelta[] {
  const deltas: StateDelta[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const bVal = before[key];
    const aVal = after[key];

    if (!(key in before)) {
      deltas.push({ path, type: "added", after: aVal });
    } else if (!(key in after)) {
      deltas.push({ path, type: "removed", before: bVal });
    } else if (isPlainObject(bVal) && isPlainObject(aVal)) {
      deltas.push(
        ...deepDiff(
          bVal as Record<string, unknown>,
          aVal as Record<string, unknown>,
          path,
        ),
      );
    } else if (Array.isArray(bVal) && Array.isArray(aVal)) {
      if (!arraysEqual(bVal, aVal)) {
        deltas.push({ path, type: "modified", before: bVal, after: aVal });
      }
    } else if (!strictEqual(bVal, aVal)) {
      deltas.push({ path, type: "modified", before: bVal, after: aVal });
    }
  }

  return deltas;
}

// ─── Delta Classification ───────────────────────────────────────────

/**
 * Classifies each delta as intended, collateral, or unknown based on
 * the expected state keys from the scenario definition.
 */
export function classifyDeltas(
  deltas: StateDelta[],
  expectedKeys: string[],
  collateralKeys?: string[],
): ClassifiedDelta[] {
  const expectedSet = new Set(expectedKeys);
  const collateralSet = new Set(collateralKeys ?? []);

  return deltas.map((delta) => {
    const rootKey = delta.path.split(".")[0]!;

    // If this path (or its root) is in expected keys → intended
    if (expectedSet.has(delta.path) || expectedSet.has(rootKey)) {
      return {
        ...delta,
        classification: "intended" as const,
        severity: "info" as const,
        reason: "Matches expected state change",
      };
    }

    // If this path is in collateral watchlist → collateral
    if (collateralSet.has(delta.path) || collateralSet.has(rootKey)) {
      const severity = delta.type === "removed" ? "critical" as const : "warning" as const;
      return {
        ...delta,
        classification: "collateral" as const,
        severity,
        reason: `Unexpected change to watched key: ${delta.path}`,
      };
    }

    // Unknown — not in either list
    return {
      ...delta,
      classification: "unknown" as const,
      severity: delta.type === "removed" ? "warning" as const : "info" as const,
      reason: "Change not in expected or watched keys",
    };
  });
}

// ─── Scoring ────────────────────────────────────────────────────────

/**
 * Computes a summary with completeness, side-effect, and overall scores.
 *
 * Completeness: What fraction of expected changes actually happened?
 * Side-effect: How clean was the execution? (penalizes collateral damage)
 * Overall: Weighted combination (70% completeness, 30% side-effect)
 */
export function computeDiffSummary(
  classified: ClassifiedDelta[],
  expectedKeys: string[],
): StateDiffSummary {
  const intended = classified.filter((d) => d.classification === "intended").length;
  const collateral = classified.filter((d) => d.classification === "collateral").length;
  const unknown = classified.filter((d) => d.classification === "unknown").length;
  const criticalIssues = classified.filter((d) => d.severity === "critical").length;

  // Completeness: How many expected keys were actually changed?
  const expectedCount = expectedKeys.length || 1;
  const completenessScore = Math.min(1, intended / expectedCount);

  // Side-effect score: 1.0 = perfectly clean, lower = more collateral
  const totalChanges = classified.length || 1;
  const unwanted = collateral + unknown;
  const sideEffectScore = Math.max(0, 1 - unwanted / totalChanges);

  // Weighted overall (completeness matters more than cleanliness)
  const overallScore = 0.7 * completenessScore + 0.3 * sideEffectScore;

  return {
    totalChanges: classified.length,
    intended,
    collateral,
    unknown,
    criticalIssues,
    completenessScore: round(completenessScore),
    sideEffectScore: round(sideEffectScore),
    overallScore: round(overallScore),
  };
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Compute a full state-diff report from before/after snapshots.
 */
export function computeStateDiff(
  before: EnvironmentSnapshot,
  after: EnvironmentSnapshot,
  expectedKeys: string[],
  opts?: {
    runId?: string;
    scenarioId?: string;
    collateralKeys?: string[];
  },
): StateDiffReport {
  const deltas = deepDiff(before.state, after.state);
  const classified = classifyDeltas(deltas, expectedKeys, opts?.collateralKeys);
  const summary = computeDiffSummary(classified, expectedKeys);

  return {
    id: `diff-${generateId()}`,
    runId: opts?.runId ?? "unknown",
    scenarioId: opts?.scenarioId ?? "unknown",
    before,
    after,
    deltas: classified,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a state-diff report from an evaluation run.
 * Extracts before/after snapshots from scenario metadata and output.
 */
export function generateStateDiffReport(
  run: EvaluationRun,
  scenarioId: string,
  beforeSnapshot: EnvironmentSnapshot,
  afterSnapshot: EnvironmentSnapshot,
): StateDiffReport {
  const scenario = run.config.dataset?.find((s) => s.id === scenarioId);
  const expectedKeys = scenario?.expected ? Object.keys(scenario.expected) : [];

  return computeStateDiff(beforeSnapshot, afterSnapshot, expectedKeys, {
    runId: run.id,
    scenarioId,
    collateralKeys: (scenario?.metadata?.tags as string[]) ?? [],
  });
}

// ─── State-Diff Scorer ──────────────────────────────────────────────

/**
 * Enhanced state-diff scorer that uses the deep diff engine.
 * Drop-in replacement for the basic stateDiff grader.
 *
 * Pass before/after snapshots via metadata:
 *   metadata: { beforeState: {...}, afterState: {...} }
 */
export function stateDiffScorer(opts: {
  expectedKeys: string[];
  collateralKeys?: string[];
  completenessWeight?: number;
  sideEffectWeight?: number;
}) {
  const cWeight = opts.completenessWeight ?? 0.7;
  const seWeight = opts.sideEffectWeight ?? 0.3;

  return async (ctx: {
    input: Record<string, unknown>;
    output: unknown;
    expected?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) => {
    const beforeState = (ctx.metadata?.["beforeState"] as Record<string, unknown>) ?? {};
    const afterState =
      typeof ctx.output === "object" && ctx.output !== null
        ? (ctx.output as Record<string, unknown>)
        : {};

    const before: EnvironmentSnapshot = {
      timestamp: new Date().toISOString(),
      label: "before",
      state: beforeState,
    };

    const after: EnvironmentSnapshot = {
      timestamp: new Date().toISOString(),
      label: "after",
      state: afterState,
    };

    const deltas = deepDiff(before.state, after.state);
    const classified = classifyDeltas(deltas, opts.expectedKeys, opts.collateralKeys);
    const summary = computeDiffSummary(classified, opts.expectedKeys);

    // Use custom weights if provided
    const score = cWeight * summary.completenessScore + seWeight * summary.sideEffectScore;

    const passed = summary.criticalIssues === 0 && summary.completenessScore >= 0.8;

    const reasons: string[] = [];
    if (summary.criticalIssues > 0) {
      reasons.push(`${summary.criticalIssues} critical issue(s)`);
    }
    if (summary.collateral > 0) {
      reasons.push(`${summary.collateral} collateral change(s)`);
    }
    if (summary.completenessScore < 1) {
      reasons.push(`completeness ${(summary.completenessScore * 100).toFixed(0)}%`);
    }

    return {
      name: "state_diff_v2",
      score: round(score),
      passed,
      reason: reasons.length > 0 ? reasons.join("; ") : undefined,
      metadata: {
        totalChanges: summary.totalChanges,
        intended: summary.intended,
        collateral: summary.collateral,
        unknown: summary.unknown,
        criticalIssues: summary.criticalIssues,
        completenessScore: summary.completenessScore,
        sideEffectScore: summary.sideEffectScore,
        deltas: classified.map((d) => ({
          path: d.path,
          type: d.type,
          classification: d.classification,
          severity: d.severity,
        })),
      },
    };
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function strictEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < Number.EPSILON;
  }
  return false;
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => {
    if (isPlainObject(val) && isPlainObject(b[i])) {
      return deepDiff(val as Record<string, unknown>, b[i] as Record<string, unknown>).length === 0;
    }
    return strictEqual(val, b[i]);
  });
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
