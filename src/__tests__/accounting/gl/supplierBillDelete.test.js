/**
 * APDEL-001  a bill entered by mistake can be removed
 * APDEL-002  a posted bill is reversed, not quietly dropped
 * APDEL-003  payment rows never outlive the bill they belong to
 * APDEL-004  deleting a bill that is not there says so
 *
 * A bill recorded against the wrong company had no way out: the Bills screen
 * offered edit and mark paid / unpaid, and no delete existed anywhere - not in
 * the UI, not over IPC, not in the database layer. Undoing the payment left the
 * bill itself in place and owing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  supplierBillPost, supplierBillPostPayment, supplierBillDelete, supplierBillSubledger,
  glFindEntryBySource,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  const cols = db.prepare(`PRAGMA table_info(chart_of_accounts)`).all().map(c => c.name);
  if (!cols.includes('itc_pct')) {
    db.prepare(`ALTER TABLE chart_of_accounts ADD COLUMN itc_pct INTEGER DEFAULT 100`).run();
  }
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'],
    ['2010', 'AP', 'liability'],
    ['1400', 'GST receivable', 'asset'],
    ['1410', 'QST receivable', 'asset'],
    ['6100', 'Rent', 'expense'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct)
       VALUES (?,?,?,?,100)`
    ).run(num, name, name, type);
  }
  db.prepare(`CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_bill_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT,
    reference TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
    AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc(num).id).bal;

function addBill({ amount = 114.98, account = '6100', date = '2026-08-04', paid = 0 } = {}) {
  return db.prepare(
    `INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid)
     VALUES ('2026-08','Acme Packaging',?,?,5.00,9.98,?,?)`
  ).run(amount, date, acc(account).id, paid).lastInsertRowid;
}

describe('APDEL-001 a bill entered by mistake can be removed', () => {
  it('leaves nothing behind and nothing owing', () => {
    const id = addBill();
    expect(supplierBillDelete(id, db)).toEqual({ ok: true, deleted: true });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM supplier_bills WHERE id=?`).get(id).n).toBe(0);
    expect(supplierBillSubledger('2026-12-31', db)).toBe(0);
  });
});

describe('APDEL-002 a posted bill is reversed, not quietly dropped', () => {
  it('reverses the bill and its payment, so the accounts come back to zero', () => {
    const id = addBill({ amount: 114.98, paid: 1 });
    supplierBillPost(id, db);
    supplierBillPostPayment(id, { paymentDate: '2026-09-02' }, db);
    expect(balanceOf('6100')).toBeGreaterThan(0);

    supplierBillDelete(id, db);

    expect(balanceOf('6100')).toBe(0);
    expect(balanceOf('2010')).toBe(0);
    expect(balanceOf('1010')).toBe(0);
    // The history stays: both entries are on file as reversed, not erased.
    const reversed = db.prepare(
      `SELECT COUNT(*) AS n FROM journal_entries WHERE status IN ('posted','reversed')`
    ).get().n;
    expect(reversed).toBeGreaterThanOrEqual(4);
    expect(glFindEntryBySource('supplier_bill', String(id), db)).toBeFalsy();
  });
});

describe('APDEL-003 payment rows never outlive the bill', () => {
  it('removes the payments recorded against it', () => {
    const id = addBill();
    db.prepare(
      `INSERT INTO supplier_payments (supplier_bill_id, amount, payment_date) VALUES (?, 50.00, '2026-08-20')`
    ).run(id);
    supplierBillDelete(id, db);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM supplier_payments WHERE supplier_bill_id=?`).get(id).n).toBe(0);
  });
});

describe('APDEL-004 deleting a bill that is not there', () => {
  it('says so instead of pretending it worked', () => {
    expect(supplierBillDelete(999999, db)).toEqual({ ok: false, error: 'bill_not_found' });
  });
});
