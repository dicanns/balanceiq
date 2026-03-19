import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Maps Stripe price IDs to plan names
const PRICE_TO_PLAN: Record<string, string> = {
  // ── Grandfathered / legacy prices (keep for existing subscribers) ──
  'price_1T9C86Gcfc7VEkjZJM9r5FeW': 'pro',        // old Pro $49/mo
  'price_1T9C8MGcfc7VEkjZH0iNcaoK': 'franchise',   // old Franchise $199/mo
  'price_1T9C8cGcfc7VEkjZxGdIU7tt': 'franchise',   // old Franchise Location $29/mo
  'price_1T9uJzGcfc7VEkjZ9yoyzz5g': 'network',     // old Network Pro $19/mo
  // ── Current prices (March 2026) ──
  'price_1TCLnfGcfc7VEkjZIMBbNl4n': 'pro',         // Pro $14/mo
  'price_1TCLnmGcfc7VEkjZX2wv763a': 'pro',         // Pro $119/yr
  'price_1TCLkXGcfc7VEkjZyZIa4Pkr': 'network',     // Network Pro $5/mo
  'price_1TCLkyGcfc7VEkjZZgwQGotm': 'network',     // Network Pro $49/yr
  'price_1TCLpmGcfc7VEkjZTuaZCNwp': 'franchise',   // Franchise $49/mo
  'price_1TCLq1Gcfc7VEkjZZK3UlWpz': 'franchise',   // Franchise $490/yr
  'price_1TCLqxGcfc7VEkjZs19hWTOo': 'franchise',   // Franchise Location $9/mo
  'price_1TCLrZGcfc7VEkjZF2o6LLXs': 'franchise',   // Franchise Location $90/yr
};

async function setOrgPlan(orgId: string, plan: string, extra: Record<string, string> = {}) {
  await supabase
    .from('organizations')
    .update({ plan, ...extra })
    .eq('id', orgId);
}

serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret!);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        if (!orgId) break;

        // Determine plan from line items
        const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
          expand: ['items.data.price'],
        });
        const priceId = sub.items.data[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId] || 'pro';

        await setOrgPlan(orgId, plan, {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        });

        console.log(`checkout.session.completed: org ${orgId} → ${plan}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string, {
          expand: ['items.data.price'],
        });
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        const priceId = sub.items.data[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId] || 'pro';
        await setOrgPlan(orgId, plan);
        console.log(`invoice.paid: org ${orgId} plan kept active (${plan})`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        // Flag the org so the app can show a payment warning
        await supabase
          .from('organizations')
          .update({ payment_failed: true })
          .eq('id', orgId);
        console.log(`invoice.payment_failed: org ${orgId} flagged`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        await setOrgPlan(orgId, 'free', {
          stripe_subscription_id: '',
        });
        console.log(`subscription.deleted: org ${orgId} → free`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        if (sub.status === 'active' || sub.status === 'trialing') {
          const priceId = sub.items.data[0]?.price?.id;
          const plan = PRICE_TO_PLAN[priceId] || 'pro';
          await setOrgPlan(orgId, plan);
          console.log(`subscription.updated: org ${orgId} → ${plan} (${sub.status})`);
        } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
          await setOrgPlan(orgId, 'free');
          console.log(`subscription.updated: org ${orgId} → free (${sub.status})`);
        }
        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
