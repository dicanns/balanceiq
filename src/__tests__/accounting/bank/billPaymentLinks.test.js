/**
 * K9-001  a statement line already matched to something else cannot also pay a bill
 * K9-002  a line matched to a supplier bill cannot be linked to a cheque
 * K10-001 deleting or un-paying a bill paid from a line releases the line
 * K10-002 a bill paid by cheque cannot be un-paid or deleted while the cheque stands
 * C1-001  register tax is backed out of tax-included money, or read from the POS figures
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  supplierBillRecord, supplierBillPayByBankTransaction, supplierBillDelete, supplierBillMarkUnpaid,
  chequeRecord, chequeLink, chequeVoid, taxPeriodCompute,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'], ['1100', 'AR', 'asset'], ['1400', 'GST receivable', 'asset'], ['1410', 'QST receivable', 'asset'],
    ['2010', 'AP', 'liability'], ['6100', 'Rent', 'expense'],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,100)`).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
const line = (id) => db.prepare(`SELECT * FROM bank_transactions WHERE id=?`).get(id);
const bill = (id) => db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(id);
function addBank() {
  return db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Chequing','bank',?,0,'2026-01-01')`)
    .run(acc('1010').id).lastInsertRowid;
}
function addTx(bank, amount) {
  return db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount) VALUES (?,?,?,?)`)
    .run(bank, '2026-10-20', 'Payment', amount).lastInsertRowid;
}
function addBill(amount = 100) {
  return supplierBillRecord({ month_key: '2026-10', supplier_name: 'Supplier', amount, bill_date: '2026-10-15',
    tps_paid: 0, tvq_paid: 0, coa_account_id: acc('6100').id }, db).id;
}
const liveEntries = (txId) => db.prepare(
  `SELECT COUNT(*) AS n FROM journal_entries WHERE source_id=? AND source_type='bank_tx' AND status='posted' AND reversed_by_entry_id IS NULL`
).get(String(txId)).n;

describe('K9 a line is matched once', () => {
  it('refuses a line already matched to a cheque', () => {
    const bank = addBank();
    const b = addBill(100);
    const ch = chequeRecord({ direction: 'issued', chequeNumber: '5', chequeDate: '2026-10-18', amountCents: 10000,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id }, db);
    const tx = addTx(bank, -100);
    expect(chequeLink(tx, [ch.id], db).ok).toBe(true);
    expect(supplierBillPayByBankTransaction(tx, [b], db)).toEqual({ ok: false, error: 'already_matched' });
    expect(bill(b).paid).toBe(0);
    expect(line(tx).matched_entity_type).toBe('cheque');
  });

  it('refuses a line already paying another bill', () => {
    const bank = addBank();
    const b1 = addBill(100), b2 = addBill(100);
    const tx = addTx(bank, -100);
    expect(supplierBillPayByBankTransaction(tx, [b1], db).ok).toBe(true);
    expect(supplierBillPayByBankTransaction(tx, [b2], db)).toEqual({ ok: false, error: 'already_matched' });
    expect(bill(b2).paid).toBe(0);
  });

  it('mirror: a cheque cannot be linked to a line that paid a bill', () => {
    const bank = addBank();
    const b = addBill(100);
    const tx = addTx(bank, -100);
    expect(supplierBillPayByBankTransaction(tx, [b], db).ok).toBe(true);
    const ch = chequeRecord({ direction: 'issued', chequeNumber: '6', chequeDate: '2026-10-18', amountCents: 10000,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id }, db);
    expect(chequeLink(tx, [ch.id], db)).toEqual({ ok: false, error: 'already_matched' });
  });

  it('still pays an unmatched line', () => {
    const bank = addBank();
    const b = addBill(100);
    const tx = addTx(bank, -100);
    expect(supplierBillPayByBankTransaction(tx, [b], db).ok).toBe(true);
    expect(bill(b).bank_transaction_id).toBe(tx);
  });
});

describe('K10 releasing the payment', () => {
  it('deleting a bill paid from a line puts the line back to unmatched', () => {
    const bank = addBank();
    const b = addBill(100);
    const tx = addTx(bank, -100);
    supplierBillPayByBankTransaction(tx, [b], db);
    expect(liveEntries(tx)).toBe(1);
    expect(supplierBillDelete(b, db).ok).toBe(true);
    const l = line(tx);
    expect(l.match_status).toBe('unmatched');
    expect(l.matched_entity_type).toBeNull();
    expect(l.matched_entity_id).toBeNull();
    expect(liveEntries(tx)).toBe(0);
  });

  it('marking unpaid releases the line and its entry', () => {
    const bank = addBank();
    const b = addBill(100);
    const tx = addTx(bank, -100);
    supplierBillPayByBankTransaction(tx, [b], db);
    const r = supplierBillMarkUnpaid(b, db);
    expect(r.paid).toBe(0);
    expect(r.bank_transaction_id).toBeNull();
    expect(line(tx).matched_entity_type).toBeNull();
    expect(liveEntries(tx)).toBe(0);
  });

  it('refuses when the line also paid other bills', () => {
    const bank = addBank();
    const b1 = addBill(100), b2 = addBill(50);
    const tx = addTx(bank, -150);
    expect(supplierBillPayByBankTransaction(tx, [b1, b2], db).ok).toBe(true);
    expect(supplierBillDelete(b1, db).error).toBe('shared_payment');
    expect(supplierBillMarkUnpaid(b1, db).error).toBe('shared_payment');
    expect(bill(b1)).toBeTruthy();
    expect(line(tx).matched_entity_type).toBe('supplier_bill');
  });

  it('refuses to un-pay or delete a bill paid by an outstanding cheque; fine once voided', () => {
    const bank = addBank();
    const b = addBill(100);
    const ch = chequeRecord({ direction: 'issued', chequeNumber: '9', chequeDate: '2026-10-18', amountCents: 10000,
      bankAccountId: bank, kind: 'supplier_bills', billIds: [b] }, db);
    expect(ch.ok).toBe(true);
    expect(supplierBillMarkUnpaid(b, db)).toMatchObject({ ok: false, error: 'paid_by_cheque', chequeId: ch.id });
    expect(supplierBillDelete(b, db)).toMatchObject({ ok: false, error: 'paid_by_cheque' });
    expect(bill(b).paid).toBe(1);
    expect(chequeVoid(ch.id, 'test', db).ok).toBe(true);
    expect(supplierBillDelete(b, db).ok).toBe(true);
  });
});

describe('C1 register tax is not receipts times the rate', () => {
  const day = (cashes) => db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('dicann-v7', ?)`)
    .run(JSON.stringify({ '2026-10-05': { cashes } }));

  it('backs the tax out of tax-included money when there are no POS figures', () => {
    // 1,149.75 received for 1,000 of sales.
    day([{ interac: 1000, finalCash: 149.75, float: 0 }]);
    const r = taxPeriodCompute('2026-10-01', '2026-10-31', db);
    expect(r.tpsCollected).toBeCloseTo(50, 2);
    expect(r.tvqCollected).toBeCloseTo(99.75, 2);
    expect(r.plRevenue).toBeCloseTo(1000, 2);
  });

  it('uses the POS figures typed into the close when present, even with no cash count', () => {
    day([{ posVentes: 1000, posTPS: 50, posTVQ: 99.75 }]);
    const r = taxPeriodCompute('2026-10-01', '2026-10-31', db);
    expect(r.tpsCollected).toBeCloseTo(50, 2);
    expect(r.tvqCollected).toBeCloseTo(99.75, 2);
    expect(r.plRevenue).toBeCloseTo(1000, 2);
  });
});
