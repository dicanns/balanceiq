import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return ok({ error: 'no_auth', message: 'Sign-in required.' });

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return ok({ error: 'no_auth', message: 'Session expired.' });

    const { franchisorOrgId, locationId, locationName } = await req.json();
    if (!franchisorOrgId || !locationId || !locationName) {
      return ok({ error: 'missing_params', message: 'Missing franchisorOrgId, locationId or locationName.' });
    }

    // Verify caller belongs to this org and has franchise plan
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('plan')
      .eq('id', franchisorOrgId)
      .single();

    if (orgRow?.plan !== 'franchise') {
      return ok({ error: 'upgrade_required', message: 'Franchise plan required to create invitations.' });
    }

    // Expire any existing pending invite for this location
    await supabaseAdmin
      .from('franchise_invitations')
      .update({ status: 'expired' })
      .eq('franchisor_org_id', franchisorOrgId)
      .eq('location_id', locationId)
      .eq('status', 'pending');

    // Generate unique code
    let inviteCode = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomCode();
      const { data: existing } = await supabaseAdmin
        .from('franchise_invitations')
        .select('id')
        .eq('invite_code', candidate)
        .single();
      if (!existing) { inviteCode = candidate; break; }
    }
    if (!inviteCode) return ok({ error: 'code_gen_failed', message: 'Could not generate unique code. Try again.' });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from('franchise_invitations')
      .insert({
        invite_code: inviteCode,
        franchisor_org_id: franchisorOrgId,
        location_id: locationId,
        location_name: locationName,
        status: 'pending',
        expires_at: expiresAt,
      });

    if (insertError) return ok({ error: 'insert_failed', message: insertError.message });

    return ok({ inviteCode, expiresAt, locationName });

  } catch (err) {
    console.error('create-invitation error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
