-- State-Diff Reports
-- Stores environment snapshot diffs generated from evaluation runs.
-- One report per scenario within a run.

CREATE TABLE IF NOT EXISTS state_diff_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    scenario_id VARCHAR(255) NOT NULL,
    before_snapshot JSONB NOT NULL,
    after_snapshot JSONB NOT NULL,
    deltas JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_state_diff_reports_run ON state_diff_reports(run_id);
CREATE INDEX IF NOT EXISTS idx_state_diff_reports_scenario ON state_diff_reports(scenario_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_state_diff_reports_run_scenario ON state_diff_reports(run_id, scenario_id);

-- Red Team Results
-- Stores adversarial evaluation results for security analysis.

CREATE TABLE IF NOT EXISTS red_team_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    intensity VARCHAR(20) NOT NULL DEFAULT 'medium',
    scenario_count INT NOT NULL DEFAULT 0,
    pass_rate FLOAT NOT NULL DEFAULT 0,
    component_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    failed_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_red_team_results_run ON red_team_results(run_id);
CREATE INDEX IF NOT EXISTS idx_red_team_results_category ON red_team_results(category);
