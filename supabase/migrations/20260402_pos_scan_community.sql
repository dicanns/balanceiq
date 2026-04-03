-- POS Report Scan — Community Templates
-- Phase 4: Community template database
-- Operators can opt-in to share locally-built POS format templates.
-- Only template patterns are stored — never financial data.

CREATE TABLE IF NOT EXISTS pos_scan_community_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_system TEXT NOT NULL,
  pos_version TEXT DEFAULT '',
  language TEXT DEFAULT 'fr',
  patterns JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,               -- reviewer name (Anthony or designated)
  download_count INTEGER DEFAULT 0,
  report_count INTEGER DEFAULT 0, -- users flagging bad results
  region TEXT DEFAULT 'QC',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookup by POS system (approved only) and region
CREATE INDEX IF NOT EXISTS idx_community_templates_pos
  ON pos_scan_community_templates(pos_system, approved);

CREATE INDEX IF NOT EXISTS idx_community_templates_region
  ON pos_scan_community_templates(region, approved);

-- Row-level security
ALTER TABLE pos_scan_community_templates ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read approved templates
CREATE POLICY "Anyone can read approved templates"
  ON pos_scan_community_templates
  FOR SELECT
  USING (approved = true);

-- Authenticated users can submit new templates
CREATE POLICY "Authenticated users can submit templates"
  ON pos_scan_community_templates
  FOR INSERT
  WITH CHECK (auth.uid() = submitted_by);

-- Users can flag templates (increment report_count)
-- This is handled via an RPC function to avoid direct UPDATE access
CREATE OR REPLACE FUNCTION flag_community_template(template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pos_scan_community_templates
  SET report_count = report_count + 1
  WHERE id = template_id AND approved = true;

  -- Auto-suspend templates with >= 3 flags (set approved = false pending review)
  UPDATE pos_scan_community_templates
  SET approved = false
  WHERE id = template_id AND report_count >= 3;
END;
$$;
