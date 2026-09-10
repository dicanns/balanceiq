/**
 * ARSUB-001  the AR subledger matches what the app says an invoice is worth
 * ARSUB-002  the old private copy diverged in three separate ways
 *
 * The control-account check compares the ledger against the AR subledger, but
 * the subledger had its own copy of the invoice maths. That copy read l.qte
 * instead of l.quantite, so every quantity resolved to 0 and the subledger was
 * always 0.00 - reporting a variance equal to the entire receivable balance
 * whether or not anything was wrong. The check that exists to catch errors was
 * itself broken. Both sides now use one shared definition (CLAUDE.md rule 5).
 */
import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals, calcInvoiceOutstanding } from '../../../utils/calculations.js';

const LIGNES = [
  { quantite: 2, prixUnitaire: 100, tps: true,  tvq: true },
  { quantite: 1, prixUnitaire: 50,  tps: false, tvq: false }, // non-taxable
];

// The old private copy, kept to prove what it got wrong.
function legacySubledger(f) {
  let lineSub = 0;
  for (const l of (f.lignes || [])) {
    const u = parseFloat(l.prixUnitaire) || 0;
    const q = parseFloat(l.qte) || 0;
    const base = u * q;
    const tps = l.tps !== false ? base * 0.05 : 0;
    const tvq = l.tvq !== false ? base * 0.09975 : 0;
    lineSub += base + tps + tvq;
  }
  const paid = (f.paiements || []).reduce((s, p) => s + (parseFloat(p.montant) || 0), 0);
  return Math.max(0, lineSub - paid);
}

describe('ARSUB-001 subledger agrees with the invoice', () => {
  it('an unpaid invoice contributes its full total', () => {
    const f = { lignes: LIGNES, paiements: [] };
    expect(calcInvoiceOutstanding(f)).toBeCloseTo(computeInvoiceTotals(LIGNES).total, 2);
  });

  it('taxes only the lines flagged taxable', () => {
    const t = computeInvoiceTotals(LIGNES);
    expect(t.sousTotal).toBeCloseTo(250, 2);
    expect(t.tpsTotal).toBeCloseTo(10, 2);      // 5% of 200 only
    expect(t.tvqTotal).toBeCloseTo(19.95, 2);   // 9.975% of 200 only
  });

  it('honours line discounts', () => {
    const l = [{ quantite: 2, prixUnitaire: 100, remise: 10, tps: true, tvq: true }];
    expect(computeInvoiceTotals(l).sousTotal).toBeCloseTo(180, 2);
  });

  it('skips section header lines', () => {
    const l = [{ type: 'section', quantite: 5, prixUnitaire: 999 }, ...LIGNES];
    expect(computeInvoiceTotals(l).sousTotal).toBeCloseTo(250, 2);
  });

  it('a partly paid invoice contributes only the remainder', () => {
    const f = { lignes: LIGNES, paiements: [{ montant: 100 }] };
    expect(calcInvoiceOutstanding(f)).toBeCloseTo(computeInvoiceTotals(LIGNES).total - 100, 2);
  });

  it('never contributes a negative balance when overpaid', () => {
    const f = { lignes: LIGNES, paiements: [{ montant: 99999 }] };
    expect(calcInvoiceOutstanding(f)).toBe(0);
  });

  it('a tax-exempt client drops both taxes', () => {
    const f = { lignes: LIGNES, paiements: [] };
    expect(calcInvoiceOutstanding(f, { exemptFromTps: true, exemptFromTvq: true }))
      .toBeCloseTo(250, 2);
  });
});

describe('ARSUB-002 the old copy diverged', () => {
  it('read the wrong quantity field, so every invoice summed to zero', () => {
    expect(legacySubledger({ lignes: LIGNES, paiements: [] })).toBe(0);
    expect(calcInvoiceOutstanding({ lignes: LIGNES, paiements: [] })).toBeGreaterThan(0);
  });

  it('ignored line discounts', () => {
    const l = [{ qte: 2, quantite: 2, prixUnitaire: 100, remise: 10, tps: false, tvq: false }];
    expect(legacySubledger({ lignes: l })).toBeCloseTo(200, 2);          // discount lost
    expect(computeInvoiceTotals(l).sousTotal).toBeCloseTo(180, 2);       // discount applied
  });

  it('taxed a line whose flags were merely undefined', () => {
    const l = [{ qte: 1, quantite: 1, prixUnitaire: 100 }];
    expect(legacySubledger({ lignes: l })).toBeGreaterThan(100);         // taxed it
    expect(computeInvoiceTotals(l).total).toBeCloseTo(100, 2);           // did not
  });
});
