import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const TO_EMAIL = 'info@dicanns.ca';

serve(async () => {
  try {
    const { data: failedOrgs, error } = await supabase
      .from('organizations')
      .select('id, name, plan, stripe_customer_id')
      .eq('payment_failed', true);

    if (error) throw error;
    if (!failedOrgs || failedOrgs.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No failed payments' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows = failedOrgs.map(org => `
      <tr>
        <td style="padding:8px 16px 8px 0;font-size:13px">${org.name || org.id}</td>
        <td style="padding:8px 16px 8px 0;font-size:13px;text-transform:uppercase;color:#6366f1">${org.plan}</td>
        <td style="padding:8px 0;font-size:12px;color:#9ca3af">${org.stripe_customer_id || '—'}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#ef4444;padding:24px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;color:white;font-size:20px">⚠️ Payment Failed Alert</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px">
            ${failedOrgs.length} org${failedOrgs.length > 1 ? 's' : ''} with failed payments
          </p>
        </div>
        <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
          <p style="margin:0 0 16px;font-size:14px">The following organizations have <strong>payment_failed = true</strong>. Check Stripe and follow up.</p>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid #e5e7eb">
                <th style="text-align:left;padding:8px 16px 8px 0;font-size:12px;color:#6b7280">Organization</th>
                <th style="text-align:left;padding:8px 16px 8px 0;font-size:12px;color:#6b7280">Plan</th>
                <th style="text-align:left;padding:8px 0;font-size:12px;color:#6b7280">Stripe Customer</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="margin-top:20px;padding:12px 16px;background:#fff7ed;border-radius:6px;border:1px solid #fed7aa">
            <p style="margin:0;font-size:13px">
              Go to <strong>Stripe Dashboard → Customers</strong> to review and reach out.
            </p>
          </div>
          <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;text-align:center">
            BalanceIQ · Daily payment check · Runs every day at 8am ET
          </p>
        </div>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'BalanceIQ <noreply@dicanns.ca>',
        to: [TO_EMAIL],
        subject: `⚠️ ${failedOrgs.length} BalanceIQ payment${failedOrgs.length > 1 ? 's' : ''} failed`,
        html,
      }),
    });

    return new Response(JSON.stringify({ ok: true, alerted: failedOrgs.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('payment-alert error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
