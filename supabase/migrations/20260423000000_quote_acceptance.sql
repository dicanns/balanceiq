-- Quote e-acceptance tokens (spec 3.9)
-- Stores token + quote snapshot for edge function lookup, and acceptance audit record.

CREATE TABLE IF NOT EXISTS quote_acceptance_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token                 TEXT UNIQUE NOT NULL,           -- 128-bit hex, single-use
  org_id                TEXT NOT NULL,
  quote_id              TEXT NOT NULL,
  quote_number          TEXT,
  quote_html            TEXT NOT NULL,                  -- frozen PDF-ready HTML at send time
  client_name           TEXT,
  client_email          TEXT,
  operator_email        TEXT,                           -- for notification on acceptance
  expires_at            TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'accepted'|'rejected'|'expired'
  accepted_at           TIMESTAMPTZ,
  accepted_from_ip      TEXT,
  accepted_user_agent   TEXT,
  accepted_typed_name   TEXT,
  accepted_signature_blob TEXT,                         -- base64 PNG
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qat_token   ON quote_acceptance_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qat_org     ON quote_acceptance_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_qat_quote   ON quote_acceptance_tokens(org_id, quote_id);

-- RLS: operators read their own org's tokens; edge function uses service role
ALTER TABLE quote_acceptance_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_read_own_tokens"
  ON quote_acceptance_tokens FOR SELECT
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid())::text);

CREATE POLICY "org_insert_own_tokens"
  ON quote_acceptance_tokens FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM users WHERE id = auth.uid())::text);

CREATE POLICY "org_update_own_tokens"
  ON quote_acceptance_tokens FOR UPDATE
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid())::text);
