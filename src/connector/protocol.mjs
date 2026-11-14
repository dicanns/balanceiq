// The Model Context Protocol, as far as a tools-only server needs it.
//
// Two generations of AI apps are in use, so both are answered:
//   2026-07-28  no handshake: every request names its protocol version in
//               params._meta, and the server describes itself in server/discover
//   2025-xx-xx  a handshake first (initialize, then notifications/initialized)
// Either way a request is one JSON-RPC message and the answer is one JSON
// object. Nothing here knows about HTTP beyond the status code to send, or
// about BalanceIQ beyond the list of tools it is given.

export const MODERN_VERSION = '2026-07-28';
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

// JSON-RPC and MCP error codes.
export const ERR_PARSE = -32700;
export const ERR_INVALID_REQUEST = -32600;
export const ERR_METHOD_NOT_FOUND = -32601;
export const ERR_INVALID_PARAMS = -32602;
export const ERR_HEADER_MISMATCH = -32020;
export const ERR_UNSUPPORTED_VERSION = -32022;

const fail = (status, id, code, message, data) => ({
  status,
  body: { jsonrpc: '2.0', id: id ?? null, error: data === undefined ? { code, message } : { code, message, data } },
});
const ok = (id, result) => ({ status: 200, body: { jsonrpc: '2.0', id, result } });

const header = (headers, name) => {
  const v = headers ? headers[name] : undefined;
  return Array.isArray(v) ? v[0] : v;
};

/** A tool as an AI app sees it: no internals, and its nature spelled out. */
export function describeTool(tool, lang) {
  const readOnly = tool.readOnly !== false;
  const title = tool.title && (tool.title[lang] || tool.title.en);
  return {
    name: tool.name,
    ...(title ? { title } : {}),
    description: tool.description,
    inputSchema: tool.inputSchema || { type: 'object', additionalProperties: false },
    annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly && tool.destructive === true, idempotentHint: readOnly, openWorldHint: false },
  };
}

// The few checks worth making before a tool runs: the arguments are an object,
// what is required is there, and each value is of the declared kind.
export function checkArguments(schema, args) {
  if (args == null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) return 'Arguments must be an object.';
  const props = (schema && schema.properties) || {};
  for (const name of (schema && schema.required) || []) {
    if (args[name] === undefined || args[name] === null || args[name] === '') return `Missing argument: ${name}.`;
  }
  for (const [name, value] of Object.entries(args)) {
    const p = props[name];
    if (!p) {
      if (schema && schema.additionalProperties === false) return `Unknown argument: ${name}.`;
      continue;
    }
    if (value === undefined || value === null) continue;
    const kind = Array.isArray(value) ? 'array' : typeof value;
    const wanted = p.type === 'integer' ? 'number' : p.type;
    if (wanted && kind !== wanted) return `Argument ${name} must be ${p.type === 'array' ? 'a list' : `a ${p.type}`}.`;
    if (p.type === 'integer' && !Number.isInteger(value)) return `Argument ${name} must be a whole number.`;
    if (p.enum && !p.enum.includes(value)) return `Argument ${name} must be one of: ${p.enum.join(', ')}.`;
    if (p.pattern && typeof value === 'string' && !new RegExp(p.pattern).test(value)) return `Argument ${name} is not in the expected form${p.description ? ` (${p.description})` : ''}.`;
  }
  return null;
}

const asResult = (data) => {
  const structured = data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data };
  return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured };
};
const asToolError = (message) => ({ content: [{ type: 'text', text: String(message) }], isError: true });

/**
 * Answer one JSON-RPC message.
 *   server: { name, version, instructions, lang }
 *   tools:  [{ name, title:{en,fr}, description, inputSchema, readOnly, run(args, ctx) }]
 *   allow:  (tool) => null when the caller may use it, or the reason it may not
 *   ctx:    whatever the tools need (the books, the company, the access level)
 * Returns { status, body }; body is null when nothing is sent back.
 */
export async function handleMessage(message, { server, tools, allow, ctx, headers } = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return fail(400, message && !Array.isArray(message) ? message.id : null, ERR_INVALID_REQUEST, 'Not a JSON-RPC 2.0 request.');
  }
  const { id, method } = message;
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (id === undefined || id === null) return { status: 202, body: null }; // a notification

  const meta = params._meta && typeof params._meta === 'object' ? params._meta : {};
  const headerVersion = header(headers, 'mcp-protocol-version');
  const asked = meta[META_PROTOCOL_VERSION];
  const modern = asked !== undefined || method === 'server/discover' || headerVersion === MODERN_VERSION;

  if (modern) {
    if (asked !== undefined && asked !== MODERN_VERSION) {
      return fail(400, id, ERR_UNSUPPORTED_VERSION, 'Unsupported protocol version.', { supported: [MODERN_VERSION], requested: asked });
    }
    // The routing headers are checked when they are sent; they must agree with the message.
    const headerMethod = header(headers, 'mcp-method');
    const headerName = header(headers, 'mcp-name');
    if ((headerVersion !== undefined && asked !== undefined && headerVersion !== asked)
      || (headerMethod !== undefined && headerMethod !== method)
      || (headerName !== undefined && method === 'tools/call' && headerName !== params.name)) {
      return fail(400, id, ERR_HEADER_MISMATCH, 'The request headers do not match the message.');
    }
  }
  const done = (result) => ok(id, modern ? { resultType: 'complete', ...result } : result);
  const list = tools || [];

  switch (method) {
    case 'server/discover':
      return done({
        supportedVersions: [MODERN_VERSION],
        capabilities: { tools: {} },
        _meta: { [META_SERVER_INFO]: { name: server.name, version: server.version } },
        ...(server.instructions ? { instructions: server.instructions } : {}),
      });
    case 'initialize': {
      const wanted = params.protocolVersion;
      return ok(id, {
        protocolVersion: LEGACY_VERSIONS.includes(wanted) ? wanted : LEGACY_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: server.name, version: server.version },
        ...(server.instructions ? { instructions: server.instructions } : {}),
      });
    }
    case 'ping':
      return done({});
    case 'tools/list':
      return done({ tools: list.filter((t) => !allow || !allow(t)).map((t) => describeTool(t, server.lang)) });
    case 'tools/call': {
      const tool = list.find((t) => t.name === params.name);
      if (!tool) return fail(modern ? 400 : 200, id, ERR_INVALID_PARAMS, `Unknown tool: ${String(params.name)}`);
      const refused = allow ? allow(tool) : null;
      if (refused) return done(asToolError(refused));
      const bad = checkArguments(tool.inputSchema, params.arguments);
      if (bad) return done(asToolError(bad));
      try {
        return done(asResult(await tool.run(params.arguments || {}, ctx)));
      } catch (e) {
        // A tool's own message is meant for the reader; anything else stays in the app.
        return done(asToolError(e && e.forUser ? e.message : 'BalanceIQ could not complete this request.'));
      }
    }
    default:
      return fail(modern ? 404 : 200, id, ERR_METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }
}

/** An error a tool raises on purpose, with a message the AI and its user may read. */
export class ToolError extends Error {
  constructor(message) { super(message); this.forUser = true; }
}
