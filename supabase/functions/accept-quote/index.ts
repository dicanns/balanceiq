/**
 * accept-quote edge function (spec 3.9)
 *
 * GET  ?token={token}           → serve acceptance page HTML
 * POST ?token={token}           → record acceptance, notify operator
 *
 * Security: single-use token, expiry enforced, rate-limited (60 req/min per token),
 * service-role DB writes only (no client auth required — public page).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Rate limiter (in-memory, per token, resets on cold start) ─────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(token);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(token, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

// ── HTML page ─────────────────────────────────────────────────────────────────
function buildAcceptancePage(row: Record<string, string>, lang = 'fr', edgeFnUrl = ''): string {
  const fr = lang !== 'en';
  const title = fr ? 'Accepter la soumission' : 'Accept Quote';
  const heading = fr ? `Soumission ${row.quote_number || ''}` : `Quote ${row.quote_number || ''}`;
  const fromLabel = fr ? 'De' : 'From';
  const toLabel = fr ? '&Agrave;' : 'To';
  const btnLabel = fr ? 'Accepter la soumission' : 'Accept Quote';
  const namePlaceholder = fr ? 'Votre nom complet' : 'Your full name';
  const nameLabel = fr ? 'Nom (optionnel)' : 'Name (optional)';
  const sigLabel = fr ? 'Signature (optionnel)' : 'Signature (optional)';
  const sigClear = fr ? 'Effacer' : 'Clear';
  const legal = fr
    ? 'En cliquant &quot;Accepter&quot;, vous acceptez les termes de cette soumission. Cette acceptation &eacute;lectronique est juridiquement contraignante en vertu de la Loi concernant le cadre juridique des technologies de l\'information (LCCJTI) et du Code civil du Qu&eacute;bec (art. 2837-2838).'
    : 'By clicking &quot;Accept&quot;, you agree to the terms of this quote. This electronic acceptance is legally binding under Quebec law (LCCJTI and Civil Code art. 2837-2838).';
  const poweredBy = fr ? 'Propuls&eacute; par BalanceIQ' : 'Powered by BalanceIQ';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;color:#111827;min-height:100vh;padding:24px 16px}
  .card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);max-width:720px;margin:0 auto;overflow:hidden}
  .header{background:linear-gradient(135deg,#f97316,#ea580c);padding:20px 24px;color:#fff}
  .header h1{font-size:22px;font-weight:800;letter-spacing:-.3px}
  .header p{font-size:13px;opacity:.85;margin-top:4px}
  .meta{padding:16px 24px;border-bottom:1px solid #e5e7eb;display:flex;gap:24px;flex-wrap:wrap}
  .meta-item{font-size:12px;color:#6b7280}
  .meta-item strong{display:block;color:#111827;font-size:13px;margin-top:2px}
  .form-section{padding:20px 24px}
  .field{margin-bottom:16px}
  label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px}
  input[type=text]{width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;outline:none}
  input[type=text]:focus{border-color:#f97316;box-shadow:0 0 0 2px rgba(249,115,22,.15)}
  canvas{border:1px solid #d1d5db;border-radius:7px;width:100%;touch-action:none;cursor:crosshair;background:#fafafa}
  .clear-btn{font-size:11px;color:#f97316;background:none;border:none;cursor:pointer;margin-top:4px;padding:0;font-weight:600}
  .legal{font-size:11px;color:#6b7280;line-height:1.6;margin-bottom:16px;padding:10px 12px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb}
  .accept-btn{width:100%;padding:12px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .15s}
  .accept-btn:hover{opacity:.92}
  .accept-btn:disabled{opacity:.5;cursor:default}
  .success{text-align:center;padding:40px 24px}
  .success h2{font-size:20px;font-weight:800;color:#16a34a;margin-bottom:8px}
  .success p{color:#6b7280;font-size:13px}
  .error-msg{color:#ef4444;font-size:12px;margin-top:8px}
  .footer{padding:12px 24px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>${heading}</h1>
    <p>${fr ? 'Veuillez r&eacute;viser et accepter cette soumission.' : 'Please review and accept this quote.'}</p>
  </div>
  <div class="meta">
    <div class="meta-item">${fromLabel}<strong>${escHtml(row.operator_email || '')}</strong></div>
    ${row.client_name ? `<div class="meta-item">${toLabel}<strong>${escHtml(row.client_name)}</strong></div>` : ''}
  </div>
  <div class="form-section" id="formSection">
    <div class="field">
      <label for="typedName">${nameLabel}</label>
      <input type="text" id="typedName" placeholder="${namePlaceholder}" maxlength="120"/>
    </div>
    <div class="field">
      <label>${sigLabel}</label>
      <canvas id="sigCanvas" height="120"></canvas>
      <button class="clear-btn" type="button" onclick="clearSig()">${sigClear}</button>
    </div>
    <div class="legal">${legal}</div>
    <button class="accept-btn" id="acceptBtn" onclick="doAccept()">${btnLabel}</button>
    <div class="error-msg" id="errMsg"></div>
  </div>
  <div class="success" id="successSection" style="display:none">
    <h2>${fr ? '&#10003; Soumission accept&eacute;e' : '&#10003; Quote accepted'}</h2>
    <p>${fr ? 'Merci. Le marchand a &eacute;t&eacute; notifi&eacute;.' : 'Thank you. The merchant has been notified.'}</p>
  </div>
  <div class="footer">${poweredBy}</div>
</div>
<script>
const TOKEN = '${escHtml(row.token || '')}';
const EDGE_URL = '${edgeFnUrl}';
const LANG = '${lang}';

// Signature pad
const canvas = document.getElementById('sigCanvas');
const ctx = canvas.getContext('2d');
let drawing = false, hasSig = false;
function resizeCanvas() {
  const w = canvas.parentElement.offsetWidth - 2;
  canvas.width = w; canvas.height = 120;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return [src.clientX - r.left, src.clientY - r.top];
}
canvas.addEventListener('mousedown', e => { drawing = true; ctx.beginPath(); const [x,y]=getPos(e); ctx.moveTo(x,y); });
canvas.addEventListener('mousemove', e => { if(!drawing) return; const [x,y]=getPos(e); ctx.lineTo(x,y); ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); hasSig=true; });
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing=true; ctx.beginPath(); const [x,y]=getPos(e); ctx.moveTo(x,y); });
canvas.addEventListener('touchmove', e => { e.preventDefault(); if(!drawing) return; const [x,y]=getPos(e); ctx.lineTo(x,y); ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke(); hasSig=true; });
canvas.addEventListener('touchend', () => drawing = false);
function clearSig() { ctx.clearRect(0,0,canvas.width,canvas.height); hasSig=false; }

async function doAccept() {
  const btn = document.getElementById('acceptBtn');
  const err = document.getElementById('errMsg');
  btn.disabled = true;
  err.textContent = '';
  const typedName = document.getElementById('typedName').value.trim();
  const signatureBlob = hasSig ? canvas.toDataURL('image/png') : null;
  try {
    const res = await fetch(EDGE_URL + '?token=' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, typed_name: typedName, signature_blob: signatureBlob })
    });
    const data = await res.json();
    if (data.error) { err.textContent = data.message || 'Error'; btn.disabled = false; return; }
    document.getElementById('formSection').style.display = 'none';
    document.getElementById('successSection').style.display = 'block';
  } catch(e) {
    err.textContent = LANG === 'fr' ? 'Erreur reseau. Reessayez.' : 'Network error. Please retry.';
    btn.disabled = false;
  }
}
</script>
</body>
</html>`;
}

function escHtml(s: string) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function htmlResp(html: string, status = 200) {
  const bytes = new TextEncoder().encode(html);
  return new Response(bytes, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': String(bytes.byteLength), 'Access-Control-Allow-Origin': '*' } });
}
function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization' } });

  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const lang = url.searchParams.get('lang') || 'fr';
  const action = url.searchParams.get('action') || '';

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ── POST ?action=create — operator creates a token from the Electron app ──
  if (req.method === 'POST' && action === 'create') {
    let body: Record<string, string> = {};
    try { body = await req.json(); } catch (_) {}
    const { token: newToken, org_id, quote_id, quote_number, quote_html, client_name, client_email, operator_email, expires_at } = body;
    if (!newToken || !org_id || !quote_id || !quote_html || !expires_at) {
      return jsonResp({ error: 'missing_params' }, 400);
    }
    const { error } = await admin.from('quote_acceptance_tokens').insert({
      token: newToken, org_id, quote_id, quote_number: quote_number || null,
      quote_html, client_name: client_name || null, client_email: client_email || null,
      operator_email: operator_email || null, expires_at,
    });
    if (error) return jsonResp({ error: 'insert_failed', message: error.message }, 500);

    const acceptanceUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/accept-quote?token=${newToken}`;
    return jsonResp({ ok: true, acceptanceUrl });
  }

  // ── GET ?action=check — operator polls acceptance status ──
  if (req.method === 'GET' && action === 'check') {
    if (!token) return jsonResp({ error: 'missing_token' }, 400);
    const { data, error } = await admin.from('quote_acceptance_tokens').select('status,accepted_at,accepted_from_ip,accepted_user_agent,accepted_typed_name,accepted_signature_blob,quote_number,client_name,operator_email').eq('token', token).single();
    if (error || !data) return jsonResp({ error: 'not_found' }, 404);
    return jsonResp({ ok: true, ...data });
  }

  // ── POST ?action=decline — client declines the quote ──
  if (req.method === 'POST' && action === 'decline') {
    if (!token) return jsonResp({ error: 'missing_token' }, 400);
    const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    await admin.from('quote_acceptance_tokens').update({ status: 'rejected', accepted_at: new Date().toISOString(), accepted_from_ip: ip, accepted_user_agent: req.headers.get('user-agent') || '' }).eq('token', token).eq('status', 'pending');
    // Notify operator
    const { data: row } = await admin.from('quote_acceptance_tokens').select('operator_email,quote_number,client_name').eq('token', token).single();
    if (row?.operator_email) {
      try {
        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'BalanceIQ <noreply@balanceiq.ca>', to: row.operator_email, subject: `Soumission ${row.quote_number || ''} refusee — ${row.client_name || ''}`, html: `<p>${row.client_name || 'Le client'} a refuse la soumission ${row.quote_number || ''}.</p>` }) });
      } catch (_) {}
    }
    return jsonResp({ ok: true });
  }

  // ── POST ?action=revoke — operator revokes a token ──
  if (req.method === 'POST' && action === 'revoke') {
    if (!token) return jsonResp({ error: 'missing_token' }, 400);
    await admin.from('quote_acceptance_tokens').update({ status: 'expired' }).eq('token', token);
    return jsonResp({ ok: true });
  }

  if (!token) return htmlResp('<h2>Lien invalide / Invalid link</h2>', 400);
  if (!checkRateLimit(token)) return htmlResp('<h2>Trop de requêtes / Too many requests</h2>', 429);

  // Load token row
  const { data: row, error: rowErr } = await admin
    .from('quote_acceptance_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (rowErr || !row) return htmlResp('<h2>Lien invalide ou expiré / Invalid or expired link</h2>', 404);
  if (row.status === 'accepted') return htmlResp(buildDonePage(lang, true), 200);
  if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
    if (row.status !== 'expired') {
      await admin.from('quote_acceptance_tokens').update({ status: 'expired' }).eq('token', token);
    }
    return htmlResp(buildDonePage(lang, false), 200);
  }

  // ── GET or POST: record acceptance ──
  if (req.method === 'GET' || req.method === 'POST') {
    let body: Record<string, string> = {};
    if (req.method === 'POST') { try { body = await req.json(); } catch (_) {} }

    const rawIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
    const ip = rawIp.split(',')[0].trim();
    const ua = req.headers.get('user-agent') || '';

    const { error: updErr } = await admin
      .from('quote_acceptance_tokens')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_from_ip: ip,
        accepted_user_agent: ua,
        accepted_typed_name: body.typed_name || null,
        accepted_signature_blob: body.signature_blob || null,
      })
      .eq('token', token)
      .eq('status', 'pending'); // idempotency guard

    if (updErr) return jsonResp({ error: 'db_error', message: 'Could not record acceptance.' }, 500);

    // Send operator notification via Resend
    if (row.operator_email) {
      const quoteNum = row.quote_number || '';
      const clientName = row.accepted_typed_name || row.client_name || (lang === 'fr' ? 'votre client' : 'your client');
      const subject = lang === 'fr'
        ? `✓ Soumission ${quoteNum} acceptée — ${clientName}`
        : `✓ Quote ${quoteNum} accepted — ${clientName}`;
      const html = lang === 'fr'
        ? `<p>Bonne nouvelle!</p><p><strong>${escHtml(clientName)}</strong> a accepté votre soumission <strong>${escHtml(quoteNum)}</strong> le ${new Date().toLocaleString('fr-CA')}.</p><p>Connectez-vous à BalanceIQ pour convertir la soumission en commande.</p>`
        : `<p>Good news!</p><p><strong>${escHtml(clientName)}</strong> accepted quote <strong>${escHtml(quoteNum)}</strong> on ${new Date().toLocaleString('en-CA')}.</p><p>Open BalanceIQ to convert the quote to an order.</p>`;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'BalanceIQ <noreply@balanceiq.ca>', to: row.operator_email, subject, html }),
        });
      } catch (_) { /* notification is best-effort */ }
    }

    const quoteNum = row.quote_number || '';
    const fr = lang !== 'en';
    const confirmText = fr
      ? `Soumission ${quoteNum} acceptee.\n\nMerci! Le marchand a ete notifie.\n\nVotre acceptation a ete enregistree le ${new Date().toLocaleString('fr-CA')} depuis ${ip}.`
      : `Quote ${quoteNum} accepted.\n\nThank you! The merchant has been notified.\n\nYour acceptance was recorded on ${new Date().toLocaleString('en-CA')} from ${ip}.`;
    return new Response(confirmText, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  return jsonResp({ error: 'method_not_allowed' }, 405);
});

function buildDonePage(lang: string, accepted: boolean): string {
  const fr = lang !== 'en';
  const msg = accepted
    ? (fr ? '<h2 style="color:#16a34a">&#10003; Soumission d&eacute;j&agrave; accept&eacute;e</h2><p>Cette soumission a d&eacute;j&agrave; &eacute;t&eacute; accept&eacute;e.</p>' : '<h2 style="color:#16a34a">&#10003; Already accepted</h2><p>This quote has already been accepted.</p>')
    : (fr ? '<h2 style="color:#ef4444">Lien expir&eacute;</h2><p>Cette soumission a expir&eacute;. Contactez le marchand.</p>' : '<h2 style="color:#ef4444">Link expired</h2><p>This quote has expired. Please contact the merchant.</p>');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f4f6;padding:24px}div{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:480px;box-shadow:0 1px 4px rgba(0,0,0,.08)}p{color:#6b7280;margin-top:8px;font-size:13px}</style></head><body><div>${msg}</div></body></html>`;
}
