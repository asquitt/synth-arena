-- SynthArena PostgreSQL Schema
-- Config, metadata, and evaluation results

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Domain Templates ────────────────────────────────────────────────
CREATE TABLE domain_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_domain_templates_name ON domain_templates(name);

-- ─── Scenario Datasets ──────────────────────────────────────────────
CREATE TABLE scenario_datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    scenario_count INT NOT NULL DEFAULT 0,
    storage_path TEXT, -- S3/MinIO path
    quality_report JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scenario_datasets_domain ON scenario_datasets(domain);

-- ─── Evaluation Runs ─────────────────────────────────────────────────
CREATE TABLE evaluation_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    domain VARCHAR(255),
    dataset_id UUID REFERENCES scenario_datasets(id),
    config JSONB NOT NULL,
    summary JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evaluation_runs_status ON evaluation_runs(status);
CREATE INDEX idx_evaluation_runs_domain ON evaluation_runs(domain);
CREATE INDEX idx_evaluation_runs_created ON evaluation_runs(created_at DESC);

-- ─── Scenario Results ────────────────────────────────────────────────
CREATE TABLE scenario_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    scenario_id VARCHAR(255) NOT NULL,
    pass_at_k FLOAT NOT NULL DEFAULT 0,
    pass_to_the_k FLOAT NOT NULL DEFAULT 0,
    aggregated_scores JSONB,
    trial_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scenario_results_run ON scenario_results(run_id);
CREATE INDEX idx_scenario_results_scenario ON scenario_results(scenario_id);

-- ─── Trial Results ───────────────────────────────────────────────────
CREATE TABLE trial_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_result_id UUID NOT NULL REFERENCES scenario_results(id) ON DELETE CASCADE,
    trial_number INT NOT NULL,
    passed BOOLEAN NOT NULL DEFAULT false,
    scores JSONB NOT NULL,
    token_usage JSONB,
    duration_ms INT,
    trace_id VARCHAR(255), -- Reference to ClickHouse trace
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trial_results_scenario ON trial_results(scenario_result_id);

-- ─── Arena Competitions ──────────────────────────────────────────────
CREATE TABLE arena_competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    domain VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    config JSONB NOT NULL,
    rankings JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_arena_competitions_status ON arena_competitions(status);

-- ─── Regression Baselines ────────────────────────────────────────────
CREATE TABLE regression_baselines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES evaluation_runs(id),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regression_baselines_domain ON regression_baselines(domain);
CREATE INDEX idx_regression_baselines_active ON regression_baselines(is_active) WHERE is_active = true;

-- ─── API Keys ────────────────────────────────────────────────────────
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    permissions JSONB DEFAULT '["read", "write"]'::jsonb,
    rate_limit_per_minute INT DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;
