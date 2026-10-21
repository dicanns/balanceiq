// ── RECURRING INVOICE AUTO-SEND ──────────────────────────────────────────────
// A recurring invoice set to auto-send is emailed as soon as it is generated.
// The email body is the regular invoice HTML, so the builder needs the same
// fields every other invoice screen passes it: the resolved client, the lines,
// the computed totals and the invoice template. The auto-send path used to pass
// {facture, clients, ...} instead; with no totals the builder threw, the error
// was swallowed, and the email silently never went out.

import { computeInvoiceTotals } from './calculations.js';

export function recurringInvoiceHtmlArgs({ fac, clients, companyInfo, invoiceTemplate }) {
  const lignes = fac.lignes || [];
  return {
    numero: fac.numero,
    date: fac.date,
    dateEcheance: fac.dateEcheance,
    statut: fac.statut,
    client: (clients || []).find(c => c.id === fac.clientId) || null,
    referenceClient: fac.referenceClient,
    lignes,
    notes: fac.notes,
    totals: computeInvoiceTotals(lignes, fac),
    companyInfo: companyInfo || {},
    invoiceTemplate: invoiceTemplate || {},
    montantPaye: (fac.paiements || []).reduce((s, p) => s + (p.montant || 0), 0),
    acomptes: fac.acomptes || [],
  };
}
