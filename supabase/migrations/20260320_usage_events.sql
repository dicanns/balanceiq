-- usage_events: lightweight anonymous usage telemetry
-- Tracks feature usage, tab views, and session events.
-- No financial data, names, or business-identifiable info.

CREATE TABLE IF NOT EXISTS usage_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      TEXT,
  event       TEXT        NOT NULL,
  metadata    JSONB       DEFAULT '{}',
  plan        TEXT        DEFAULT 'free',
  app_version TEXT,
  platform    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_event   ON usage_events(event);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_org_id  ON usage_events(org_id);

-- RLS: orgs can only read their own rows; inserts open to anon (telemetry write)
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Allow all inserts (telemetry is unauthenticated write — device_id as org_id for free users)
CREATE POLICY "usage_events_insert"
  ON usage_events FOR INSERT
  WITH CHECK (true);

-- Authenticated users can read only their own org's events
CREATE POLICY "usage_events_select_own"
  ON usage_events FOR SELECT
  TO authenticated
  USING (
    org_id = (
      SELECT org_id::text FROM users WHERE id = auth.uid() LIMIT 1
    )
  );
