-- E2: Server-side updated_at for synced_data conflict resolution.
-- The client no longer sends updated_at — Postgres stamps it on every write.
-- This prevents a client with a wrong clock from winning a conflict.

-- Add version counter for optimistic concurrency (E3)
ALTER TABLE synced_data ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Set updated_at to NOT NULL with server default (idempotent on existing rows)
-- If the column already exists and has a different default, this is a no-op in Postgres
ALTER TABLE synced_data ALTER COLUMN updated_at SET DEFAULT now();

-- Trigger function: stamp updated_at on every INSERT/UPDATE, increment version
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_synced_data_updated_at ON synced_data;
CREATE TRIGGER set_synced_data_updated_at
  BEFORE INSERT OR UPDATE ON synced_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Ensure existing rows have version = 1
UPDATE synced_data SET version = 1 WHERE version IS NULL OR version = 0;
