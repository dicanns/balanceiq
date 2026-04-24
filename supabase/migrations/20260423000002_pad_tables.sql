-- PAD / ACSS Debit tables (spec 3.11)
-- Safe to run on a DB where these already exist manually.

CREATE TABLE IF NOT EXISTS pad_config (
  org_id         TEXT PRIMARY KEY,
  webhook_secret TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pad_mandates (
  id                     TEXT PRIMARY KEY,
  org_id                 TEXT NOT NULL,
  client_id              TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending',  -- pending|active|cancelled|nsf
  stripe_payment_method  TEXT,
  stripe_mandate_id      TEXT,
  stripe_customer_id     TEXT,
  bank_name              TEXT,
  last4                  TEXT,
  followup_enabled       BOOLEAN NOT NULL DEFAULT false,
  followup_sent_at       TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pad_mandates_org_client ON pad_mandates (org_id, client_id);
CREATE INDEX IF NOT EXISTS idx_pad_mandates_stripe_mandate ON pad_mandates (stripe_mandate_id);
