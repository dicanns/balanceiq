-- Patch C: add columns that create-pad-mandate inserts but were missing from schema
-- Safe to re-run (IF NOT EXISTS guards on all columns).

ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS client_name        TEXT;
ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS client_email       TEXT;
ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS operator_email     TEXT;
ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS currency           TEXT NOT NULL DEFAULT 'cad';
ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS stripe_setup_intent TEXT;
