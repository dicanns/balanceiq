import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

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

    const { franchisorOrgId, locationId, locationName } = await req.json();
    if (!franchisorOrgId || !locationId) {
      return ok({ error: 'missing_params', message: 'Missing franchisorOrgId or locationId.' });
    }

    // Verify caller's org has franchise plan
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('plan')
      .eq('id', franchisorOrgId)
      .single();

    if (orgRow?.plan !== 'franchise') {
      return ok({ error: 'upgrade_required', message: 'Franchise plan required.' });
    }

    // Find the most recent invitation for this location that has a Stripe item
    const { data: inviteRow } = await supabaseAdmin
      .from('franchise_invitations')
      .select('id, stripe_item_id, status, location_name')
      .eq('franchisor_org_id', franchisorOrgId)
      .eq('location_id', locationId)
      .not('stripe_item_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let stripeRemoved = false;
    const stripeItemId = inviteRow?.stripe_item_id;
    const resolvedName = locationName || inviteRow?.location_name || locationId;

    if (stripeItemId) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
      try {
        await stripe.subscriptionItems.del(stripeItemId, { proration_behavior: 'create_prorations' });
        stripeRemoved = true;
        console.log(`Stripe: removed subscription item ${stripeItemId} for location ${locationId} (org ${franchisorOrgId})`);
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        // If item is already deleted or not found, treat as success — don't block the revocation
        if (msg.includes('No such subscription_item') || msg.includes('resource_missing')) {
          console.warn(`Stripe item ${stripeItemId} already gone — proceeding with revocation`);
          stripeRemoved = true;
        } else {
          console.error('Stripe error removing location item:', msg);
          return ok({ error: 'stripe_error', message: `Could not remove Stripe billing: ${msg}` });
        }
      }
    }

    // Mark all invitations for this location as expired
    const { error: updateError } = await supabaseAdmin
      .from('franchise_invitations')
      .update({ status: 'expired' })
      .eq('franchisor_org_id', franchisorOrgId)
      .eq('location_id', locationId)
      .in('status', ['pending', 'accepted']);

    if (updateError) {
      return ok({ error: 'update_failed', message: updateError.message });
    }

    return ok({
      success: true,
      stripeRemoved,
      stripeItemId: stripeItemId ?? null,
      locationId,
      locationName: resolvedName,
    });

  } catch (err) {
    console.error('revoke-invitation error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
