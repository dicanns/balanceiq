/**
 * create-pad-mandate edge function (spec 3.11)
 *
 * POST { org_id, client_id, client_name, client_email, operator_email,
 *        followup_enabled?, success_url?, cancel_url? }
 * → { ok: true, checkout_url, mandate_id }
 *
 * Creates a Stripe Checkout Session in setup mode for ACSS Debit (Canadian PAD),
 * inserts a pending record in pad_mandates, and returns the hosted URL to email to the client.
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
    const {
      org_id,
      client_id,
      client_name,
      client_email,
      operator_email,
      followup_enabled = false,
      success_url,
      cancel_url,
    } = await req.json();

    if (!org_id || !client_id || !client_email) {
      return json({ error: 'missing_params', required: ['org_id', 'client_id', 'client_email'] }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Insert pending mandate record first so we have an ID for Stripe metadata
    const { data: mandate, error: insertErr } = await supabase
      .from('pad_mandates')
      .insert({
        org_id,
        client_id,
        client_name: client_name || null,
        client_email,
        operator_email: operator_email || null,
        status: 'pending',
        currency: 'cad',
        followup_enabled: !!followup_enabled,
      })
      .select('id')
      .single();

    if (insertErr || !mandate) {
      console.error('pad_mandates insert error:', insertErr);
      return json({ error: 'db_error', detail: insertErr?.message }, 500);
    }

    const mandateId = mandate.id as string;

    const baseUrl = 'https://biq-accept-quote.sweet-bird-4d5f.workers.dev';
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      payment_method_types: ['acss_debit'],
      payment_method_options: {
        acss_debit: {
          mandate_options: {
            payment_schedule: 'sporadic',
            transaction_type: 'business',
          },
          currency: 'cad',
          verification_method: 'instant',
        },
      },
      customer_email: client_email,
      success_url: success_url || `${baseUrl}/pad-success?mandate_id=${mandateId}`,
      cancel_url: cancel_url || `${baseUrl}/pad-cancel?mandate_id=${mandateId}`,
      metadata: { org_id, client_id, mandate_id: mandateId },
    });

    // Store setup intent ID on the mandate so the webhook can match it
    await supabase
      .from('pad_mandates')
      .update({ stripe_setup_intent: session.setup_intent as string })
      .eq('id', mandateId);

    return json({ ok: true, checkout_url: session.url, mandate_id: mandateId });
  } catch (e) {
    console.error('create-pad-mandate error:', e);
    return json({ error: 'server_error', detail: String(e?.message ?? e) }, 500);
  }
});
