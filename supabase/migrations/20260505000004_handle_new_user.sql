-- handle_new_user: auto-provision an organization and users row on signup.
-- cloudSync.js signUp() calls supabase.auth.signUp and relies on this trigger
-- to create the org and user profile (see cloudSync.js comment line ~111).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO public.organizations (plan)
  VALUES ('free')
  RETURNING id INTO v_org_id;

  INSERT INTO public.users (id, org_id, role)
  VALUES (NEW.id, v_org_id, 'owner')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
