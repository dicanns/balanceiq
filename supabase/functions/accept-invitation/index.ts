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

    const { inviteCode, franchiseeOrgId } = await req.json();
    if (!inviteCode || !franchiseeOrgId) {
      return ok({ error: 'missing_params', message: 'Missing inviteCode or franchiseeOrgId.' });
    }

    // Look up the invitation
    const { data: invite } = await supabaseAdmin
      .from('franchise_invitations')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase().trim())
      .single();

    if (!invite) return ok({ error: 'invalid_code', message: 'Invitation code not found.' });
    if (invite.status === 'accepted') return ok({ error: 'already_accepted', message: 'This invitation has already been used.' });
    if (invite.status === 'expired') return ok({ error: 'expired', message: 'This invitation has expired.' });
    if (new Date(invite.expires_at) < new Date()) return ok({ error: 'expired', message: 'This invitation has expired.' });

    // Prevent linking to own org
    if (invite.franchisor_org_id === franchiseeOrgId) {
      return ok({ error: 'same_org', message: 'Cannot link an organization to itself.' });
    }

    // Get franchisor org name
    const { data: franchisorOrg } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', invite.franchisor_org_id)
      .single();

    // Link franchisee org to franchisor
    await supabaseAdmin
      .from('organizations')
      .update({
        parent_org_id: invite.franchisor_org_id,
        linked_location_id: invite.location_id,
      })
      .eq('id', franchiseeOrgId);

    // Mark invitation as accepted
    await supabaseAdmin
      .from('franchise_invitations')
      .update({
        status: 'accepted',
        accepted_by_org_id: franchiseeOrgId,
      })
      .eq('id', invite.id);

    return ok({
      success: true,
      franchisorName: franchisorOrg?.name || 'Réseau franchise',
      locationName: invite.location_name,
      locationId: invite.location_id,
    });

  } catch (err) {
    console.error('accept-invitation error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
