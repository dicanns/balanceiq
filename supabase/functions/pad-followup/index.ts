/**
 * pad-followup edge function (spec 3.11.8)
 *
 * Called on app startup (once per day) to send a single reminder email
 * to clients whose PAD mandate is still 'pending' 48h after the link was sent,
 * when followup_enabled = true and followup_sent_at IS NULL.
 *
 * POST { org_id, resend_api_key, resend_from, operator_email }
 * → { sent: number, skipped: number }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const { org_id, resend_api_key, resend_from, operator_email } = await req.json();
    if (!org_id) return json({ error: 'missing_org_id' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find pending mandates > 48h old with followup enabled and not yet sent
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: mandates, error } = await supabase
      .from('pad_mandates')
      .select('id, client_id, client_name, client_email, created_at')
      .eq('org_id', org_id)
      .eq('status', 'pending')
      .eq('followup_enabled', true)
      .is('followup_sent_at', null)
      .lt('created_at', cutoff);

    if (error) {
      console.error('pad-followup query error:', error);
      return json({ error: 'db_error', detail: error.message }, 500);
    }

    let sent = 0;
    let skipped = 0;

    for (const mandate of (mandates || [])) {
      const email = mandate.client_email;
      if (!email || !resend_api_key) { skipped++; continue; }

      const name = mandate.client_name || email;
      const subject = 'Rappel — Autorisation de prélèvement automatique en attente';
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#f97316">Rappel de prélèvement automatique (PAD)</h2>
          <p>Bonjour ${name},</p>
          <p>Votre autorisation de prélèvement automatique (PAD/débit ACSS) est toujours en attente.
          Veuillez compléter l'enregistrement de vos informations bancaires pour activer les paiements automatiques.</p>
          <p>Si vous avez des questions, veuillez contacter votre fournisseur directement.</p>
          <p style="font-size:11px;color:#888;margin-top:24px">Courriel envoyé par BalanceIQ au nom de votre fournisseur. Pour vous désabonner, répondez à ce courriel.</p>
        </div>`;

      try {
        await sendEmail(resend_api_key, resend_from || 'noreply@balanceiq.ca', email, subject, html);
        await supabase
          .from('pad_mandates')
          .update({ followup_sent_at: new Date().toISOString() })
          .eq('id', mandate.id);
        // Notify operator
        if (operator_email && operator_email !== email) {
          const opSubject = `PAD followup envoyé à ${name}`;
          const opHtml = `<p>BalanceIQ a envoyé un rappel PAD à <strong>${name}</strong> (${email}).</p>`;
          await sendEmail(resend_api_key, resend_from || 'noreply@balanceiq.ca', operator_email, opSubject, opHtml).catch(() => {});
        }
        sent++;
        console.log('PAD followup sent to', email, 'mandate:', mandate.id);
      } catch (e) {
        console.error('PAD followup send failed for', email, e);
        skipped++;
      }
    }

    return json({ sent, skipped });
  } catch (e) {
    console.error('pad-followup error:', e);
    return json({ error: 'server_error', detail: String(e) }, 500);
  }
});
