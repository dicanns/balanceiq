import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OCR_MONTHLY_LIMIT = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Always return 200 so supabase.functions.invoke() passes data through to the client.
// Use data.error field for business-logic errors.
function ok(body: Record<string, unknown>) {
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

STEP 6 — Return ONLY this JSON, no explanation:
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
  "notes": null
}

All values must be plain numbers (no $ signs, no commas). Return ONLY the JSON.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageType, orgId, ownApiKey } = await req.json();

    if (!imageBase64 || !imageType) {
      return ok({ error: 'missing_params', message: 'Missing imageBase64 or imageType.' });
    }

    // Validate image size (max ~10MB base64 ≈ 7.5MB file — client resizes before sending)
    if (imageBase64.length > 14_000_000) {
      return ok({ error: 'too_large', message: 'Image too large. Max 10 MB.' });
    }

    let apiKey = ownApiKey || null;

    if (!apiKey) {
      // Authenticate and check plan + usage
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return ok({ error: 'no_auth', message: 'Sign-in required. Log in via Settings → Application.' });
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Verify JWT
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return ok({ error: 'no_auth', message: 'Session expired. Please sign in again.' });
      }

      if (!orgId) {
        return ok({ error: 'no_org', message: 'Organization not found.' });
      }

      // Check org plan
      const { data: orgRow } = await supabaseAdmin
        .from('organizations')
        .select('plan')
        .eq('id', orgId)
        .single();

      const plan = orgRow?.plan || 'free';
      if (plan !== 'pro' && plan !== 'franchise') {
        return ok({ error: 'upgrade_required', message: 'AI scanning requires a Pro plan.' });
      }

      // Check and increment usage
      const month = new Date().toISOString().slice(0, 7); // YYYY-MM
      const { data: usageRow } = await supabaseAdmin
        .from('ocr_usage')
        .select('count')
        .eq('org_id', orgId)
        .eq('month', month)
        .single();

      const currentCount = usageRow?.count || 0;
      if (currentCount >= OCR_MONTHLY_LIMIT) {
        return ok({ error: 'limit_reached', scansUsed: currentCount, scansLimit: OCR_MONTHLY_LIMIT });
      }

      // Increment counter
      await supabaseAdmin
        .from('ocr_usage')
        .upsert({ org_id: orgId, month, count: currentCount + 1 }, { onConflict: 'org_id,month' });

      apiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    }

    if (!apiKey) {
      return ok({ error: 'no_key', message: 'ANTHROPIC_API_KEY secret is not set in Supabase Edge Function settings.' });
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
        max_tokens: 1024,
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
      return ok({ error: 'claude_error', message: `Erreur Anthropic (${claudeRes.status}): ${errBody.slice(0, 200)}` });
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

    return ok({ ...parsed, usedOwnKey: !!ownApiKey });

  } catch (err) {
    console.error('ocr-invoice error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
