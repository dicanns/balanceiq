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
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Total installs
    const { count: totalInstalls } = await supabase
      .from('installs')
      .select('*', { count: 'exact', head: true });

    // New this week
    const { count: newThisWeek } = await supabase
      .from('installs')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', weekAgo);

    // Active this week (seen in last 7 days)
    const { count: activeThisWeek } = await supabase
      .from('installs')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', weekAgo);

    // Platform breakdown
    const { data: platforms } = await supabase
      .from('installs')
      .select('platform')
      .gte('last_seen_at', weekAgo);

    const platformCounts: Record<string, number> = {};
    for (const row of platforms || []) {
      const p = row.platform || 'unknown';
      platformCounts[p] = (platformCounts[p] || 0) + 1;
    }

    // Version breakdown
    const { data: versions } = await supabase
      .from('installs')
      .select('version')
      .gte('last_seen_at', weekAgo);

    const versionCounts: Record<string, number> = {};
    for (const row of versions || []) {
      const v = row.version || 'unknown';
      versionCounts[v] = (versionCounts[v] || 0) + 1;
    }

    // Paid orgs
    const { count: paidOrgs } = await supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .in('plan', ['pro', 'franchise', 'network']);

    // payment_failed orgs
    const { count: failedPayments } = await supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .eq('payment_failed', true);

    const platformRows = Object.entries(platformCounts)
      .map(([p, c]) => `<tr><td style="padding:4px 12px 4px 0">${p}</td><td style="padding:4px 0;font-weight:600">${c}</td></tr>`)
      .join('');

    const versionRows = Object.entries(versionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => `<tr><td style="padding:4px 12px 4px 0">v${v}</td><td style="padding:4px 0;font-weight:600">${c}</td></tr>`)
      .join('');

    const failedBanner = (failedPayments || 0) > 0
      ? `<div style="background:#fee2e2;border-left:4px solid #ef4444;padding:12px 16px;margin:20px 0;border-radius:4px">
           <strong>⚠️ ${failedPayments} org(s) with failed payments</strong> — check Stripe dashboard.
         </div>`
      : '';

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:24px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;color:white;font-size:20px">BalanceIQ — Weekly Digest</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px">
            Week of ${now.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">

          ${failedBanner}

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
            <div style="background:white;padding:16px;border-radius:6px;border:1px solid #e5e7eb;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#f97316">${totalInstalls || 0}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px">Total Installs</div>
            </div>
            <div style="background:white;padding:16px;border-radius:6px;border:1px solid #e5e7eb;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#10b981">${newThisWeek || 0}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px">Active This Week</div>
            </div>
            <div style="background:white;padding:16px;border-radius:6px;border:1px solid #e5e7eb;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#6366f1">${paidOrgs || 0}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px">Paid Orgs</div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div style="background:white;padding:16px;border-radius:6px;border:1px solid #e5e7eb">
              <h3 style="margin:0 0 12px;font-size:13px;color:#374151">Platform (active)</h3>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                ${platformRows || '<tr><td style="color:#9ca3af">No data</td></tr>'}
              </table>
            </div>
            <div style="background:white;padding:16px;border-radius:6px;border:1px solid #e5e7eb">
              <h3 style="margin:0 0 12px;font-size:13px;color:#374151">Version (active)</h3>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                ${versionRows || '<tr><td style="color:#9ca3af">No data</td></tr>'}
              </table>
            </div>
          </div>

          <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;text-align:center">
            BalanceIQ · Automated weekly digest · Every Monday 9am ET
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
        subject: `BalanceIQ Weekly — ${totalInstalls} installs, ${paidOrgs} paid`,
        html,
      }),
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('weekly-digest error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
