import type { EvaluationRun, EvaluationSummary, ScenarioResult, TrialResult } from "@syntharena/shared";
import { sql } from "../db.js";

// postgres.js TransactionSql extends Omit<Sql, ...> which drops call signatures in strict TS.
// This helper type restores the tagged template literal call.
type TxSql = typeof sql;

/**
 * Evaluation repository — PostgreSQL persistence for evaluation runs.
 *
 * Maps between the application's EvaluationRun type and the database
 * schema (evaluation_runs + scenario_results + trial_results tables).
 */

interface EvalRunRow {
  id: string;
  name: string;
  status: string;
  domain: string | null;
  config: Record<string, unknown>;
  summary: Record<string, unknown> | null;
  created_at: Date;
  completed_at: Date | null;
}

interface ScenarioResultRow {
  id: string;
  run_id: string;
  scenario_id: string;
  pass_at_k: number;
  pass_to_the_k: number;
  g_pass_at_k: number;
  aggregated_scores: Record<string, unknown>;
  trial_count: number;
}

interface TrialResultRow {
  id: string;
  scenario_result_id: string;
  trial_number: number;
  passed: boolean;
  scores: unknown[];
  token_usage: Record<string, unknown> | null;
  duration_ms: number | null;
  trace_id: string | null;
}

/** Save a complete evaluation run (run + scenario results + trial results). */
export async function saveEvaluationRun(run: EvaluationRun): Promise<void> {
  const domain = (run.config.metadata as Record<string, unknown> | undefined)?.["domain"] as string ?? null;
  const configJson = JSON.stringify(run.config);
  const summaryJson = run.summary ? JSON.stringify(run.summary) : null;

  await sql.begin(async (_tx) => {
    const tx = _tx as unknown as TxSql;
    await tx`
      INSERT INTO evaluation_runs (id, name, status, domain, config, summary, created_at, completed_at)
      VALUES (
        ${run.id}, ${run.name}, ${run.status}, ${domain},
        ${configJson}::jsonb, ${summaryJson}::jsonb,
        ${run.createdAt}, ${run.completedAt ?? null}
      )
    `;

    for (const sr of run.results) {
      const scoresJson = JSON.stringify(sr.aggregatedScores);
      const [row] = await tx`
        INSERT INTO scenario_results (run_id, scenario_id, pass_at_k, pass_to_the_k, g_pass_at_k, aggregated_scores, trial_count)
        VALUES (
          ${run.id}, ${sr.scenarioId}, ${sr.passAtK}, ${sr.passToTheK}, ${sr.gPassAtK},
          ${scoresJson}::jsonb, ${sr.trials.length}
        )
        RETURNING id
      `;

      if (sr.trials.length > 0 && row) {
        for (const t of sr.trials) {
          const trialScoresJson = JSON.stringify(t.scores);
          const tokenJson = t.taskResult.tokenUsage ? JSON.stringify(t.taskResult.tokenUsage) : null;
          await tx`
            INSERT INTO trial_results (scenario_result_id, trial_number, passed, scores, token_usage, duration_ms)
            VALUES (
              ${row.id as string}, ${t.trialNumber}, ${t.passed},
              ${trialScoresJson}::jsonb, ${tokenJson}::jsonb, ${t.taskResult.duration}
            )
          `;
        }
      }
    }
  });
}

/** List evaluation runs (metadata only, no results). */
export async function listEvaluationRuns(opts?: {
  limit?: number;
  offset?: number;
  domain?: string;
  status?: string;
}): Promise<{ runs: Omit<EvaluationRun, "results" | "config">[]; total: number }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rows = await sql<EvalRunRow[]>`
    SELECT id, name, status, domain, summary, created_at, completed_at
    FROM evaluation_runs
    WHERE (${opts?.domain ?? null}::text IS NULL OR domain = ${opts?.domain ?? null})
      AND (${opts?.status ?? null}::text IS NULL OR status = ${opts?.status ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [countRow] = await sql`
    SELECT count(*)::int as total FROM evaluation_runs
    WHERE (${opts?.domain ?? null}::text IS NULL OR domain = ${opts?.domain ?? null})
      AND (${opts?.status ?? null}::text IS NULL OR status = ${opts?.status ?? null})
  `;

  return {
    runs: rows.map(rowToRunSummary),
    total: (countRow?.total as number) ?? 0,
  };
}

/** Get a single evaluation run with all results. */
export async function getEvaluationRun(id: string): Promise<EvaluationRun | null> {
  const [row] = await sql<EvalRunRow[]>`
    SELECT id, name, status, domain, config, summary, created_at, completed_at
    FROM evaluation_runs WHERE id = ${id}
  `;
  if (!row) return null;

  const scenarioRows = await sql<ScenarioResultRow[]>`
    SELECT id, run_id, scenario_id, pass_at_k, pass_to_the_k, g_pass_at_k,
           aggregated_scores, trial_count
    FROM scenario_results WHERE run_id = ${id}
  `;

  const results: ScenarioResult[] = [];
  for (const sr of scenarioRows) {
    const trialRows = await sql<TrialResultRow[]>`
      SELECT id, scenario_result_id, trial_number, passed, scores, token_usage, duration_ms, trace_id
      FROM trial_results WHERE scenario_result_id = ${sr.id}
      ORDER BY trial_number
    `;

    results.push({
      scenarioId: sr.scenario_id,
      passAtK: sr.pass_at_k,
      passToTheK: sr.pass_to_the_k,
      gPassAtK: sr.g_pass_at_k ?? 0,
      aggregatedScores: sr.aggregated_scores as ScenarioResult["aggregatedScores"],
      trials: trialRows.map(trialRowToTrial),
    });
  }

  return {
    id: row.id,
    name: row.name,
    status: row.status as EvaluationRun["status"],
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    config: row.config as EvaluationRun["config"],
    results,
    summary: row.summary as unknown as EvaluationSummary,
  };
}

/** Delete an evaluation run and all associated data (cascades). */
export async function deleteEvaluationRun(id: string): Promise<boolean> {
  const result = await sql`DELETE FROM evaluation_runs WHERE id = ${id}`;
  return result.count > 0;
}

/** Update run status and summary (e.g., on completion). */
export async function updateEvaluationStatus(
  id: string,
  status: string,
  summary?: EvaluationSummary,
): Promise<void> {
  const summaryJson = summary ? JSON.stringify(summary) : null;
  if (summaryJson) {
    await sql`
      UPDATE evaluation_runs
      SET status = ${status}, summary = ${summaryJson}::jsonb,
          completed_at = ${status === "completed" || status === "failed" ? sql`NOW()` : sql`completed_at`},
          updated_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql`
      UPDATE evaluation_runs
      SET status = ${status},
          completed_at = ${status === "completed" || status === "failed" ? sql`NOW()` : sql`completed_at`},
          updated_at = NOW()
      WHERE id = ${id}
    `;
  }
}

// ─── Row Mappers ────────────────────────────────────────────────────

function rowToRunSummary(row: EvalRunRow): Omit<EvaluationRun, "results" | "config"> {
  return {
    id: row.id,
    name: row.name,
    status: row.status as EvaluationRun["status"],
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    summary: row.summary as unknown as EvaluationSummary,
  };
}

function trialRowToTrial(row: TrialResultRow): TrialResult {
  const tokenUsage = row.token_usage as Record<string, unknown> | null;
  return {
    trialNumber: row.trial_number,
    passed: row.passed,
    scores: row.scores as TrialResult["scores"],
    taskResult: {
      output: null,
      trace: [],
      tokenUsage: {
        inputTokens: (tokenUsage?.["inputTokens"] as number) ?? 0,
        outputTokens: (tokenUsage?.["outputTokens"] as number) ?? 0,
        totalTokens: (tokenUsage?.["totalTokens"] as number) ?? 0,
        estimatedCost: (tokenUsage?.["estimatedCost"] as number) ?? 0,
        model: (tokenUsage?.["model"] as string) ?? "unknown",
        provider: (tokenUsage?.["provider"] as string) ?? "unknown",
      },
      duration: row.duration_ms ?? 0,
    },
  };
}
