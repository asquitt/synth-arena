-- Webhook configuration persistence
-- Replaces in-memory Map<string, WebhookConfig> with PostgreSQL storage

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    secret VARCHAR(255) NOT NULL,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active) WHERE active = true;

-- Webhook delivery log for debugging and retry
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status_code INT,
    response_body TEXT,
    error TEXT,
    duration_ms INT,
    delivered_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivered ON webhook_deliveries(delivered_at DESC);
