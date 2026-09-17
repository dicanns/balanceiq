/**
 * TAX-020  a bill recorded in the Bills screen reaches the GST/QST return
 * TAX-021  a reversed bill claims nothing
 * TAX-022  a bill paid from a statement line is claimed once, not twice
 * TAX-023  the period boundary is respected
 *
 * The return built its input tax credits from the monthly P&L bills in kv_store
 * and from categorized bank lines, and never read the supplier_bills table. A
 * bill recorded in the Bills screen posted its tax to the ledger and the filing
 * figure ignored it. The ledger is now the source for those bills.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  taxPeriodCompute, supplierBillPost, supplierBillUnpost, supplierBillPayByBankTransaction,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'], ['1400', 'GST receivable', 'asset'], ['1410', 'QST receivable', 'asset'],
    ['2010', 'AP', 'liability'], ['2100', 'GST payable', 'liability'], ['2110', 'QST payable', 'liability'],
    ['6100', 'Rent', 'expense'],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,100)`)
      .run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
function addBill({ amount = 114.98, date = '2026-08-04' } = {}) {
  return db.prepare(
    `INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid)
     VALUES (?, 'Acme Packaging', ?, ?, 5.00, 9.98, ?, 0)`
  ).run(date.slice(0, 7), amount, date, acc('6100').id).lastInsertRowid;
}
const Q3 = ['2026-07-01', '2026-09-30'];

describe('TAX-020 a supplier bill reaches the return', () => {
  it('claims the tax the bill posted', () => {
    supplierBillPost(addBill(), db);
    const r = taxPeriodCompute(...Q3, db);
    expect(r.tpsCtiFromSupplierBills).toBeCloseTo(5.00, 2);
    expect(r.tvqRtiFromSupplierBills).toBeCloseTo(9.98, 2);
    expect(r.tpsCti).toBeCloseTo(5.00, 2);
    expect(r.tvqRti).toBeCloseTo(9.98, 2);
    expect(r.supplierBillCount).toBe(1);
    expect(r.billCount).toBe(1);
  });
});

describe('TAX-021 a reversed bill claims nothing', () => {
  it('nets to zero once the bill is unposted', () => {
    const id = addBill();
    supplierBillPost(id, db);
    supplierBillUnpost(id, 'corrected', db);
    const r = taxPeriodCompute(...Q3, db);
    expect(r.tpsCtiFromSupplierBills).toBeCloseTo(0, 2);
    expect(r.supplierBillCount).toBe(0);
  });
});

describe('TAX-022 paid from a statement line, claimed once', () => {
  it('the linked line adds nothing on top of the bill', () => {
    const id = addBill();
    supplierBillPost(id, db);
    const accountId = db.prepare(
      `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Chequing','bank',?,0,'2026-01-01')`
    ).run(acc('1010').id).lastInsertRowid;
    const txId = db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, tps_paid, tvq_paid)
       VALUES (?, '2026-08-20', 'ACME', -114.98, 5.00, 9.98)`
    ).run(accountId).lastInsertRowid;
    // Tax typed on the line by mistake is dropped once it becomes the bill's payment.
    supplierBillPayByBankTransaction(txId, id, db);
    const r = taxPeriodCompute(...Q3, db);
    expect(r.tpsCtiFromBank).toBeCloseTo(0, 2);
    expect(r.tpsCti).toBeCloseTo(5.00, 2);
    expect(r.tvqRti).toBeCloseTo(9.98, 2);
  });
});

describe('TAX-023 the period boundary', () => {
  it('a bill dated outside the period is not claimed in it', () => {
    supplierBillPost(addBill({ date: '2026-06-30' }), db);
    supplierBillPost(addBill({ date: '2026-07-01' }), db);
    const r = taxPeriodCompute(...Q3, db);
    expect(r.supplierBillCount).toBe(1);
    expect(r.tpsCtiFromSupplierBills).toBeCloseTo(5.00, 2);
  });
});
