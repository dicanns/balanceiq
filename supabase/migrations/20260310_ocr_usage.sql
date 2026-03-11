-- OCR usage tracking: 100 free scans/month per org (Pro plan)
CREATE TABLE IF NOT EXISTS ocr_usage (
  org_id  UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month   TEXT    NOT NULL,  -- YYYY-MM
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, month)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS ocr_usage_org_month ON ocr_usage (org_id, month);

-- Service role handles all writes (edge functions use service role key)
-- No RLS needed — edge function validates org ownership via JWT
