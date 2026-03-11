-- ── PHASE 1: Multi-Tenant Franchise Network Schema ──

-- 1. Add franchise columns to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS parent_org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS linked_location_id TEXT;

-- 2. franchise_invitations table
CREATE TABLE IF NOT EXISTS franchise_invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code         TEXT NOT NULL UNIQUE,
  franchisor_org_id   UUID NOT NULL REFERENCES organizations(id),
  location_id         TEXT NOT NULL,
  location_name       TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  expires_at          TIMESTAMPTZ NOT NULL,
  accepted_by_org_id  UUID REFERENCES organizations(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE franchise_invitations ENABLE ROW LEVEL SECURITY;

-- Franchisor can manage their own invitations
CREATE POLICY "franchisor_manage_invitations" ON franchise_invitations
  FOR ALL USING (
    franchisor_org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  );

-- Anyone authenticated can read a pending invitation by code (for acceptance)
CREATE POLICY "read_pending_by_code" ON franchise_invitations
  FOR SELECT USING (status = 'pending');

-- 3. Update synced_data RLS: franchisor org can read child org data
-- Drop existing policy first (may be named differently — safe with IF EXISTS)
DROP POLICY IF EXISTS "Users can manage own org data" ON synced_data;
DROP POLICY IF EXISTS "org_own" ON synced_data;

-- Recreate: own org data OR child org data (for franchisor reading franchisee syncs)
CREATE POLICY "synced_data_own_or_child" ON synced_data
  FOR SELECT USING (
    org_id = (SELECT org_id FROM users WHERE id = auth.uid())
    OR
    org_id IN (
      SELECT id FROM organizations
      WHERE parent_org_id = (SELECT org_id FROM users WHERE id = auth.uid())
    )
  );

-- Write policy: only own org
CREATE POLICY "synced_data_own_write" ON synced_data
  FOR INSERT WITH CHECK (
    org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "synced_data_own_update" ON synced_data
  FOR UPDATE USING (
    org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  );
