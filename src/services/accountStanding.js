// ── ACCOUNT STANDING ─────────────────────────────────────────────────────────
// Where a client stands, as one set of numbers the statement screen, the statement
// PDF and the statement email all share:
//
//   invoices outstanding    what is still unpaid on sent invoices, by age
//   credits available       credit notes not yet applied to an invoice
//   balance owed            outstanding less available credit
//   deposits held           deposits taken on invoices not yet sent (2500)
//
// A credit note applied to an invoice shows on that invoice as a payment that
// references the credit note, so the applied part is already inside "outstanding"
// and only the rest counts as available credit.

const DAY = 86400000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (list) => (list || []).reduce((s, x) => s + (parseFloat(x?.montant) || 0), 0);
const CLOSED = ['Payée', 'Créditée', 'Annulée', 'Brouillon'];

/**
 * totalOf(document) -> the document's total, computed the way the rest of the app
 * computes it. asOf is YYYY-MM-DD.
 */
export function accountStanding({ clientId, factures = [], creditNotes = [], asOf, totalOf }) {
  const asOfMs = Date.parse(`${asOf}T12:00:00`);
  const mine = (factures || []).filter(f => f && f.clientId === clientId && f.documentType !== 'proforma');
  const aging = { current: 0, d30: 0, d60: 0, d90: 0 };

  for (const f of mine) {
    if (CLOSED.includes(f.statut)) continue;
    const balance = (Number(totalOf(f)) || 0) - sum(f.paiements);
    if (balance <= 0.005) continue;
    const days = f.dateEcheance ? Math.floor((asOfMs - Date.parse(`${f.dateEcheance}T12:00:00`)) / DAY) : 0;
    if (days <= 0) aging.current += balance;
    else if (days <= 30) aging.d30 += balance;
    else if (days <= 60) aging.d60 += balance;
    else aging.d90 += balance;
  }

  const applied = new Map();
  for (const f of mine) {
    for (const p of f.paiements || []) {
      if (p?.fromCredit && p.reference) applied.set(p.reference, (applied.get(p.reference) || 0) + (parseFloat(p.montant) || 0));
    }
  }
  const credits = [];
  for (const cn of creditNotes || []) {
    if (!cn || cn.clientId !== clientId || cn.statut === 'Annulée') continue;
    const remaining = round2((Number(totalOf(cn)) || 0) - (applied.get(cn.numero) || 0));
    if (remaining > 0.005) credits.push({ numero: cn.numero || '', remaining });
  }

  const outstanding = round2(aging.current + aging.d30 + aging.d60 + aging.d90);
  const creditsAvailable = round2(credits.reduce((s, c) => s + c.remaining, 0));
  const depositsHeld = round2(mine.filter(f => f.statut === 'Brouillon').reduce((s, f) => s + sum(f.acomptes), 0));

  return {
    outstanding,
    creditsAvailable,
    balanceOwed: round2(Math.max(0, outstanding - creditsAvailable)),
    depositsHeld,
    aging: { current: round2(aging.current), d30: round2(aging.d30), d60: round2(aging.d60), d90: round2(aging.d90) },
    credits,
  };
}
