-- Security review follow-up (2026-11-03).
--
-- 1. audit_log_cloud is an audit trail: rows are written and read, never changed
--    or removed by a client. The old org policy was ALL, which let any member of
--    the org delete or rewrite its own history.
-- 2. SECURITY DEFINER functions run with the owner's rights, so their search_path
--    is pinned and they are not callable by the public API unless meant to be.
--    handle_new_user is an auth trigger; nobody calls it. flag_community_template
--    is a report button for signed-in users; anonymous callers have no business
--    with it.

-- 1. Immutable audit log -----------------------------------------------------
DROP POLICY IF EXISTS org_audit ON public.audit_log_cloud;

CREATE POLICY audit_org_read ON public.audit_log_cloud
  FOR SELECT USING (
    org_id IN (SELECT users.org_id FROM public.users WHERE users.id = auth.uid())
  );

CREATE POLICY audit_org_insert ON public.audit_log_cloud
  FOR INSERT WITH CHECK (
    org_id IN (SELECT users.org_id FROM public.users WHERE users.id = auth.uid())
  );

-- No UPDATE or DELETE policy: with RLS on, clients cannot change or remove rows.

-- 2. Functions ---------------------------------------------------------------
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.flag_community_template(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_community_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_community_template(uuid) TO authenticated;
