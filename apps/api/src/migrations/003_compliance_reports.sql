-- Compliance Reports
-- Stores EU AI Act compliance reports generated from evaluation runs.
-- One report per evaluation run, cached for re-retrieval without regeneration.

CREATE TABLE IF NOT EXISTS compliance_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    framework VARCHAR(50) NOT NULL DEFAULT 'eu-ai-act',
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    overall_status VARCHAR(50) NOT NULL,
    risk_level VARCHAR(50) NOT NULL,
    report JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_reports_run ON compliance_reports(run_id);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_status ON compliance_reports(overall_status);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_risk ON compliance_reports(risk_level);

-- Webhooks table (referenced by admin routes but missing from initial schema)
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_triggered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = true;
