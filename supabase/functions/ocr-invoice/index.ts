import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOrgForUser } from '../_shared/getOrgForUser.ts';

const OCR_MONTHLY_LIMIT = 100;

const ALLOWED_ORIGINS = ['https://balanceiq.ca', 'http://localhost:5173'];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Always return 200 so supabase.functions.invoke() passes data through to the client.
// Use data.error field for business-logic errors.
function ok(body: Record<string, unknown>, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const EXTRACT_PROMPT = `You are extracting data from a supplier invoice. Follow these steps exactly, then return a single JSON object.

STEP 1 — Grand total (tax-in):
Find the final "PAYEZ CE MONTANT", "TOTAL", or "BALANCE DUE" amount. This is "total".

STEP 2 — TPS and TVQ dollar amounts:
A valid TPS line looks like: "5.00 % T.P.S. sur 300.71    15.04" — it contains a percentage AND "T.P.S." or "GST". The dollar amount at the end of that line (15.04) is "tps".
A valid TVQ line looks like: "9.975 % T.V.Q. sur 300.71    30.00" — it contains a percentage AND "T.V.Q." or "QST". The dollar amount at the end of that line (30.00) is "tvq".
CRITICAL: A line that says only "Frais de livraison" or "Shipping" or "Delivery" with a dollar amount is a PRODUCT COST — it has no percentage, no "T.P.S.", no "T.V.Q.". Never use it as tps or tvq.

STEP 3 — Total before tax (math, do not sum line items):
subtotalBeforeTax = total - tps - tvq
This is always exact. Do not try to add up individual line items.

STEP 4 — Taxable base:
Look for a pattern like "5% T.P.S. sur 300.71" or "GST @ 5% on 300.71".
The number after "sur" or "on" is subtotalTaxable. Use it directly.
If no such pattern exists, calculate: subtotalTaxable = tps / 0.05.

STEP 5 — Non-taxable:
subtotalNonTaxable = subtotalBeforeTax - subtotalTaxable

STEP 6 — Line items:
Extract every product/ingredient line from the invoice body (skip tax lines, totals, shipping fees, and header rows).
For each product line, extract: description (exact text from invoice), quantity (number only), unit (kg/lb/case/L/each/etc.), unit_price (price per unit), extended_price (total for that line).
If a field is unreadable or absent, use null.

STEP 7 — Return ONLY this JSON, no explanation:
{
  "supplier": "supplier or vendor name",
  "date": "YYYY-MM-DD or null",
  "invoiceNumber": "invoice number — look for fields labeled 'Invoice No', 'No. Facture', 'No. de Facture', 'Facture No', 'Invoice #', 'Fact. No' — ignore RIN, NIR, NAS, order numbers, PO numbers, customer numbers",
  "subtotalTaxable": number from Step 4,
  "subtotalNonTaxable": number from Step 5,
  "subtotalBeforeTax": number from Step 3,
  "tps": number from Step 2 (0 if none),
  "tvq": number from Step 2 (0 if none),
  "total": number from Step 1,
  "currency": "CAD",
  "notes": null,
  "lineItems": [
    {"description": "exact text", "quantity": number_or_null, "unit": "kg", "unit_price": number_or_null, "extended_price": number_or_null}
  ]
}

All numeric values must be plain numbers (no $ signs, no commas). lineItems must be an array (empty [] if no items readable). Return ONLY the JSON.`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageType, orgId, ownApiKey } = await req.json();

    if (!imageBase64 || !imageType) {
      return ok({ error: 'missing_params', message: 'Missing imageBase64 or imageType.' }, corsHeaders);
    }

    // Validate image size (max ~10MB base64 ≈ 7.5MB file — client resizes before sending)
    if (imageBase64.length > 14_000_000) {
      return ok({ error: 'too_large', message: 'Image too large. Max 10 MB.' }, corsHeaders);
    }

    // Always authenticate — ownApiKey only controls which key pays for the Anthropic call,
    // never whether the user is authorized to use this endpoint.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return ok({ error: 'no_auth', message: 'Sign-in required. Log in via Settings → Application.' }, corsHeaders);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return ok({ error: 'no_auth', message: 'Session expired. Please sign in again.' }, corsHeaders);
    }

    if (!orgId) {
      return ok({ error: 'no_org', message: 'Organization not found.' }, corsHeaders);
    }

    const serverOrgId = await getOrgForUser(supabaseAdmin, user.id);
    if (!serverOrgId || serverOrgId !== orgId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check org plan
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('plan')
      .eq('id', orgId)
      .single();

    const plan = orgRow?.plan || 'free';
    if (plan !== 'pro' && plan !== 'franchise') {
      return ok({ error: 'upgrade_required', message: 'AI scanning requires a Pro plan.' }, corsHeaders);
    }

    // Atomically reserve a quota slot before calling Claude
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { data: newCount, error: rpcErr } = await supabaseAdmin
      .rpc('increment_usage_if_under_limit', {
        p_table: 'ocr_usage', p_org_id: orgId, p_month: month, p_limit: OCR_MONTHLY_LIMIT,
      });

    if (rpcErr || newCount === null || newCount === -1) {
      const { data: usageRow } = await supabaseAdmin.from('ocr_usage').select('count').eq('org_id', orgId).eq('month', month).single();
      const scansUsed = usageRow?.count ?? OCR_MONTHLY_LIMIT;
      return ok({ error: 'limit_reached', scansUsed, scansLimit: OCR_MONTHLY_LIMIT }, corsHeaders);
    }

    // Decide which API key pays for the Anthropic call
    const apiKey = ownApiKey || Deno.env.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
      return ok({ error: 'no_key', message: 'ANTHROPIC_API_KEY secret is not set in Supabase Edge Function settings.' }, corsHeaders);
    }

    // Call Claude Haiku 4.5 vision
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageType, data: imageBase64 } },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error('Claude API error:', claudeRes.status, errBody);
      // API failed — do NOT increment quota
      return ok({ error: 'claude_error', message: `Erreur Anthropic (${claudeRes.status}): ${errBody.slice(0, 200)}` }, corsHeaders);
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '{}';

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      try { parsed = match ? JSON.parse(match[0]) : {}; } catch { parsed = {}; }
    }

    return ok({ ...parsed, usedOwnKey: !!ownApiKey }, corsHeaders);

  } catch (err) {
    console.error('ocr-invoice error:', err);
    const corsHeaders = getCorsHeaders(req);
    return ok({ error: 'unexpected', message: String(err) }, corsHeaders);
  }
});
