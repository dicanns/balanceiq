/**
 * revoke-invitation edge function
 *
 * POST { franchisorOrgId, locationId, locationName? }
 * → { success, accessRevoked, stripeRemoved, ... } | { error, message, accessRevoked? }
 *
 * Removes a location from the network. revoke_franchise_location unlinks the
 * franchisee organization, removes linked users' access and expires the
 * invitations in one transaction; then the $9/month Stripe item is deleted.
 * Access goes first, so a Stripe failure never leaves a revoked location
 * readable, and revoking again retries the billing removal.
 *
 * Only an owner or admin of the franchisor may revoke. Revoking does not require
 * the franchise plan: a franchisor who downgraded must still be able to cut access.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';
import { canManageBilling } from '../_shared/billingRules.ts';

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

    // Organization and role come from the database, never from the request.
    const { data: caller } = await supabaseAdmin
      .from('users')
      .select('org_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!caller?.org_id || caller.org_id !== franchisorOrgId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!canManageBilling(caller.role)) {
      return ok({ error: 'forbidden_role', message: 'Only the account owner or an admin can revoke a location.' });
    }

    // ── Access first ──
    const { data: revoked, error: revokeErr } = await supabaseAdmin.rpc('revoke_franchise_location', {
      p_franchisor_org_id: franchisorOrgId,
      p_location_id: locationId,
    });
    if (revokeErr || !revoked) {
      console.error('revoke_franchise_location error:', revokeErr);
      return ok({ error: 'revoke_failed', message: 'Could not remove access. Nothing was changed. Try again.' });
    }

    // ── Then billing ──
    const stripeItemId: string | null = revoked.stripe_item_id ?? null;
    let stripeRemoved = false;

    if (stripeItemId) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
      try {
        await stripe.subscriptionItems.del(stripeItemId, { proration_behavior: 'create_prorations' });
        stripeRemoved = true;
        console.log(`Stripe: removed subscription item ${stripeItemId} for location ${locationId} (org ${franchisorOrgId})`);
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        if (msg.includes('No such subscription_item') || msg.includes('resource_missing')) {
          console.warn(`Stripe item ${stripeItemId} already gone`);
          stripeRemoved = true;
        } else {
          console.error('Stripe error removing location item:', msg);
          return ok({
            error: 'stripe_error',
            accessRevoked: true,
            message: `Access was removed, but the $9/month billing could not be removed: ${msg}. Revoke again to retry.`,
          });
        }
      }

      const { error: markErr } = await supabaseAdmin
        .from('franchise_location_billing')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('franchisor_org_id', franchisorOrgId)
        .eq('location_id', locationId)
        .eq('stripe_item_id', stripeItemId);
      // The item is already gone; a later revoke would find it missing and finish this.
      if (markErr) console.error('Could not mark location billing removed:', markErr);
    }

    return ok({
      success: true,
      accessRevoked: true,
      stripeRemoved,
      stripeItemId,
      locationId,
      locationName: locationName || locationId,
      orgsUnlinked: revoked.orgs_unlinked,
      userLinksRemoved: revoked.user_links_removed,
    });

  } catch (err) {
    console.error('revoke-invitation error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
