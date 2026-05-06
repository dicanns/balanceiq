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

// Server-side mapping: planKey → Stripe price ID.
// Clients send planKey; the server resolves the price ID — clients never supply price IDs directly.
const PLAN_PRICES: Record<string, string> = {
  pro_monthly:                 'price_1TCLnfGcfc7VEkjZIMBbNl4n',
  pro_annual:                  'price_1TCLnmGcfc7VEkjZX2wv763a',
  network_monthly:             'price_1TCLkXGcfc7VEkjZyZIa4Pkr',
  network_annual:              'price_1TCLkyGcfc7VEkjZZgwQGotm',
  franchise_monthly:           'price_1TCLpmGcfc7VEkjZTuaZCNwp',
  franchise_annual:            'price_1TCLq1Gcfc7VEkjZZK3UlWpz',
  franchise_location_monthly:  'price_1TCLqxGcfc7VEkjZs19hWTOo',
  franchise_location_annual:   'price_1TCLrZGcfc7VEkjZF2o6LLXs',
};

const ALLOWED_REDIRECT_HOSTS = ['balanceiq.app', 'balanceiq.ca'];

function isAllowedRedirectUrl(url: string | undefined): boolean {
  if (!url) return true; // undefined → use server default
  try {
    const p = new URL(url);
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

    const { planKey, orgId, successUrl, cancelUrl } = await req.json();

    if (!planKey || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing planKey or orgId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const priceId = PLAN_PRICES[planKey];
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid planKey' }), {
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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_collection: 'always',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
