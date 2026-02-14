-- ClickHouse trace spans schema.
--
-- Run against ClickHouse (not PostgreSQL).
-- Execute: clickhouse-client < 006_clickhouse_traces.sql
--
-- Uses MergeTree engine optimized for time-range + run_id queries.
-- Projected to handle 100M+ traces with sub-second query times.

CREATE DATABASE IF NOT EXISTS syntharena;

CREATE TABLE IF NOT EXISTS syntharena.trace_spans (
    -- Identity
    trace_id     String,
    span_id      String,
    parent_id    String DEFAULT '',
    name         String,
    type         Enum8(
        'llm_call' = 1,
        'tool_invocation' = 2,
        'decision' = 3,
        'environment_interaction' = 4,
        'state_transition' = 5
    ),

    -- Timing
    start_time   DateTime64(3, 'UTC'),
    end_time     DateTime64(3, 'UTC'),
    duration_ms  UInt32,

    -- Status
    status       Enum8('ok' = 1, 'error' = 2),

    -- Context
    run_id       String,
    scenario_id  String,
    trial_number UInt8,

    -- LLM call data
    model        String DEFAULT '',
    provider     String DEFAULT '',
    input_tokens UInt32 DEFAULT 0,
    output_tokens UInt32 DEFAULT 0,
    cost         Float64 DEFAULT 0,

    -- Flexible fields (JSON strings)
    attributes   String DEFAULT '{}',
    events       String DEFAULT '[]'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (run_id, scenario_id, start_time)
SETTINGS index_granularity = 8192;

-- Materialized view: per-run cost summary (auto-updated on insert)
CREATE TABLE IF NOT EXISTS syntharena.run_cost_summary (
    run_id           String,
    model            String,
    provider         String,
    total_calls      UInt64,
    total_input_tokens  UInt64,
    total_output_tokens UInt64,
    total_cost       Float64
)
ENGINE = SummingMergeTree()
ORDER BY (run_id, model, provider);

CREATE MATERIALIZED VIEW IF NOT EXISTS syntharena.run_cost_summary_mv
TO syntharena.run_cost_summary AS
SELECT
    run_id,
    model,
    provider,
    count()        AS total_calls,
    sum(input_tokens)  AS total_input_tokens,
    sum(output_tokens) AS total_output_tokens,
    sum(cost)      AS total_cost
FROM syntharena.trace_spans
WHERE type = 'llm_call'
GROUP BY run_id, model, provider;

-- Materialized view: per-run latency percentiles (auto-updated)
CREATE TABLE IF NOT EXISTS syntharena.run_latency_summary (
    run_id   String,
    p50_ms   Float64,
    p95_ms   Float64,
    p99_ms   Float64,
    max_ms   Float64,
    avg_ms   Float64,
    span_count UInt64
)
ENGINE = AggregatingMergeTree()
ORDER BY run_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS syntharena.run_latency_summary_mv
TO syntharena.run_latency_summary AS
SELECT
    run_id,
    quantile(0.50)(duration_ms) AS p50_ms,
    quantile(0.95)(duration_ms) AS p95_ms,
    quantile(0.99)(duration_ms) AS p99_ms,
    max(duration_ms)            AS max_ms,
    avg(duration_ms)            AS avg_ms,
    count()                     AS span_count
FROM syntharena.trace_spans
GROUP BY run_id;
