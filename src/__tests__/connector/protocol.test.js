/**
 * CONN-010  the 2026-07-28 protocol: no handshake, server/discover, version in _meta
 * CONN-011  the older protocol: initialize handshake
 * CONN-012  listing and calling tools, and what an AI is told when a call fails
 * CONN-013  the door: this computer only, POST only, a key every time
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
  handleMessage, describeTool, checkArguments, ToolError,
  MODERN_VERSION, LEGACY_VERSIONS, META_PROTOCOL_VERSION, META_SERVER_INFO,
  ERR_METHOD_NOT_FOUND, ERR_INVALID_PARAMS, ERR_UNSUPPORTED_VERSION, ERR_HEADER_MISMATCH, ERR_INVALID_REQUEST,
} from '../../connector/protocol.mjs';
import { createConnectorServer, listenLocal, CONNECTOR_PATH, MAX_BODY_BYTES } from '../../connector/httpServer.mjs';

const server = { name: 'balanceiq', version: '9.9.9', instructions: 'Books of one company.', lang: 'en' };
const tools = [
  { name: 'echo', title: { en: 'Echo', fr: 'Écho' }, description: 'Returns what it is given.', inputSchema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' }, times: { type: 'integer' } } }, run: (a, ctx) => ({ text: a.text, company: ctx.company }) },
  { name: 'boom', description: 'Fails.', run: () => { throw new Error('SQLITE_ERROR: no such table secret_table'); } },
  { name: 'polite', description: 'Fails on purpose.', run: () => { throw new ToolError('No invoice has that number.'); } },
  { name: 'write_it', description: 'Changes something.', readOnly: false, run: () => ({ done: true }) },
];
const opts = (extra = {}) => ({ server, tools, ctx: { company: 'Demo' }, ...extra });
const modern = (method, params = {}) => ({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: { [META_PROTOCOL_VERSION]: MODERN_VERSION } } });
const legacy = (method, params) => ({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) });

describe('CONN-010 the 2026-07-28 protocol', () => {
  it('describes itself in server/discover', async () => {
    const r = await handleMessage(modern('server/discover'), opts());
    expect(r.status).toBe(200);
    expect(r.body.result).toEqual({
      resultType: 'complete', supportedVersions: [MODERN_VERSION], capabilities: { tools: {} },
      _meta: { [META_SERVER_INFO]: { name: 'balanceiq', version: '9.9.9' } }, instructions: 'Books of one company.',
    });
  });

  it('answers discover even before a version is named', async () => {
    const r = await handleMessage(legacy('server/discover'), opts());
    expect(r.body.result.supportedVersions).toEqual([MODERN_VERSION]);
  });

  it('refuses a version it does not speak, and says which it does', async () => {
    const r = await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: { _meta: { [META_PROTOCOL_VERSION]: '2027-01-01' } } }, opts());
    expect(r.status).toBe(400);
    expect(r.body.error).toEqual({ code: ERR_UNSUPPORTED_VERSION, message: 'Unsupported protocol version.', data: { supported: [MODERN_VERSION], requested: '2027-01-01' } });
  });

  it('refuses headers that disagree with the message, and accepts their absence', async () => {
    const call = modern('tools/call', { name: 'echo', arguments: { text: 'a' } });
    const bad = [{ 'mcp-method': 'tools/list' }, { 'mcp-name': 'boom' }, { 'mcp-protocol-version': '2025-11-25' }];
    for (const headers of bad) {
      const r = await handleMessage(call, opts({ headers }));
      expect([r.status, r.body.error.code]).toEqual([400, ERR_HEADER_MISMATCH]);
    }
    const good = await handleMessage(call, opts({ headers: { 'mcp-method': 'tools/call', 'mcp-name': 'echo', 'mcp-protocol-version': MODERN_VERSION } }));
    expect(good.body.result.isError).toBeUndefined();
    expect((await handleMessage(call, opts({ headers: {} }))).status).toBe(200);
  });

  it('marks results complete and says 404 for a method it does not have', async () => {
    expect((await handleMessage(modern('tools/list'), opts())).body.result.resultType).toBe('complete');
    const r = await handleMessage(modern('resources/list'), opts());
    expect([r.status, r.body.error.code]).toEqual([404, ERR_METHOD_NOT_FOUND]);
  });
});

describe('CONN-011 the older protocol', () => {
  it('shakes hands, keeping a version it knows', async () => {
    const r = await handleMessage(legacy('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } }), opts());
    expect(r.body.result).toEqual({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'balanceiq', version: '9.9.9' }, instructions: 'Books of one company.' });
  });

  it('offers its newest handshake version to a client asking for an unknown one', async () => {
    const r = await handleMessage(legacy('initialize', { protocolVersion: '2024-01-01' }), opts());
    expect(r.body.result.protocolVersion).toBe(LEGACY_VERSIONS[0]);
  });

  it('acknowledges notifications without a body', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, opts())).toEqual({ status: 202, body: null });
  });

  it('answers ping, and leaves the new result marker out', async () => {
    expect((await handleMessage(legacy('ping'), opts())).body.result).toEqual({});
    expect((await handleMessage(legacy('tools/list'), opts())).body.result.resultType).toBeUndefined();
  });

  it('reports an unknown method inside a normal reply', async () => {
    const r = await handleMessage(legacy('resources/list'), opts());
    expect([r.status, r.body.error.code]).toEqual([200, ERR_METHOD_NOT_FOUND]);
  });

  it('rejects what is not JSON-RPC', async () => {
    for (const m of [null, [], 'x', { id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 1 }]) {
      const r = await handleMessage(m, opts());
      expect([r.status, r.body.error.code]).toEqual([400, ERR_INVALID_REQUEST]);
    }
  });
});

describe('CONN-012 tools', () => {
  it('are listed with their nature and without their internals', async () => {
    const r = await handleMessage(legacy('tools/list'), opts());
    expect(r.body.result.tools[0]).toEqual({
      name: 'echo', title: 'Echo', description: 'Returns what it is given.', inputSchema: tools[0].inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    });
    expect(r.body.result.tools[1].inputSchema).toEqual({ type: 'object', additionalProperties: false });
    expect(r.body.result.tools[3].annotations.readOnlyHint).toBe(false);
    expect(JSON.stringify(r.body.result)).not.toContain('run');
  });

  it('carry their title in the language of the company', () => {
    expect(describeTool(tools[0], 'fr').title).toBe('Écho');
    expect(describeTool(tools[0], 'de').title).toBe('Echo');
  });

  it('return their result as text and as data', async () => {
    const r = await handleMessage(legacy('tools/call', { name: 'echo', arguments: { text: 'hi' } }), opts());
    expect(r.body.result).toEqual({ content: [{ type: 'text', text: '{"text":"hi","company":"Demo"}' }], structuredContent: { text: 'hi', company: 'Demo' } });
  });

  it('hide tools the caller may not use, and refuse a call to one', async () => {
    const allow = (t) => (t.readOnly === false ? 'This company allows reading only.' : null);
    const listed = await handleMessage(legacy('tools/list'), opts({ allow }));
    expect(listed.body.result.tools.map((t) => t.name)).toEqual(['echo', 'boom', 'polite']);
    const r = await handleMessage(legacy('tools/call', { name: 'write_it' }), opts({ allow }));
    expect(r.body.result).toEqual({ content: [{ type: 'text', text: 'This company allows reading only.' }], isError: true });
  });

  it('explain a bad argument instead of running', async () => {
    const call = (args) => handleMessage(legacy('tools/call', { name: 'echo', arguments: args }), opts());
    expect((await call({})).body.result).toEqual({ content: [{ type: 'text', text: 'Missing argument: text.' }], isError: true });
    expect((await call({ text: 5 })).body.result.content[0].text).toBe('Argument text must be a string.');
    expect((await call({ text: 'a', times: 1.5 })).body.result.content[0].text).toBe('Argument times must be a whole number.');
    expect((await call({ text: 'a', other: 1 })).body.result.content[0].text).toBe('Unknown argument: other.');
    expect((await call('x')).body.result.isError).toBe(true);
  });

  it('check lists, choices and patterns', () => {
    const schema = { type: 'object', properties: { ids: { type: 'array' }, kind: { type: 'string', enum: ['a', 'b'] }, date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' } } };
    expect(checkArguments(schema, { ids: [1], kind: 'a', date: '2026-01-31' })).toBeNull();
    expect(checkArguments(schema, { ids: 'x' })).toBe('Argument ids must be a list.');
    expect(checkArguments(schema, { kind: 'c' })).toBe('Argument kind must be one of: a, b.');
    expect(checkArguments(schema, { date: 'Jan 31' })).toBe('Argument date is not in the expected form (YYYY-MM-DD).');
    expect(checkArguments(schema, { anything: 1 })).toBeNull();
    expect(checkArguments(undefined, undefined)).toBeNull();
  });

  it('never pass an internal error on, only a message meant for the reader', async () => {
    const boom = await handleMessage(legacy('tools/call', { name: 'boom' }), opts());
    expect(boom.body.result).toEqual({ content: [{ type: 'text', text: 'BalanceIQ could not complete this request.' }], isError: true });
    const polite = await handleMessage(legacy('tools/call', { name: 'polite' }), opts());
    expect(polite.body.result.content[0].text).toBe('No invoice has that number.');
  });

  it('say so when the tool does not exist', async () => {
    const r = await handleMessage(legacy('tools/call', { name: 'nope' }), opts());
    expect(r.body.error.code).toBe(ERR_INVALID_PARAMS);
  });
});

describe('CONN-013 the door', () => {
  let srv; let url;
  const KEY = 'biq_test-key';
  beforeAll(async () => {
    srv = createConnectorServer({
      authorize: (key) => (key === KEY ? { ok: true, company: 'Demo' } : key === 'biq_other' ? { ok: false, status: 409, message: 'Open that company in BalanceIQ.' } : { ok: false }),
      handle: (message, who, headers) => handleMessage(message, { server, tools, ctx: { company: who.company }, headers }),
    });
    await listenLocal(srv, 0);
    url = `http://127.0.0.1:${srv.address().port}${CONNECTOR_PATH}`;
  });
  afterAll(() => new Promise((r) => srv.close(r)));
  const post = (body, headers = {}, to = url) => fetch(to, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('listens on this computer only', () => {
    expect(srv.address().address).toBe('127.0.0.1');
  });

  it('answers a call that carries the key', async () => {
    const r = await post(legacy('tools/call', { name: 'echo', arguments: { text: 'hi' } }));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect((await r.json()).result.structuredContent).toEqual({ text: 'hi', company: 'Demo' });
  });

  it('refuses a missing or wrong key before reading anything', async () => {
    for (const h of [{ Authorization: '' }, { Authorization: 'Bearer nope' }, { Authorization: 'Basic abc' }]) {
      const r = await post(legacy('tools/list'), h);
      expect(r.status).toBe(401);
      expect(r.headers.get('www-authenticate')).toBe('Bearer');
      expect(JSON.stringify(await r.json())).not.toContain('echo');
    }
  });

  it('says which company to open when the key is for another one', async () => {
    const r = await post(legacy('tools/list'), { Authorization: 'Bearer biq_other' });
    expect(r.status).toBe(409);
    expect((await r.json()).error.message).toBe('Open that company in BalanceIQ.');
  });

  it('refuses a web page, whatever key it carries', async () => {
    const r = await post(legacy('tools/list'), { Origin: 'https://example.com' });
    expect(r.status).toBe(403);
    const local = await post(legacy('tools/list'), { Origin: 'http://localhost:3000' });
    expect(local.status).toBe(403);
  });

  it('takes POST on its one path and nothing else', async () => {
    const get = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    expect([get.status, get.headers.get('allow')]).toEqual([405, 'POST']);
    expect((await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${KEY}` } })).status).toBe(405);
    expect((await post(legacy('ping'), {}, url.replace(CONNECTOR_PATH, '/other'))).status).toBe(404);
  });

  it('acknowledges a notification with 202 and no body', async () => {
    const r = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(r.status).toBe(202);
    expect(await r.text()).toBe('');
  });

  it('rejects what is not JSON, and anything too large', async () => {
    expect((await post('{not json')).status).toBe(400);
    const big = await post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(MAX_BODY_BYTES) } })).catch(() => ({ status: 'closed' }));
    expect([400, 'closed']).toContain(big.status);
  });
});
