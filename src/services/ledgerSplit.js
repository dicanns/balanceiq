'use strict';
// How an invoice's cents land in the ledger.
//
// The renderer rounds the subtotal, each tax and the total to cents on their
// own, so on about a third of invoices subtotal + TPS + TVQ misses the total by
// a cent. A journal entry has to balance to the cent, and posting the rounded
// parts against the rounded total was refused for exactly that cent, silently:
// the invoice existed, the customer was billed, and the books never saw it.
//
// The receivable is what the customer is billed (the total). The taxes are what
// is owed to the government, as printed. Whatever is left is revenue, so the
// rounding cent lands there, and the entry balances by construction.
function ledgerSplit({ totalCents, tpsCents, tvqCents, taxExempt, hasTps = true, hasTvq = true }) {
  const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const total = int(totalCents);
  if (total < 0) return { ok: false, error: 'negative_total' };
  if (taxExempt) return { ok: true, totalCents: total, revenueCents: total, tpsCents: 0, tvqCents: 0 };
  // A tax with no account to post to cannot be split out; it stays in revenue,
  // as it always did, rather than leaving the entry short.
  const tps = hasTps ? Math.max(0, int(tpsCents)) : 0;
  const tvq = hasTvq ? Math.max(0, int(tvqCents)) : 0;
  const revenue = total - tps - tvq;
  if (revenue < 0) return { ok: false, error: 'taxes_exceed_total' };
  return { ok: true, totalCents: total, revenueCents: revenue, tpsCents: tps, tvqCents: tvq };
}

module.exports = { ledgerSplit };
