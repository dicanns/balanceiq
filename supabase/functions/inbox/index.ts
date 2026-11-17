// Bill inbox: the owner forwards a supplier's invoice to a private address
// (bills+<code>@in.balanceiq.ca) and finds it in the app next time it is open.
//
//   supplier / owner --email--> Cloudflare worker --POST /receive--> here (sealed, waiting)
//   app (signed in)  --POST /pull--> here --> computer, then POST /done erases it
//
// /receive is called only by the Cloudflare email worker, with a shared secret.
// Every other route takes a BalanceIQ sign-in (Pro plans only). No AI reads a
// message here: the text and the files are only stored and handed over.
//
// Deployed with verify_jwt off: every route below does its own check.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import PostalMime from 'npm:postal-mime@2';
import * as core from './core.js';
import { ACCESS_PREFIX } from '../ai-relay/core.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REFRESH_PREFIX = 'biqf_';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let sealKeyPromise: Promise<CryptoKey> | null = null;
const sealKey = () => (sealKeyPromise ||= core.sealKeyFrom(Deno.env.get('INBOX_SEAL_KEY') || Deno.env.get('AI_RELAY_SEAL_KEY') || SERVICE_KEY));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

function bearer(req: Request): string {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader.replace(/^Bearer /i, '').trim();
}

async function readJson(req: Request, max = 16 * 1024): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get('content-length') || 0) > max) return null;
  let text = '';
  try { text = await req.text(); } catch (_) { return null; }
  if (text.length > max) return null;
  try {
    const o = JSON.parse(text || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (_) { return null; }
}

// A BalanceIQ sign-in (never a key issued by the AI relay), and the company it belongs to.
async function firstParty(req: Request) {
  const token = bearer(req);
  if (!token || token.startsWith(ACCESS_PREFIX) || token.startsWith(REFRESH_PREFIX)) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: row } = await admin.from('users').select('org_id').eq('id', data.user.id).maybeSingle();
  if (!row?.org_id) return null;
  const { data: org } = await admin.from('organizations').select('id, name, plan').eq('id', row.org_id).maybeSingle();
  if (!org) return null;
  return { userId: data.user.id as string, email: (data.user.email || '') as string, orgId: org.id as string, plan: org.plan as string };
}
const UNAUTHORIZED = () => json({ error: 'unauthorized' }, 401);

// ── The owner's side (a BalanceIQ sign-in) ───────────────────────────────────

async function waitingCount(orgId: string): Promise<number> {
  const { count } = await admin.from('bill_inbox_messages').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
  return count || 0;
}

async function statusOf(orgId: string) {
  const { data: row } = await admin.from('bill_inbox_addresses').select('code, enabled, senders').eq('org_id', orgId).maybeSingle();
  return {
    enabled: !!row?.enabled,
    address: row ? core.addressFor(row.code) : null,
    senders: (row?.senders || []) as string[],
    waiting: await waitingCount(orgId),
  };
}

// Owner routes all start the same way: a sign-in, then the plan.
async function owner(req: Request) {
  const who = await firstParty(req);
  if (!who) return { who: null, refusal: UNAUTHORIZED() };
  if (!core.RELAY_PLANS.includes(who.plan)) return { who: null, refusal: json({ error: 'plan' }, 403) };
  return { who, refusal: null };
}

async function status(req: Request) {
  const o = await owner(req);
  if (!o.who) return o.refusal!;
  return json(await statusOf(o.who.orgId));
}

async function enable(req: Request) {
  const o = await owner(req);
  if (!o.who) return o.refusal!;
  const who = o.who;
  const { data: row } = await admin.from('bill_inbox_addresses').select('senders').eq('org_id', who.orgId).maybeSingle();
  const own = core.addressParts(who.email)?.address;
  if (row) {
    const patch: Record<string, unknown> = { enabled: true, updated_at: new Date().toISOString() };
    if (!(row.senders || []).length && own) patch.senders = [own];
    await admin.from('bill_inbox_addresses').update(patch).eq('org_id', who.orgId);
    return json(await statusOf(who.orgId));
  }
  // The address is random; on the rare clash a new one is drawn.
  for (let i = 0; i < 5; i++) {
    const { error } = await admin.from('bill_inbox_addresses')
      .insert({ org_id: who.orgId, code: core.newAddressCode(), enabled: true, senders: own ? [own] : [] });
    if (!error) return json(await statusOf(who.orgId));
    // Two taps at once: the other one already made the row.
    const { data: made } = await admin.from('bill_inbox_addresses').select('org_id').eq('org_id', who.orgId).maybeSingle();
    if (made) return json(await statusOf(who.orgId));
  }
  return json({ error: 'server_error' }, 500);
}

async function disable(req: Request) {
  const o = await owner(req);
  if (!o.who) return o.refusal!;
  await admin.from('bill_inbox_addresses').update({ enabled: false, updated_at: new Date().toISOString() }).eq('org_id', o.who.orgId);
  // What is still waiting is erased: attachments go with their message.
  await admin.from('bill_inbox_messages').delete().eq('org_id', o.who.orgId);
  return json(await statusOf(o.who.orgId));
}

async function setSenders(req: Request) {
  const o = await owner(req);
  if (!o.who) return o.refusal!;
  const body = await readJson(req);
  const cleaned = core.cleanSenders(body?.senders);
  if (!body || cleaned.error) return json({ error: 'invalid_sender' }, 400);
  const { data } = await admin.from('bill_inbox_addresses')
    .update({ senders: cleaned.senders, updated_at: new Date().toISOString() }).eq('org_id', o.who.orgId).select('org_id');
  if (!data?.length) return json({ error: 'not_enabled' }, 409);
  return json(await statusOf(o.who.orgId));
}

async function newAddress(req: Request) {
  const o = await owner(req);
  if (!o.who) return o.refusal!;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin.from('bill_inbox_addresses')
      .update({ code: core.newAddressCode(), updated_at: new Date().toISOString() }).eq('org_id', o.who.orgId).select('org_id');
    if (!error) {
      if (!data?.length) return json({ error: 'not_enabled' }, 409);
      return json(await statusOf(o.who.orgId));
    }
  }
  return json({ error: 'server_error' }, 500);
}

// The oldest waiting message, opened. One message per call keeps the answer small.
async function pull(req: Request) {
  const o = await owner(req);
  if (!o.who) return o.refusal!;
  const orgId = o.who.orgId;
  const key = await sealKey();
  // A message that can no longer be opened (the seal key changed) would block the
  // ones behind it forever, so it is erased and the next one is tried.
  for (let tries = 0; tries < 5; tries++) {
    const { data: msg } = await admin.from('bill_inbox_messages')
      .select('id, sealed, received_at').eq('org_id', orgId).order('received_at', { ascending: true }).limit(1).maybeSingle();
    if (!msg) return json({ item: null, remaining: 0 });
    try {
      const body = await core.unsealJson(key, msg.sealed);
      const { data: rows } = await admin.from('bill_inbox_attachments')
        .select('meta, body').eq('message_id', msg.id).order('position', { ascending: true });
      const attachments = [];
      for (const r of rows || []) {
        const meta = await core.unsealJson(key, r.meta);
        const bytes = await core.unsealBytes(key, r.body);
        attachments.push({ name: meta.name, type: meta.type, size: meta.size, data_base64: core.bytesToB64(bytes) });
      }
      const remaining = Math.max(0, (await waitingCount(orgId)) - 1);
      return json({
        item: {
          id: msg.id, received_at: msg.received_at, from: body.from, subject: body.subject,
          note: body.note, skipped: body.skipped || 0, attachments,
        },
        remaining,
      });
    } catch (_) {
      await admin.from('bill_inbox_messages').delete().eq('id', msg.id).eq('org_id', orgId);
    }
  }
  return json({ item: null, remaining: 0 });
}

async function done(req: Request) {
  const o = await owner(req);
  if (!o.who) return o.refusal!;
  const body = await readJson(req);
  if (!body || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: 'invalid_request' }, 400);
  await admin.from('bill_inbox_messages').delete().eq('id', body.id).eq('org_id', o.who.orgId);
  return json({ ok: true });
}

// ── The mail side (the Cloudflare email worker) ──────────────────────────────

const turnAway = (reason: string) => json({ accept: false, reason });

async function receive(req: Request) {
  const authHeader = req.headers.get('x-inbox-secret') || '';
  const expected = Deno.env.get('INBOX_INGEST_SECRET') || '';
  if (!expected || !core.constantTimeEqual(authHeader, expected)) return json({ error: 'unauthorized' }, 401);

  if (Number(req.headers.get('content-length') || 0) > core.MAX_MESSAGE_BYTES) return turnAway('too_large');
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length > core.MAX_MESSAGE_BYTES) return turnAway('too_large');

  const rcpt = core.addressParts(req.headers.get('x-rcpt-to') || '');
  const code = rcpt && rcpt.domain === core.INBOX_DOMAIN ? core.codeOf(rcpt.local) : null;
  if (!code) return turnAway('unknown_address');
  const { data: addr } = await admin.from('bill_inbox_addresses')
    .select('org_id, enabled, senders, count_day, count_today').eq('code', code).maybeSingle();
  if (!addr) return turnAway('unknown_address');
  if (!addr.enabled) return turnAway('off');
  const { data: org } = await admin.from('organizations').select('plan').eq('id', addr.org_id).maybeSingle();
  if (!org || !core.RELAY_PLANS.includes(org.plan)) return turnAway('plan');

  // Anything the app never collected is erased after KEEP_DAYS; do it before counting what waits.
  await admin.from('bill_inbox_messages').delete().eq('org_id', addr.org_id)
    .lt('received_at', new Date(Date.now() - core.KEEP_DAYS * 24 * 3600_000).toISOString());

  // deno-lint-ignore no-explicit-any
  let parsed: any = null;
  try { parsed = await new PostalMime().parse(raw); } catch (_) { parsed = null; }
  if (!parsed) return turnAway('unreadable');

  const from = core.addressParts(String(parsed.from?.address || ''));
  if (!from || !(addr.senders || []).includes(from.address)) return turnAway('sender_not_listed');
  if (!core.authVerdict(parsed.headers, from.address)) return turnAway('not_authenticated');

  const today = core.todayKey();
  const waiting = await waitingCount(addr.org_id);
  if (core.capVerdict({ waiting, row: addr, today })) return turnAway('full');

  const { kept, skipped } = core.pickAttachments(parsed.attachments);
  const key = await sealKey();
  const sealed = await core.sealJson(key, {
    from: from.address, subject: core.subjectOf(parsed), note: core.noteOf(parsed), skipped,
  });
  const { data: msg, error } = await admin.from('bill_inbox_messages').insert({ org_id: addr.org_id, sealed }).select('id').single();
  if (error || !msg) throw new Error('store failed');
  try {
    for (let i = 0; i < kept.length; i++) {
      const a = kept[i];
      const { error: e } = await admin.from('bill_inbox_attachments').insert({
        message_id: msg.id, position: i,
        meta: await core.sealJson(key, { name: a.name, type: a.type, size: a.size }),
        body: await core.sealBytes(key, a.bytes),
      });
      if (e) throw new Error('store failed');
    }
  } catch (err) {
    // Never keep half a message: the worker is told to try again later.
    await admin.from('bill_inbox_messages').delete().eq('id', msg.id);
    throw err;
  }
  await admin.from('bill_inbox_addresses')
    .update({ count_day: today, count_today: core.dayCount(addr, today) + 1 }).eq('org_id', addr.org_id);
  return json({ accept: true, id: msg.id });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const route = core.routeOf(url.pathname);
  const key = `${req.method} ${route}`;
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    switch (key) {
      case 'POST /receive': return await receive(req);
      case 'POST /status': return await status(req);
      case 'POST /enable': return await enable(req);
      case 'POST /disable': return await disable(req);
      case 'POST /senders': return await setSenders(req);
      case 'POST /new-address': return await newAddress(req);
      case 'POST /pull': return await pull(req);
      case 'POST /done': return await done(req);
    }
    return json({ error: 'not_found' }, 404);
  } catch (_) {
    // Nothing about the failure is passed on; the mail worker treats a 5xx as "try again later".
    return json({ error: 'server_error' }, 500);
  }
});
