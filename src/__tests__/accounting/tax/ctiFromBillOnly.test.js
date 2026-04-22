/**
 * TAX-011 + TAX-012 — CTI Sourced from Bill Only, Never Doubled via Bank Transaction
 *
 * P1 fix from Codex review: the CTI computation reads tax fields from supplier
 * bills stored in kv_store JSON. Bank transactions have a tax_claimable flag
 * but it is used only for the suspense queue count, NOT for adding to CTI.
 * A bank transaction matched to a bill must NOT produce a second CTI claim.
 * If this test fails, do not canary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb, computeCtiFromDb, gl } from '../helpers/testSchema.js';

let db;

beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db.close(); });

describe('TAX-011 CTI from bill only', () => {
  it('CTI is recorded exactly once from a bill with tps_paid and tvq_paid', () => {
    // Seed a P&L month with a bill that has explicit TPS/TVQ amounts
    const plData = {
      _revenueOverride: 20000,
      loyer_bills: [
        {
          id: 'bill-rent-1',
          supplier: 'Proprio Inc',
          amount: 3765.00,
          tps_paid: 175.00,  // $175.00 TPS
          tvq_paid: 348.56,  // $348.56 TVQ
          business_use_pct: 100,
        },
      ],
    };
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-pl-2026-03', JSON.stringify(plData));

    const { tpsCti, tvqRti, billCount } = computeCtiFromDb(db, '2026-03-01', '2026-03-31');

    expect(billCount).toBe(1);
    expect(tpsCti).toBeCloseTo(175.00, 4);
    expect(tvqRti).toBeCloseTo(348.56, 4);
  });
});

describe('TAX-012 no CTI double-count when bank transaction matches bill', () => {
  it('bank transaction with tax_claimable=0 does not add to CTI', () => {
    // Seed bill in kv_store
    const plData = {
      _revenueOverride: 20000,
      loyer_bills: [
        {
          id: 'bill-rent-2',
          supplier: 'Proprio Inc',
          amount: 3765.00,
          tps_paid: 175.00,
          tvq_paid: 348.56,
          business_use_pct: 100,
        },
      ],
    };
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-pl-2026-03', JSON.stringify(plData));

    // Create a bank account and matching bank transaction
    const coaCash = gl.coaId(db, '1010');
    const coaExpense = gl.coaId(db, '6100'); // Loyer
    const { lastInsertRowid: bankAccountId } = db.prepare(
      `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
       VALUES ('BNC Oper', 'bank', ?, 5000, '2026-01-01')`
    ).run(coaCash);

    // Bank transaction for same amount, categorized as cash expense (tax_claimable=0 default)
    db.prepare(
      `INSERT INTO bank_transactions
         (bank_account_id, transaction_date, description, amount, match_status, coa_account_id, tax_claimable)
       VALUES (?, '2026-03-01', 'PROPRIO INC LOYER', -3765.00, 'manual', ?, 0)`
    ).run(bankAccountId, coaExpense);

    // CTI must come from bill only — bank transaction with tax_claimable=0 is ignored
    const { tpsCti, tvqRti } = computeCtiFromDb(db, '2026-03-01', '2026-03-31');

    // Total CTI = bill amount only (not bill + bank transaction)
    expect(tpsCti).toBeCloseTo(175.00, 4);
    expect(tvqRti).toBeCloseTo(348.56, 4);
  });

  it('setting tax_claimable=1 on bank transaction still does not double CTI computation', () => {
    // This confirms the architecture: taxPeriodCompute reads CTI from kv_store bills,
    // not from bank_transactions.tax_claimable. Marking a transaction as tax_claimable
    // affects the suspense queue count only, not the CTI total.
    const plData = {
      _revenueOverride: 10000,
      loyer_bills: [
        {
          id: 'bill-rent-3',
          supplier: 'Energir',
          amount: 318.50,
          tps_paid: 14.50,
          tvq_paid: 28.89,
          business_use_pct: 100,
        },
      ],
    };
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-pl-2026-04', JSON.stringify(plData));

    const coaCash = gl.coaId(db, '1010');
    const coaExpense = gl.coaId(db, '6120');
    const { lastInsertRowid: bankAccountId } = db.prepare(
      `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
       VALUES ('BNC Oper', 'bank', ?, 5000, '2026-01-01')`
    ).run(coaCash);

    // Mark this bank transaction as tax_claimable=1 (which places it in suspense queue)
    db.prepare(
      `INSERT INTO bank_transactions
         (bank_account_id, transaction_date, description, amount, match_status, coa_account_id, tax_claimable)
       VALUES (?, '2026-04-05', 'ENERGIR DEBIT', -318.50, 'manual', ?, 1)`
    ).run(bankAccountId, coaExpense);

    // CTI still comes from bill only — tax_claimable on bank_transactions is a suspense flag, not a CTI source
    const { tpsCti, tvqRti } = computeCtiFromDb(db, '2026-04-01', '2026-04-30');
    expect(tpsCti).toBeCloseTo(14.50, 4);
    expect(tvqRti).toBeCloseTo(28.89, 4);
  });
});
