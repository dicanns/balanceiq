-- AI query usage tracking (per org, per month)
CREATE TABLE IF NOT EXISTS ai_usage (
  org_id UUID NOT NULL,
  month  TEXT NOT NULL,
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, month)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_org_own" ON ai_usage
  FOR ALL USING (
    org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  );
