// Bill inbox: the parts with no network and no database in them, so the same file
// runs in the edge function and in the unit tests (Web APIs only).
//
// The owner forwards a supplier's invoice to a private address. The message waits
// sealed in the cloud until the app is next open, then moves to the computer and
// is erased here. Nothing in this file reads a message with any kind of AI.
import { RELAY_PLANS, sealKeyFrom, sha256Hex, randomToken, b64url } from '../ai-relay/core.js';

// Shared with the AI relay on purpose: one list of plans, one way to make a seal key.
export { RELAY_PLANS, sealKeyFrom, sha256Hex, randomToken, b64url };

export const INBOX_DOMAIN = 'in.balanceiq.ca';
// One mailbox for everyone; the company is told apart by the code after the plus sign
// (bills+code@...). Cloudflare can send any address to the worker only on a main domain,
// not on a sub-address like this one, so a single named mailbox with a code is used.
export const INBOX_MAILBOX = 'bills';
// The mail server that receives for us and writes the verdict we trust.
export const MAIL_SERVER = 'mx.cloudflare.net';
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024; // the raw email
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // all kept attachments of one message together
export const MAX_ATTACHMENTS = 4;
export const MAX_NOTE_CHARS = 8000;
export const MAX_SUBJECT_CHARS = 300;
export const MAX_SENDERS = 10;
export const MAX_WAITING = 15; // messages waiting per company
export const MAX_PER_DAY = 40; // messages accepted per company per day
export const KEEP_DAYS = 14;
export const SMALL_INLINE_BYTES = 20 * 1024; // inline pictures under this are signatures and logos
export const ATTACHMENT_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

const enc = new TextEncoder();
const dec = new TextDecoder();

/** The path inside the function, whatever the gateway put in front of it. */
export function routeOf(pathname) {
  const m = /\/inbox(?=\/|$)/.exec(pathname);
  const rest = m ? pathname.slice(m.index + '/inbox'.length) : pathname;
  return rest.replace(/\/+$/, '') || '/';
}

// ── Bytes and sealing ────────────────────────────────────────────────────────

/** Standard base64 of bytes, built in slices: one character at a time would cost seconds on 5 MB. */
export function bytesToB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parts = [];
  for (let i = 0; i < u8.length; i += 0x8000) parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)));
  return btoa(parts.join(''));
}

export function b64ToBytes(text) {
  const s = atob(String(text));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Seals raw bytes (not through JSON). The answer is `iv.ciphertext`, both standard base64. */
export async function sealBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return `${bytesToB64(iv)}.${bytesToB64(new Uint8Array(ct))}`;
}

export async function unsealBytes(key, text) {
  const [iv, ct] = String(text).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) }, key, b64ToBytes(ct));
  return new Uint8Array(pt);
}

/** Seals a small JSON value (names, subject, note). Same layout as sealBytes. */
export async function sealJson(key, value) {
  return sealBytes(key, enc.encode(JSON.stringify(value)));
}

export async function unsealJson(key, text) {
  return JSON.parse(dec.decode(await unsealBytes(key, text)));
}

/** Compares two secrets without stopping at the first different character. */
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// ── Addresses ────────────────────────────────────────────────────────────────

const LOCAL_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no i, l, o, 0, 1

/** A company's private code: 12 random characters, no lookalike characters, no modulo bias. */
export function newAddressCode() {
  let out = '';
  const limit = 256 - (256 % LOCAL_ALPHABET.length);
  while (out.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(24))) {
      if (b < limit && out.length < 12) out += LOCAL_ALPHABET[b % LOCAL_ALPHABET.length];
    }
  }
  return out;
}

/** The full address a company forwards to. */
export function addressFor(code) {
  return `${INBOX_MAILBOX}+${code}@${INBOX_DOMAIN}`;
}

/**
 * The company code inside the local part of a recipient address, or null. The dash
 * form (bills-code) is accepted too, for an address routed by its own rule.
 */
export function codeOf(local) {
  const m = new RegExp(`^${INBOX_MAILBOX}[+-]([${LOCAL_ALPHABET}]{12})$`).exec(String(local || '').toLowerCase());
  return m ? m[1] : null;
}

/**
 * Splits an address into { address, local, domain }, lowercased. Tolerates
 * `Name <a@b.com>`. Anything with a control character (a smuggled newline) or
 * without the shape of an email address gives null.
 */
export function addressParts(raw) {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  let text = raw.trim();
  const angle = /<([^<>]*)>\s*$/.exec(text);
  if (angle) text = angle[1].trim();
  text = text.toLowerCase();
  if (text.length > 254) return null;
  const m = /^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})$/.exec(text);
  if (!m) return null;
  return { address: text, local: m[1], domain: m[2] };
}

/** The owner's list of who may send: { senders } cleaned, or { error: 'invalid_sender' }. */
export function cleanSenders(list) {
  if (!Array.isArray(list)) return { error: 'invalid_sender' };
  const out = [];
  for (const item of list) {
    const parts = addressParts(item);
    if (!parts) return { error: 'invalid_sender' };
    if (!out.includes(parts.address)) out.push(parts.address);
  }
  if (out.length > MAX_SENDERS) return { error: 'invalid_sender' };
  return { senders: out };
}

// ── Who really sent it ───────────────────────────────────────────────────────

const AUTH_HEADER = 'authentication-results';

/**
 * Did the receiving mail server see this message pass a check tied to the From
 * domain? `headers` is the parsed header list in message order. Only the first
 * authentication-results header counts, and only when it was written by our own
 * receiving server: that server puts its verdict on top, and anything lower down,
 * or under another server's name, may have been written by the sender.
 */
export function authVerdict(headers, fromAddress, server = MAIL_SERVER) {
  const from = addressParts(String(fromAddress || ''));
  if (!from) return false;
  const first = (Array.isArray(headers) ? headers : []).find((h) => h && String(h.key || '').toLowerCase() === AUTH_HEADER);
  if (!first) return false;
  const value = String(first.value || '').toLowerCase().replace(/\([^)]*\)/g, ' ');
  const parts = value.split(';');
  if (parts.shift().trim().split(/\s+/)[0] !== server) return false;
  for (const part of parts) {
    const seg = ` ${part.replace(/\s+/g, ' ')} `;
    if (/ dmarc=pass /.test(seg)) return true;
    if (/ dkim=pass /.test(seg)) {
      const d = /header\.d=([^\s;]+)/.exec(seg);
      const domain = d ? d[1].replace(/\.$/, '') : '';
      // A parent domain may sign for its subdomains; a bare top-level name never counts.
      if (domain.includes('.') && (from.domain === domain || from.domain.endsWith(`.${domain}`))) return true;
    }
    if (/ spf=pass /.test(seg)) {
      const m = /smtp\.mailfrom=([^\s;]+)/.exec(seg);
      const domain = m ? m[1].replace(/^["<]+|[">]+$/g, '').split('@').pop().replace(/\.$/, '') : '';
      if (domain && domain === from.domain) return true;
    }
  }
  return false;
}

// ── Limits ───────────────────────────────────────────────────────────────────

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Messages accepted so far today; the count starts over when the day changes. */
export function dayCount(row, today) {
  if (!row || row.count_day !== today) return 0;
  return Math.max(0, Number(row.count_today) || 0);
}

/** null when one more message may be stored, otherwise 'full'. */
export function capVerdict({ waiting, row, today }) {
  if ((Number(waiting) || 0) >= MAX_WAITING) return 'full';
  if (dayCount(row, today) >= MAX_PER_DAY) return 'full';
  return null;
}

// ── What is kept from a message ──────────────────────────────────────────────

function extensionOf(name) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

function bytesOf(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  if (typeof content === 'string') return enc.encode(content);
  return new Uint8Array(0);
}

function typeOf(att) {
  const mime = String(att.mimeType || '').toLowerCase().split(';')[0].trim();
  if (Object.values(ATTACHMENT_TYPES).includes(mime)) return mime;
  // Many mail programs label a PDF as a generic file; the name then decides.
  return ATTACHMENT_TYPES[extensionOf(att.filename)] || null;
}

function nameOf(att, type) {
  const clean = String(att.filename || '').replace(/[\u0000-\u001f\u007f\\/]/g, '').trim().slice(0, 120);
  if (clean) return clean;
  const ext = Object.keys(ATTACHMENT_TYPES).find((k) => ATTACHMENT_TYPES[k] === type) || 'bin';
  return `attachment.${ext}`;
}

/**
 * Chooses which attachments are stored. Small inline pictures (signatures,
 * logos) are ignored without a word. A file of another kind, or one that does
 * not fit the count or size limit, is counted in `skipped` so the owner knows.
 */
export function pickAttachments(parsed) {
  const kept = [];
  let skipped = 0;
  let total = 0;
  for (const att of Array.isArray(parsed) ? parsed : []) {
    if (!att) continue;
    const bytes = bytesOf(att.content);
    const inline = att.disposition === 'inline' || !!att.related || (!att.disposition && !!att.contentId);
    if (inline && String(att.mimeType || '').toLowerCase().startsWith('image/') && bytes.length < SMALL_INLINE_BYTES) continue;
    const type = typeOf(att);
    if (!type || bytes.length === 0) { skipped++; continue; }
    if (kept.length >= MAX_ATTACHMENTS || total + bytes.length > MAX_ATTACHMENT_BYTES) { skipped++; continue; }
    total += bytes.length;
    kept.push({ name: nameOf(att, type), type, size: bytes.length, bytes });
  }
  return { kept, skipped };
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&');
}

/** What the owner wrote: the plain-text body, else the HTML body with its tags removed. */
export function noteOf(parsed) {
  let text = typeof parsed?.text === 'string' ? parsed.text : '';
  if (!text.trim() && typeof parsed?.html === 'string') {
    text = decodeEntities(
      parsed.html
        .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])\s*>/gi, '\n')
        .replace(/<[^>]*>/g, ' '),
    ).replace(/[ \t]{2,}/g, ' ').replace(/ ([,.;:!?])/g, '$1');
  }
  text = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, MAX_NOTE_CHARS);
}

export function subjectOf(parsed) {
  return String(parsed?.subject || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_SUBJECT_CHARS);
}
