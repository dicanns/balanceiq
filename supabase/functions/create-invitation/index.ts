/**
 * create-invitation edge function
 *
 * POST { franchisorOrgId, locationId, locationName }
 * → { inviteCode, expiresAt, locationName } | { error, message }
 *
 * Creates an invitation code for a franchise location and makes sure the
 * location is billed ($9/month item on the franchisor's subscription). Only an
 * owner or admin of the franchisor may call it, because it changes the bill.
 *
 * Whether to add a Stripe item is decided by claim_location_billing before
 * Stripe is called, so two quick requests cannot both add one, and a location
 * that was revoked is billed again when re-invited. Anything this request adds
 * to Stripe is undone if a later step fails.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';
import { canManageBilling, isUniqueViolation, locationItemIdempotencyKey } from '../_shared/billingRules.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Franchise Location add-on price - $9/month per location
const FRANCHISE_LOCATION_PRICE = 'price_1TCLqxGcfc7VEkjZs19hWTOo';

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
      return ok({ error: 'forbidden_role', message: 'Only the account owner or an admin can invite a billed location.' });
    }

    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('plan, stripe_subscription_id')
      .eq('id', franchisorOrgId)
      .single();

    if (orgRow?.plan !== 'franchise') {
      return ok({ error: 'upgrade_required', message: 'Franchise plan required to create invitations.' });
    }

    if (!orgRow?.stripe_subscription_id) {
      return ok({ error: 'no_subscription', message: 'No active Stripe subscription found. Please complete billing setup in-app.' });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
    const billingRow = () => supabaseAdmin
      .from('franchise_location_billing')
      .update({ updated_at: new Date().toISOString() })
      .eq('franchisor_org_id', franchisorOrgId)
      .eq('location_id', locationId);

    // ── Billing: reuse the location's live item, or claim the right to add one ──
    const { data: claim, error: claimErr } = await supabaseAdmin.rpc('claim_location_billing', {
      p_franchisor_org_id: franchisorOrgId,
      p_location_id: locationId,
    });
    if (claimErr || !claim) {
      console.error('claim_location_billing error:', claimErr);
      return ok({ error: 'billing_check_failed', message: 'Could not check billing for this location. Try again.' });
    }
    if (claim.state === 'in_progress') {
      return ok({ error: 'invite_in_progress', message: 'An invitation for this location is already being created. Wait a moment, then refresh.' });
    }

    let stripeItemId: string | null = claim.state === 'active' ? claim.stripe_item_id : null;
    let addedItemId: string | null = null;

    // Undo the item this request added, so a failure never leaves an unexplained charge.
    const undoBilling = async () => {
      if (!addedItemId) return;
      try {
        await stripe.subscriptionItems.del(addedItemId, { proration_behavior: 'none' });
        await billingRow().update({ status: 'removed', updated_at: new Date().toISOString() }).eq('stripe_item_id', addedItemId);
      } catch (undoErr) {
        // The row still says active with this item, which matches Stripe.
        console.error('Could not undo location item', addedItemId, undoErr);
      }
    };

    if (claim.state === 'claimed') {
      try {
        const item = await stripe.subscriptionItems.create({
          subscription: orgRow.stripe_subscription_id,
          price: FRANCHISE_LOCATION_PRICE,
          quantity: 1,
        }, { idempotencyKey: locationItemIdempotencyKey(claim.claim_id) });
        addedItemId = item.id;
      } catch (stripeErr) {
        console.error('Stripe error adding location item:', stripeErr);
        await billingRow()
          .update({ status: 'removed', updated_at: new Date().toISOString() })
          .eq('status', 'claimed')
          .eq('claim_id', claim.claim_id);
        return ok({
          error: 'payment_required',
          message: 'Could not add the $9/month location charge. Please verify your payment method in billing settings.',
        });
      }

      // Finish only while this request still holds the claim.
      const { data: finished, error: finishErr } = await billingRow()
        .update({ status: 'active', stripe_item_id: addedItemId, updated_at: new Date().toISOString() })
        .eq('status', 'claimed')
        .eq('claim_id', claim.claim_id)
        .select('location_id');
      if (finishErr || !finished?.length) {
        console.error('Could not record location item', addedItemId, finishErr);
        await undoBilling();
        return ok({ error: 'billing_record_failed', message: 'Billing could not be recorded, so the charge was undone. Try again.' });
      }
      stripeItemId = addedItemId;
      console.log(`Stripe: added location item ${addedItemId} for org ${franchisorOrgId} location ${locationId}`);
    } else {
      console.log(`Stripe: reusing live item ${stripeItemId} for location ${locationId}`);
    }

    // ── Invitation ──
    // Replacing the code: the previous pending invitation for this location expires.
    const { error: expireErr } = await supabaseAdmin
      .from('franchise_invitations')
      .update({ status: 'expired' })
      .eq('franchisor_org_id', franchisorOrgId)
      .eq('location_id', locationId)
      .eq('status', 'pending');
    if (expireErr) {
      await undoBilling();
      return ok({ error: 'update_failed', message: expireErr.message });
    }

    let inviteCode = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomCode();
      const { data: existing } = await supabaseAdmin
        .from('franchise_invitations')
        .select('id')
        .eq('invite_code', candidate)
        .maybeSingle();
      if (!existing) { inviteCode = candidate; break; }
    }
    if (!inviteCode) {
      await undoBilling();
      return ok({ error: 'code_gen_failed', message: 'Could not generate unique code. Try again.' });
    }

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
        stripe_item_id: stripeItemId,
      });

    if (insertError) {
      await undoBilling();
      if (isUniqueViolation(insertError)) {
        return ok({ error: 'invite_in_progress', message: 'An invitation for this location was just created. Refresh to see it.' });
      }
      return ok({ error: 'insert_failed', message: insertError.message });
    }

    return ok({ inviteCode, expiresAt, locationName });

  } catch (err) {
    console.error('create-invitation error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
