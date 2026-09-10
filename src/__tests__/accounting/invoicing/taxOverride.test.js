/**
 * TAXOV-001  a stated tax amount overrides the rates
 * TAXOV-002  an exemption still beats an override
 * TAXOV-003  the override reaches the ledger and the subledger together
 *
 * A grocery chain's deduction notice states its own GST/QST, and those figures
 * are frequently nothing like 5% / 9.975% of the charge - an $24.60 deduction
 * arriving with $0.02 GST and $0.04 QST is ordinary, because only a sliver of it
 * was taxable upstream. Recomputing from the rates would post $1.23 and $2.45 and
 * leave the remittance wrong by $3.62 on that one notice alone. The figure on the
 * notice wins, and the same totals feed the credit note, the ledger posting and
 * the AR subledger, so none of the three can drift from the others.
 */
import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals, calcInvoiceOutstanding, isTaxOverride } from '../../../utils/calculations.js';

const DEDUCTION = [{ quantite: 1, prixUnitaire: 24.60, tps: true, tvq: true }];

describe('TAXOV-001 a stated tax amount overrides the rates', () => {
  it('without an override the rates apply', () => {
    const t = computeInvoiceTotals(DEDUCTION);
    expect(t.tpsTotal).toBeCloseTo(1.23, 2);
    expect(t.tvqTotal).toBeCloseTo(2.45385, 5);
    expect(t.tpsOverridden).toBe(false);
  });

  it('the notice figures replace them', () => {
    const t = computeInvoiceTotals(DEDUCTION, { tpsOverride: 0.02, tvqOverride: 0.04 });
    expect(t.tpsTotal).toBe(0.02);
    expect(t.tvqTotal).toBe(0.04);
    expect(t.total).toBeCloseTo(24.66, 2);
    expect(t.tpsOverridden).toBe(true);
    expect(t.tvqOverridden).toBe(true);
  });

  it('the subtotal is untouched - only the tax is being restated', () => {
    expect(computeInvoiceTotals(DEDUCTION, { tpsOverride: 0.02, tvqOverride: 0.04 }).sousTotal)
      .toBeCloseTo(24.60, 2);
  });

  it('one tax can be overridden while the other keeps its rate', () => {
    const t = computeInvoiceTotals(DEDUCTION, { tpsOverride: 0.02 });
    expect(t.tpsTotal).toBe(0.02);
    expect(t.tvqTotal).toBeCloseTo(2.45385, 5);
  });

  it('zero is a real answer, not a missing one', () => {
    const t = computeInvoiceTotals(DEDUCTION, { tpsOverride: 0, tvqOverride: 0 });
    expect(t.tpsTotal).toBe(0);
    expect(t.total).toBeCloseTo(24.60, 2);
  });

  it('a value typed into the field arrives as a string and still counts', () => {
    const t = computeInvoiceTotals(DEDUCTION, { tpsOverride: '0.02', tvqOverride: '0.04' });
    expect(t.tpsTotal).toBe(0.02);
    expect(t.tvqTotal).toBe(0.04);
  });

  it('an emptied field means "use the rates", not "no tax"', () => {
    for (const empty of [null, undefined, '', NaN, 'abc', -1]) {
      expect(isTaxOverride(empty)).toBe(false);
      expect(computeInvoiceTotals(DEDUCTION, { tpsOverride: empty }).tpsTotal).toBeCloseTo(1.23, 2);
    }
  });
});

describe('TAXOV-002 an exemption still beats an override', () => {
  it('an exempt customer is charged nothing, whatever an old override says', () => {
    const t = computeInvoiceTotals(DEDUCTION, {
      exemptFromTps: true, exemptFromTvq: true, tpsOverride: 0.02, tvqOverride: 0.04,
    });
    expect(t.tpsTotal).toBe(0);
    expect(t.tvqTotal).toBe(0);
    expect(t.total).toBeCloseTo(24.60, 2);
  });

  it('a partial exemption leaves the other override standing', () => {
    const t = computeInvoiceTotals(DEDUCTION, { exemptFromTps: true, tvqOverride: 0.04 });
    expect(t.tpsTotal).toBe(0);
    expect(t.tvqTotal).toBe(0.04);
  });
});

describe('TAXOV-003 the override reaches every reader of the total', () => {
  it('the AR subledger picks it up off the document', () => {
    const doc = { lignes: DEDUCTION, paiements: [], tpsOverride: 0.02, tvqOverride: 0.04 };
    expect(calcInvoiceOutstanding(doc)).toBeCloseTo(24.66, 2);
  });

  it('a document with no override is unaffected', () => {
    const doc = { lignes: DEDUCTION, paiements: [] };
    expect(calcInvoiceOutstanding(doc)).toBeCloseTo(28.28385, 5);
  });

  it('the cents handed to the ledger match the document to the penny', () => {
    const doc = { lignes: DEDUCTION, paiements: [], tpsOverride: 0.02, tvqOverride: 0.04 };
    const t = computeInvoiceTotals(doc.lignes, doc);
    const cents = {
      subtotal: Math.round(t.sousTotal * 100),
      tps: Math.round(t.tpsTotal * 100),
      tvq: Math.round(t.tvqTotal * 100),
      total: Math.round(t.total * 100),
    };
    expect(cents).toEqual({ subtotal: 2460, tps: 2, tvq: 4, total: 2466 });
    // The entry has to balance: one debit against subtotal + both taxes.
    expect(cents.subtotal + cents.tps + cents.tvq).toBe(cents.total);
  });

  it('the exemption a customer carries still wins at the subledger', () => {
    const doc = { lignes: DEDUCTION, paiements: [], tpsOverride: 0.02, tvqOverride: 0.04 };
    expect(calcInvoiceOutstanding(doc, { exemptFromTps: true, exemptFromTvq: true }))
      .toBeCloseTo(24.60, 2);
  });

  it('what a run of notices costs if the rates are used instead', () => {
    const notices = [
      { charge: 24.60, tps: 0.02, tvq: 0.04 },
      { charge: 42.50, tps: 0.03, tvq: 0.05 },
      { charge: 7.25,  tps: 0.00, tvq: 0.01 },
    ];
    const stated = notices.reduce((s, n) => s + n.tps + n.tvq, 0);
    const byRate = notices.reduce(
      (s, n) => s + computeInvoiceTotals([{ quantite: 1, prixUnitaire: n.charge, tps: true, tvq: true }]).tpsTotal
                  + computeInvoiceTotals([{ quantite: 1, prixUnitaire: n.charge, tps: true, tvq: true }]).tvqTotal, 0);
    expect(stated).toBeCloseTo(0.15, 2);
    expect(byRate).toBeGreaterThan(9);   // off by two orders of magnitude
  });
});
