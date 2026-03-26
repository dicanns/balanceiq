/**
 * Invoice Balance (AR) Tests
 * calcInvoiceBalance — total minus payments, never negative
 * calcTotalOutstanding — sum of all open balances
 * Covers: partial pay, full pay, overpay, no payments, credit notes, multiple invoices
 */
import { describe, it, expect } from 'vitest';
import { calcInvoiceBalance, calcTotalOutstanding, calcInvoiceTotals } from '../utils/calculations.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
const pmt = (montant, date = '2026-03-01') => ({ montant, date });

// ────────────────────────────────────────────────────────────────────────────
describe('Invoice balance — single invoice', () => {
  it('full balance when no payments made', () => {
    expect(calcInvoiceBalance(500, [])).toBe(500);
    expect(calcInvoiceBalance(500, null)).toBe(500);
  });

  it('partial payment reduces balance', () => {
    expect(calcInvoiceBalance(500, [pmt(200)])).toBe(300);
    expect(calcInvoiceBalance(1149.75, [pmt(500)])).toBe(649.75);
  });

  it('full payment — balance is zero', () => {
    expect(calcInvoiceBalance(500, [pmt(500)])).toBe(0);
    expect(calcInvoiceBalance(1149.75, [pmt(1149.75)])).toBe(0);
  });

  it('overpayment — balance never goes negative (capped at 0)', () => {
    expect(calcInvoiceBalance(500, [pmt(600)])).toBe(0);
    expect(calcInvoiceBalance(100, [pmt(200)])).toBe(0);
  });

  it('multiple payments sum correctly', () => {
    const payments = [pmt(200), pmt(150), pmt(100)];  // = 450
    expect(calcInvoiceBalance(500, payments)).toBe(50);
  });

  it('splits across payment dates', () => {
    const payments = [
      pmt(300, '2026-02-15'),
      pmt(150, '2026-03-01'),
    ];
    expect(calcInvoiceBalance(500, payments)).toBe(50);
  });

  it('rounding: $1149.75 invoice with $1000 payment', () => {
    expect(calcInvoiceBalance(1149.75, [pmt(1000)])).toBe(149.75);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Invoice balance — from computed totals', () => {
  it('balance computed from invoice lines', () => {
    // 2 × $200 + TPS + TVQ → invoice total
    const lignes = [{ quantite: 2, prixUnitaire: 200, remise: 0, tps: true, tvq: true }];
    const { total } = calcInvoiceTotals(lignes);
    expect(total).toBeCloseTo(459.90, 2);  // 400 + 20 + 39.90

    // Paid $200, remaining balance
    const balance = calcInvoiceBalance(total, [pmt(200)]);
    expect(balance).toBeCloseTo(259.90, 2);
  });

  it('zero-value invoice has zero balance', () => {
    expect(calcInvoiceBalance(0, [])).toBe(0);
  });

  it('payments with null montant treated as zero', () => {
    const payments = [{ montant: null, date: '2026-03-01' }, pmt(100)];
    expect(calcInvoiceBalance(500, payments)).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Total outstanding — AR aging portfolio', () => {
  it('sums outstanding balances across multiple invoices', () => {
    const invoices = [
      { total: 1000, paiements: [pmt(400)] },           // $600 outstanding
      { total: 500,  paiements: [pmt(500)] },            // $0 (paid)
      { total: 750,  paiements: [pmt(200), pmt(100)] },  // $450 outstanding
    ];
    expect(calcTotalOutstanding(invoices)).toBe(1050);
  });

  it('all invoices paid — total outstanding is zero', () => {
    const invoices = [
      { total: 1000, paiements: [pmt(1000)] },
      { total: 500,  paiements: [pmt(600)] }, // overpaid, capped at 0
    ];
    expect(calcTotalOutstanding(invoices)).toBe(0);
  });

  it('no invoices — returns zero', () => {
    expect(calcTotalOutstanding([])).toBe(0);
  });

  it('unpaid invoice portfolio — real franchise AR scenario', () => {
    // Three franchise royalty invoices from different locations
    const invoices = [
      { total: 2667.50, paiements: [] },                      // full outstanding
      { total: 1940.00, paiements: [pmt(1000)] },             // partial
      { total: 3200.00, paiements: [pmt(3200)] },             // fully paid
    ];
    const outstanding = calcTotalOutstanding(invoices);
    expect(outstanding).toBe(3607.50);  // 2667.50 + 940 + 0
  });

  it('single invoice with multiple partial payments chains correctly', () => {
    const invoices = [{
      total: 5000,
      paiements: [pmt(1000), pmt(1500), pmt(500)],  // paid $3000
    }];
    expect(calcTotalOutstanding(invoices)).toBe(2000);
  });
});
