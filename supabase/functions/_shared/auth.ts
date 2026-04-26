import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function requireOrgMember(req: Request, orgId: string) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer /i, '');
  if (!token) throw new Response(JSON.stringify({ error: 'unauthorized' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) throw new Response(
    JSON.stringify({ error: 'invalid_token' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } });

  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (memErr || !membership) throw new Response(
    JSON.stringify({ error: 'forbidden' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } });

  return { user: userData.user, role: membership.role };
}
