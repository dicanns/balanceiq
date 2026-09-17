/**
 * APSETTLE-001  a bill marked paid by hand settles against the account chosen
 * APSETTLE-002  with no account it falls back to cash, and says which was used
 * APSETTLE-003  undoing a hand payment reverses it; one from a statement line is refused
 * APSETTLE-004  the two migration lists carry the same versions
 *
 * "Mark paid" posted every payment against 1010 whatever the bill was really
 * paid with, so a card-paid bill understated the card and overstated cash. The
 * undo swallowed a failed reversal and left the bill unpaid with its payment
 * still posted.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  supplierBillRecord, supplierBillSettle, supplierBillUnsettle, supplierBillPayByBankTransaction,
  supplierBillList, glFindEntryBySource,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'], ['1400', 'GST receivable', 'asset'], ['1410', 'QST receivable', 'asset'],
    ['2010', 'AP', 'liability'], ['2210', 'Credit card', 'liability'], ['6100', 'Rent', 'expense'],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,100)`)
      .run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`).get(acc(num).id).bal;
const addAccount = (name, type, coa) => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES (?,?,?,0,'2026-01-01')`
).run(name, type, acc(coa).id).lastInsertRowid;
const record = () => supplierBillRecord({
  month_key: '2026-08', supplier_name: 'Acme Packaging', amount: 114.98, bill_date: '2026-08-04',
  tps_paid: 5.00, tvq_paid: 9.98, coa_account_id: acc('6100').id,
}, db).id;

describe('APSETTLE-001 settles against the chosen account', () => {
  it('a card payment credits the card, not cash', () => {
    const id = record();
    const visa = addAccount('Visa', 'credit_card', '2210');
    const r = supplierBillSettle(id, { payment_date: '2026-09-03', bank_account_id: visa }, db);
    expect(r).toMatchObject({ ok: true, paid: 1, payment_method: 'card', paid_from_bank_account_id: visa });
    expect(balanceOf('2010')).toBe(0);
    expect(balanceOf('2210')).toBe(-11498);
    expect(balanceOf('1010')).toBe(0);
    expect(supplierBillList({ paid: 1 }, db)[0]).toMatchObject({ paid_account_name: 'Visa', paid_account_type: 'credit_card' });
  });
});

describe('APSETTLE-002 no account set up', () => {
  it('falls back to cash and records the method', () => {
    const id = record();
    expect(supplierBillSettle(id, { payment_date: '2026-09-03' }, db)).toMatchObject({ ok: true, payment_method: 'manual' });
    expect(balanceOf('1010')).toBe(-11498);
    expect(supplierBillSettle(id, {}, db)).toMatchObject({ ok: false, error: 'bill_already_paid' });
  });
});

describe('APSETTLE-003 undoing', () => {
  it('reverses a hand payment as one act, and refuses one from a statement line', () => {
    const id = record();
    const chq = addAccount('Chequing', 'bank', '1010');
    supplierBillSettle(id, { payment_date: '2026-09-03', bank_account_id: chq }, db);
    expect(supplierBillUnsettle(id, db)).toMatchObject({ ok: true, paid: 0, paid_from_bank_account_id: null });
    expect(balanceOf('1010')).toBe(0);
    expect(balanceOf('2010')).toBe(-11498);
    expect(glFindEntryBySource('supplier_bill_payment', String(id), db)).toBeFalsy();

    const txId = db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount) VALUES (?, '2026-09-05', 'ACME', -114.98)`
    ).run(chq).lastInsertRowid;
    supplierBillPayByBankTransaction(txId, id, db);
    expect(supplierBillUnsettle(id, db)).toMatchObject({ ok: false, error: 'bill_linked' });
  });
});

describe('APSETTLE-004 the two migration lists agree', () => {
  it('database.js and migrations.js carry the same versions', () => {
    const ROOT = path.resolve(__dirname, '../../../..');
    const versions = (f) => (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/^\s+version: (\d+),/gm) || [])
      .map(l => parseInt(l.replace(/\D/g, ''), 10));
    // Declaration order differs between the two files; runMigrations sorts by
    // version, so the set is what matters.
    const a = versions('src/db/database.js').sort((x, y) => x - y);
    const b = versions('src/db/migrations.js').sort((x, y) => x - y);
    expect(a.length).toBeGreaterThan(40);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});
