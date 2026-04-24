/**
 * charge-pad-mandate edge function (spec 3.11)
 *
 * POST { org_id, mandate_id, amount_cents, invoice_id?, description? }
 * → { ok: true, payment_intent_id } | { error }
 *
 * Charges an active PAD mandate by creating a Stripe PaymentIntent with the
 * stored payment method. Called when an invoice with PAD preference hits its due date.
 * No JWT required — called from Electron app with anon key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

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

  try {
    const { org_id, mandate_id, amount_cents, invoice_id, description } = await req.json();

    if (!org_id || !mandate_id || !amount_cents) {
      return json({ error: 'missing_params', required: ['org_id', 'mandate_id', 'amount_cents'] }, 400);
    }

    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      return json({ error: 'invalid_amount' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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

    const intent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'cad',
      payment_method_types: ['acss_debit'],
      payment_method: mandate.stripe_payment_method,
      customer: mandate.stripe_customer_id,
      mandate: mandate.stripe_mandate_id || undefined,
      confirm: true,
      off_session: true,
      description: description || `PAD — facture ${invoice_id || ''}`,
      metadata: {
        org_id,
        mandate_id,
        invoice_id: invoice_id || '',
      },
    });

    // Track attempt on mandate
    await supabase
      .from('pad_mandates')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', mandate_id);

    return json({ ok: true, payment_intent_id: intent.id, status: intent.status });
  } catch (e: unknown) {
    const err = e as { type?: string; message?: string; code?: string };
    console.error('charge-pad-mandate error:', err);

    // Stripe payment failure — mark mandate as having an issue (not cancelled; may retry)
    if (err?.type === 'StripeCardError' || err?.code === 'payment_intent_authentication_failure') {
      return json({ error: 'charge_failed', stripe_error: err?.message }, 422);
    }

    return json({ error: 'server_error', detail: String(err?.message ?? e) }, 500);
  }
});
