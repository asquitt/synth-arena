-- SynthArena ClickHouse Schema
-- Traces, spans, and analytics at scale

-- ─── Trace Spans ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trace_spans (
    trace_id String,
    span_id String,
    parent_id String,
    name String,
    type Enum8('llm_call' = 1, 'tool_invocation' = 2, 'decision' = 3, 'environment_interaction' = 4, 'state_transition' = 5),
    start_time DateTime64(3),
    end_time DateTime64(3),
    duration_ms UInt64,
    status Enum8('ok' = 1, 'error' = 2),
    -- Evaluation context
    run_id String,
    scenario_id String,
    trial_number UInt32,
    -- LLM-specific
    model String,
    provider String,
    input_tokens UInt32,
    output_tokens UInt32,
    cost Float64,
    -- General attributes
    attributes String, -- JSON blob
    events String, -- JSON blob
    -- Partitioning
    created_date Date DEFAULT today()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_date)
ORDER BY (run_id, scenario_id, trace_id, start_time)
TTL created_date + INTERVAL 90 DAY;

-- ─── Evaluation Metrics (Materialized View) ──────────────────────────
CREATE TABLE IF NOT EXISTS eval_metrics_daily (
    date Date,
    run_id String,
    domain String,
    total_spans UInt64,
    total_llm_calls UInt64,
    total_input_tokens UInt64,
    total_output_tokens UInt64,
    total_cost Float64,
    avg_duration_ms Float64,
    error_count UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, run_id, domain);

-- ─── Cost Analytics ──────────────────────────────────────────────────
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
