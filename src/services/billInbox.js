// The bill inbox for the open company: the owner forwards a supplier invoice to a
// private address, the message waits sealed online and this file brings it down
// whenever BalanceIQ is open. Off unless the owner turned it on here.
// See src/inbox/puller.mjs. Nothing in here throws to the caller.
import { signedEdgeCall } from './edgeCall.js';
import { createInboxPuller } from '../inbox/puller.mjs';

export const INBOX_FLAG_KEY = 'balanceiq-bill-inbox-on';
const EVERY_MS = 10 * 60 * 1000;

let puller = null;
let timer = null;
let wanted = false;
let lastCheckAt = null;

const call = (path, body) => signedEdgeCall('inbox', path, body);

function getPuller() {
  if (!puller) puller = createInboxPuller({ call, store: (item) => window.api.inbox.store(item) });
  return puller;
}

async function flagOn() {
  try { const r = await window.api?.storage?.get?.(INBOX_FLAG_KEY); return !!r && r.value === '1'; } catch (_) { return false; }
}
async function setFlag(on) {
  try { await window.api?.storage?.set?.(INBOX_FLAG_KEY, on ? '1' : '0'); } catch (_) { /* the screen still works */ }
}

// Owner routes answer { ok, status, data }; the screen wants a plain result.
async function owner(path, body) {
  try {
    const r = await call(path, body);
    if (r && r.ok && r.data) return { ok: true, status: r.data };
    let error = 'unreachable';
    if (r && r.status === 401) error = 'signed_out';
    else if (r && r.status === 403 && r.data && r.data.error === 'plan') error = 'plan';
    else if (r && r.status === 400 && r.data && r.data.error === 'invalid_sender') error = 'invalid_sender';
    return { ok: false, error };
  } catch (_) { return { ok: false, error: 'unreachable' }; }
}

/** Bring the waiting messages down now. Returns { pulled, error, at }. */
export async function check() {
  let r;
  try { r = await getPuller().run(); } catch (_) { r = { pulled: 0, error: 'unreachable' }; }
  lastCheckAt = new Date().toISOString();
  return { pulled: r.pulled, error: r.error, at: lastCheckAt };
}

/** Check now and every 10 minutes. Safe to call many times; does nothing while the flag is off. */
export async function watch() {
  wanted = true;
  if (timer) return;
  if (!(await flagOn())) return;
  // stopWatch may have been called while the flag was being read.
  if (timer || !wanted) return;
  timer = setInterval(async () => { if (await flagOn()) check(); }, EVERY_MS);
  check();
}

export function stopWatch() {
  wanted = false;
  if (timer) { clearInterval(timer); timer = null; }
}

// The cloud is the truth for on/off: on a second computer, or after a restore, the
// local flag follows it, so the messages are fetched here too.
export async function status() {
  const r = await owner('status');
  if (r.ok && r.status && typeof r.status.enabled === 'boolean' && r.status.enabled !== (await flagOn())) {
    await setFlag(r.status.enabled);
    if (r.status.enabled && wanted) watch();
  }
  return r;
}
export async function enable() {
  const r = await owner('enable');
  if (r.ok) { await setFlag(true); watch(); }
  return r;
}
export async function disable() {
  const r = await owner('disable');
  if (r.ok) { await setFlag(false); stopWatch(); }
  return r;
}
export const setSenders = (list) => owner('senders', { senders: list });
export const newAddress = () => owner('new-address');
export const lastCheck = () => lastCheckAt;

// One object for the screen, the same on every render.
export const inboxApi = { status, enable, disable, setSenders, newAddress, check, watch, stopWatch, lastCheck };
