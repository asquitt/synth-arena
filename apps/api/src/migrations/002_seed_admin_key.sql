-- Seed an initial admin API key for bootstrapping.
-- Raw key: sa_bootstrap_admin_key_change_me
-- IMPORTANT: Create a new admin key via POST /api/v1/admin/keys, then revoke this one.

INSERT INTO api_keys (key_hash, name, permissions, rate_limit_per_minute)
VALUES (
  '5fef3b102913c93d14f3a679868f53182b47340b6eed95a0acf66db9af8b0057',
  'Bootstrap Admin (revoke after setup)',
  '["read", "write", "admin"]'::jsonb,
  1000
)
ON CONFLICT (key_hash) DO NOTHING;
