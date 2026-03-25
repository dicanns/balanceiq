-- ── Multi-Unit Operator (MUO): user_linked_locations ──
-- Tracks all franchise locations a user has access to (via accepted invitations).
-- A user who owns 2 locations accepts 2 invitations; both appear here.

CREATE TABLE IF NOT EXISTS user_linked_locations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  franchisor_org_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  franchisee_org_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id         TEXT NOT NULL,
  location_name       TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, location_id)
);

ALTER TABLE user_linked_locations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own linked locations
CREATE POLICY "user_linked_locations_own" ON user_linked_locations
  FOR SELECT USING (auth.uid() = user_id);

-- Add accepted_by_user_id to franchise_invitations if not already present
ALTER TABLE franchise_invitations
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID REFERENCES auth.users(id);

-- Allow MUO users to read synced_data for all their linked franchisee orgs
-- This supplements the existing synced_data_own_or_child policy
CREATE POLICY "synced_data_muo_read" ON synced_data
  FOR SELECT USING (
    org_id IN (
      SELECT franchisee_org_id FROM user_linked_locations
      WHERE user_id = auth.uid()
    )
  );
