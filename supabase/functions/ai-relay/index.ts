// AI relay: the door an online AI assistant (ChatGPT and others) uses to put a
// question to the BalanceIQ app on the owner's computer.
//
//   assistant  --POST /mcp-->  relay  --queue-->  app (asks /next, replies /answer)
//
// The books stay on the computer. A question and its answer pass through sealed
// and are erased when the call ends. The assistant signs in with a key issued
// here (OAuth 2.1, PKCE), good for this relay and nothing else, after the owner
// approved it on balanceiq.ca while signed in to BalanceIQ. The app's side
// (/next, /answer, /revoke, /status, /approve) takes a BalanceIQ sign-in only.
//
// Deployed with verify_jwt off: every route below does its own check.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as core from './core.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ISSUER = (Deno.env.get('AI_RELAY_ISSUER') || 'https://balanceiq.ca').replace(/\/+$/, '');
const BASE = (Deno.env.get('AI_RELAY_BASE') || `${ISSUER}/ai`).replace(/\/+$/, '');
const CONSENT_URL = Deno.env.get('AI_RELAY_CONSENT_URL') || `${ISSUER}/connect/`;
const RESOURCE_METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource${new URL(BASE).pathname}/mcp`;
const REFRESH_PREFIX = 'biqf_';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let sealKeyPromise: Promise<CryptoKey> | null = null;
const sealKey = () => (sealKeyPromise ||= core.sealKeyFrom(Deno.env.get('AI_RELAY_SEAL_KEY') || SERVICE_KEY));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-method, mcp-name',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();
const olderThan = (iso: string | null, ms: number) => !iso || Date.now() - new Date(iso).getTime() > ms;

function bearer(req: Request): string {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader.replace(/^Bearer /i, '').trim();
}

async function readBody(req: Request, max: number): Promise<{ text: string } | null> {
  if (Number(req.headers.get('content-length') || 0) > max) return null;
  let text = '';
  try { text = await req.text(); } catch (_) { return null; }
  return text.length > max ? null : { text };
}

async function readFields(req: Request, max = 16 * 1024): Promise<Record<string, string> | null> {
  const raw = await readBody(req, max);
  if (!raw) return null;
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    try {
      const o = JSON.parse(raw.text || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    } catch (_) { return null; }
  }
  return Object.fromEntries(new URLSearchParams(raw.text));
}

// A BalanceIQ sign-in (never a key issued by this relay), and the company it belongs to.
async function firstParty(req: Request) {
  const token = bearer(req);
  if (!token || token.startsWith(core.ACCESS_PREFIX) || token.startsWith(REFRESH_PREFIX)) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: row } = await admin.from('users').select('org_id').eq('id', data.user.id).maybeSingle();
  if (!row?.org_id) return null;
  const { data: org } = await admin.from('organizations').select('id, name, plan').eq('id', row.org_id).maybeSingle();
  if (!org) return null;
  return { userId: data.user.id as string, orgId: org.id as string, orgName: (org.name || '') as string, plan: org.plan as string };
}
const UNAUTHORIZED = () => json({ error: 'unauthorized' }, 401);

// ── Sign-in for assistants (OAuth 2.1 with PKCE, public clients) ─────────────

async function register(req: Request) {
  const body = await readFields(req);
  // deno-lint-ignore no-explicit-any
  const cleaned = core.cleanRegistration(body as any);
  if (!body || cleaned.error) return json({ error: 'invalid_client_metadata', error_description: cleaned.error || 'invalid body' }, 400);
  // Registration is open to anyone, so the number of new assistants per hour is bounded.
  const { count } = await admin.from('ai_relay_clients').select('client_id', { count: 'exact', head: true })
    .gt('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((count || 0) >= core.NEW_CLIENTS_PER_HOUR) return json({ error: 'temporarily_unavailable' }, 429, { 'Retry-After': '600' });
  if (Math.random() < 0.2) await tidy().catch(() => {});
  const client_id = `biqc_${core.randomToken(16)}`;
  const { error } = await admin.from('ai_relay_clients').insert({ client_id, ...cleaned.client });
  if (error) return json({ error: 'server_error' }, 500);
  return json({
    client_id, ...cleaned.client,
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  }, 201);
}

async function authorize(url: URL) {
  const q = url.searchParams;
  const { data: client } = await admin.from('ai_relay_clients').select('client_id, redirect_uris').eq('client_id', q.get('client_id') || '').maybeSingle();
  const redirect_uri = q.get('redirect_uri') || '';
  // Never send anyone to an address the assistant did not register.
  if (!client || !client.redirect_uris.includes(redirect_uri)) return new Response('Unknown assistant or return address.', { status: 400 });
  const back = (error: string) => Response.redirect(core.withQuery(redirect_uri, { error, state: q.get('state') }), 302);
  if (q.get('response_type') !== 'code') return back('unsupported_response_type');
  const challenge = q.get('code_challenge') || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || q.get('code_challenge_method') !== 'S256') return back('invalid_request');
  // Bounded as well: sign-in requests waiting for one assistant, and new ones per hour for all.
  const recent = new Date(Date.now() - core.REQUEST_TTL_MS).toISOString();
  const { count: waiting } = await admin.from('ai_relay_requests').select('id', { count: 'exact', head: true })
    .eq('client_id', client.client_id).is('used_at', null).gt('created_at', recent);
  const { count: lastHour } = await admin.from('ai_relay_requests').select('id', { count: 'exact', head: true })
    .gt('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((waiting || 0) >= core.OPEN_REQUESTS_PER_CLIENT || (lastHour || 0) >= core.NEW_REQUESTS_PER_HOUR) return back('temporarily_unavailable');
  const id = core.randomToken(24);
  const { error } = await admin.from('ai_relay_requests').insert({
    id, client_id: client.client_id, redirect_uri, state: (q.get('state') || '').slice(0, 1000), code_challenge: challenge,
  });
  if (error) return back('server_error');
  return Response.redirect(core.withQuery(CONSENT_URL, { request: id }), 302);
}

async function openRequest(id: string) {
  if (!id) return null;
  const { data } = await admin.from('ai_relay_requests')
    .select('id, client_id, redirect_uri, state, created_at, approved_at, used_at').eq('id', id).maybeSingle();
  if (!data || data.approved_at || data.used_at || olderThan(data.created_at, core.REQUEST_TTL_MS)) return null;
  return data;
}

// What the approval page shows before the owner decides. The id is unguessable.
async function describeRequest(url: URL) {
  const r = await openRequest(url.searchParams.get('id') || '');
  if (!r) return json({ error: 'not_found' }, 404);
  const { data: client } = await admin.from('ai_relay_clients').select('client_name').eq('client_id', r.client_id).maybeSingle();
  const host = core.redirectHost(r.redirect_uri);
  return json({ client_name: client?.client_name || '', host, known: core.isKnownHost(host) });
}

async function approve(req: Request) {
  const who = await firstParty(req);
  if (!who) return UNAUTHORIZED();
  const body = await readFields(req);
  const r = await openRequest(String(body?.request || ''));
  if (!r) return json({ error: 'not_found' }, 404);
  // deno-lint-ignore no-explicit-any
  if ((body as any).approve !== true) {
    await admin.from('ai_relay_requests').delete().eq('id', r.id);
    return json({ redirect: core.withQuery(r.redirect_uri, { error: 'access_denied', state: r.state }) });
  }
  if (!core.RELAY_PLANS.includes(who.plan)) return json({ error: 'plan' }, 403);
  const code = core.randomToken(32);
  const { data: done } = await admin.from('ai_relay_requests')
    .update({ code_hash: await core.sha256Hex(code), org_id: who.orgId, user_id: who.userId, approved_at: new Date().toISOString() })
    .eq('id', r.id).is('approved_at', null).select('id');
  if (!done?.length) return json({ error: 'not_found' }, 404);
  return json({ redirect: core.withQuery(r.redirect_uri, { code, state: r.state }), company: who.orgName });
}

async function issue(grant: { org_id: string; user_id: string; client_id: string }, renewOf?: string) {
  const access = core.ACCESS_PREFIX + core.randomToken(32);
  const refresh = REFRESH_PREFIX + core.randomToken(32);
  const row = {
    access_hash: await core.sha256Hex(access), access_expires_at: isoIn(core.ACCESS_TTL_MS),
    refresh_hash: await core.sha256Hex(refresh), refresh_expires_at: isoIn(core.REFRESH_TTL_MS),
  };
  if (renewOf) {
    // The renewal key is single use: whoever presents it first gets the new pair.
    const { data } = await admin.from('ai_relay_grants').update(row).eq('refresh_hash', renewOf).select('id');
    if (!data?.length) return null;
  } else {
    const { error } = await admin.from('ai_relay_grants').insert({ ...grant, ...row });
    if (error) return null;
  }
  return { access_token: access, token_type: 'Bearer', expires_in: Math.floor(core.ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: core.SCOPE };
}

async function token(req: Request) {
  const f = await readFields(req);
  if (!f) return json({ error: 'invalid_request' }, 400);
  const bad = () => json({ error: 'invalid_grant' }, 400);
  if (f.grant_type === 'authorization_code') {
    const { data: r } = await admin.from('ai_relay_requests')
      .select('id, client_id, redirect_uri, code_challenge, org_id, user_id, approved_at, used_at')
      .eq('code_hash', await core.sha256Hex(f.code || '')).maybeSingle();
    if (!r || r.used_at || olderThan(r.approved_at, core.CODE_TTL_MS)) return bad();
    if (r.client_id !== f.client_id || r.redirect_uri !== f.redirect_uri) return bad();
    if (!(await core.pkceMatches(f.code_verifier, r.code_challenge))) return bad();
    // A code works once.
    const { data: used } = await admin.from('ai_relay_requests').update({ used_at: new Date().toISOString() })
      .eq('id', r.id).is('used_at', null).select('id');
    if (!used?.length) return bad();
    const out = await issue({ org_id: r.org_id, user_id: r.user_id, client_id: r.client_id });
    return out ? json(out) : json({ error: 'server_error' }, 500);
  }
  if (f.grant_type === 'refresh_token') {
    const hash = await core.sha256Hex(f.refresh_token || '');
    const { data: g } = await admin.from('ai_relay_grants').select('org_id, user_id, client_id, refresh_expires_at').eq('refresh_hash', hash).maybeSingle();
    if (!g || (f.client_id && g.client_id !== f.client_id) || new Date(g.refresh_expires_at).getTime() < Date.now()) return bad();
    const out = await issue(g, hash);
    return out ? json(out) : bad();
  }
  return json({ error: 'unsupported_grant_type' }, 400);
}

// ── The assistant's side ─────────────────────────────────────────────────────

async function mcp(req: Request) {
  const key = bearer(req);
  const { data: grant } = key.startsWith(core.ACCESS_PREFIX)
    ? await admin.from('ai_relay_grants').select('id, org_id, access_expires_at').eq('access_hash', await core.sha256Hex(key)).maybeSingle()
    : { data: null };
  if (!grant || new Date(grant.access_expires_at).getTime() < Date.now()) {
    return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${RESOURCE_METADATA_URL}", scope="${core.SCOPE}"` });
  }
  const raw = await readBody(req, core.MAX_BODY_BYTES);
  // deno-lint-ignore no-explicit-any
  let message: any = null;
  try { message = raw ? JSON.parse(raw.text) : null; } catch (_) { message = null; }
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Send one JSON-RPC message per request.' } }, 400);
  }
  // A notification asks for nothing back.
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) return new Response(null, { status: 202, headers: CORS });

  const { data: org } = await admin.from('organizations').select('plan').eq('id', grant.org_id).maybeSingle();
  if (!org || !core.RELAY_PLANS.includes(org.plan)) return json(core.refusal(message, core.SAY.plan));
  const { data: presence } = await admin.from('ai_relay_presence').select('last_seen_at').eq('org_id', grant.org_id).maybeSingle();
  if (!presence || olderThan(presence.last_seen_at, core.PRESENCE_FRESH_MS)) return json(core.refusal(message, core.SAY.closed));
  const { count } = await admin.from('ai_relay_calls').select('id', { count: 'exact', head: true })
    .eq('org_id', grant.org_id).gt('created_at', new Date(Date.now() - 60_000).toISOString());
  if ((count || 0) >= core.CALLS_PER_MINUTE) return json(core.refusal(message, core.SAY.pace));

  const headers: Record<string, string> = {};
  for (const h of ['mcp-protocol-version', 'mcp-method', 'mcp-name']) { const v = req.headers.get(h); if (v) headers[h] = v; }
  const { data: call, error } = await admin.from('ai_relay_calls')
    .insert({ org_id: grant.org_id, method: String(message.method || '').slice(0, 60), request: await core.seal(await sealKey(), { message, headers }) })
    .select('id').single();
  if (error || !call) return json(core.refusal(message, core.SAY.silent));
  admin.from('ai_relay_grants').update({ last_used_at: new Date().toISOString() }).eq('id', grant.id).then(() => {}, () => {});

  // Wait for the app to answer, then erase both sides of the exchange.
  const erase = (status: string) => admin.from('ai_relay_calls').update({ request: null, response: null, status }).eq('id', call.id);
  const deadline = Date.now() + core.ANSWER_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(350);
    const { data: row } = await admin.from('ai_relay_calls').select('status, response').eq('id', call.id).maybeSingle();
    if (row?.status === 'done' && row.response) {
      let answer: { status?: number; body?: unknown } | null = null;
      try { answer = await core.unseal(await sealKey(), row.response); } catch (_) { answer = null; }
      await erase('done');
      if (!answer) break;
      const status = Number(answer.status) || 200;
      return status === 202 || answer.body == null ? new Response(null, { status: 202, headers: CORS }) : json(answer.body, status);
    }
  }
  await erase('failed');
  return json(core.refusal(message, core.SAY.silent));
}

// ── The app's side (a BalanceIQ sign-in) ─────────────────────────────────────

async function tidy() {
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const stale = new Date(Date.now() - 120_000).toISOString();
  await admin.from('ai_relay_calls').update({ request: null, response: null, status: 'failed' }).in('status', ['pending', 'claimed']).lt('created_at', stale);
  await admin.from('ai_relay_calls').delete().lt('created_at', day);
  await admin.from('ai_relay_requests').delete().lt('created_at', day);
  await admin.from('ai_relay_grants').delete().lt('refresh_expires_at', new Date().toISOString());
  // An assistant that registered and was never approved by anyone is forgotten.
  const { data: kept } = await admin.from('ai_relay_grants').select('client_id');
  const inUse = [...new Set((kept || []).map((g: { client_id: string }) => g.client_id))].filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
  let unused = admin.from('ai_relay_clients').delete().lt('created_at', new Date(Date.now() - core.UNUSED_CLIENT_TTL_MS).toISOString());
  if (inUse.length) unused = unused.not('client_id', 'in', `(${inUse.join(',')})`);
  await unused;
}

// The app waits here for the next question put to its company.
async function next(req: Request) {
  const who = await firstParty(req);
  if (!who) return UNAUTHORIZED();
  if (!core.RELAY_PLANS.includes(who.plan)) return json({ error: 'plan' }, 403);
  const f = await readFields(req);
  if (Math.random() < 0.1) await tidy().catch(() => {});
  const seen = () => admin.from('ai_relay_presence')
    .upsert({ org_id: who.orgId, last_seen_at: new Date().toISOString(), app_version: String(f?.version || '').slice(0, 20) });
  await seen();
  const deadline = Date.now() + core.NEXT_HOLD_MS;
  while (Date.now() < deadline) {
    const { data } = await admin.rpc('ai_relay_claim', { p_org: who.orgId });
    const row = Array.isArray(data) ? data[0] : null;
    if (row?.id) {
      try {
        const { message, headers } = await core.unseal(await sealKey(), row.request);
        return json({ call: { id: row.id, message, headers } });
      } catch (_) {
        await admin.from('ai_relay_calls').update({ request: null, status: 'failed' }).eq('id', row.id);
      }
    }
    await sleep(1500);
  }
  await seen();
  return json({ call: null });
}

async function answer(req: Request) {
  const who = await firstParty(req);
  if (!who) return UNAUTHORIZED();
  const raw = await readBody(req, 2 * 1024 * 1024);
  // deno-lint-ignore no-explicit-any
  let body: any = null;
  try { body = raw ? JSON.parse(raw.text) : null; } catch (_) { body = null; }
  if (!body || typeof body.id !== 'string') return json({ error: 'invalid_request' }, 400);
  const sealed = await core.seal(await sealKey(), { status: Number(body.status) || 200, body: body.body ?? null });
  const { data } = await admin.from('ai_relay_calls')
    .update({ response: sealed, status: 'done', done_at: new Date().toISOString() })
    .eq('id', body.id).eq('org_id', who.orgId).eq('status', 'claimed').select('id');
  return json({ ok: !!data?.length });
}

// Which assistants the owner let in, for the Settings page.
async function status(req: Request) {
  const who = await firstParty(req);
  if (!who) return UNAUTHORIZED();
  const { data } = await admin.from('ai_relay_grants')
    .select('created_at, last_used_at, ai_relay_clients(client_name)').eq('org_id', who.orgId).order('created_at');
  // deno-lint-ignore no-explicit-any
  return json({ assistants: (data || []).map((g: any) => ({ name: g.ai_relay_clients?.client_name || '', since: g.created_at, last_used: g.last_used_at })) });
}

// Shut every assistant out of this company, and stop looking open.
async function revoke(req: Request) {
  const who = await firstParty(req);
  if (!who) return UNAUTHORIZED();
  const { data } = await admin.from('ai_relay_grants').delete().eq('org_id', who.orgId).select('id');
  await admin.from('ai_relay_presence').delete().eq('org_id', who.orgId);
  return json({ ok: true, removed: data?.length || 0 });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const route = core.routeOf(url.pathname);
  const key = `${req.method} ${route}`;
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method === 'GET' && route.startsWith('/.well-known/oauth-protected-resource')) return json(core.resourceMetadata(ISSUER, BASE));
    if (req.method === 'GET' && (route === '/.well-known/oauth-authorization-server' || route === '/.well-known/openid-configuration')) {
      return json(core.authServerMetadata(ISSUER, BASE));
    }
    switch (key) {
      case 'POST /register': return await register(req);
      case 'GET /authorize': return await authorize(url);
      case 'GET /request': return await describeRequest(url);
      case 'POST /approve': return await approve(req);
      case 'POST /token': return await token(req);
      case 'POST /mcp': return await mcp(req);
      case 'POST /next': return await next(req);
      case 'POST /answer': return await answer(req);
      case 'POST /status': return await status(req);
      case 'POST /revoke': return await revoke(req);
    }
    if (route === '/mcp') {
      // A person opening the address in a browser gets a sentence, not a bare error.
      if ((req.headers.get('accept') || '').includes('text/html')) {
        return new Response(core.BROWSER_NOTE, { status: 405, headers: { Allow: 'POST', 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    }
    return json({ error: 'not_found' }, 404);
  } catch (_) {
    // Nothing about the failure is passed on.
    return json({ error: 'server_error' }, 500);
  }
});
