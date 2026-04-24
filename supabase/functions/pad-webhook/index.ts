/**
 * pad-webhook edge function (spec 3.11) — multi-tenant revision
 *
 * Each operator stores their Stripe webhook signing secret in pad_config
 * (via set-pad-config). This function reads that per-org secret at runtime
 * so operators never need Supabase access.
 *
 * Flow:
 *   1. Read raw body + stripe-signature header
 *   2. Parse JSON (without verifying) to extract org_id from metadata
 *   3. Look up that org's webhook_secret from pad_config
 *   4. Verify Stripe signature — reject if invalid
 *   5. Process event
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getWebhookSecret(supabase: ReturnType<typeof createClient>, orgId: string): Promise<string> {
  if (!orgId) return Deno.env.get('STRIPE_WEBHOOK_SECRET_PAD') || Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
  const { data } = await supabase
    .from('pad_config')
    .select('webhook_secret')
    .eq('org_id', orgId)
    .single();
  if (data?.webhook_secret) return data.webhook_secret;
  return Deno.env.get('STRIPE_WEBHOOK_SECRET_PAD') || Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
}

function extractOrgId(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.data?.object?.metadata?.org_id || '';
  } catch {
    return '';
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const sig = req.headers.get('stripe-signature') || '';
  const body = await req.text();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const orgId = extractOrgId(body);
  const webhookSecret = await getWebhookSecret(supabase, orgId);

  if (!webhookSecret) {
    console.error('No webhook secret found for org:', orgId || '(unknown)');
    return json({ error: 'no_webhook_secret' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (e) {
    console.error('Webhook signature verification failed for org:', orgId, e);
    return json({ error: 'invalid_signature' }, 400);
  }

  // Dedup: reject if this event ID was already processed
  const { error: dedupErr } = await supabase
    .from('pad_webhook_events')
    .insert({ event_id: event.id })
    .single();
  if (dedupErr) {
    // Unique constraint violation = already processed
    console.log('Duplicate webhook event ignored:', event.id);
    return json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'setup') break;

        const mandateId = session.metadata?.mandate_id;
        if (!mandateId) break;

        const setupIntentId = session.setup_intent as string;
        const customerId = session.customer as string;

        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
          expand: ['payment_method', 'mandate'],
        });

        const paymentMethodId = typeof setupIntent.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id || '';

        const stripeMandateId = typeof setupIntent.mandate === 'string'
          ? setupIntent.mandate
          : setupIntent.mandate?.id || '';

        let bankName = '';
        let last4 = '';
        if (typeof setupIntent.payment_method === 'object' && setupIntent.payment_method) {
          const pm = setupIntent.payment_method as Stripe.PaymentMethod;
          if (pm.acss_debit) {
            bankName = pm.acss_debit.bank_name || '';
            last4 = pm.acss_debit.last4 || '';
          }
        }

        await supabase
          .from('pad_mandates')
          .update({
            status: 'active',
            stripe_payment_method: paymentMethodId,
            stripe_mandate_id: stripeMandateId,
            stripe_customer_id: customerId,
            bank_name: bankName || null,
            last4: last4 || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', mandateId);

        console.log('PAD mandate activated:', mandateId, bankName, last4);
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const mandateId = pi.metadata?.mandate_id;

        if (mandateId) {
          await supabase
            .from('pad_mandates')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', mandateId)
            .eq('status', 'nsf');
        }

        console.log('PAD payment succeeded:', pi.id, 'mandate:', mandateId);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const mandateId = pi.metadata?.mandate_id;
        const invoiceId = pi.metadata?.invoice_id || null;

        if (mandateId) {
          const reason = pi.last_payment_error?.message || pi.last_payment_error?.code || 'payment_failed';
          await supabase
            .from('pad_mandates')
            .update({
              status: 'nsf',
              nsf_invoice_id: invoiceId,
              nsf_reason: reason,
              nsf_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', mandateId);

          console.log('PAD payment failed (NSF):', pi.id, 'mandate:', mandateId, 'invoice:', invoiceId, reason);
        }
        break;
      }

      case 'mandate.updated': {
        const mandate = event.data.object as Stripe.Mandate;
        if (mandate.status === 'inactive') {
          await supabase
            .from('pad_mandates')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('stripe_mandate_id', mandate.id);

          console.log('PAD mandate cancelled:', mandate.id);
        }
        break;
      }

      default:
        console.log('Unhandled PAD webhook event:', event.type);
    }

    return json({ received: true });
  } catch (e) {
    console.error('pad-webhook handler error:', e);
    return json({ error: 'handler_error', detail: String(e) }, 500);
  }
});
