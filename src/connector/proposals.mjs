// What an AI assistant prepared and the owner has not dealt with yet.
//
// An assistant never records anything. A "propose" tool fills in an ordinary
// form (an invoice, a supplier bill) and leaves it here; BalanceIQ shows that it
// is waiting; the owner opens it in the normal screen, checks it and saves it
// with the screen's own Save, or dismisses it. Kept in memory: closing the app
// forgets what was waiting, and nothing was recorded.

import { randomUUID } from 'node:crypto';

export const WAITING = 'waiting';
export const OPENED = 'opened';
export const SAVED = 'saved';
export const DISMISSED = 'dismissed';
export const EXPIRED = 'expired';

export const PROPOSAL_KINDS = ['invoice', 'bill'];
export const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_WAITING = 20;
const KEEP_SETTLED = 200;

const isOpen = (p) => p.status === WAITING || p.status === OPENED;

export function createProposalStore({ now = () => new Date(), onChange = () => {} } = {}) {
  const items = new Map();
  const changed = () => { try { onChange(); } catch (_) { /* a listener must not break a tool */ } };

  function sweep() {
    const t = now().getTime();
    for (const p of items.values()) if (isOpen(p) && t - p.createdAt.getTime() > PROPOSAL_TTL_MS) p.status = EXPIRED;
    const settled = [...items.values()].filter((p) => !isOpen(p));
    for (const p of settled.slice(0, Math.max(0, settled.length - KEEP_SETTLED))) items.delete(p.id);
  }

  /** Leave something for the owner to review. Throws { code: 'too_many' } when the pile is full. */
  function add({ kind, tool, summary, payload }) {
    if (!PROPOSAL_KINDS.includes(kind)) throw new Error(`unknown proposal kind: ${kind}`);
    sweep();
    if ([...items.values()].filter(isOpen).length >= MAX_WAITING) throw Object.assign(new Error('too many proposals waiting'), { code: 'too_many' });
    const p = { id: randomUUID(), kind, tool: String(tool || ''), summary, payload, status: WAITING, reference: null, createdAt: now() };
    items.set(p.id, p);
    changed();
    return { id: p.id, status: p.status };
  }

  /** What an assistant may learn about its own proposal. */
  function get(id) {
    sweep();
    const p = items.get(String(id));
    return p ? { id: p.id, kind: p.kind, status: p.status, reference: p.reference, created_at: p.createdAt.toISOString() } : null;
  }

  /** What the screen shows: everything still waiting, oldest first. */
  function open() {
    sweep();
    return [...items.values()].filter(isOpen).map((p) => ({ id: p.id, kind: p.kind, status: p.status, summary: p.summary, payload: p.payload, createdAt: p.createdAt.toISOString() }));
  }

  /** The owner opened, saved or dismissed it. Returns the proposal as it now stands, or null. */
  function mark(id, status, reference) {
    const p = items.get(String(id));
    if (!p || !isOpen(p) || ![OPENED, SAVED, DISMISSED].includes(status)) return null;
    p.status = status;
    if (status === SAVED) p.reference = reference ? String(reference).slice(0, 80) : null;
    changed();
    return { id: p.id, kind: p.kind, status: p.status, reference: p.reference, tool: p.tool, summary: p.summary };
  }

  return { add, get, open, mark };
}
