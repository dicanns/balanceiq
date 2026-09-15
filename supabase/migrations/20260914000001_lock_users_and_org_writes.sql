-- Lock client writes to users and organizations.
--
-- users had FOR ALL USING (id = auth.uid()): a signed-in user could rewrite
-- their own org_id and role, which every other policy and edge function trusts
-- for membership. organizations had FOR ALL for members: a user could set their
-- own plan, Stripe ids, parent_org_id and payment_failed.
--
-- The app only reads these tables. Rows are created by handle_new_user()
-- (security definer) and changed by edge functions with the service role,
-- neither of which is affected by RLS or these grants.

-- users: read your own row, nothing else.
DROP POLICY IF EXISTS "users_own_org" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());
REVOKE ALL ON public.users FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.users FROM authenticated;

-- organizations: read your own organization, nothing else.
DROP POLICY IF EXISTS "org_members" ON public.organizations;
DROP POLICY IF EXISTS "org_members_select" ON public.organizations;
CREATE POLICY "org_members_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));
REVOKE ALL ON public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organizations FROM authenticated;
