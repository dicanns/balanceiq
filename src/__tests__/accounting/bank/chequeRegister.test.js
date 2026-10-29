/**
 * CHQ-001  cheque numbers are read the way banks print them
 * CHQ-002  a cheque written posts when written and is outstanding until it clears
 * CHQ-003  the statement line it clears on is linked and posts nothing
 * CHQ-004  a line categorized before the cheque was recorded is not counted twice
 * CHQ-005  a cheque can pay supplier bills; voiding it makes them owed again
 * CHQ-006  invoice cheques post nothing of their own; one deposit can hold several
 * CHQ-007  safeguards: amounts must add up, a cleared cheque cannot be voided, unlinking reopens it
 * CHQ-008  tax on a cheque purchase reaches the GST/QST return
 *
 * A cheque leaves the books and the bank out of step for days or weeks. The books
 * record it the day it is written; the bank only when it is cashed. Recording it
 * on both sides would count it twice, so the statement line where it clears only
 * proves it went through. Until then it is "outstanding", which is exactly the
 * difference a bank reconciliation has to explain.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';
import { chequeNumberFromDescription, normalizeChequeNumber } from '../../../utils/chequeNumber.mjs';

const require = createRequire(import.meta.url);
const {
  chequeRecord, chequeVoid, chequeLink, chequeAutoMatch, chequeCandidatesForTx, chequeOutstandingSummary,
  bankTransactionCategorize, bankTransactionUnmatch, taxPeriodCompute,
} = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'], ['1100', 'AR', 'asset'], ['1400', 'GST receivable', 'asset'], ['1410', 'QST receivable', 'asset'],
    ['2010', 'AP', 'liability'], ['6100', 'Rent', 'expense'], ['4900', 'Other income', 'revenue'],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,100)`).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
const bal = (n) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents - jl.credit_cents), 0) AS c FROM journal_lines jl
   JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed') WHERE jl.account_id = ?`
).get(acc(n).id).c;
function addAccount() {
  return db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Chequing','bank',?,0,'2026-01-01')`)
    .run(acc('1010').id).lastInsertRowid;
}
function addTx(accountId, amount, date, description) {
  return db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount) VALUES (?,?,?,?)`)
    .run(accountId, date, description, amount).lastInsertRowid;
}
const line = (id) => db.prepare(`SELECT * FROM bank_transactions WHERE id=?`).get(id);
const cheque = (id) => db.prepare(`SELECT * FROM cheques WHERE id=?`).get(id);

describe('CHQ-001 cheque numbers on statements', () => {
  it('reads the common bank formats and drops padding zeros', () => {
    expect(chequeNumberFromDescription('CHEQUE 000123')).toBe('123');
    expect(chequeNumberFromDescription('CHQ#00123-4567890')).toBe('123');
    expect(chequeNumberFromDescription('Chèque no 456')).toBe('456');
    expect(chequeNumberFromDescription('CHECK #789')).toBe('789');
    expect(chequeNumberFromDescription('Mobile Cheque Deposit')).toBeNull();
    expect(chequeNumberFromDescription('INTERAC e-Transfer Sent')).toBeNull();
    expect(normalizeChequeNumber('0042')).toBe('42');
  });
});

describe('CHQ-002 a cheque written', () => {
  it('books rent net of tax and is outstanding', () => {
    const bank = addAccount();
    // $1,149.75 rent = $1,000 + $50 GST + $99.75 QST.
    const r = chequeRecord({ direction: 'issued', chequeNumber: '123', chequeDate: '2026-11-01', partyName: 'Landlord',
      amountCents: 114975, bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id, tpsCents: 5000, tvqCents: 9975 }, db);
    expect(r.ok).toBe(true);
    expect(bal('6100')).toBe(100000);
    expect(bal('1400')).toBe(5000);
    expect(bal('1410')).toBe(9975);
    expect(bal('1010')).toBe(-114975);
    expect(cheque(r.id).status).toBe('outstanding');
    expect(chequeOutstandingSummary(bank, '2026-11-30', db).issued).toEqual({ count: 1, cents: 114975 });
  });

  it('refuses a second cheque with the same number on the same account', () => {
    const bank = addAccount();
    const base = { direction: 'issued', chequeNumber: '123', chequeDate: '2026-11-01', amountCents: 1000, bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id };
    expect(chequeRecord(base, db).ok).toBe(true);
    expect(chequeRecord(base, db).error).toBe('duplicate_number');
  });
});

describe('CHQ-003 clearing on the statement', () => {
  it('the line with its number is linked on import and books nothing more', () => {
    const bank = addAccount();
    const r = chequeRecord({ direction: 'issued', chequeNumber: '123', chequeDate: '2026-11-01', amountCents: 114975,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id }, db);
    const tx = addTx(bank, -1149.75, '2026-11-09', 'CHEQUE 000123');
    expect(chequeAutoMatch(bank, db).linked).toBe(1);
    expect(line(tx).matched_entity_type).toBe('cheque');
    expect(cheque(r.id).status).toBe('cleared');
    expect(cheque(r.id).cleared_date).toBe('2026-11-09');
    expect(bal('1010')).toBe(-114975);
    expect(bal('6100')).toBe(114975);
  });

  it('a line without a number is suggested by amount, not linked', () => {
    const bank = addAccount();
    const r = chequeRecord({ direction: 'issued', chequeNumber: '124', chequeDate: '2026-11-01', amountCents: 50000,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id }, db);
    const tx = addTx(bank, -500, '2026-11-10', 'CHEQUE IMAGE');
    expect(chequeAutoMatch(bank, db).linked).toBe(0);
    const c = chequeCandidatesForTx(tx, db);
    expect(c.cheques[0].id).toBe(r.id);
    expect(c.cheques[0].sameAmount).toBe(true);
  });
});

describe('CHQ-004 the statement came first', () => {
  it('recording the cheque links the categorized line and reverses its expense', () => {
    const bank = addAccount();
    const tx = addTx(bank, -1149.75, '2026-11-09', 'CHQ#00123-998877');
    bankTransactionCategorize(tx, acc('6100').id, null, {}, db);
    expect(bal('6100')).toBe(114975);
    const r = chequeRecord({ direction: 'issued', chequeNumber: '123', chequeDate: '2026-11-01', amountCents: 114975,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id }, db);
    expect(r.matchedTxId).toBe(tx);
    expect(bal('6100')).toBe(114975);
    expect(bal('1010')).toBe(-114975);
  });
});

describe('CHQ-005 a cheque paying supplier bills', () => {
  function addBill(amount) {
    return db.prepare(`INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid)
      VALUES ('2026-10','Supplier',?, '2026-10-15', 0, 0, ?, 0)`).run(amount, acc('6100').id).lastInsertRowid;
  }
  it('settles the payable, marks the bills paid, and voiding undoes both', () => {
    const bank = addAccount();
    const b1 = addBill(300), b2 = addBill(200);
    const r = chequeRecord({ direction: 'issued', chequeNumber: '200', chequeDate: '2026-11-02', amountCents: 50000,
      bankAccountId: bank, kind: 'supplier_bills', billIds: [b1, b2] }, db);
    expect(r.ok).toBe(true);
    expect(bal('2010')).toBe(50000);
    const paid = db.prepare(`SELECT paid, payment_method FROM supplier_bills WHERE id IN (?,?)`).all(b1, b2);
    expect(paid.every(p => p.paid === 1 && p.payment_method === 'cheque')).toBe(true);
    expect(chequeVoid(r.id, 'lost in the mail', db).ok).toBe(true);
    expect(bal('2010')).toBe(0);
    expect(bal('1010')).toBe(0);
    expect(db.prepare(`SELECT paid FROM supplier_bills WHERE id=?`).get(b1).paid).toBe(0);
  });

  it('the bills must add up to the cheque', () => {
    const bank = addAccount();
    const b1 = addBill(300);
    expect(chequeRecord({ direction: 'issued', chequeDate: '2026-11-02', amountCents: 50000, bankAccountId: bank, kind: 'supplier_bills', billIds: [b1] }, db).error)
      .toBe('amount_mismatch');
  });
});

describe('CHQ-006 cheques received', () => {
  it('invoice cheques book nothing themselves; one deposit clears two of them', () => {
    const bank = addAccount();
    const a = chequeRecord({ direction: 'received', chequeNumber: '5501', chequeDate: '2026-11-03', partyName: 'Client A',
      amountCents: 40000, bankAccountId: bank, kind: 'invoice_payment', invoiceRefs: ['F-0101'] }, db);
    const b = chequeRecord({ direction: 'received', chequeNumber: '881', chequeDate: '2026-11-04', partyName: 'Client B',
      amountCents: 25000, bankAccountId: bank, kind: 'invoice_payment', invoiceRefs: ['F-0102'] }, db);
    expect(a.entryId).toBeNull();
    const dep = addTx(bank, 650, '2026-11-05', 'Mobile Cheque Deposit');
    expect(chequeLink(dep, [a.id, b.id], db).ok).toBe(true);
    expect(line(dep).coa_account_id).toBe(acc('1100').id);
    expect(bal('1010')).toBe(0);
    expect(cheque(b.id).status).toBe('cleared');
  });

  it('a cheque received for anything else posts when recorded', () => {
    const bank = addAccount();
    const r = chequeRecord({ direction: 'received', chequeNumber: '77', chequeDate: '2026-11-03', amountCents: 12000,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('4900').id }, db);
    expect(bal('1010')).toBe(12000);
    expect(bal('4900')).toBe(-12000);
    expect(cheque(r.id).status).toBe('outstanding');
  });
});

describe('CHQ-007 safeguards', () => {
  it('amounts must add up, cleared cheques cannot be voided, unlinking reopens', () => {
    const bank = addAccount();
    const r = chequeRecord({ direction: 'issued', chequeNumber: '300', chequeDate: '2026-11-01', amountCents: 10000,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id }, db);
    const wrong = addTx(bank, -99.99, '2026-11-05', 'CHEQUE 300');
    expect(chequeLink(wrong, [r.id], db).error).toBe('amount_mismatch');
    const deposit = addTx(bank, 100, '2026-11-05', 'DEPOSIT');
    expect(chequeLink(deposit, [r.id], db).error).toBe('wrong_direction');
    const right = addTx(bank, -100, '2026-11-06', 'CHEQUE 300');
    expect(chequeLink(right, [r.id], db).ok).toBe(true);
    expect(chequeVoid(r.id, 'x', db).error).toBe('cheque_cleared');
    bankTransactionUnmatch(right, db);
    expect(cheque(r.id).status).toBe('outstanding');
    expect(bal('1010')).toBe(-10000);
  });
});

describe('CHQ-008 tax on a cheque purchase', () => {
  it('is claimed on the GST/QST return like a bill', () => {
    const bank = addAccount();
    chequeRecord({ direction: 'issued', chequeNumber: '400', chequeDate: '2026-11-01', amountCents: 114975,
      bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id, tpsCents: 5000, tvqCents: 9975 }, db);
    const t = taxPeriodCompute('2026-10-01', '2026-12-31', db);
    expect(t.tpsCtiFromSupplierBills).toBeCloseTo(50, 6);
    expect(t.tvqRtiFromSupplierBills).toBeCloseTo(99.75, 6);
  });
});

describe('CHQ-009 the modules meet without counting twice', () => {
  it('a deposit categorized to receivables links the one invoice cheque it must be', () => {
    const bank = addAccount();
    const r = chequeRecord({ direction: 'received', chequeNumber: '9001', chequeDate: '2026-11-03', amountCents: 40000,
      bankAccountId: null, kind: 'invoice_payment', invoiceRefs: ['F-0101'], paymentIds: ['p1'] }, db);
    const dep = addTx(bank, 400, '2026-11-05', 'DEPOSIT');
    bankTransactionCategorize(dep, acc('1100').id, null, {}, db);
    expect(cheque(r.id).status).toBe('cleared');
    expect(line(dep).matched_entity_type).toBe('cheque');
    expect(bal('1010')).toBe(0);
  });

  it('voiding the invoice payment takes its cheque out of the register', () => {
    const { chequeRemoveInvoicePayment } = require('../../../db/database.js');
    const single = chequeRecord({ direction: 'received', chequeNumber: '9002', chequeDate: '2026-11-03', amountCents: 40000,
      kind: 'invoice_payment', paymentIds: ['pA'] }, db);
    const multi = chequeRecord({ direction: 'received', chequeNumber: '9003', chequeDate: '2026-11-03', amountCents: 70000,
      kind: 'invoice_payment', paymentIds: ['pB', 'pC'] }, db);
    expect(chequeRemoveInvoicePayment('pA', 40000, db).voided).toBe(single.id);
    expect(cheque(single.id).status).toBe('void');
    expect(chequeRemoveInvoicePayment('pB', 30000, db).reduced).toBe(multi.id);
    expect(cheque(multi.id).amount_cents).toBe(40000);
    expect(chequeRemoveInvoicePayment('nope', 100, db).nothing).toBe(true);
  });

  it('a cleared invoice cheque is reported, not silently changed', () => {
    const { chequeRemoveInvoicePayment } = require('../../../db/database.js');
    const bank = addAccount();
    const r = chequeRecord({ direction: 'received', chequeNumber: '9004', chequeDate: '2026-11-03', amountCents: 25000,
      kind: 'invoice_payment', paymentIds: ['pD'] }, db);
    chequeLink(addTx(bank, 250, '2026-11-06', 'DEPOSIT'), [r.id], db);
    expect(chequeRemoveInvoicePayment('pD', 25000, db).error).toBe('cheque_cleared');
    expect(cheque(r.id).status).toBe('cleared');
  });
});
