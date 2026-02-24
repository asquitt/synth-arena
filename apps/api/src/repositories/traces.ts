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

/** Latency percentiles for a run, grouped by model. */
export interface LatencyPercentiles {
  model: string;
  provider: string;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  count: number;
}

export async function getLatencyPercentiles(runId: string): Promise<LatencyPercentiles[]> {
  const result = await clickhouseQuery(
    `SELECT model, provider,
      quantile(0.5)(duration_ms) as p50,
      quantile(0.75)(duration_ms) as p75,
      quantile(0.95)(duration_ms) as p95,
      quantile(0.99)(duration_ms) as p99,
      min(duration_ms) as min_val,
      max(duration_ms) as max_val,
      avg(duration_ms) as mean_val,
      count() as cnt
    FROM trace_spans
    WHERE run_id = {run_id:String}
    GROUP BY model, provider
    FORMAT JSON`,
    { run_id: runId },
  );
  const parsed = JSON.parse(result) as { data: Array<Record<string, unknown>> };
  return parsed.data.map((row) => ({
    model: row["model"] as string,
    provider: row["provider"] as string,
    p50: Number(row["p50"]),
    p75: Number(row["p75"]),
    p95: Number(row["p95"]),
    p99: Number(row["p99"]),
    min: Number(row["min_val"]),
    max: Number(row["max_val"]),
    mean: Number(row["mean_val"]),
    count: Number(row["cnt"]),
  }));
}

/** Error rate analytics: counts by scenario and status. */
export interface ErrorAnalytics {
  scenarioId: string;
  model: string;
  totalSpans: number;
  errorSpans: number;
  errorRate: number;
}

export async function getErrorAnalytics(runId: string): Promise<ErrorAnalytics[]> {
  const result = await clickhouseQuery(
    `SELECT scenario_id, model,
      count() as total_spans,
      countIf(status = 'error') as error_spans,
      countIf(status = 'error') / count() as error_rate
    FROM trace_spans
    WHERE run_id = {run_id:String}
    GROUP BY scenario_id, model
    HAVING error_spans > 0
    ORDER BY error_rate DESC
    FORMAT JSON`,
    { run_id: runId },
  );
  const parsed = JSON.parse(result) as { data: Array<Record<string, unknown>> };
  return parsed.data.map((row) => ({
    scenarioId: row["scenario_id"] as string,
    model: row["model"] as string,
    totalSpans: Number(row["total_spans"]),
    errorSpans: Number(row["error_spans"]),
    errorRate: Number(row["error_rate"]),
  }));
}

/** Token usage aggregated by time bucket (hour). */
export interface TokenUsageBucket {
  bucket: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  callCount: number;
}

export async function getTokenUsageTrends(
  runId: string,
  intervalHours: number = 1,
): Promise<TokenUsageBucket[]> {
  const result = await clickhouseQuery(
    `SELECT
      toStartOfInterval(parseDateTimeBestEffort(start_time), INTERVAL {interval_h:UInt32} HOUR) as bucket,
      model,
      sum(input_tokens) as input_tokens,
      sum(output_tokens) as output_tokens,
      sum(input_tokens + output_tokens) as total_tokens,
      sum(cost) as total_cost,
      count() as call_count
    FROM trace_spans
    WHERE run_id = {run_id:String} AND type = 'llm_call'
    GROUP BY bucket, model
    ORDER BY bucket
    FORMAT JSON`,
    { run_id: runId, interval_h: intervalHours },
  );
  const parsed = JSON.parse(result) as { data: Array<Record<string, unknown>> };
  return parsed.data.map((row) => ({
    bucket: String(row["bucket"]),
    model: row["model"] as string,
    inputTokens: Number(row["input_tokens"]),
    outputTokens: Number(row["output_tokens"]),
    totalTokens: Number(row["total_tokens"]),
    totalCost: Number(row["total_cost"]),
    callCount: Number(row["call_count"]),
  }));
}

/** Scenario performance: pass/fail rate per scenario across runs. */
export interface ScenarioPerformance {
  scenarioId: string;
  runId: string;
  totalTrials: number;
  passedTrials: number;
  passRate: number;
  avgDuration: number;
  avgCost: number;
}

export async function getScenarioPerformance(scenarioId: string, limit: number = 50): Promise<ScenarioPerformance[]> {
  const result = await clickhouseQuery(
    `SELECT scenario_id, run_id,
      count() as total_trials,
      countIf(status = 'ok') as passed_trials,
      countIf(status = 'ok') / count() as pass_rate,
      avg(duration_ms) as avg_duration,
      avg(cost) as avg_cost
    FROM trace_spans
    WHERE scenario_id = {scenario_id:String}
    GROUP BY scenario_id, run_id
    ORDER BY run_id DESC
    LIMIT {lim:UInt32}
    FORMAT JSON`,
    { scenario_id: scenarioId, lim: limit },
  );
  const parsed = JSON.parse(result) as { data: Array<Record<string, unknown>> };
  return parsed.data.map((row) => ({
    scenarioId: row["scenario_id"] as string,
    runId: row["run_id"] as string,
    totalTrials: Number(row["total_trials"]),
    passedTrials: Number(row["passed_trials"]),
    passRate: Number(row["pass_rate"]),
    avgDuration: Number(row["avg_duration"]),
    avgCost: Number(row["avg_cost"]),
  }));
}

/** Model comparison: side-by-side metrics for models used in a run. */
export interface ModelComparison {
  model: string;
  provider: string;
  totalCalls: number;
  passRate: number;
  avgDuration: number;
  p95Duration: number;
  totalCost: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

export async function getModelComparison(runId: string): Promise<ModelComparison[]> {
  const result = await clickhouseQuery(
    `SELECT model, provider,
      count() as total_calls,
      countIf(status = 'ok') / count() as pass_rate,
      avg(duration_ms) as avg_duration,
      quantile(0.95)(duration_ms) as p95_duration,
      sum(cost) as total_cost,
      avg(input_tokens) as avg_input_tokens,
      avg(output_tokens) as avg_output_tokens
    FROM trace_spans
    WHERE run_id = {run_id:String}
    GROUP BY model, provider
    ORDER BY total_calls DESC
    FORMAT JSON`,
    { run_id: runId },
  );
  const parsed = JSON.parse(result) as { data: Array<Record<string, unknown>> };
  return parsed.data.map((row) => ({
    model: row["model"] as string,
    provider: row["provider"] as string,
    totalCalls: Number(row["total_calls"]),
    passRate: Number(row["pass_rate"]),
    avgDuration: Number(row["avg_duration"]),
    p95Duration: Number(row["p95_duration"]),
    totalCost: Number(row["total_cost"]),
    avgInputTokens: Number(row["avg_input_tokens"]),
    avgOutputTokens: Number(row["avg_output_tokens"]),
  }));
}

/** Top N slowest spans for a run. */
export interface SlowestSpan {
  spanId: string;
  traceId: string;
  name: string;
  type: string;
  scenarioId: string;
  model: string;
  durationMs: number;
  status: string;
}

export async function getSlowestSpans(runId: string, limit: number = 20): Promise<SlowestSpan[]> {
  const result = await clickhouseQuery(
    `SELECT span_id, trace_id, name, type, scenario_id, model, duration_ms, status
    FROM trace_spans
    WHERE run_id = {run_id:String}
    ORDER BY duration_ms DESC
    LIMIT {lim:UInt32}
    FORMAT JSON`,
    { run_id: runId, lim: limit },
  );
  const parsed = JSON.parse(result) as { data: Array<Record<string, unknown>> };
  return parsed.data.map((row) => ({
    spanId: row["span_id"] as string,
    traceId: row["trace_id"] as string,
    name: row["name"] as string,
    type: row["type"] as string,
    scenarioId: row["scenario_id"] as string,
    model: row["model"] as string,
    durationMs: Number(row["duration_ms"]),
    status: row["status"] as string,
  }));
}

/** Hierarchical trace timeline — spans with parent-child structure. */
export interface TraceTimelineSpan {
  spanId: string;
  parentId: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: string;
  model: string;
  cost: number;
  children: TraceTimelineSpan[];
}

export async function getTraceTimeline(traceId: string): Promise<TraceTimelineSpan[]> {
  const spans = await getSpansByTraceId(traceId);

  // Build flat map
  const map = new Map<string, TraceTimelineSpan>();
  for (const span of spans) {
    map.set(span.span_id, {
      spanId: span.span_id,
      parentId: span.parent_id,
      name: span.name,
      type: span.type,
      startTime: span.start_time,
      endTime: span.end_time,
      durationMs: span.duration_ms,
      status: span.status,
      model: span.model,
      cost: span.cost,
      children: [],
    });
  }

  // Build tree
  const roots: TraceTimelineSpan[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Check ClickHouse connectivity. Returns latency in ms. */
export async function checkClickHouse(): Promise<number> {
  const start = Date.now();
  await clickhouseQuery("SELECT 1 FORMAT JSON");
  return Date.now() - start;
}
