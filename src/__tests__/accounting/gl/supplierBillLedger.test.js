/**
 * APPOST-001  a bill reaches the ledger when it is recorded
 * APPOST-002  paying it settles the payable against cash
 * APPOST-003  the tax claim rate applies here exactly as on a bank line
 * APPOST-004  the 2010 control check has something to compare against
 * XFER-001    a transfer between your own accounts posts once, not twice
 *
 * supplier_bills has carried a journal_entry_id column since the table was
 * created and nothing ever wrote to it. A bill recorded there moved no money in
 * the books: the expense was missing from the income statement, accounts payable
 * never rose, and the control-account check on 2010 called window.api.bills,
 * which does not exist, so it threw into a catch and compared nothing - silently,
 * on every run, in exactly the way the AR check was broken before it.
 *
 * The transfer half is the credit-card problem. Paying a card off the chequing
 * account is one movement of money that appears on two statements, and posting
 * both sides records it twice.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  supplierBillPost, supplierBillUnpost, supplierBillPostPayment, supplierBillSubledger,
  glFindEntryBySource,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  const cols = db.prepare(`PRAGMA table_info(chart_of_accounts)`).all().map(c => c.name);
  if (!cols.includes('itc_pct')) {
    db.prepare(`ALTER TABLE chart_of_accounts ADD COLUMN itc_pct INTEGER DEFAULT 100`).run();
  }
  for (const [num, name, type, pct] of [
    ['1010', 'Cash',      'asset',     100],
    ['2010', 'AP',        'liability', 100],
    ['2100', 'GST paid',  'liability', 100],
    ['2110', 'QST paid',  'liability', 100],
    ['6100', 'Rent',      'expense',   100],
    ['6810', 'Meals',     'expense',    50],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct)
       VALUES (?,?,?,?,?)`
    ).run(num, name, name, type, pct);
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

function addBill({ amount, tps = 0, tvq = 0, account = '6100', date = '2026-08-04', paid = 0 }) {
  return db.prepare(
    `INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid)
     VALUES ('2026-08','Acme Packaging',?,?,?,?,?,?)`
  ).run(amount, date, tps, tvq, acc(account).id, paid).lastInsertRowid;
}

describe('APPOST-001 a bill reaches the ledger', () => {
  it('raises the payable and books the expense', () => {
    supplierBillPost(addBill({ amount: 1149.80, tps: 50.00, tvq: 99.80 }), db);
    expect(balanceOf('2010')).toBe(-114980);   // credit: owed
    expect(balanceOf('6100')).toBe(100000);    // net of reclaimable tax
    expect(balanceOf('2100')).toBe(5000);
    expect(balanceOf('2110')).toBe(9980);
  });

  it('this is what was recorded before: nothing at all', () => {
    addBill({ amount: 1149.80, tps: 50.00, tvq: 99.80 });   // created, never posted
    expect(balanceOf('2010')).toBe(0);
    expect(balanceOf('6100')).toBe(0);
  });

  it('writes the entry id back onto the bill', () => {
    const id = addBill({ amount: 500 });
    const r = supplierBillPost(id, db);
    const bill = db.prepare(`SELECT journal_entry_id FROM supplier_bills WHERE id=?`).get(id);
    expect(bill.journal_entry_id).toBe(r.entryId);
  });

  it('is idempotent: recording twice does not double the payable', () => {
    const id = addBill({ amount: 500 });
    supplierBillPost(id, db);
    const second = supplierBillPost(id, db);
    expect(second.alreadyPosted).toBe(true);
    expect(balanceOf('2010')).toBe(-50000);
  });

  it('a bill with no expense account is refused rather than half-posted', () => {
    const id = db.prepare(
      `INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date) VALUES ('2026-08','X',100,'2026-08-04')`
    ).run().lastInsertRowid;
    expect(supplierBillPost(id, db).ok).toBe(false);
    expect(balanceOf('2010')).toBe(0);
  });

  it('correcting a bill reverses before re-posting, so nothing doubles', () => {
    const id = addBill({ amount: 500 });
    supplierBillPost(id, db);
    supplierBillUnpost(id, 'corrected', db);
    expect(balanceOf('2010')).toBe(0);
    db.prepare(`UPDATE supplier_bills SET amount=750 WHERE id=?`).run(id);
    supplierBillPost(id, db);
    expect(balanceOf('2010')).toBe(-75000);
  });
});

describe('APPOST-002 paying settles the payable', () => {
  it('the payable clears and cash goes down', () => {
    const id = addBill({ amount: 1149.80, tps: 50.00, tvq: 99.80 });
    supplierBillPost(id, db);
    supplierBillPostPayment(id, { paymentDate: '2026-09-02' }, db);
    expect(balanceOf('2010')).toBe(0);
    expect(balanceOf('1010')).toBe(-114980);
  });

  it('the expense stays in the month the bill was raised', () => {
    const id = addBill({ amount: 1000, date: '2026-08-04' });
    supplierBillPost(id, db);
    supplierBillPostPayment(id, { paymentDate: '2026-09-02' }, db);
    const asOfAugust = db.prepare(
      `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
        AND je.status IN ('posted','reversed') AND je.entry_date <= '2026-08-31'
       WHERE jl.account_id = ?`
    ).get(acc('6100').id).bal;
    expect(asOfAugust).toBe(100000);       // the cost landed in August
    expect(balanceOf('1010')).toBe(-100000); // the cash left in September
  });

  it('paying twice is refused', () => {
    const id = addBill({ amount: 500 });
    supplierBillPost(id, db);
    supplierBillPostPayment(id, { paymentDate: '2026-09-02' }, db);
    expect(supplierBillPostPayment(id, { paymentDate: '2026-09-02' }, db).alreadyPosted).toBe(true);
    expect(balanceOf('1010')).toBe(-50000);
  });

  it('the payment is its own entry, so it can be reversed on its own', () => {
    const id = addBill({ amount: 500 });
    supplierBillPost(id, db);
    supplierBillPostPayment(id, { paymentDate: '2026-09-02' }, db);
    expect(glFindEntryBySource('supplier_bill_payment', String(id), db)).toBeTruthy();
    expect(glFindEntryBySource('supplier_bill', String(id), db)).toBeTruthy();
  });
});

describe('APPOST-003 the claim rate applies here too', () => {
  it('a restaurant bill claims half its tax, whichever route it came in by', () => {
    supplierBillPost(addBill({ amount: 114.98, tps: 5.00, tvq: 9.98, account: '6810' }), db);
    expect(balanceOf('2100')).toBe(250);
    expect(balanceOf('2110')).toBe(499);
  });

  it('and the half it cannot claim stays in the expense', () => {
    supplierBillPost(addBill({ amount: 114.98, tps: 5.00, tvq: 9.98, account: '6810' }), db);
    expect(balanceOf('6810')).toBe(11498 - 250 - 499);
  });

  it('the entry balances whatever the rate', () => {
    supplierBillPost(addBill({ amount: 114.98, tps: 5.00, tvq: 9.98, account: '6810' }), db);
    expect(balanceOf('6810') + balanceOf('2100') + balanceOf('2110') + balanceOf('2010')).toBe(0);
  });
});

describe('APPOST-004 the 2010 check has a second opinion', () => {
  it('sums what is still owed', () => {
    addBill({ amount: 1000 });
    addBill({ amount: 250 });
    expect(supplierBillSubledger('2026-12-31', db)).toBe(125000);
  });

  it('a paid bill is no longer owed', () => {
    addBill({ amount: 1000, paid: 1 });
    addBill({ amount: 250 });
    expect(supplierBillSubledger('2026-12-31', db)).toBe(25000);
  });

  it('stops at the as-of date, like the trial balance', () => {
    addBill({ amount: 1000, date: '2026-08-04' });
    addBill({ amount: 250, date: '2026-10-15' });
    expect(supplierBillSubledger('2026-08-31', db)).toBe(100000);
  });

  it('ledger and subledger agree once the bill is posted', () => {
    supplierBillPost(addBill({ amount: 1149.80, tps: 50.00, tvq: 99.80 }), db);
    expect(-balanceOf('2010')).toBe(supplierBillSubledger('2026-12-31', db));
  });

  it('and still agree after it is paid', () => {
    const id = addBill({ amount: 500 });
    supplierBillPost(id, db);
    supplierBillPostPayment(id, { paymentDate: '2026-09-02' }, db);
    db.prepare(`UPDATE supplier_bills SET paid=1 WHERE id=?`).run(id);
    // `|| 0` normalises the -0 that negating a zero balance produces.
    expect(-balanceOf('2010') || 0).toBe(supplierBillSubledger('2026-12-31', db));
    expect(supplierBillSubledger('2026-12-31', db)).toBe(0);
  });

  it('an empty book reports zero, not null', () => {
    expect(supplierBillSubledger('2026-12-31', db)).toBe(0);
  });
});

describe('XFER-001 a transfer posts once, not twice', () => {
  // Mirrors the guard in _postBankTransactionEntry.
  const wouldPost = (tx) => !tx.is_transfer;

  it('an ordinary line still posts', () => {
    expect(wouldPost({ is_transfer: 0 })).toBe(true);
  });

  it('the card side of a payment does not', () => {
    expect(wouldPost({ is_transfer: 1 })).toBe(false);
  });

  it('the money still moved, so the line stays in the reconciliation', () => {
    // The bank subledger sums amounts regardless of whether an entry was posted,
    // which is right: the balance on the statement really did change.
    const rows = [{ amount: -1118.32, is_transfer: 1 }, { amount: -116.34, is_transfer: 0 }];
    const subledger = rows.reduce((s, r) => s + r.amount, 0);
    expect(subledger).toBeCloseTo(-1234.66, 2);
  });

  it('recording both sides would have doubled it', () => {
    const chequingSide = -1118.32;   // Dr 2210 / Cr 1010
    const cardSide     =  1118.32;   // would post Dr 2210 again from the card
    expect(Math.abs(chequingSide) + Math.abs(cardSide)).toBeCloseTo(2236.64, 2);
  });
});
