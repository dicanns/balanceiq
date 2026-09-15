// ── INVOICE DEPOSITS ─────────────────────────────────────────────────────────
// A deposit taken while an invoice is still a draft is money held for the
// customer: it is posted to 2500 Customer deposits, not to revenue and not
// against a receivable that does not exist yet. When the invoice is sent, each
// deposit becomes a payment on it (and 2500 is applied against receivables in
// the ledger), so every balance - the invoice, the client, the receivables
// subledger, the statement - counts it the way it counts any other payment.

const sum = (list) => (list || []).reduce((s, x) => s + (parseFloat(x?.montant) || 0), 0);

// Deposits stay deposits on a draft, and a cancelled invoice has nothing to apply them to.
export const STATUSES_HOLDING_DEPOSITS = ['Brouillon', 'Annulée'];

/**
 * The invoice as it should be saved once sent: deposits moved into its payments,
 * flagged, and the status set from what is left to pay. Returns { doc, applied },
 * where applied lists the new payments whose ledger application must be posted.
 * Running it twice changes nothing the second time.
 */
export function applyDepositsOnSend(doc, total) {
  const deposits = doc?.acomptes || [];
  if (!doc || deposits.length === 0 || doc.documentType === 'proforma' || STATUSES_HOLDING_DEPOSITS.includes(doc.statut)) {
    return { doc, applied: [] };
  }
  const already = new Set((doc.paiements || []).map(p => p.id));
  const applied = deposits
    .filter(a => a && !already.has(a.id) && (parseFloat(a.montant) || 0) > 0)
    .map(a => ({
      id: a.id,
      numero: null,
      date: a.date || null,
      montant: parseFloat(a.montant) || 0,
      mode: a.mode || null,
      reference: a.reference || '',
      note: '',
      isDeposit: true,
      appliedDeposit: true,
      ...(a.glEntryId ? { receiptEntryId: a.glEntryId } : {}),
    }));
  const paiements = [...(doc.paiements || []), ...applied];
  const remaining = (Number(total) || 0) - sum(paiements);
  const statut = sum(paiements) <= 0.005 ? doc.statut : remaining <= 0.005 ? 'Payée' : 'Payée partiellement';
  return { doc: { ...doc, acomptes: [], paiements, statut }, applied };
}

// Applied deposits are payments to the ledger, but the printed invoice still
// lists them under Deposits.
export const appliedDepositsTotal = (paiements) => sum((paiements || []).filter(p => p?.appliedDeposit));

// The day a deposit is applied: the invoice date, or the deposit's own date if it
// came in later, so 2500 is never drawn down before the money arrived.
export const depositApplyDate = (depositDate, invoiceDate) =>
  (depositDate && invoiceDate && depositDate > invoiceDate) ? depositDate : (invoiceDate || depositDate);
