-- Patch C: enable RLS on PAD tables so direct REST calls from the desktop
-- app (now using user JWTs after Patch B) are isolated by org.
-- Edge functions use SERVICE_ROLE_KEY which bypasses RLS -- no change there.

ALTER TABLE pad_mandates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pad_mandates_org_isolation ON pad_mandates;
CREATE POLICY pad_mandates_org_isolation ON pad_mandates
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

ALTER TABLE pad_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pad_config_org_isolation ON pad_config;
CREATE POLICY pad_config_org_isolation ON pad_config
  FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));
