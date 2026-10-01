// Applying a credit note to an invoice.
//
// A credit note posts to the ledger when it is saved (Dr contra-revenue,
// Cr accounts receivable), so applying it later moves no money in the books:
// it only says which invoice the credit settles. On the invoice that is a
// payment line marked fromCredit, referencing the credit note's number, which
// is what account standing, statements and aging already read.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (list) => (list || []).reduce((s, p) => s + (Number(p?.montant) || 0), 0);

/** What is left of a credit note once its applications are counted. */
export function creditRemaining(creditNote, creditTotal, factures) {
  if (!creditNote || creditNote.statut === 'Annulée') return 0;
  const used = (factures || []).reduce((s, f) => s + sum((f.paiements || []).filter(
    (p) => p?.fromCredit && p.reference && p.reference === creditNote.numero)), 0);
  return Math.max(0, r2((Number(creditTotal) || 0) - used));
}

/** An invoice's balance: total less everything recorded against it. */
export function invoiceBalance(invoice, invoiceTotal) {
  return Math.max(0, r2((Number(invoiceTotal) || 0) - sum(invoice?.paiements)));
}

/** Invoice status from what has been recorded against it. */
export function statusAfterPayments(invoice, invoiceTotal, fallback) {
  const paid = sum(invoice?.paiements);
  if (r2(invoiceTotal) - r2(paid) <= 0.005) {
    const anyMoney = (invoice?.paiements || []).some((p) => !p?.fromCredit && Number(p?.montant) > 0);
    return anyMoney ? 'Payée' : 'Créditée';
  }
  return paid > 0 ? 'Payée partiellement' : (fallback || 'Envoyée');
}

/**
 * Apply up to `amount` of a credit note to an invoice. Never more than the
 * credit has left or the invoice still owes. Returns the updated invoice and
 * credit note, or { error } with nothing changed.
 */
export function applyCreditToInvoice({ creditNote, creditTotal, invoice, invoiceTotal, factures, amount, date, label = 'Note de crédit', id }) {
  if (!creditNote || !invoice) return { error: 'missing' };
  if (creditNote.statut === 'Annulée') return { error: 'cancelled' };
  if (creditNote.clientId && invoice.clientId && creditNote.clientId !== invoice.clientId) return { error: 'other_client' };
  if (['Annulée', 'Brouillon'].includes(invoice.statut)) return { error: 'invoice_not_open' };
  const left = creditRemaining(creditNote, creditTotal, factures);
  const owed = invoiceBalance(invoice, invoiceTotal);
  const amt = r2(Math.min(Number(amount) || 0, left, owed));
  if (!(amt > 0)) return { error: left <= 0 ? 'nothing_left' : 'nothing_owed' };

  const payment = {
    id: id || `${Date.now()}c`, numero: creditNote.numero, date, montant: amt,
    mode: label, reference: creditNote.numero, note: `${label} ${creditNote.numero}`, fromCredit: true,
  };
  const paiements = [...(invoice.paiements || []), payment];
  const nextInvoice = { ...invoice, paiements, statut: statusAfterPayments({ paiements }, invoiceTotal, invoice.statut) };
  const leftAfter = r2(left - amt);
  const nextCredit = {
    ...creditNote,
    factureId: creditNote.factureId || invoice.id,
    statut: leftAfter <= 0.005 ? 'Appliquée' : (creditNote.statut === 'Brouillon' ? 'Émise' : creditNote.statut),
  };
  return { invoice: nextInvoice, creditNote: nextCredit, payment, applied: amt, leftAfter };
}

/** Remove every application of a credit note, for when it is cancelled. */
export function unapplyCredit(creditNote, factures, totalOf) {
  return (factures || []).map((f) => {
    const keep = (f.paiements || []).filter((p) => !(p?.fromCredit && p.reference === creditNote.numero));
    if (keep.length === (f.paiements || []).length) return f;
    return { ...f, paiements: keep, statut: statusAfterPayments({ paiements: keep }, totalOf(f), 'Envoyée') };
  });
}
