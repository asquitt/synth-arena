-- SynthArena ClickHouse Schema
-- Traces, spans, and analytics at scale
-- Optimized for 100M+ trace query in <1s

-- ─── Trace Spans ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trace_spans (
    trace_id String,
    span_id String,
    parent_id String DEFAULT '',
    name String,
    type Enum8('llm_call' = 1, 'tool_invocation' = 2, 'decision' = 3, 'environment_interaction' = 4, 'state_transition' = 5),
    start_time DateTime64(3, 'UTC'),
    end_time DateTime64(3, 'UTC'),
    duration_ms UInt32,
    status Enum8('ok' = 1, 'error' = 2),
    -- Evaluation context
    run_id String,
    scenario_id String,
    trial_number UInt8,
    -- LLM-specific
    model String DEFAULT '',
    provider String DEFAULT '',
    input_tokens UInt32 DEFAULT 0,
    output_tokens UInt32 DEFAULT 0,
    cost Float64 DEFAULT 0,
    -- General attributes
    attributes String DEFAULT '{}', -- JSON blob
    events String DEFAULT '[]', -- JSON blob
    -- Partitioning
    created_date Date DEFAULT today()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_date)
ORDER BY (run_id, scenario_id, trace_id, start_time)
TTL created_date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- ─── Per-Run Cost Summary (auto-aggregated) ────────────────────────
CREATE TABLE IF NOT EXISTS run_cost_summary (
    run_id String,
    model String,
    provider String,
    total_calls UInt64,
    total_input_tokens UInt64,
    total_output_tokens UInt64,
    total_cost Float64
) ENGINE = SummingMergeTree()
ORDER BY (run_id, model, provider);

CREATE MATERIALIZED VIEW IF NOT EXISTS run_cost_summary_mv
TO run_cost_summary AS
SELECT
    run_id,
    model,
    provider,
    count()           AS total_calls,
    sum(input_tokens)  AS total_input_tokens,
    sum(output_tokens) AS total_output_tokens,
    sum(cost)          AS total_cost
FROM trace_spans
WHERE type = 'llm_call'
GROUP BY run_id, model, provider;

-- ─── Per-Run Latency Summary (auto-aggregated) ─────────────────────
CREATE TABLE IF NOT EXISTS run_latency_summary (
    run_id String,
    p50_ms Float64,
    p95_ms Float64,
    p99_ms Float64,
    max_ms Float64,
    avg_ms Float64,
    span_count UInt64
) ENGINE = AggregatingMergeTree()
ORDER BY run_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS run_latency_summary_mv
TO run_latency_summary AS
SELECT
    run_id,
    quantile(0.50)(duration_ms) AS p50_ms,
    quantile(0.95)(duration_ms) AS p95_ms,
    quantile(0.99)(duration_ms) AS p99_ms,
    max(duration_ms)            AS max_ms,
    avg(duration_ms)            AS avg_ms,
    count()                     AS span_count
FROM trace_spans
GROUP BY run_id;

-- ─── Daily Cost Analytics ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_analytics (
    date Date,
    model String,
    provider String,
    run_id String,
    total_calls UInt64,
    total_input_tokens UInt64,
    total_output_tokens UInt64,
    total_cost Float64,
    avg_cost_per_call Float64,
    p50_duration_ms Float64,
    p99_duration_ms Float64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, model, provider);

CREATE MATERIALIZED VIEW IF NOT EXISTS cost_analytics_mv
TO cost_analytics AS
SELECT
    toDate(start_time) AS date,
    model,
    provider,
    run_id,
    count()                 AS total_calls,
    sum(input_tokens)       AS total_input_tokens,
    sum(output_tokens)      AS total_output_tokens,
    sum(cost)               AS total_cost,
    avg(cost)               AS avg_cost_per_call,
    quantile(0.50)(duration_ms) AS p50_duration_ms,
    quantile(0.99)(duration_ms) AS p99_duration_ms
FROM trace_spans
WHERE type = 'llm_call'
GROUP BY date, model, provider, run_id;
