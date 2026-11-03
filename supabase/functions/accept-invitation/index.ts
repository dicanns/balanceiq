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
function refuse(status: number, error: string, message: string) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Linking an organization under a franchisor changes who can read its data, so
// only the organization's owner or admin may accept, every write is checked, and
// the invitation is claimed first with a conditional update so two accepts of
// the same code cannot both succeed.
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

    // The signed-in user must belong to the organization being linked, and be
    // allowed to make that decision for it.
    const { data: userRecord } = await supabaseAdmin
      .from('users')
      .select('org_id, role')
      .eq('id', user.id)
      .single();
    if (!userRecord || userRecord.org_id !== franchiseeOrgId) return refuse(403, 'forbidden', 'Forbidden');
    if (!['owner', 'admin'].includes(String(userRecord.role || ''))) {
      return refuse(403, 'forbidden', 'Only the organization owner or an admin can accept an invitation.');
    }

    // The organization must not already belong to a network.
    const { data: ownOrg } = await supabaseAdmin
      .from('organizations')
      .select('id, parent_org_id')
      .eq('id', franchiseeOrgId)
      .single();
    if (!ownOrg) return refuse(404, 'org_not_found', 'Organization not found.');
    if (ownOrg.parent_org_id) return ok({ error: 'already_linked', message: 'This organization is already linked to a network.' });

    const { data: invite } = await supabaseAdmin
      .from('franchise_invitations')
      .select('*')
      .eq('invite_code', String(inviteCode).toUpperCase().trim())
      .single();

    if (!invite) return ok({ error: 'invalid_code', message: 'Invitation code not found.' });
    if (invite.status === 'accepted') return ok({ error: 'already_accepted', message: 'This invitation has already been used.' });
    if (invite.status !== 'pending') return ok({ error: 'expired', message: 'This invitation is no longer valid.' });
    if (new Date(invite.expires_at) < new Date()) return ok({ error: 'expired', message: 'This invitation has expired.' });
    if (invite.franchisor_org_id === franchiseeOrgId) {
      return ok({ error: 'same_org', message: 'Cannot link an organization to itself.' });
    }

    const { data: franchisorOrg } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', invite.franchisor_org_id)
      .single();
    if (!franchisorOrg) return ok({ error: 'invalid_code', message: 'The inviting network no longer exists.' });

    // Claim the invitation: only one accept can flip it from pending.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('franchise_invitations')
      .update({ status: 'accepted', accepted_by_org_id: franchiseeOrgId, accepted_by_user_id: user.id })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .select('id');
    if (claimErr) throw claimErr;
    if (!claimed || claimed.length === 0) return ok({ error: 'already_accepted', message: 'This invitation has already been used.' });

    const { error: linkErr } = await supabaseAdmin
      .from('organizations')
      .update({ parent_org_id: invite.franchisor_org_id, linked_location_id: invite.location_id })
      .eq('id', franchiseeOrgId)
      .is('parent_org_id', null);
    if (linkErr) {
      // Give the code back rather than leave it spent with nothing linked.
      await supabaseAdmin.from('franchise_invitations')
        .update({ status: 'pending', accepted_by_org_id: null, accepted_by_user_id: null })
        .eq('id', invite.id);
      throw linkErr;
    }

    // Record the linked location for the accepting user (MUO support); upsert so
    // re-accepting the same code is idempotent.
    const { error: mapErr } = await supabaseAdmin
      .from('user_linked_locations')
      .upsert({
        user_id: user.id,
        franchisor_org_id: invite.franchisor_org_id,
        franchisee_org_id: franchiseeOrgId,
        location_id: invite.location_id,
        location_name: invite.location_name,
      }, { onConflict: 'user_id,location_id' });
    if (mapErr) console.error('accept-invitation: user_linked_locations upsert failed', mapErr);

    const { data: allLinked } = await supabaseAdmin
      .from('user_linked_locations')
      .select('location_id, location_name')
      .eq('user_id', user.id);

    return ok({
      success: true,
      franchisorName: franchisorOrg.name || 'Réseau franchise',
      locationName: invite.location_name,
      locationId: invite.location_id,
      alreadyManages: (allLinked || []).filter((l: { location_id: string }) => l.location_id !== invite.location_id),
    });

  } catch (err) {
    console.error('accept-invitation error:', err);
    return ok({ error: 'unexpected', message: 'The invitation could not be accepted. Please try again.' });
  }
});
