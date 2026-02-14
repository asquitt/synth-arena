/**
 * ClickHouse trace storage.
 *
 * Writes evaluation trace spans to ClickHouse via its HTTP interface.
 * Supports batch insertion for performance.
 * Falls back gracefully when CLICKHOUSE_URL is not configured.
 */

const CLICKHOUSE_URL = process.env["CLICKHOUSE_URL"] ?? "";
const CLICKHOUSE_USER = process.env["CLICKHOUSE_USER"] ?? "syntharena";
const CLICKHOUSE_PASSWORD = process.env["CLICKHOUSE_PASSWORD"] ?? "syntharena";

export interface TraceSpanRow {
  trace_id: string;
  span_id: string;
  parent_id: string;
  name: string;
  type: "llm_call" | "tool_invocation" | "decision" | "environment_interaction" | "state_transition";
  start_time: string; // ISO datetime
  end_time: string;
  duration_ms: number;
  status: "ok" | "error";
  run_id: string;
  scenario_id: string;
  trial_number: number;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  attributes: string; // JSON string
  events: string; // JSON string
}

async function clickhouseQuery(
  query: string,
  params?: Record<string, string | number>,
  body?: string,
): Promise<string> {
  if (!CLICKHOUSE_URL) throw new Error("CLICKHOUSE_URL not configured");

  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set("query", query);

  // Use ClickHouse parameterized queries to prevent SQL injection
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(`param_${key}`, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method: body ? "POST" : "GET",
    headers: {
      "X-ClickHouse-User": CLICKHOUSE_USER,
      "X-ClickHouse-Key": CLICKHOUSE_PASSWORD,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse error (${res.status}): ${text}`);
  }

  return res.text();
}

/** Insert trace spans in batch via JSONEachRow format. */
export async function insertSpans(spans: TraceSpanRow[]): Promise<void> {
  if (spans.length === 0) return;

  const body = spans.map((s) => JSON.stringify(s)).join("\n");
  await clickhouseQuery(
    "INSERT INTO trace_spans FORMAT JSONEachRow",
    undefined,
    body,
  );
}

/** Query spans for a specific evaluation run. */
export async function getSpansByRunId(runId: string, limit: number = 1000): Promise<TraceSpanRow[]> {
  const result = await clickhouseQuery(
    "SELECT * FROM trace_spans WHERE run_id = {run_id:String} ORDER BY start_time LIMIT {lim:UInt32} FORMAT JSON",
    { run_id: runId, lim: limit },
  );
  const parsed = JSON.parse(result) as { data: TraceSpanRow[] };
  return parsed.data;
}

/** Query spans for a specific trace. */
export async function getSpansByTraceId(traceId: string): Promise<TraceSpanRow[]> {
  const result = await clickhouseQuery(
    "SELECT * FROM trace_spans WHERE trace_id = {trace_id:String} ORDER BY start_time FORMAT JSON",
    { trace_id: traceId },
  );
  const parsed = JSON.parse(result) as { data: TraceSpanRow[] };
  return parsed.data;
}

/** Get cost analytics for a run grouped by model/provider. */
export async function getCostAnalytics(runId: string): Promise<Array<{
  model: string;
  provider: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}>> {
  const result = await clickhouseQuery(
    "SELECT model, provider, count() as total_calls, sum(input_tokens) as total_input_tokens, sum(output_tokens) as total_output_tokens, sum(cost) as total_cost FROM trace_spans WHERE run_id = {run_id:String} AND type = 'llm_call' GROUP BY model, provider FORMAT JSON",
    { run_id: runId },
  );
  const parsed = JSON.parse(result) as { data: Array<Record<string, unknown>> };
  return parsed.data.map((row) => ({
    model: row["model"] as string,
    provider: row["provider"] as string,
    totalCalls: Number(row["total_calls"]),
    totalInputTokens: Number(row["total_input_tokens"]),
    totalOutputTokens: Number(row["total_output_tokens"]),
    totalCost: Number(row["total_cost"]),
  }));
}

/** Check ClickHouse connectivity. Returns latency in ms. */
export async function checkClickHouse(): Promise<number> {
  const start = Date.now();
  await clickhouseQuery("SELECT 1 FORMAT JSON");
  return Date.now() - start;
}
