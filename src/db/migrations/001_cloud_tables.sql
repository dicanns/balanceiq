-- BalanceIQ Cloud Tables — Migration 001
-- Run this in the Supabase SQL editor for your project.

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','franchise')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  latitude DOUBLE PRECISION DEFAULT 45.5088,
  longitude DOUBLE PRECISION DEFAULT -73.5878,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE synced_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  location_id UUID REFERENCES locations(id),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, key)
);

CREATE TABLE audit_log_cloud (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  location_id UUID REFERENCES locations(id),
  timestamp TIMESTAMPTZ NOT NULL,
  device_id TEXT,
  module TEXT,
  action TEXT,
  record_type TEXT,
  record_id TEXT,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_cloud ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_org" ON users
  FOR ALL USING (id = auth.uid());

CREATE POLICY "org_members" ON organizations
  FOR ALL USING (id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "org_locations" ON locations
  FOR ALL USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "org_data" ON synced_data
  FOR ALL USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "org_audit" ON audit_log_cloud
  FOR ALL USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));
