// Customer credits: the excess of an overpayment kept on the customer's account
// until it is applied to another invoice. Money is integer cents throughout.
//
// A credit is { id, clientId, date, amountCents, mode, reference, source,
// sourceFactureId, sourcePaymentId, glEntryId, applications: [{ id, factureId,
// date, amountCents, glEntryId }], refunds: [{ id, date, amountCents, mode,
// reference, chequeId, glEntryId }] }. What is left is amountCents less the sum of
// its applications and its refunds (money given back to the customer). Pure
// arithmetic only; the ledger calls live in the screens.

// kv_store key holding the list.
export const CLIENT_CREDITS_KEY = 'dicann-fac-client-credits';

// Mode label on the invoice payment row that an applied credit leaves behind.
// The row settles the balance but is not money received (see isCashPayment).
export const CLIENT_CREDIT_MODE = 'Crédit client';
// How the row reads on a printed receipt or invoice, by document language.
export const CLIENT_CREDIT_MODE_LABELS = { fr: 'Crédit client appliqué', en: 'Customer credit applied' };

export const CLIENT_CREDIT_SOURCE_OVERPAYMENT = 'overpayment';

const cents = (n) => Math.max(0, Math.round(Number(n) || 0));

export function creditAppliedCents(credit) {
  return (credit?.applications || []).reduce((s, a) => s + cents(a?.amountCents), 0);
}

export function creditRefundedCents(credit) {
  return (credit?.refunds || []).reduce((s, r) => s + cents(r?.amountCents), 0);
}

export function creditAvailableCents(credit) {
  if (!credit) return 0;
  return Math.max(0, cents(credit.amountCents) - creditAppliedCents(credit) - creditRefundedCents(credit));
}

// How a refund is paid out. The cheque goes through the cheque register; the other
// two post their own entry (see ledger:credit:refund).
export const CLIENT_CREDIT_REFUND_MODES = ['Chèque', 'Virement/E-Transfer', 'Comptant'];
export const CLIENT_CREDIT_REFUND_CHEQUE = 'Chèque';
export const CLIENT_CREDIT_REFUND_CASH = 'Comptant';

export function clientAvailableCents(credits, clientId) {
  return (credits || [])
    .filter((c) => c && c.clientId === clientId)
    .reduce((s, c) => s + creditAvailableCents(c), 0);
}

// Spread wantCents over the customer's credits, oldest first. Returns the updated
// list (credits not touched are the same objects) and the applications made, each
// { id, creditId, factureId, date, amountCents }. The stored application carries
// the same fields; creditId is repeated on it for the caller's convenience only.
export function applyCredits(credits, clientId, wantCents, { factureId, date, makeId } = {}) {
  const list = Array.isArray(credits) ? credits : [];
  let left = cents(wantCents);
  const made = [];
  const order = list
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c && c.clientId === clientId && creditAvailableCents(c) > 0)
    .sort((a, b) => String(a.c.date || '').localeCompare(String(b.c.date || '')) || a.i - b.i);
  const next = list.slice();
  for (const { c, i } of order) {
    if (left <= 0) break;
    const take = Math.min(left, creditAvailableCents(c));
    if (take <= 0) continue;
    const app = { id: makeId ? makeId() : `${c.id}-${(c.applications || []).length + 1}`, factureId, date, amountCents: take, glEntryId: null };
    next[i] = { ...c, applications: [...(c.applications || []), app] };
    made.push({ ...app, creditId: c.id });
    left -= take;
  }
  return { credits: next, applications: made, appliedCents: cents(wantCents) - left };
}

// Record one application on its credit (after the ledger accepted it).
export function addApplication(credits, creditId, app) {
  return (credits || []).map((c) => (c.id === creditId
    ? { ...c, applications: [...(c.applications || []), { id: app.id, factureId: app.factureId, date: app.date, amountCents: app.amountCents, glEntryId: app.glEntryId || null }] }
    : c));
}

// Drop one application (the invoice payment row was removed): the credit is
// available again.
export function removeApplication(credits, applicationId) {
  return (credits || []).map((c) =>
    (c.applications || []).some((a) => a.id === applicationId)
      ? { ...c, applications: c.applications.filter((a) => a.id !== applicationId) }
      : c);
}

// Stamp the ledger entry id on an application once it is posted.
export function setApplicationEntry(credits, applicationId, glEntryId) {
  return (credits || []).map((c) =>
    (c.applications || []).some((a) => a.id === applicationId)
      ? { ...c, applications: c.applications.map((a) => (a.id === applicationId ? { ...a, glEntryId } : a)) }
      : c);
}

export function findCreditByPayment(credits, paymentId) {
  return (credits || []).find((c) => c && c.sourcePaymentId === paymentId) || null;
}

export function findCreditByApplication(credits, applicationId) {
  return (credits || []).find((c) => (c?.applications || []).some((a) => a.id === applicationId)) || null;
}

// Credits created from an invoice payment row of this invoice (any payment).
export function creditsForFacture(credits, factureId) {
  return (credits || []).filter((c) => c && c.sourceFactureId === factureId);
}

// Give back up to wantCents of the customer's available credit, oldest credit first.
// Never more than is available. Returns the updated list and the refunds made, each
// { id, creditId, date, amountCents, mode, reference }; nothing is stored until the
// caller has the ledger's answer (see addRefund).
export function planRefund(credits, clientId, wantCents, { date, mode, reference = '', makeId } = {}) {
  const list = Array.isArray(credits) ? credits : [];
  let left = Math.min(cents(wantCents), clientAvailableCents(list, clientId));
  const made = [];
  const order = list
    .filter((c) => c && c.clientId === clientId && creditAvailableCents(c) > 0)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  for (const c of order) {
    if (left <= 0) break;
    const take = Math.min(left, creditAvailableCents(c));
    made.push({ id: makeId ? makeId() : `${c.id}-r${(c.refunds || []).length + made.length + 1}`, creditId: c.id, date, amountCents: take, mode, reference });
    left -= take;
  }
  return { refunds: made, refundedCents: made.reduce((s, r) => s + r.amountCents, 0) };
}

// Record one refund on its credit (after the ledger accepted it).
export function addRefund(credits, creditId, refund) {
  return (credits || []).map((c) => {
    if (c.id !== creditId) return c;
    // Never beyond what is left, whatever the caller asks.
    const amountCents = Math.min(cents(refund.amountCents), creditAvailableCents(c));
    if (amountCents <= 0) return c;
    return { ...c, refunds: [...(c.refunds || []), { id: refund.id, date: refund.date, amountCents, mode: refund.mode, reference: refund.reference || '', chequeId: refund.chequeId ?? null, glEntryId: refund.glEntryId ?? null }] };
  });
}

// Drop one refund (it was undone): the credit is available again.
export function removeRefund(credits, refundId) {
  return (credits || []).map((c) =>
    (c.refunds || []).some((r) => r.id === refundId)
      ? { ...c, refunds: c.refunds.filter((r) => r.id !== refundId) }
      : c);
}

export function findCreditByRefund(credits, refundId) {
  return (credits || []).find((c) => (c?.refunds || []).some((r) => r.id === refundId)) || null;
}

// Operator setting (kv_store, stored as JSON true/false, off by default): apply a
// customer's available credit to an invoice as soon as it enters the ledger.
export const CLIENT_CREDIT_AUTO_APPLY_KEY = 'dicann-fac-credit-auto-apply';

// Reads the stored setting value (a string, or the { value } the storage API returns).
export function parseAutoApplySetting(stored) {
  const raw = typeof stored === 'string' ? stored : stored?.value;
  if (raw === undefined || raw === null || raw === '') return false;
  try { return JSON.parse(raw) === true; } catch (_) { return false; }
}
