// AI relay: the parts with no network and no database in them, so the same file
// runs in the edge function and in the unit tests (Web APIs only).
//
// The relay lets an online AI assistant (ChatGPT and others) put a question to
// the BalanceIQ app on the owner's computer. It hands out its own access keys,
// good for the relay and nothing else: no assistant ever holds a BalanceIQ
// sign-in.

export const RELAY_PLANS = ['pro', 'network', 'franchise'];
export const SCOPE = 'books.read';
export const ACCESS_PREFIX = 'biqr_';

export const CODE_TTL_MS = 5 * 60 * 1000;
export const REQUEST_TTL_MS = 15 * 60 * 1000;
export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const PRESENCE_FRESH_MS = 45 * 1000;
export const ANSWER_WAIT_MS = 20 * 1000;
export const NEXT_HOLD_MS = 25 * 1000;
export const MAX_BODY_BYTES = 256 * 1024;
export const CALLS_PER_MINUTE = 120;

// Anyone on the internet can reach the sign-in routes, so what they can make
// the relay store is bounded: new assistants per hour, sign-in requests per
// assistant and per hour. An assistant nobody approved is forgotten after two days.
export const NEW_CLIENTS_PER_HOUR = 60;
export const OPEN_REQUESTS_PER_CLIENT = 10;
export const NEW_REQUESTS_PER_HOUR = 300;
export const UNUSED_CLIENT_TTL_MS = 2 * 24 * 60 * 60 * 1000;

/** What a person sees when they open the relay's address in a browser. */
export const BROWSER_NOTE = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>BalanceIQ</title>
<body style="font:16px/1.5 -apple-system,Segoe UI,sans-serif;max-width:34em;margin:12vh auto;padding:0 20px;color:#17160F;background:#F3EFE6">
<p><strong>BalanceIQ</strong></p>
<p>Cette adresse est destin\u00e9e aux assistants IA, pas \u00e0 un navigateur. Collez-la dans votre assistant comme nouvelle connexion.</p>
<p>This address is for AI assistants, not for a web browser. Paste it into your assistant as a new connection.</p>
<p><a href="https://balanceiq.ca/#assistant" style="color:#E4570F">balanceiq.ca</a></p></body>`;

// Assistants whose sign-in page we recognise. Any other destination is still
// allowed, and the approval page says plainly that it is not a known one.
export const KNOWN_HOSTS = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'claude.com', 'gemini.google.com', 'copilot.microsoft.com', 'chat.mistral.ai'];

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const s = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(String(text)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PKCE, S256 only: the verifier the assistant shows must hash to the challenge it sent first. */
export async function pkceMatches(verifier, challenge) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const d = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64url(d) === challenge;
}

/** The key that seals a question and its answer while they wait in the queue. */
export async function sealKeyFrom(secret) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(`ai-relay-seal:${secret}`));
  return crypto.subtle.importKey('raw', d, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return `${b64url(iv)}.${b64url(ct)}`;
}

export async function unseal(key, text) {
  const [iv, ct] = String(text).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(ct));
  return JSON.parse(dec.decode(pt));
}

/** Where an assistant may be sent back to: https anywhere, or this computer. Never a fragment. */
export function validRedirect(uri) {
  if (typeof uri !== 'string' || uri.length > 2000) return false;
  let u;
  try { u = new URL(uri); } catch (_) { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

export function redirectHost(uri) {
  try { return new URL(uri).hostname; } catch (_) { return ''; }
}

export function isKnownHost(host) {
  return KNOWN_HOSTS.some((k) => host === k || host.endsWith(`.${k}`));
}

export function withQuery(uri, params) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

/** The path inside the function, whatever the gateway put in front of it. */
export function routeOf(pathname) {
  const i = pathname.indexOf('/ai-relay');
  const rest = i >= 0 ? pathname.slice(i + '/ai-relay'.length) : pathname;
  return rest.replace(/\/+$/, '') || '/';
}

export function authServerMetadata(issuer, base) {
  return {
    issuer,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  };
}

export function resourceMetadata(issuer, base) {
  return {
    resource: `${base}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [SCOPE],
    resource_name: 'BalanceIQ',
  };
}

/** What a dynamic registration must look like; returns the cleaned client or an error word. */
export function cleanRegistration(body) {
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) return { error: 'invalid_redirect_uri' };
  const name = typeof body.client_name === 'string' ? body.client_name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80) : '';
  return { client: { client_name: name, redirect_uris: uris } };
}

/** How the app being closed, the plan or the pace is told to the assistant. */
export function refusal(message, text) {
  const id = message && Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null;
  if (message && message.method === 'tools/call') {
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } };
  }
  return { jsonrpc: '2.0', id, error: { code: -32000, message: text } };
}

export const SAY = {
  closed: 'BalanceIQ is not open on the computer that holds these books, or its online assistant switch is off. Ask the owner to open BalanceIQ with this company, check Settings > AI assistant, then try again.',
  plan: 'Connecting an AI assistant is part of the BalanceIQ Pro plan, and this company is not on it.',
  pace: 'Too many requests in one minute. Wait a moment, then try again.',
  silent: 'BalanceIQ did not answer in time. Check that it is still open on the computer that holds these books, then try again.',
};
