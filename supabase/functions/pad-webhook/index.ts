/**
 * pad-webhook edge function (spec 3.11) - multi-tenant revision
 *
 * Each operator stores their Stripe webhook signing secret in pad_config
 * (via set-pad-config). This function reads that per-org secret at runtime
 * so operators never need Supabase access.
 *
 * Flow:
 *   1. Read raw body + stripe-signature header
 *   2. Try the platform signing secret first. If it verifies, the event is
 *      Stripe's own and its org_id metadata can be trusted.
 *   3. Otherwise look up the secret of the org the message CLAIMS, and verify
 *      with it. The claim is only used to pick a candidate secret: an event
 *      that verifies this way is trusted for that one org and nothing else.
 *   4. Every database update is limited to rows of the event's org.
 */
import { isUniqueViolation } from '../_shared/billingRules.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const platformSecrets = (): string[] =>
  [Deno.env.get('STRIPE_WEBHOOK_SECRET_PAD'), Deno.env.get('STRIPE_WEBHOOK_SECRET')].filter((x): x is string => !!x);

async function orgSecret(supabase: ReturnType<typeof createClient>, orgId: string): Promise<string> {
  if (!orgId) return '';
  const { data } = await supabase.from('pad_config').select('webhook_secret').eq('org_id', orgId).maybeSingle();
  return data?.webhook_secret || '';
}

// Org named by the (not yet trusted) message; used only to choose a secret to try.
function claimedOrgId(body: string): string {
  try {
    const v = JSON.parse(body)?.data?.object?.metadata?.org_id;
    return typeof v === 'string' ? v.slice(0, 100) : '';
  } catch {
    return '';
  }
}

type Verified = { event: Stripe.Event; scope: 'platform' | 'org'; orgId: string };

async function verify(supabase: ReturnType<typeof createClient>, body: string, sig: string): Promise<Verified | null> {
  for (const secret of platformSecrets()) {
    try {
      const event = await stripe.webhooks.constructEventAsync(body, sig, secret);
      const meta = (event.data.object as { metadata?: Record<string, string> })?.metadata;
      return { event, scope: 'platform', orgId: meta?.org_id || '' };
    } catch { /* try the next candidate */ }
  }
  const claimed = claimedOrgId(body);
  const secret = await orgSecret(supabase, claimed);
  if (!secret) return null;
  try {
    const event = await stripe.webhooks.constructEventAsync(body, sig, secret);
    return { event, scope: 'org', orgId: claimed };
  } catch {
    return null;
  }
}

// Keep the pad_charges record in step with Stripe. Matched by the charge id in
// the payment intent metadata, or by payment intent id for charges created
// before metadata carried it.
async function markCharge(
  supabase: ReturnType<typeof createClient>,
  pi: Stripe.PaymentIntent,
  fields: Record<string, unknown>,
  orgId: string,
  platformSigned: boolean,
) {
  const update = { ...fields, stripe_payment_intent_id: pi.id, updated_at: new Date().toISOString() };
  // Limited to the event's own org. Only a platform-signed event may omit the
  // org (charges created before metadata carried it).
  if (!orgId && !platformSigned) return;
  const base = supabase.from('pad_charges').update(update);
  const query = orgId ? base.eq('org_id', orgId) : base;
  const { error } = pi.metadata?.charge_id
    ? await query.eq('id', pi.metadata.charge_id)
    : await query.eq('stripe_payment_intent_id', pi.id);
  if (error) console.error('pad_charges update failed:', pi.id, error);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const sig = req.headers.get('stripe-signature') || '';
  const body = await req.text();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const verified = await verify(supabase, body, sig);
  if (!verified) {
    console.error('pad-webhook: signature verification failed');
    return json({ error: 'invalid_signature' }, 400);
  }
  const { event, scope, orgId } = verified;

  // Dedup: reject if this event ID was already processed. The key carries the
  // scope so an org-signed message cannot use up another event's id.
  const { error: dedupErr } = await supabase
    .from('pad_webhook_events')
    .insert({ event_id: `${scope === 'platform' ? 'platform' : 'org:' + orgId}:${event.id}` })
    .single();
  if (dedupErr) {
    if (!isUniqueViolation(dedupErr)) {
      console.error('pad-webhook dedup insert failed:', dedupErr);
      return json({ error: 'server_error' }, 500);
    }
    console.log('Duplicate webhook event ignored:', event.id);
    return json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'setup') break;

        const mandateId = session.metadata?.mandate_id;
        if (!mandateId || !orgId) break;

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
          .eq('id', mandateId)
          .eq('org_id', orgId);

        console.log('PAD mandate activated:', mandateId, bankName, last4);
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const mandateId = pi.metadata?.mandate_id;

        await markCharge(supabase, pi, { status: 'succeeded' }, orgId, scope === 'platform');

        if (mandateId && orgId) {
          await supabase
            .from('pad_mandates')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', mandateId)
            .eq('org_id', orgId)
            .eq('status', 'nsf');
        }

        console.log('PAD payment succeeded:', pi.id, 'mandate:', mandateId);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const mandateId = pi.metadata?.mandate_id;
        const invoiceId = pi.metadata?.invoice_id || null;
        const reason = pi.last_payment_error?.message || pi.last_payment_error?.code || 'payment_failed';

        // A failed charge releases the invoice so it can be charged again.
        await markCharge(supabase, pi, { status: 'failed', failure_reason: reason }, orgId, scope === 'platform');

        if (mandateId && orgId) {
          await supabase
            .from('pad_mandates')
            .update({
              status: 'nsf',
              nsf_invoice_id: invoiceId,
              nsf_reason: reason,
              nsf_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', mandateId)
            .eq('org_id', orgId);

          console.log('PAD payment failed (NSF):', pi.id, 'mandate:', mandateId, 'invoice:', invoiceId, reason);
        }
        break;
      }

      case 'mandate.updated': {
        const mandate = event.data.object as Stripe.Mandate;
        // A mandate object carries no org metadata, so only platform-signed events
        // can cancel a mandate, and then by Stripe's own mandate id.
        if (mandate.status === 'inactive' && scope === 'platform') {
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
    return json({ error: 'handler_error' }, 500);
  }
});
