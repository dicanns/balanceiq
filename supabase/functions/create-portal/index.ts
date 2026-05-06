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

const ALLOWED_REDIRECT_HOSTS = ['balanceiq.app', 'balanceiq.ca'];

function isAllowedRedirectUrl(url: string | undefined): boolean {
  if (!url) return true;
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

    const { orgId, returnUrl } = await req.json();

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Missing orgId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isAllowedRedirectUrl(returnUrl)) {
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
      .select('stripe_customer_id')
      .eq('id', orgId)
      .single();

    const customerId = orgRow?.stripe_customer_id;
    if (!customerId) {
      return new Response(JSON.stringify({ error: 'No Stripe customer found for this organization. Please subscribe first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || 'https://balanceiq.app',
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('create-portal error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
