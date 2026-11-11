// Customer credits: the excess of an overpayment kept on the customer's account
// until it is applied to another invoice. Money is integer cents throughout.
//
// A credit is { id, clientId, date, amountCents, mode, reference, source,
// sourceFactureId, sourcePaymentId, glEntryId, applications: [{ id, factureId,
// date, amountCents, glEntryId }] }. What is left is amountCents less the sum of
// its applications. Pure arithmetic only; the ledger calls live in the screens.

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

export function creditAvailableCents(credit) {
  if (!credit) return 0;
  return Math.max(0, cents(credit.amountCents) - creditAppliedCents(credit));
}

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
