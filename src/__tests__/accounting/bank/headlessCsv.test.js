/**
 * HEADLESS-001  a file with no header keeps its first transaction
 * HEADLESS-002  charge and payment columns are read as a direction, never flipped
 * HEADLESS-003  a running balance gives the closing balance, and the opening one
 * HEADLESS-004  the opening balance is only ever set when nothing was set before
 * HEADLESS-005  a file whose columns cannot be recognized says so
 *
 * Plenty of banks export no column names at all: date, description, charge,
 * payment, running balance, one transaction per line. Line one was read as a
 * header, so no date column was found and the whole file imported as nothing -
 * reported as "no transactions found".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { looksLikeHeader, inferColumns, parseCsvLines } from '../../../utils/importParse.mjs';

const require = createRequire(import.meta.url);
const { bankStatementImport, bankStatementsList, bankReconcilePreview, parseBankCsvFile } = require('../../../db/database.js');

// The shape of a headerless card export, newest first, with invented amounts:
// date, description, charge, payment, running balance.
const HEADLESS = [
  '07/27/2026,PAYMENT - THANK YOU,,184.90,116.34',
  '07/24/2026,SAMPLE CAFE,19.50,,301.24',
  '07/23/2026,SAMPLE CORNER STORE,4.00,,281.74',
  '07/08/2026,SAMPLE CAFE,10.66,,277.74',
].join('\n') + '\n';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [['1010', 'Encaisse', 'asset'], ['2210', 'Carte', 'liability']]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });
const account = (type = 'credit_card', coa = '2210', opening = 0, openingDate = '2026-09-17') => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
   VALUES ('Visa', ?, (SELECT id FROM chart_of_accounts WHERE account_number=?), ?, ?)`
).run(type, coa, opening, openingDate).lastInsertRowid;

describe('HEADLESS-001/002 reading a file with no column names', () => {
  it('keeps every line and reads the columns from the values', () => {
    const { rows } = parseCsvLines(HEADLESS);
    expect(rows).toHaveLength(4);
    expect(looksLikeHeader(rows[0])).toBe(false);
    expect(inferColumns(rows)).toMatchObject({ dateIdx: 0, descIdx: 1, debitIdx: 2, creditIdx: 3, balIdx: 4, amtIdx: -1 });

    const parsed = parseBankCsvFile(HEADLESS, null);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.meta).toMatchObject({ hadHeader: false, amountsFrom: 'debit_credit', closingBalance: 116.34, openingBalance: 277.74 });
    // A charge is money out and a payment is money in, with no flipping.
    expect(parsed.rows.find(r => r.description === 'PAYMENT - THANK YOU').amount).toBe(184.9);
    expect(parsed.rows.find(r => r.transaction_date === '2026-07-24').amount).toBe(-19.5);
  });

  it('a header that names its columns is still used', () => {
    const withHeader = 'Date,Description,Debit,Credit,Balance\n07/24/2026,SAMPLE CAFE,19.50,,301.24\n';
    const parsed = parseBankCsvFile(withHeader, null);
    expect(parsed.meta.hadHeader).toBe(true);
    expect(parsed.rows[0]).toMatchObject({ transaction_date: '2026-07-24', description: 'SAMPLE CAFE', amount: -19.5 });
  });
});

describe('HEADLESS-003 both ends of the balance come from the file', () => {
  it('sets the closing balance and the opening balance a card statement implies', () => {
    const id = account();
    const r = bankStatementImport({ bankAccountId: id, fileText: HEADLESS, fileName: 'a.csv', fileType: 'csv' }, db);
    expect(r).toMatchObject({ rowCount: 4, closingFromFile: true });
    expect(r.openingSet).toEqual({ balance: -267.08, date: '2026-07-07' });

    const [st] = bankStatementsList(id, db);
    expect(st).toMatchObject({ ending_balance: -116.34, ending_balance_source: 'file' });

    // With both ends from the file, the month reconciles with nothing typed.
    db.prepare(`UPDATE bank_transactions SET match_status='manual'`).run();
    expect(bankReconcilePreview(id, st.period_end, db).ecart).toBe(0);
  });

  it('a chequing account keeps the balance as the file states it', () => {
    const id = account('bank', '1010');
    const csv = 'Date,Description,Amount,Balance\n2026-07-02,RENT,-1200.00,3800.00\n2026-07-01,DEPOSIT,500.00,5000.00\n';
    bankStatementImport({ bankAccountId: id, fileText: csv, fileName: 'b.csv', fileType: 'csv' }, db);
    expect(bankStatementsList(id, db)[0]).toMatchObject({ ending_balance: 3800, ending_balance_source: 'file' });
    expect(db.prepare(`SELECT opening_balance FROM bank_accounts WHERE id=?`).get(id).opening_balance).toBe(4500);
  });
});

describe('HEADLESS-004 an opening balance already set is left alone', () => {
  it('never overwrites a figure somebody entered, nor an account with history', () => {
    const id = account('credit_card', '2210', -50, '2026-07-01');
    const r = bankStatementImport({ bankAccountId: id, fileText: HEADLESS, fileName: 'c.csv', fileType: 'csv' }, db);
    expect(r.openingSet).toBeNull();
    expect(db.prepare(`SELECT opening_balance FROM bank_accounts WHERE id=?`).get(id).opening_balance).toBe(-50);

    // Second import into an account that now holds history: still untouched.
    const id2 = account();
    bankStatementImport({ bankAccountId: id2, fileText: HEADLESS, fileName: 'd.csv', fileType: 'csv' }, db);
    const afterFirst = db.prepare(`SELECT opening_balance FROM bank_accounts WHERE id=?`).get(id2).opening_balance;
    db.prepare(`UPDATE bank_accounts SET opening_balance=0 WHERE id=?`).run(id2);
    const more = 'date,desc,charge,payment,balance\n08/03/2026,SAMPLE CAFE,5.00,,121.34\n';
    const r2 = bankStatementImport({ bankAccountId: id2, fileText: more, fileName: 'e.csv', fileType: 'csv' }, db);
    expect(r2.openingSet).toBeNull();
    expect(afterFirst).toBe(-267.08);
  });
});

describe('HEADLESS-005 a file nothing can be made of', () => {
  it('names the problem instead of reporting an empty import', () => {
    const id = account();
    const junk = 'Client,Notes\nACME,Called back\nSAMPLE,Left a message\n';
    expect(() => bankStatementImport({ bankAccountId: id, fileText: junk, fileName: 'f.csv', fileType: 'csv' }, db))
      .toThrow(/ERR_CSV_NO_COLUMNS/);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM bank_statements`).get().n).toBe(0);
  });
});
