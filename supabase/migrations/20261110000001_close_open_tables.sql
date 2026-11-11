-- Rules that were wider than the app needs (review 2026-11-09, B3 B4 B8 B9 B10).
-- Edge functions use the service role, which is not subject to these rules.

-- pad_config holds a webhook signing secret. Its only rule was "everyone,
-- everything". Only the edge functions read or write it.
DROP POLICY IF EXISTS "service_role_all" ON public.pad_config;
REVOKE ALL ON public.pad_config FROM anon, authenticated;

-- pad_mandates: the rules tested a session setting nothing ever sets, so the
-- app's own reads returned nothing. Members read their organization's mandates
-- and may cancel one (status only); everything else goes through the functions.
DROP POLICY IF EXISTS "pad_org_read"   ON public.pad_mandates;
DROP POLICY IF EXISTS "pad_org_insert" ON public.pad_mandates;
DROP POLICY IF EXISTS "pad_org_update" ON public.pad_mandates;
REVOKE ALL ON public.pad_mandates FROM anon, authenticated;
GRANT SELECT ON public.pad_mandates TO authenticated;
GRANT UPDATE (status, updated_at) ON public.pad_mandates TO authenticated;
CREATE POLICY "pad_mandates_org_read" ON public.pad_mandates
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT users.org_id::text FROM public.users WHERE users.id = auth.uid()));
CREATE POLICY "pad_mandates_org_cancel" ON public.pad_mandates
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT users.org_id::text FROM public.users WHERE users.id = auth.uid()))
  WITH CHECK (org_id IN (SELECT users.org_id::text FROM public.users WHERE users.id = auth.uid()) AND status = 'cancelled');

-- Franchise invitations are created, accepted and revoked by the functions,
-- which check the plan, the owner and the per-location charge. A member could
-- insert one directly and skip all three. The app only reads them.
DROP POLICY IF EXISTS "franchisor_manage_invitations" ON public.franchise_invitations;
REVOKE ALL ON public.franchise_invitations FROM anon, authenticated;
GRANT SELECT ON public.franchise_invitations TO authenticated;
CREATE POLICY "franchise_invitations_org_read" ON public.franchise_invitations
  FOR SELECT TO authenticated
  USING (franchisor_org_id = (SELECT users.org_id FROM public.users WHERE users.id = auth.uid()));

-- Community POS templates: a submitter could mark their own template approved,
-- and approved templates run on every install's scans.
DROP POLICY IF EXISTS "Authenticated users can submit templates" ON public.pos_scan_community_templates;
CREATE POLICY "Authenticated users can submit templates" ON public.pos_scan_community_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = submitted_by AND approved IS NOT TRUE AND approved_at IS NULL AND approved_by IS NULL);
REVOKE UPDATE, DELETE, TRUNCATE ON public.pos_scan_community_templates FROM anon, authenticated;

-- installs (telemetry): anonymous users could delete every row. The app only
-- upserts its own device row.
DROP POLICY IF EXISTS "anon upsert" ON public.installs;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.installs FROM anon, authenticated;
CREATE POLICY "installs_read"   ON public.installs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "installs_insert" ON public.installs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "installs_update" ON public.installs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
