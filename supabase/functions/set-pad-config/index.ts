/**
 * set-pad-config edge function
 * Stores per-org PAD configuration (webhook_secret) in pad_config table.
 * Called by the BalanceIQ desktop app when the operator pastes their
 * Stripe webhook signing secret in Config → Online Payments.
 *
 * POST { org_id: string, webhook_secret: string }
 * Returns { ok: true } or { error: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { org_id?: string; webhook_secret?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { org_id, webhook_secret } = body;
  if (!org_id || !webhook_secret) return json({ error: 'missing_fields' }, 400);
  if (!webhook_secret.startsWith('whsec_')) return json({ error: 'invalid_secret_format' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await supabase
    .from('pad_config')
    .upsert({ org_id, webhook_secret, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });

  if (error) {
    console.error('set-pad-config DB error:', error);
    return json({ error: 'db_error', detail: error.message }, 500);
  }

  console.log('PAD config saved for org:', org_id);
  return json({ ok: true });
});
