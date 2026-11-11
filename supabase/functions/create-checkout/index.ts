import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14';
import { getOrgForUser } from '../_shared/getOrgForUser.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Server-side mapping: planKey -> Stripe price ID, for plans a customer can start on.
// The per-location prices are NOT here: they are add-ons billed on top of an
// existing Franchise subscription (see create-invitation), never a plan of their own.
const PLAN_PRICES: Record<string, string> = {
  pro_monthly:                 'price_1TCLnfGcfc7VEkjZIMBbNl4n',
  pro_annual:                  'price_1TCLnmGcfc7VEkjZX2wv763a',
  network_monthly:             'price_1TCLkXGcfc7VEkjZyZIa4Pkr',
  network_annual:              'price_1TCLkyGcfc7VEkjZZgwQGotm',
  franchise_monthly:           'price_1TCLpmGcfc7VEkjZTuaZCNwp',
  franchise_annual:            'price_1TCLq1Gcfc7VEkjZZK3UlWpz',
};

// The released desktop app sends a price id instead of a plan key. Accept it only
// when it is one of the standalone prices above; anything else is refused.
const ALLOWED_PRICE_IDS = new Set(Object.values(PLAN_PRICES));
const TRIAL_DAYS = 30;

const ALLOWED_REDIRECT_HOSTS = ['balanceiq.app', 'balanceiq.ca'];

function isAllowedRedirectUrl(url: string | undefined): boolean {
  if (!url) return true; // undefined → use server default
  try {
    const p = new URL(url);
    // The desktop app returns through its own deep link.
    if (p.protocol === 'balanceiq:') return true;
    if (p.hostname === 'localhost' || p.hostname === '127.0.0.1') return true;
    return p.protocol === 'https:' && ALLOWED_REDIRECT_HOSTS.some(h => p.hostname === h || p.hostname.endsWith('.' + h));
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the request using the user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { planKey, priceId: requestedPriceId, orgId, successUrl, cancelUrl } = await req.json();

    if ((!planKey && !requestedPriceId) || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing planKey or orgId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const priceId = planKey
      ? PLAN_PRICES[String(planKey)]
      : (ALLOWED_PRICE_IDS.has(String(requestedPriceId)) ? String(requestedPriceId) : undefined);
    if (!priceId) {
      return new Response(JSON.stringify({ error: planKey ? 'Invalid planKey' : 'Invalid priceId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isAllowedRedirectUrl(successUrl) || !isAllowedRedirectUrl(cancelUrl)) {
      return new Response(JSON.stringify({ error: 'Redirect URL not allowed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serverOrgId = await getOrgForUser(supabaseAdmin, user.id);
    if (!serverOrgId || serverOrgId !== orgId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('stripe_customer_id, name')
      .eq('id', orgId)
      .single();

    let customerId = orgRow?.stripe_customer_id;

    // Create Stripe customer if none exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: orgRow?.name,
        metadata: { orgId, userId: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', orgId);
    }

    // One free trial per organization: skip it if the customer ever had a subscription
    // of any status (active, canceled, trialing...). A brand-new customer has none.
    const prior = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 1 });
    const hadSubscription = prior.data.length > 0;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_collection: 'always',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(hadSubscription ? {} : { trial_period_days: TRIAL_DAYS }),
        metadata: { orgId, userId: user.id },
      },
      metadata: { orgId, userId: user.id },
      success_url: successUrl || 'https://balanceiq.app/success',
      cancel_url:  cancelUrl  || 'https://balanceiq.app/cancel',
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('create-checkout error:', err);
    return new Response(JSON.stringify({ error: 'checkout_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
