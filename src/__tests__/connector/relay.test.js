// The AI relay: the edge function's pure parts, the app's loop, and the switch.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as core from '../../../supabase/functions/ai-relay/core.js';
import { createRelayClient, RELAY_ADDRESS, RELAY_LISTENING, RELAY_OFF, RELAY_SIGNED_OUT, RELAY_NOT_ON_PLAN, RELAY_UNREACHABLE } from '../../connector/relayClient.mjs';
import { createConnectorService } from '../../connector/service.mjs';
import { normalizeConfig } from '../../connector/access.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('RELAY-001 keys and sealing', () => {
  it('seals a question so that only the same secret opens it', async () => {
    const key = await core.sealKeyFrom('secret-one');
    const sealed = await core.seal(key, { message: { id: 1, method: 'tools/call' }, headers: {} });
    expect(sealed).not.toContain('tools/call');
    expect(await core.unseal(key, sealed)).toEqual({ message: { id: 1, method: 'tools/call' }, headers: {} });
    await expect(core.unseal(await core.sealKeyFrom('secret-two'), sealed)).rejects.toBeTruthy();
    // Two sealings of the same thing never look alike.
    expect(await core.seal(key, { a: 1 })).not.toBe(await core.seal(key, { a: 1 }));
  });

  it('checks the PKCE proof (S256 only)', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(await core.pkceMatches(verifier, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(true);
    expect(await core.pkceMatches(verifier + 'x', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(false);
    expect(await core.pkceMatches('short', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(false);
    expect(await core.pkceMatches(undefined, '')).toBe(false);
  });

  it('makes long random keys and stable hashes', async () => {
    const a = core.randomToken(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(core.randomToken(32)).not.toBe(a);
    expect(await core.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('RELAY-002 where an assistant may be sent back to', () => {
  it('accepts https and this computer, nothing else', () => {
    expect(core.validRedirect('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(core.validRedirect('http://127.0.0.1:33418/callback')).toBe(true);
    expect(core.validRedirect('http://localhost/cb')).toBe(true);
    for (const bad of ['http://example.com/cb', 'javascript:alert(1)', 'https://a.com/cb#frag', 'https://user:pw@a.com/cb', 'ftp://a.com', '', null, 'x'.repeat(2100)]) {
      expect(core.validRedirect(bad), String(bad).slice(0, 30)).toBe(false);
    }
  });

  it('knows the assistants it recognises, by exact host or subdomain only', () => {
    expect(core.isKnownHost('chatgpt.com')).toBe(true);
    expect(core.isKnownHost('www.claude.ai')).toBe(true);
    expect(core.isKnownHost('chatgpt.com.evil.example')).toBe(false);
    expect(core.isKnownHost('notchatgpt.com')).toBe(false);
  });

  it('cleans a registration and refuses a bad return address', () => {
    expect(core.cleanRegistration({ client_name: ' Chat<b>GPT\n ', redirect_uris: ['https://chatgpt.com/cb'] }))
      .toEqual({ client: { client_name: 'ChatbGPT', redirect_uris: ['https://chatgpt.com/cb'] } });
    expect(core.cleanRegistration({ redirect_uris: [] }).error).toBe('invalid_redirect_uri');
    expect(core.cleanRegistration({ redirect_uris: ['http://evil.example/cb'] }).error).toBe('invalid_redirect_uri');
    expect(core.cleanRegistration(null).error).toBe('invalid_redirect_uri');
  });

  it('adds the code and state to the return address without losing its own query', () => {
    expect(core.withQuery('https://a.com/cb?x=1', { code: 'c', state: 's', skip: '' })).toBe('https://a.com/cb?x=1&code=c&state=s');
  });
});

describe('RELAY-003 addresses and refusals', () => {
  it('finds its route behind any gateway prefix', () => {
    expect(core.routeOf('/functions/v1/ai-relay/mcp')).toBe('/mcp');
    expect(core.routeOf('/ai-relay/.well-known/oauth-authorization-server')).toBe('/.well-known/oauth-authorization-server');
    expect(core.routeOf('/ai-relay/')).toBe('/');
    expect(core.routeOf('/ai-relay')).toBe('/');
  });

  it('describes itself the way assistants look it up', () => {
    const as = core.authServerMetadata('https://balanceiq.ca', 'https://balanceiq.ca/ai');
    expect(as).toMatchObject({ issuer: 'https://balanceiq.ca', authorization_endpoint: 'https://balanceiq.ca/ai/authorize', token_endpoint: 'https://balanceiq.ca/ai/token', registration_endpoint: 'https://balanceiq.ca/ai/register', code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
    expect(core.resourceMetadata('https://balanceiq.ca', 'https://balanceiq.ca/ai')).toMatchObject({ resource: RELAY_ADDRESS, authorization_servers: ['https://balanceiq.ca'] });
  });

  it('tells the assistant in words when the app is closed', () => {
    expect(core.refusal({ jsonrpc: '2.0', id: 7, method: 'tools/call' }, core.SAY.closed))
      .toEqual({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: core.SAY.closed }], isError: true } });
    expect(core.refusal({ jsonrpc: '2.0', id: 'a', method: 'initialize' }, core.SAY.plan))
      .toEqual({ jsonrpc: '2.0', id: 'a', error: { code: -32000, message: core.SAY.plan } });
  });

  it('is on the same plans as the connector in the app', async () => {
    const { PLAN_FEATURES } = await import('../../config/features.js');
    const withIt = Object.keys(PLAN_FEATURES).filter((p) => PLAN_FEATURES[p].aiConnector === true).sort();
    expect([...core.RELAY_PLANS].sort()).toEqual(withIt);
  });
});

describe('RELAY-004 the edge function guards every route', () => {
  const src = read('supabase/functions/ai-relay/index.ts');
  it('takes a BalanceIQ sign-in, never a relay key, on the app side', () => {
    for (const fn of ['approve', 'next', 'answer', 'status', 'revoke']) {
      const body = src.slice(src.indexOf(`async function ${fn}(req: Request)`));
      expect(body.slice(0, 200), fn).toContain('const who = await firstParty(req);');
      expect(body.slice(0, 260), fn).toContain('if (!who) return UNAUTHORIZED();');
    }
    expect(src).toContain("token.startsWith(core.ACCESS_PREFIX) || token.startsWith(REFRESH_PREFIX)) return null;");
  });
  it('stores keys and codes as hashes only, and erases the exchange', () => {
    expect(src).toMatch(/access_hash: await core\.sha256Hex\(access\)/);
    expect(src).toMatch(/refresh_hash: await core\.sha256Hex\(refresh\)/);
    expect(src).toMatch(/code_hash: await core\.sha256Hex\(code\)/);
    expect(src).toContain("update({ request: null, response: null, status })");
    expect(src).not.toMatch(/console\.(log|info|debug)/);
  });
  it('never sends anyone to an address the assistant did not register', () => {
    expect(src).toContain("if (!client || !client.redirect_uris.includes(redirect_uri)) return new Response(");
  });
});

describe('RELAY-005 the app loop', () => {
  const flush = () => new Promise((r) => setTimeout(r, 5));

  it('answers each question through the connector and reports listening', async () => {
    const calls = [];
    const queue = [{ id: 'c1', message: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { 'mcp-method': 'tools/list' } }];
    let client;
    const call = async (p, body) => {
      calls.push([p, body]);
      if (p === 'next') {
        const c = queue.shift();
        if (!c) { client.stop(); return { ok: true, status: 200, data: { call: null } }; }
        return { ok: true, status: 200, data: { call: c } };
      }
      return { ok: true, status: 200, data: { ok: true } };
    };
    const states = [];
    client = createRelayClient({ call, handle: async (m, h) => ({ status: 200, body: { jsonrpc: '2.0', id: m.id, result: { heads: h } } }), onState: (s) => states.push(s) });
    client.start();
    await flush();
    expect(calls.map((c) => c[0])).toEqual(['next', 'answer', 'next']);
    expect(calls[1][1]).toEqual({ id: 'c1', status: 200, body: { jsonrpc: '2.0', id: 1, result: { heads: { 'mcp-method': 'tools/list' } } } });
    expect(states).toEqual([RELAY_LISTENING, RELAY_OFF]);
    expect(client.state()).toBe(RELAY_OFF);
  });

  it('says why it is not listening, and waits longer each time', async () => {
    const waits = [];
    const replies = [{ ok: false, status: 401 }, { ok: false, status: 403 }, { ok: false, status: 500 }, 'throw'];
    let client;
    const call = async () => {
      const r = replies.shift();
      if (r === 'throw') throw new Error('offline');
      if (!r) { client.stop(); return { ok: false, status: 0 }; }
      return r;
    };
    const states = [];
    client = createRelayClient({ call, handle: async () => null, onState: (s) => states.push(s), sleep: async (ms) => { waits.push(ms); } });
    client.start();
    await flush();
    expect(states).toEqual([RELAY_SIGNED_OUT, RELAY_NOT_ON_PLAN, RELAY_UNREACHABLE, RELAY_OFF]);
    expect(waits).toEqual([5000, 10000, 20000, 40000]);
  });

  it('still answers the relay when the connector fails, and start is idempotent', async () => {
    const calls = [];
    let n = 0;
    let client;
    const call = async (p, body) => {
      calls.push([p, body]);
      if (p !== 'next') return { ok: true, status: 200, data: {} };
      n += 1;
      if (n === 1) return { ok: true, status: 200, data: { call: { id: 'x', message: {} } } };
      client.stop();
      return { ok: true, status: 200, data: { call: null } };
    };
    client = createRelayClient({ call, handle: async () => { throw new Error('boom'); } });
    client.start(); client.start();
    await flush();
    expect(calls.filter((c) => c[0] === 'next')).toHaveLength(2);
    expect(calls.find((c) => c[0] === 'answer')[1]).toEqual({ id: 'x', status: 200, body: null });
  });
});

describe('RELAY-006 the switch in the app', () => {
  const dirs = [];
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const tool = { name: 'ping_books', title: { en: 'Ping', fr: 'Ping' }, description: 'Test.', inputSchema: { type: 'object', properties: {} }, readOnly: true, run: () => ({ ok: true }) };
  const make = (allowed) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-relay-'));
    dirs.push(d);
    return createConnectorService({ dir: d, company: { id: 'co1', name: 'Demo Inc.' }, version: '1', tools: [tool], makeCtx: () => ({}), port: 0, allowed });
  };
  const listTools = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } };

  it('is off by default, kept apart from the local key, and refused off the plan', async () => {
    expect(normalizeConfig({ companies: { a: { relay: 'yes' }, b: { relay: true } } }).companies).toMatchObject({ a: { relay: false, enabled: false }, b: { relay: true, enabled: false } });
    const s = make(false);
    expect(s.status().relay).toBe(false);
    expect(await s.setRelay(true)).toMatchObject({ ok: false, error: 'plan' });
    expect(await s.handleRelayed(listTools, {})).toEqual({ status: 403, body: null });
  });

  it('answers a relayed question only while the switch is on and the plan allows', async () => {
    const s = make(true);
    expect(await s.handleRelayed(listTools, {})).toEqual({ status: 403, body: null });
    expect(await s.setRelay(true)).toMatchObject({ ok: true, status: { relay: true, enabled: false, running: false } });
    const on = await s.handleRelayed(listTools, { 'MCP-Method': 'tools/list' });
    expect(on.status).toBe(200);
    expect(on.body.result.tools.map((t) => t.name)).toEqual(['ping_books']);
    expect(await s.handleRelayed([listTools], {})).toEqual({ status: 403, body: null });
    await s.setAllowed(false);
    expect(await s.handleRelayed(listTools, {})).toEqual({ status: 403, body: null });
    await s.setAllowed(true);
    expect(await s.setRelay(false)).toMatchObject({ ok: true, status: { relay: false } });
    expect(await s.handleRelayed(listTools, {})).toEqual({ status: 403, body: null });
  });
});
