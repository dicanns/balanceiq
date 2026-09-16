/**
 * APLINK-001  the expense is booked once: by the bill, never by the statement line
 * APLINK-002  bill and statement line each name the other, as proof of payment
 * APLINK-003  a line that cannot be the payment is refused
 * APLINK-004  unlinking puts the bill back to unpaid and reverses the payment
 * APLINK-005  a card pays a bill the same way a bank account does
 * APLINK-006  the statement line that could be a bill's payment is found
 * APLINK-007  the statement came first: attaching moves the expense to the bill
 *
 * A bill recorded in the Bills screen raises accounts payable. The statement line
 * that pays it must only settle that payable - Dr 2010 / Cr the bank or card
 * account. Categorizing the same line to an expense account instead would book
 * the expense a second time, which is the mistake this link exists to prevent.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  supplierBillPost, supplierBillPayByBankTransaction, bankTransactionUnmatch,
  bankLinesForBillAmount, glDraftEntry, glPostEntry,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'],
    ['2010', 'AP', 'liability'],
    ['2100', 'GST paid', 'liability'],
    ['2110', 'QST paid', 'liability'],
    ['2210', 'Credit card', 'liability'],
    ['6100', 'Rent', 'expense'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct)
       VALUES (?,?,?,?,100)`
    ).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
    AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc(num).id).bal;

function addAccount({ name = 'Chequing', type = 'bank', coa = '1010' } = {}) {
  return db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
     VALUES (?,?,?,0,'2026-01-01')`
  ).run(name, type, acc(coa).id).lastInsertRowid;
}

function addTx({ accountId, amount = -114.98, date = '2026-09-03', description = 'ACME PACKAGING' }) {
  return db.prepare(
    `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount)
     VALUES (?,?,?,?)`
  ).run(accountId, date, description, amount).lastInsertRowid;
}

// Total 114.98 = 100.00 expense + 5.00 GST + 9.98 QST.
function addBill({ amount = 114.98, account = '6100', date = '2026-08-28' } = {}) {
  return db.prepare(
    `INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid)
     VALUES ('2026-08','Acme Packaging',?,?,5.00,9.98,?,0)`
  ).run(amount, date, acc(account).id).lastInsertRowid;
}

describe('APLINK-001 the expense is booked once', () => {
  it('the bill books the expense and the statement line only settles the payable', () => {
    const billId = addBill();
    supplierBillPost(billId, db);
    expect(balanceOf('6100')).toBe(10000);
    expect(balanceOf('2010')).toBe(-11498);

    const txId = addTx({ accountId: addAccount() });
    expect(supplierBillPayByBankTransaction(txId, billId, db)).toMatchObject({ ok: true });

    // The expense did not move, the payable is settled, the cash went out once.
    expect(balanceOf('6100')).toBe(10000);
    expect(balanceOf('2010')).toBe(0);
    expect(balanceOf('1010')).toBe(-11498);
    // Tax was claimed on the bill, not on the payment.
    expect(balanceOf('2100')).toBe(500);
    expect(balanceOf('2110')).toBe(998);
  });
});

describe('APLINK-002 each side names the other', () => {
  it('records the link and the payment date from the statement', () => {
    const billId = addBill();
    supplierBillPost(billId, db);
    const txId = addTx({ accountId: addAccount(), date: '2026-09-03' });
    supplierBillPayByBankTransaction(txId, billId, db);

    const bill = db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(billId);
    expect(bill).toMatchObject({ paid: 1, payment_date: '2026-09-03', bank_transaction_id: txId });

    const tx = db.prepare(`SELECT * FROM bank_transactions WHERE id=?`).get(txId);
    expect(tx).toMatchObject({ match_status: 'matched', matched_entity_type: 'supplier_bill', matched_entity_id: billId });
    expect(tx.coa_account_id).toBe(acc('2010').id);
  });
});

describe('APLINK-003 a line that cannot be the payment is refused', () => {
  it('refuses money in, a different amount, and a bill already paid', () => {
    const accountId = addAccount();
    const billId = addBill();
    supplierBillPost(billId, db);

    const inflow = addTx({ accountId, amount: 114.98 });
    expect(supplierBillPayByBankTransaction(inflow, billId, db)).toMatchObject({ ok: false, error: 'not_money_out' });

    const wrongAmount = addTx({ accountId, amount: -99.00 });
    expect(supplierBillPayByBankTransaction(wrongAmount, billId, db)).toMatchObject({ ok: false, error: 'amount_mismatch' });

    const right = addTx({ accountId });
    supplierBillPayByBankTransaction(right, billId, db);
    const again = addTx({ accountId });
    expect(supplierBillPayByBankTransaction(again, billId, db)).toMatchObject({ ok: false, error: 'bill_already_paid' });

    expect(supplierBillPayByBankTransaction(right, 999999, db)).toMatchObject({ ok: false, error: 'bill_not_found' });
    expect(supplierBillPayByBankTransaction(999999, billId, db)).toMatchObject({ ok: false, error: 'transaction_not_found' });
  });
});

describe('APLINK-004 unlinking undoes the payment', () => {
  it('puts the bill back to unpaid and leaves the payable owing again', () => {
    const billId = addBill();
    supplierBillPost(billId, db);
    const txId = addTx({ accountId: addAccount() });
    supplierBillPayByBankTransaction(txId, billId, db);

    bankTransactionUnmatch(txId, db);

    const bill = db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(billId);
    expect(bill.paid).toBe(0);
    expect(bill.payment_date).toBeNull();
    expect(bill.bank_transaction_id).toBeNull();
    // Still owed, and the cash is back: the payment was reversed, not erased.
    expect(balanceOf('2010')).toBe(-11498);
    expect(balanceOf('1010')).toBe(0);
    expect(balanceOf('6100')).toBe(10000);
  });
});

describe('APLINK-005 a card pays a bill the same way', () => {
  it('credits the card account instead of the bank account', () => {
    const billId = addBill();
    supplierBillPost(billId, db);
    const cardId = addAccount({ name: 'Visa', type: 'credit_card', coa: '2210' });
    const txId = addTx({ accountId: cardId });

    expect(supplierBillPayByBankTransaction(txId, billId, db)).toMatchObject({ ok: true });
    expect(balanceOf('2010')).toBe(0);
    expect(balanceOf('2210')).toBe(-11498);
    expect(balanceOf('1010')).toBe(0);
  });
});

describe('APLINK-006 finding the line that could be the payment', () => {
  it('offers same-amount money out, and nothing else', () => {
    const accountId = addAccount();
    const wanted = addTx({ accountId, amount: -114.98 });
    addTx({ accountId, amount: 114.98 });           // money in
    addTx({ accountId, amount: -99.00 });           // another amount
    const taken = addTx({ accountId, amount: -114.98 });
    db.prepare(`UPDATE bank_transactions SET matched_entity_type='supplier_bill', matched_entity_id=1 WHERE id=?`).run(taken);

    const found = bankLinesForBillAmount(114.98, db).map(r => r.id);
    expect(found).toEqual([wanted]);
    expect(bankLinesForBillAmount(0, db)).toEqual([]);
  });
});

describe('APLINK-007 the statement came first', () => {
  it('attaching a categorized line moves the expense to the bill, counted once', () => {
    // The card statement was imported and categorized to Food weeks ago.
    const cardId = addAccount({ name: 'Visa', type: 'credit_card', coa: '2210' });
    const txId = addTx({ accountId: cardId });
    const { entryId } = glDraftEntry({
      entry_date: '2026-09-03',
      description: 'OSOLE MIO',
      source_type: 'bank_tx',
      source_id: String(txId),
      lines: [
        { account_id: acc('6100').id, debit_cents: 11498, credit_cents: 0, memo: 'OSOLE MIO' },
        { account_id: acc('2210').id, debit_cents: 0, credit_cents: 11498, memo: 'OSOLE MIO' },
      ],
    }, db);
    glPostEntry(entryId, db);
    db.prepare(`UPDATE bank_transactions SET match_status='manual', coa_account_id=?, journal_entry_id=? WHERE id=?`)
      .run(acc('6100').id, entryId, txId);
    expect(balanceOf('6100')).toBe(11498);   // the whole amount, tax and all

    // The bill turns up later and is recorded, then the line is attached to it.
    const billId = addBill();
    supplierBillPost(billId, db);
    expect(supplierBillPayByBankTransaction(txId, billId, db)).toMatchObject({ ok: true });

    // The line's expense entry was reversed: the bill is now the only place the
    // expense lives, net of the tax it claims.
    expect(balanceOf('6100')).toBe(10000);
    expect(balanceOf('2100')).toBe(500);
    expect(balanceOf('2110')).toBe(998);
    expect(balanceOf('2010')).toBe(0);
    expect(balanceOf('2210')).toBe(-11498);
    const bill = db.prepare(`SELECT * FROM supplier_bills WHERE id=?`).get(billId);
    expect(bill).toMatchObject({ paid: 1, bank_transaction_id: txId });
  });
});
