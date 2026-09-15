/**
 * charge-pad-mandate edge function (spec 3.11)
 *
 * POST { org_id, mandate_id, amount_cents, invoice_id, description? }
 * → { ok: true, payment_intent_id, status, charge_id } | { error }
 *
 * Debits a customer's active PAD mandate for one invoice. The caller must be
 * signed in as an owner or admin of the organization: this moves a customer's
 * money. Invoices live on the operator's computer, so the server cannot derive
 * the amount; it bounds it with a ceiling instead (PAD_MAX_CHARGE_CENTS).
 *
 * Each attempt is written to pad_charges before Stripe is called. The table
 * allows one live charge per invoice and the charge id is the Stripe
 * idempotency key, so a double click or a retried request cannot debit twice.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';
import { requireOrgMember } from '../_shared/auth.ts';
import {
  canManageBilling, checkChargeRequest, maxChargeCents,
  chargeIdempotencyKey, isUniqueViolation, LIVE_CHARGE_STATUSES,
} from '../_shared/billingRules.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const check = checkChargeRequest(body, maxChargeCents(Deno.env.get('PAD_MAX_CHARGE_CENTS')));
  if (!check.ok) return json({ error: check.error }, check.status);

  const { org_id, mandate_id, amount_cents, invoice_id, description } = body as {
    org_id: string; mandate_id: string; amount_cents: number; invoice_id: string; description?: string;
  };

  let caller: { user: { id: string }; role: string | null };
  try { caller = await requireOrgMember(req, org_id); }
  catch (resp) { return resp as Response; }

  if (!canManageBilling(caller.role)) {
    return json({ error: 'forbidden_role' }, 403);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: mandate, error: fetchErr } = await supabase
      .from('pad_mandates')
      .select('stripe_payment_method, stripe_customer_id, stripe_mandate_id, status, org_id')
      .eq('id', mandate_id)
      .single();

    if (fetchErr || !mandate) {
      return json({ error: 'mandate_not_found' }, 404);
    }

    if (mandate.org_id !== org_id) {
      return json({ error: 'forbidden' }, 403);
    }

    if (mandate.status !== 'active') {
      return json({ error: 'mandate_not_active', status: mandate.status }, 422);
    }

    if (!mandate.stripe_payment_method || !mandate.stripe_customer_id) {
      return json({ error: 'mandate_incomplete' }, 422);
    }

    // Record the attempt first. The unique index refuses a second live charge
    // for the same invoice, so only one request can reach Stripe.
    const { data: charge, error: chargeErr } = await supabase
      .from('pad_charges')
      .insert({
        org_id,
        mandate_id,
        invoice_id,
        amount_cents,
        currency: 'cad',
        status: 'pending',
        requested_by: caller.user.id,
      })
      .select('id')
      .single();

    if (chargeErr || !charge) {
      if (isUniqueViolation(chargeErr)) {
        const { data: live } = await supabase
          .from('pad_charges')
          .select('id, status, amount_cents, stripe_payment_intent_id, created_at')
          .eq('org_id', org_id)
          .eq('invoice_id', invoice_id)
          .in('status', LIVE_CHARGE_STATUSES)
          .maybeSingle();
        return json({ error: 'already_charged', charge: live ?? null }, 409);
      }
      console.error('pad_charges insert error:', chargeErr);
      return json({ error: 'db_error' }, 500);
    }

    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: amount_cents,
        currency: 'cad',
        payment_method_types: ['acss_debit'],
        payment_method: mandate.stripe_payment_method,
        customer: mandate.stripe_customer_id,
        mandate: mandate.stripe_mandate_id || undefined,
        confirm: true,
        off_session: true,
        description: description || `PAD - invoice ${invoice_id}`,
        metadata: { org_id, mandate_id, invoice_id, charge_id: charge.id },
      }, { idempotencyKey: chargeIdempotencyKey(charge.id) });
    } catch (e: unknown) {
      const err = e as { type?: string; message?: string; code?: string };
      console.error('charge-pad-mandate Stripe error:', err);
      // Release the invoice so the charge can be retried.
      await supabase
        .from('pad_charges')
        .update({ status: 'failed', failure_reason: String(err?.message ?? e).slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', charge.id);
      if (err?.type === 'StripeCardError' || err?.code === 'payment_intent_authentication_failure') {
        return json({ error: 'charge_failed', stripe_error: err?.message }, 422);
      }
      return json({ error: 'server_error', detail: String(err?.message ?? e) }, 500);
    }

    // If this update does not land the row stays 'pending', which still blocks
    // a duplicate; the webhook matches it by charge_id when Stripe reports back.
    const { error: submitErr } = await supabase
      .from('pad_charges')
      .update({ status: 'submitted', stripe_payment_intent_id: intent.id, updated_at: new Date().toISOString() })
      .eq('id', charge.id);
    if (submitErr) console.error('pad_charges submit update failed:', charge.id, submitErr);

    await supabase
      .from('pad_mandates')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', mandate_id);

    return json({ ok: true, payment_intent_id: intent.id, status: intent.status, charge_id: charge.id });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error('charge-pad-mandate error:', err);
    return json({ error: 'server_error', detail: String(err?.message ?? e) }, 500);
  }
});
