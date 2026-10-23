/**
 * BANKTAX-001  a refund of a purchase takes its tax off the claim
 * BANKTAX-002  tax left on a customer payment is not claimed
 * BANKTAX-003  categorizing drops tax a line cannot carry
 * BANKTAX-004  the return and the ledger agree on what was claimed
 *
 * A purchase on the card adds its GST/QST to the claim. A refund of a purchase
 * gives that tax back, so it comes off the claim. A customer's payment carries no
 * tax of its own: the tax was recorded when the invoice was raised. The return
 * once added every line's tax regardless, so a refund raised the claim instead of
 * lowering it, and tax typed on a customer payment (left in the form after the
 * account was changed) was claimed as a credit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { taxPeriodCompute, bankTransactionCategorize } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'],
    ['1100', 'AR', 'asset'],
    ['1400', 'GST receivable', 'asset'],
    ['1410', 'QST receivable', 'asset'],
    ['2100', 'GST payable', 'liability'],
    ['2110', 'QST payable', 'liability'],
    ['2210', 'Card', 'liability'],
    ['6530', 'Software', 'expense'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct)
       VALUES (?,?,?,?,100)`
    ).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

function addAccount(name, type, coa) {
  return db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
     VALUES (?,?,?,0,'2026-01-01')`
  ).run(name, type, acc(coa).id).lastInsertRowid;
}
function addTx(accountId, amount, date, description) {
  return db.prepare(
    `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount)
     VALUES (?,?,?,?)`
  ).run(accountId, date, description, amount).lastInsertRowid;
}
const ledgerClaim = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents - jl.credit_cents), 0) AS c
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc(num).id).c;

describe('BANKTAX-001 a refund takes its tax off the claim', () => {
  it('purchase then prorated refund leaves only the net claim', () => {
    const card = addAccount('Amex', 'credit_card', '2210');
    // $229.95 = $200 + $10 GST + $19.95 QST; refunded $114.98 = $100 + $5 + $9.98.
    const buy = addTx(card, -229.95, '2026-08-05', 'BACKUP SOFTWARE');
    const back = addTx(card, 114.98, '2026-09-10', 'BACKUP SOFTWARE REFUND');
    bankTransactionCategorize(buy, acc('6530').id, null, { tpsPaid: 10, tvqPaid: 19.95 }, db);
    bankTransactionCategorize(back, acc('6530').id, null, { tpsPaid: 5, tvqPaid: 9.98 }, db);
    const r = taxPeriodCompute('2026-07-01', '2026-09-30', db);
    expect(r.tpsCtiFromBank).toBeCloseTo(5, 6);
    expect(r.tvqCtiFromBank).toBeCloseTo(9.97, 6);
  });
});

describe('BANKTAX-002 tax on a customer payment is not claimed', () => {
  it('a line already holding tax on a payment to receivables adds nothing', () => {
    const bank = addAccount('Chequing', 'bank', '1010');
    const pay = addTx(bank, 9984.41, '2026-08-04', 'CUSTOMER PAYMENT');
    // As older data holds it: categorized to receivables with tax still on it.
    db.prepare(`UPDATE bank_transactions SET coa_account_id=?, match_status='manual', tps_paid=434.20, tvq_paid=866.23 WHERE id=?`)
      .run(acc('1100').id, pay);
    const r = taxPeriodCompute('2026-07-01', '2026-09-30', db);
    expect(r.tpsCtiFromBank).toBe(0);
    expect(r.tvqCtiFromBank).toBe(0);
  });
});

describe('BANKTAX-003 categorizing drops tax a line cannot carry', () => {
  it('money in to a non-expense account keeps no tax', () => {
    const bank = addAccount('Chequing', 'bank', '1010');
    const pay = addTx(bank, 9984.41, '2026-08-04', 'CUSTOMER PAYMENT');
    bankTransactionCategorize(pay, acc('1100').id, null, { tpsPaid: 434.20, tvqPaid: 866.23 }, db);
    const row = db.prepare(`SELECT tps_paid, tvq_paid FROM bank_transactions WHERE id=?`).get(pay);
    expect(row.tps_paid).toBeNull();
    expect(row.tvq_paid).toBeNull();
  });

  it('a purchase and a refund keep theirs', () => {
    const card = addAccount('Amex', 'credit_card', '2210');
    const buy = addTx(card, -114.98, '2026-08-05', 'SOFTWARE');
    const back = addTx(card, 114.98, '2026-08-20', 'SOFTWARE REFUND');
    bankTransactionCategorize(buy, acc('6530').id, null, { tpsPaid: 5, tvqPaid: 9.98 }, db);
    bankTransactionCategorize(back, acc('6530').id, null, { tpsPaid: 5, tvqPaid: 9.98 }, db);
    for (const id of [buy, back]) {
      expect(db.prepare(`SELECT tps_paid FROM bank_transactions WHERE id=?`).get(id).tps_paid).toBe(5);
    }
  });
});

describe('BANKTAX-004 the return and the ledger agree', () => {
  it('after a purchase, a refund and a payment, both show the same claim', () => {
    const card = addAccount('Amex', 'credit_card', '2210');
    const bank = addAccount('Chequing', 'bank', '1010');
    bankTransactionCategorize(addTx(card, -229.95, '2026-08-05', 'SOFTWARE'), acc('6530').id, null, { tpsPaid: 10, tvqPaid: 19.95 }, db);
    bankTransactionCategorize(addTx(card, 114.98, '2026-09-10', 'REFUND'), acc('6530').id, null, { tpsPaid: 5, tvqPaid: 9.98 }, db);
    bankTransactionCategorize(addTx(bank, 500, '2026-09-12', 'CUSTOMER'), acc('1100').id, null, { tpsPaid: 20, tvqPaid: 40 }, db);
    const r = taxPeriodCompute('2026-07-01', '2026-09-30', db);
    expect(Math.round(r.tpsCtiFromBank * 100)).toBe(ledgerClaim('1400'));
    expect(Math.round(r.tvqCtiFromBank * 100)).toBe(ledgerClaim('1410'));
  });
});
