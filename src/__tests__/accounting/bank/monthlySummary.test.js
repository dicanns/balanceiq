/**
 * MSUM-001  expenses are grouped by category with the tax entered on each line
 * MSUM-002  a line that paid supplier bills counts as those bills; a cheque as what it was for
 * MSUM-003  transfers are counted apart, money in has its own table, uncategorized lines are listed
 * MSUM-004  a statement period or a calendar month; the printed sheet carries the totals
 *
 * The sheet a bookkeeper builds by hand each month, one per card: a row per
 * category, before tax, GST, QST, total. Built from the categorized statement
 * lines, so it is only as complete as the categorizing, which is why anything
 * still uncategorized is printed on the sheet rather than silently left out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';
import { buildMonthlySummaryHtml } from '../../../utils/monthlySummaryHtml.mjs';

const require = createRequire(import.meta.url);
const { bankMonthlySummary, bankTransactionCategorize, supplierBillPayByBankTransaction, chequeRecord, chequeLink } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type, pct] of [
    ['1010', 'Cash', 'asset', 100], ['1100', 'AR', 'asset', 100], ['1400', 'GST rec', 'asset', 100], ['1410', 'QST rec', 'asset', 100],
    ['2010', 'AP', 'liability', 100], ['2210', 'Card', 'liability', 100], ['4000', 'Sales', 'revenue', 100],
    ['6100', 'Rent', 'expense', 100], ['6600', 'Office', 'expense', 100], ['6810', 'Meals (50%)', 'expense', 50],
  ]) db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,?)`).run(num, name, name, type, pct);
});
afterEach(() => { db?.close(); db = null; });
const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);
function addAccount(name = 'Card', type = 'credit_card', coa = '2210') {
  return db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES (?,?,?,0,'2026-01-01')`).run(name, type, acc(coa).id).lastInsertRowid;
}
function addStatement(accountId, from, to) {
  return db.prepare(`INSERT INTO bank_statements (bank_account_id, period_start, period_end, ending_balance, reconciled) VALUES (?,?,?,0,0)`).run(accountId, from, to).lastInsertRowid;
}
function addTx(accountId, stId, amount, date, description) {
  return db.prepare(`INSERT INTO bank_transactions (bank_account_id, bank_statement_id, transaction_date, description, amount) VALUES (?,?,?,?,?)`).run(accountId, stId, date, description, amount).lastInsertRowid;
}
const row = (sec, num) => sec.rows.find(r => r.account_number === num);

describe('MSUM-001 grouped by category', () => {
  it('two meals and one office purchase make two rows with their tax', () => {
    const card = addAccount(); const st = addStatement(card, '2026-10-06', '2026-11-05');
    bankTransactionCategorize(addTx(card, st, -22.99, '2026-10-10', 'CAFE A'), acc('6810').id, null, { tpsPaid: 1.00, tvqPaid: 2.00 }, db);
    bankTransactionCategorize(addTx(card, st, -45.98, '2026-10-20', 'CAFE B'), acc('6810').id, null, { tpsPaid: 2.00, tvqPaid: 3.99 }, db);
    bankTransactionCategorize(addTx(card, st, -114.98, '2026-10-25', 'STAPLES'), acc('6600').id, null, { tpsPaid: 5.00, tvqPaid: 9.98 }, db);
    const r = bankMonthlySummary({ statementId: st }, db);
    expect(r.ok).toBe(true);
    const a = r.accounts[0];
    expect(a.expenses.rows.map(x => x.account_number)).toEqual(['6600', '6810']);
    expect(row(a.expenses, '6810')).toMatchObject({ count: 2, gross_cents: 6897, tps_cents: 300, tvq_cents: 599, net_cents: 5998, itc_pct: 50 });
    expect(a.expenses.totals).toMatchObject({ count: 3, gross_cents: 18395, tps_cents: 800, tvq_cents: 1597 });
  });
});

describe('MSUM-002 bills and cheques', () => {
  it('a line that paid two bills shows as the bills, with their accounts and tax', () => {
    const bank = addAccount('Chequing', 'bank', '1010'); const st = addStatement(bank, '2026-10-01', '2026-10-31');
    const b1 = db.prepare(`INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid) VALUES ('2026-10','Landlord',1149.75,'2026-10-01',50,99.75,?,0)`).run(acc('6100').id).lastInsertRowid;
    const b2 = db.prepare(`INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid) VALUES ('2026-10','Staples',114.98,'2026-10-02',5,9.98,?,0)`).run(acc('6600').id).lastInsertRowid;
    const tx = addTx(bank, st, -1264.73, '2026-10-15', 'E-TRANSFER');
    expect(supplierBillPayByBankTransaction(tx, [b1, b2], db).ok).toBe(true);
    const a = bankMonthlySummary({ statementId: st }, db).accounts[0];
    expect(row(a.expenses, '6100')).toMatchObject({ count: 1, gross_cents: 114975, tps_cents: 5000, tvq_cents: 9975 });
    expect(row(a.expenses, '6600')).toMatchObject({ count: 1, gross_cents: 11498 });
    expect(row(a.expenses, '2010')).toBeUndefined();
  });

  it('a cleared cheque shows under what the cheque was for', () => {
    const bank = addAccount('Chequing', 'bank', '1010'); const st = addStatement(bank, '2026-10-01', '2026-10-31');
    const c = chequeRecord({ direction: 'issued', chequeNumber: '55', chequeDate: '2026-10-03', partyName: 'Landlord', amountCents: 114975, bankAccountId: bank, kind: 'account', coaAccountId: acc('6100').id, tpsCents: 5000, tvqCents: 9975 }, db);
    const tx = addTx(bank, st, -1149.75, '2026-10-09', 'CHEQUE 000055');
    expect(chequeLink(tx, [c.id], db).ok).toBe(true);
    const a = bankMonthlySummary({ statementId: st }, db).accounts[0];
    expect(row(a.expenses, '6100')).toMatchObject({ count: 1, gross_cents: 114975, tps_cents: 5000, tvq_cents: 9975 });
    expect(a.expenses.rows[0].items[0].description).toContain('#55');
  });
});

describe('MSUM-002b a bill paid by cheque', () => {
  it('shows under the bill expense account with its tax, not under accounts payable', () => {
    const bank = addAccount('Chequing', 'bank', '1010'); const st = addStatement(bank, '2026-10-01', '2026-10-31');
    const b1 = db.prepare(`INSERT INTO supplier_bills (month_key, supplier_name, amount, bill_date, tps_paid, tvq_paid, coa_account_id, paid) VALUES ('2026-10','Landlord',1149.75,'2026-10-01',50,99.75,?,0)`).run(acc('6100').id).lastInsertRowid;
    const c = chequeRecord({ direction: 'issued', chequeNumber: '61', chequeDate: '2026-10-03', partyName: 'Landlord', amountCents: 114975, bankAccountId: bank, kind: 'supplier_bills', billIds: [b1] }, db);
    expect(c.ok).toBe(true);
    const tx = addTx(bank, st, -1149.75, '2026-10-09', 'CHEQUE 000061');
    expect(chequeLink(tx, [c.id], db).ok).toBe(true);
    const a = bankMonthlySummary({ statementId: st }, db).accounts[0];
    expect(row(a.expenses, '6100')).toMatchObject({ count: 1, gross_cents: 114975, tps_cents: 5000, tvq_cents: 9975 });
    expect(row(a.expenses, '2010')).toBeUndefined();
  });
});

describe('MSUM-003 the rest of the statement', () => {
  it('transfers apart, money in on its own, uncategorized listed', () => {
    const card = addAccount(); const st = addStatement(card, '2026-10-06', '2026-11-05');
    const bank = addAccount('Chequing', 'bank', '1010');
    void bank;
    const pay = addTx(card, st, 500, '2026-10-12', 'PAYMENT - THANK YOU');
    bankTransactionCategorize(pay, acc('1010').id, null, {}, db);          // the rule marks it as a transfer
    bankTransactionCategorize(addTx(card, st, 30, '2026-10-13', 'REFUND'), acc('6600').id, null, { tpsPaid: 1.30, tvqPaid: 2.61 }, db);
    addTx(card, st, -12.34, '2026-10-14', 'MYSTERY CHARGE');
    const a = bankMonthlySummary({ statementId: st }, db).accounts[0];
    expect(a.transfers).toEqual({ count: 1, cents: 50000 });
    expect(row(a.inflows, '6600')).toMatchObject({ gross_cents: 3000, tps_cents: 130, tvq_cents: 261 });
    expect(a.uncategorized).toEqual([{ date: '2026-10-14', description: 'MYSTERY CHARGE', cents: 1234 }]);
    expect(a.expenses.rows).toEqual([]);
  });
});

describe('MSUM-004 periods and the sheet', () => {
  it('a calendar month covers every account, and the sheet carries the totals', () => {
    const card = addAccount(); const bank = addAccount('Chequing', 'bank', '1010');
    bankTransactionCategorize(addTx(card, null, -22.99, '2026-10-10', 'CAFE'), acc('6810').id, null, {}, db);
    bankTransactionCategorize(addTx(bank, null, -300, '2026-10-30', 'RENT PART'), acc('6100').id, null, {}, db);
    bankTransactionCategorize(addTx(bank, null, -300, '2026-11-01', 'RENT PART'), acc('6100').id, null, {}, db);
    const r = bankMonthlySummary({ monthKey: '2026-10' }, db);
    expect(r.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(r.accounts.map(a => a.name).sort()).toEqual(['Card', 'Chequing']);
    expect(r.accounts.find(a => a.name === 'Chequing').expenses.totals.gross_cents).toBe(30000);
    const html = buildMonthlySummaryHtml(r, { lang: 'en', companyName: 'Sample <Co>' });
    expect(html).toContain('Sample &lt;Co&gt;');
    expect(html).toContain('300.00 $');
    expect(html).toContain('6810 · Meals');
    expect(bankMonthlySummary({}, db).error).toBe('period_required');
    expect(bankMonthlySummary({ statementId: 999 }, db).error).toBe('statement_not_found');
  });
});
