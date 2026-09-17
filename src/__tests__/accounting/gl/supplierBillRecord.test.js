/**
 * APREC-001  recording a bill is one act: row and ledger entry, or neither
 * APREC-002  a bill dated in a closed period is refused before anything is written
 * APREC-003  a correction reverses and reposts only when money fields change
 * APREC-004  a bill settled by a statement line keeps its money fields
 * APREC-005  deleting a bill from a closed period is refused and the bill stays
 *
 * supplier:bill:create inserted the row, then posting threw on a closed period:
 * the IPC call rejected, and a bill sat in the list with no entry behind it.
 * Update had the same shape. Editing a bill already paid by a statement line
 * changed the amount under the link with no guard.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  supplierBillRecord, supplierBillCorrect, supplierBillDelete, supplierBillPayByBankTransaction,
  glFindEntryBySource,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'], ['1400', 'GST receivable', 'asset'], ['1410', 'QST receivable', 'asset'],
    ['2010', 'AP', 'liability'], ['6100', 'Rent', 'expense'], ['6200', 'Supplies', 'expense'],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,100)`)
      .run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
const data = (over = {}) => ({
  month_key: '2026-08', supplier_name: 'Acme Packaging', amount: 114.98, bill_date: '2026-08-04',
  tps_paid: 5.00, tvq_paid: 9.98, coa_account_id: acc('6100').id, note: '', ...over,
});
const entries = () => db.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).get().n;
const closeMonth = (start, end) => {
  db.prepare(`INSERT OR IGNORE INTO accounting_periods (period_type, fiscal_year, start_date, end_date, status) VALUES ('month', ?, ?, ?, 'open')`)
    .run(start.slice(0, 4), start, end);
  db.prepare(`UPDATE accounting_periods SET status='closed' WHERE start_date=? AND end_date=?`).run(start, end);
};

describe('APREC-001 recording is one act', () => {
  it('leaves a row with a posted entry behind it', () => {
    const r = supplierBillRecord(data(), db);
    expect(r.ok).toBe(true);
    expect(glFindEntryBySource('supplier_bill', String(r.id), db)?.status).toBe('posted');
  });
});

describe('APREC-002 a closed period is refused up front', () => {
  it('writes nothing at all', () => {
    closeMonth('2026-08-01', '2026-08-31');
    const r = supplierBillRecord(data(), db);
    expect(r).toMatchObject({ ok: false, error: 'period_closed' });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM supplier_bills`).get().n).toBe(0);
    expect(entries()).toBe(0);
  });
});

describe('APREC-003 corrections', () => {
  it('a note-only edit leaves the ledger alone; an amount change reverses and reposts', () => {
    const { id } = supplierBillRecord(data(), db);
    const before = entries();
    expect(supplierBillCorrect(id, { note: 'PO 4471' }, db).ok).toBe(true);
    expect(entries()).toBe(before);

    expect(supplierBillCorrect(id, { amount: 229.96, tps_paid: 10.00, tvq_paid: 19.95 }, db).ok).toBe(true);
    expect(entries()).toBe(before + 2);   // one reversal, one new posting
    const live = glFindEntryBySource('supplier_bill', String(id), db);
    expect(live?.status).toBe('posted');
    const ap = db.prepare(
      `SELECT COALESCE(SUM(jl.credit_cents - jl.debit_cents),0) AS c FROM journal_lines jl
       JOIN journal_entries je ON je.id=jl.entry_id AND je.status IN ('posted','reversed')
       WHERE jl.account_id=?`
    ).get(acc('2010').id).c;
    expect(ap).toBe(22996);
  });
});

describe('APREC-004 a settled bill keeps its money fields', () => {
  it('refuses an amount change, still allows a note', () => {
    const { id } = supplierBillRecord(data(), db);
    const accountId = db.prepare(
      `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Chequing','bank',?,0,'2026-01-01')`
    ).run(acc('1010').id).lastInsertRowid;
    const txId = db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount) VALUES (?, '2026-09-03', 'ACME', -114.98)`
    ).run(accountId).lastInsertRowid;
    supplierBillPayByBankTransaction(txId, id, db);

    expect(supplierBillCorrect(id, { amount: 200 }, db)).toMatchObject({ ok: false, error: 'bill_linked' });
    expect(db.prepare(`SELECT amount FROM supplier_bills WHERE id=?`).get(id).amount).toBeCloseTo(114.98, 2);
    expect(supplierBillCorrect(id, { note: 'paid by Visa' }, db).ok).toBe(true);
  });
});

describe('APREC-005 delete from a closed period', () => {
  it('is refused, and the bill and its entry stay', () => {
    const { id } = supplierBillRecord(data(), db);
    closeMonth('2026-08-01', '2026-08-31');
    const r = supplierBillDelete(id, db);
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/PERIOD_CLOSED/);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM supplier_bills WHERE id=?`).get(id).n).toBe(1);
    expect(glFindEntryBySource('supplier_bill', String(id), db)?.status).toBe('posted');
  });
});
