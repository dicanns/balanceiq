/**
 * DISC-001  a line discount is a percentage or a dollar amount off the line
 * DISC-002  a subtotal discount is a percentage or a dollar amount off the lines
 * DISC-003  a subtotal discount lowers the tax, spread over the lines by value
 * DISC-004  line and subtotal discounts together
 * DISC-005  the outstanding balance and a stated tax amount see the discount
 * DISC-006  documents saved before the dollar option still read as percentages
 *
 * A discount given at the time of sale lowers the price, so it lowers the tax
 * too. On a document mixing taxable and zero-rated lines, a subtotal discount is
 * shared by every line in proportion to its value, and the taxable lines carry
 * only their share. The revenue the ledger records is the subtotal after every
 * discount (sousTotal); the lines' sum before the subtotal discount is kept
 * separately (sousTotalBrut) for the document to show.
 */
import { describe, it, expect } from 'vitest';
import {
  computeInvoiceTotals, calcInvoiceOutstanding, lineTotal, lineDiscountLabel, discountOff,
  DISCOUNT_PERCENT, DISCOUNT_AMOUNT,
} from '../../../utils/calculations.js';

const money = (v) => `$${v.toFixed(2)}`;

describe('DISC-001 line discounts', () => {
  it('a percentage comes off the line', () => {
    expect(lineTotal({ quantite: 10, prixUnitaire: 10, remise: 10, remiseType: DISCOUNT_PERCENT })).toBe(90);
  });

  it('a dollar amount comes off the line as a whole, not off each unit', () => {
    expect(lineTotal({ quantite: 10, prixUnitaire: 10, remise: 15, remiseType: DISCOUNT_AMOUNT })).toBe(85);
  });

  it('never takes a line below zero', () => {
    expect(lineTotal({ quantite: 1, prixUnitaire: 30, remise: 50, remiseType: DISCOUNT_AMOUNT })).toBe(0);
    expect(lineTotal({ quantite: 1, prixUnitaire: 30, remise: 150 })).toBe(0);
    expect(discountOff(30, -5, DISCOUNT_AMOUNT)).toBe(0);
  });

  it('reads as a percentage or a dollar amount on the document', () => {
    expect(lineDiscountLabel({ remise: 10 }, money)).toBe('10%');
    expect(lineDiscountLabel({ remise: 15, remiseType: DISCOUNT_AMOUNT }, money)).toBe('$15.00');
    expect(lineDiscountLabel({ remise: 13.333333 }, money)).toBe('13.33%');
    expect(lineDiscountLabel({ remise: 0 }, money)).toBe('');
  });
});

const TAXABLE = [{ id: 'a', quantite: 2, prixUnitaire: 100, tps: true, tvq: true }];

describe('DISC-002 subtotal discounts', () => {
  it('a percentage off the subtotal', () => {
    const t = computeInvoiceTotals(TAXABLE, { remiseGlobale: 10, remiseGlobaleType: DISCOUNT_PERCENT });
    expect(t.sousTotalBrut).toBe(200);
    expect(t.remiseGlobaleMontant).toBe(20);
    expect(t.remiseGlobaleTaux).toBe(10);
    expect(t.sousTotal).toBe(180);
  });

  it('a dollar amount off the subtotal, capped at the subtotal', () => {
    const t = computeInvoiceTotals(TAXABLE, { remiseGlobale: 25, remiseGlobaleType: DISCOUNT_AMOUNT });
    expect(t.remiseGlobaleMontant).toBe(25);
    expect(t.remiseGlobaleTaux).toBeNull();
    expect(t.sousTotal).toBe(175);
    expect(computeInvoiceTotals(TAXABLE, { remiseGlobale: 500, remiseGlobaleType: DISCOUNT_AMOUNT }).sousTotal).toBe(0);
  });

  it('no discount leaves the totals as they were', () => {
    const t = computeInvoiceTotals(TAXABLE);
    expect(t.remiseGlobaleMontant).toBe(0);
    expect(t.sousTotal).toBe(t.sousTotalBrut);
    expect(t.total).toBeCloseTo(200 * 1.14975, 6);
  });
});

describe('DISC-003 the tax follows the subtotal discount', () => {
  it('a fully taxable document is taxed on what is left', () => {
    const t = computeInvoiceTotals(TAXABLE, { remiseGlobale: 10 });
    expect(t.tpsTotal).toBeCloseTo(9, 6);
    expect(t.tvqTotal).toBeCloseTo(17.955, 6);
    expect(t.total).toBeCloseTo(180 + 9 + 17.955, 6);
  });

  it('on a mixed document the taxable lines carry only their share', () => {
    // $300 of zero-rated mayo and $100 of taxable royalties, $40 off the subtotal:
    // a tenth comes off each, so the royalties are taxed on $90.
    const mixed = [
      { id: 'm', quantite: 1, prixUnitaire: 300, tps: false, tvq: false },
      { id: 'r', quantite: 1, prixUnitaire: 100, tps: true, tvq: true },
    ];
    const t = computeInvoiceTotals(mixed, { remiseGlobale: 40, remiseGlobaleType: DISCOUNT_AMOUNT });
    expect(t.sousTotal).toBe(360);
    expect(t.tpsTotal).toBeCloseTo(4.5, 6);
    expect(t.tvqTotal).toBeCloseTo(8.9775, 6);
  });

  it('a tax-exempt customer is still charged no tax', () => {
    const t = computeInvoiceTotals(TAXABLE, { remiseGlobale: 10, exemptFromTps: true, exemptFromTvq: true });
    expect(t.tpsTotal).toBe(0);
    expect(t.tvqTotal).toBe(0);
    expect(t.total).toBe(180);
  });
});

describe('DISC-004 line and subtotal discounts together', () => {
  it('the subtotal discount applies to the lines after their own discounts', () => {
    const lignes = [
      { id: 'a', quantite: 10, prixUnitaire: 10, remise: 10, tps: true, tvq: true },
      { id: 'b', quantite: 1, prixUnitaire: 60, remise: 10, remiseType: DISCOUNT_AMOUNT, tps: true, tvq: true },
      { type: 'section', label: 'ignored' },
    ];
    const t = computeInvoiceTotals(lignes, { remiseGlobale: 5 });
    expect(t.sousTotalBrut).toBe(140);
    expect(t.remiseGlobaleMontant).toBeCloseTo(7, 6);
    expect(t.sousTotal).toBeCloseTo(133, 6);
    expect(t.tpsTotal).toBeCloseTo(6.65, 6);
  });
});

describe('DISC-005 balances and stated taxes see the discount', () => {
  it('the outstanding balance uses the discounted total', () => {
    const facture = { lignes: TAXABLE, remiseGlobale: 20, remiseGlobaleType: DISCOUNT_AMOUNT, paiements: [{ montant: 100 }] };
    expect(calcInvoiceOutstanding(facture)).toBeCloseTo(180 * 1.14975 - 100, 6);
  });

  it('a stated tax amount still wins over the computed one', () => {
    const t = computeInvoiceTotals(TAXABLE, { remiseGlobale: 10, tpsOverride: 1, tvqOverride: 2 });
    expect(t.tpsTotal).toBe(1);
    expect(t.tvqTotal).toBe(2);
    expect(t.total).toBe(183);
  });
});

describe('DISC-006 older documents', () => {
  it('a line discount with no kind is a percentage', () => {
    expect(lineTotal({ quantite: 4, prixUnitaire: 25, remise: 25 })).toBe(75);
  });

  it('a subtotal discount with no kind is a percentage, and none at all changes nothing', () => {
    expect(computeInvoiceTotals(TAXABLE, { remiseGlobale: 50 }).sousTotal).toBe(100);
    expect(computeInvoiceTotals(TAXABLE, {}).sousTotal).toBe(200);
  });
});
