/**
 * invoice-view edge function
 *
 * POST ?action=create  signed-in org member
 *      { token, org_id, invoice_id, invoice_number, invoice_html, company_name, lang, expires_at } -> { ok }
 * POST ?action=status  signed-in org member
 *      { org_id, tokens: [...] } -> { ok, views: { [token]: { first_viewed_at, last_viewed_at, view_count } } }
 * GET  ?token=...      public: the invoice for the balanceiq.ca view page. Does not count as a view.
 * POST ?action=seen&token=...  public: sent by the view page's own script once the
 *      invoice is on screen. Link scanners that pre-fetch URLs do not run that
 *      script, so they do not create false "viewed" marks.
 *
 * Rows live in invoice_view_links (service role only). Tokens are 128+ bit hex.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireOrgMember } from '../_shared/auth.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const TOKEN_RE = /^[a-f0-9]{32,64}$/;
const MAX_HTML_CHARS = 2_000_000;
const MAX_DAYS = 366;

// Per-token request ceiling (in memory; resets when the function cold-starts).
const hits = new Map<string, { count: number; resetAt: number }>();
function allow(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now > h.resetAt) { hits.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
  if (h.count >= 60) return false;
  h.count++;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const token = url.searchParams.get('token') || '';

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Operator: create a link while emailing an invoice ──
    if (req.method === 'POST' && action === 'create') {
      let b: Record<string, unknown>;
      try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
      const { token: newToken, org_id, invoice_id, invoice_number, invoice_html, company_name, lang, expires_at } =
        b as Record<string, string>;
      if (!newToken || !org_id || !invoice_id || !invoice_html || !expires_at) return json({ error: 'missing_params' }, 400);

      let caller: { user: { id: string } };
      try { caller = await requireOrgMember(req, org_id); }
      catch (resp) { return resp as Response; }

      if (!TOKEN_RE.test(newToken)) return json({ error: 'invalid_token' }, 400);
      if (String(invoice_html).length > MAX_HTML_CHARS) return json({ error: 'too_large' }, 413);
      const exp = Date.parse(expires_at);
      if (!Number.isFinite(exp) || exp <= Date.now() || exp > Date.now() + MAX_DAYS * 86400000) {
        return json({ error: 'invalid_expiry' }, 400);
      }

      const { error } = await admin.from('invoice_view_links').insert({
        token: newToken,
        org_id,
        invoice_id,
        invoice_number: invoice_number || null,
        invoice_html,
        company_name: company_name || null,
        lang: lang === 'en' ? 'en' : 'fr',
        created_by: caller.user.id,
        expires_at: new Date(exp).toISOString(),
      });
      if (error) {
        console.error('invoice_view_links insert failed:', error.message);
        return json({ error: 'insert_failed' }, 500);
      }
      return json({ ok: true });
    }

    // ── Operator: which of my links have been opened ──
    if (req.method === 'POST' && action === 'status') {
      let b: Record<string, unknown>;
      try { b = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
      const org_id = String(b.org_id || '');
      if (!org_id || !Array.isArray(b.tokens)) return json({ error: 'missing_params' }, 400);

      try { await requireOrgMember(req, org_id); }
      catch (resp) { return resp as Response; }

      const list = (b.tokens as unknown[]).filter((x): x is string => typeof x === 'string' && TOKEN_RE.test(x)).slice(0, 200);
      if (!list.length) return json({ ok: true, views: {} });
      const { data, error } = await admin
        .from('invoice_view_links')
        .select('token, first_viewed_at, last_viewed_at, view_count')
        .eq('org_id', org_id)
        .in('token', list);
      if (error) return json({ error: 'query_failed' }, 500);
      const views: Record<string, unknown> = {};
      for (const r of data || []) {
        views[r.token] = { first_viewed_at: r.first_viewed_at, last_viewed_at: r.last_viewed_at, view_count: r.view_count };
      }
      return json({ ok: true, views });
    }

    // ── Client: the view page asks for the invoice ──
    if (req.method === 'GET' && !action) {
      if (!TOKEN_RE.test(token)) return json({ error: 'not_found' }, 404);
      if (!allow(`get:${token}`)) return json({ error: 'rate_limited' }, 429);
      const { data: row } = await admin
        .from('invoice_view_links')
        .select('invoice_number, invoice_html, company_name, lang, expires_at, revoked_at')
        .eq('token', token)
        .maybeSingle();
      if (!row) return json({ error: 'not_found' }, 404);
      if (row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
        return json({ error: 'expired', company_name: row.company_name, lang: row.lang }, 410);
      }
      return json({ ok: true, invoice_number: row.invoice_number, company_name: row.company_name, lang: row.lang, html: row.invoice_html });
    }

    // ── Client: the invoice is on screen ──
    if (req.method === 'POST' && action === 'seen') {
      if (!TOKEN_RE.test(token)) return json({ error: 'not_found' }, 404);
      if (!allow(`seen:${token}`)) return json({ error: 'rate_limited' }, 429);
      const { data, error } = await admin.rpc('record_invoice_view', { p_token: token });
      if (error) return json({ error: 'record_failed' }, 500);
      if (!data?.ok) return json({ error: 'not_found' }, 404);
      return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error('invoice-view error:', e);
    return json({ error: 'server_error' }, 500);
  }
});
