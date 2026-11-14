// The connector's door: a small HTTP server on this computer only.
//
// It listens on 127.0.0.1, takes POST /mcp and nothing else, and answers only
// a caller that presents an access key. A web page cannot reach it: any request
// carrying an Origin, or addressed to a name other than this computer, is
// refused before the key is even looked at.

import http from 'node:http';
import { ERR_PARSE, ERR_INVALID_REQUEST } from './protocol.mjs';

export const CONNECTOR_PATH = '/mcp';
export const MAX_BODY_BYTES = 1024 * 1024;

const LOCAL_NAMES = ['127.0.0.1', 'localhost', '[::1]'];

const send = (res, status, body, headers = {}) => {
  const text = body == null ? '' : JSON.stringify(body);
  res.writeHead(status, { ...(text ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), 'Cache-Control': 'no-store', ...headers });
  res.end(text);
};
const rpcError = (code, message) => ({ jsonrpc: '2.0', id: null, error: { code, message } });

export function bearerKey(req) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * authorize(key) -> { ok: true, ...who } or { ok: false, status, message }
 * handle(message, who, headers) -> { status, body }   (protocol.mjs)
 */
export function createConnectorServer({ authorize, handle }) {
  return http.createServer(async (req, res) => {
    try {
      const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
      if (req.headers.origin !== undefined || !LOCAL_NAMES.includes(host)) return send(res, 403, rpcError(ERR_INVALID_REQUEST, 'Forbidden.'));
      if ((req.url || '').split('?')[0] !== CONNECTOR_PATH) return send(res, 404, rpcError(ERR_INVALID_REQUEST, 'Not found.'));
      if (req.method !== 'POST') return send(res, 405, null, { Allow: 'POST' });

      const who = await authorize(bearerKey(req));
      if (!who || !who.ok) {
        const status = (who && who.status) || 401;
        return send(res, status, rpcError(ERR_INVALID_REQUEST, (who && who.message) || 'A valid access key is required.'), status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {});
      }

      let message;
      try { message = JSON.parse(await readBody(req)); } catch (_) { return send(res, 400, rpcError(ERR_PARSE, 'The request is not valid JSON.')); }
      const out = await handle(message, who, req.headers);
      return send(res, out.status, out.body);
    } catch (_) {
      if (!res.headersSent) send(res, 500, rpcError(ERR_INVALID_REQUEST, 'BalanceIQ could not answer.'));
      else res.end();
    }
  });
}

/** Start listening on this computer only. Resolves with the server, rejects if the port is taken. */
export function listenLocal(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server); });
  });
}
