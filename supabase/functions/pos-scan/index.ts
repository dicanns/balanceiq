import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOrgForUser } from '../_shared/getOrgForUser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const EXTRACT_PROMPT = `You are a POS report reader for a restaurant operations app.
Extract the following fields from the attached end-of-day POS report image.
Return ONLY valid JSON, no explanation.

Fields to extract:
- ventes_avant_taxes (net sales before tax — look for "Ventes nettes", "Net Sales", "Sales before tax", "Sous-total")
- tps (federal tax / GST / TPS — look for "TPS", "GST", "Taxe fédérale")
- tvq (provincial tax / QST / TVQ — look for "TVQ", "QST", "Taxe provinciale")
- interac (Interac/debit card total — look for "Interac", "Débit", "Debit")
- visa (Visa/credit card total, if present)
- mastercard (Mastercard total, if present)
- especes (cash total — look for "Comptant", "Cash", "Espèces")
- livraisons (delivery total — DoorDash, Uber Eats, Skip, etc.)
- nb_transactions (transaction count — look for "Transactions", "Nb transactions", "#")
- pos_system (detected POS system name, if identifiable from logos, headers, or footer text)

For each field found, return:
{ "value": number_or_null, "confidence": "high"|"medium"|"low", "raw_label": "exact label text from report" }

If a field is not found in the report, return null for that field.
Return amounts as plain numbers (no $ sign, no commas). Transaction count as integer.

Also return an "unmatched_values" array for any significant dollar amounts you found but could not confidently assign to a standard field above:
[{ "label": "label as shown on report", "value": number }]

Return ONLY this JSON structure, no other text:
{
  "pos_system": "string or null",
  "fields": {
    "ventes_avant_taxes": { "value": number_or_null, "confidence": "high"|"medium"|"low", "raw_label": "string" } | null,
    "tps": ... | null,
    "tvq": ... | null,
    "interac": ... | null,
    "visa": ... | null,
    "mastercard": ... | null,
    "especes": ... | null,
    "livraisons": ... | null,
    "nb_transactions": ... | null
  },
  "unmatched_values": [{ "label": "string", "value": number }]
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image, imageType, orgId } = await req.json();

    if (!image || !imageType || !orgId) {
      return new Response(JSON.stringify({ error: 'missing_params', message: 'Missing image, imageType, or orgId.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate size (max ~10MB base64)
    if (image.length > 14_000_000) {
      return ok({ error: 'too_large', message: 'Image too large. Max 10 MB.' });
    }

    // Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return ok({ error: 'no_auth', message: 'Sign-in required. Log in via Settings → Application.' });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return ok({ error: 'no_auth', message: 'Session expired. Please sign in again.' });
    }

    // Verify caller owns the org and has a paid plan
    const serverOrgId = await getOrgForUser(supabaseAdmin, user.id);
    if (!serverOrgId || serverOrgId !== orgId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('plan')
      .eq('id', orgId)
      .single();

    const plan = orgRow?.plan || 'free';
    if (plan !== 'pro' && plan !== 'franchise' && plan !== 'network') {
      return ok({ error: 'upgrade_required', message: 'Cloud POS scanning requires a Pro plan.' });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return ok({ error: 'no_key', message: 'ANTHROPIC_API_KEY secret is not configured.' });
    }

    // Call Claude Haiku vision
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageType, data: image },
            },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error('Claude API error:', claudeRes.status, errBody);
      return ok({ error: 'claude_error', message: `Claude error (${claudeRes.status})` });
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

    return ok(parsed);

  } catch (err) {
    console.error('pos-scan error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
