-- PAD NSF tracking columns (Sprint 15)
-- Records which invoice failed so the app can mark it unpaid on next load.
ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS nsf_invoice_id TEXT;
ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS nsf_reason     TEXT;
ALTER TABLE pad_mandates ADD COLUMN IF NOT EXISTS nsf_at         TIMESTAMPTZ;
