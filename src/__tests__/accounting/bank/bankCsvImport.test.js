/**
 * CSVIMP-001  an unquoted CSV keeps every column in place (the Amex shape)
 * CSVIMP-002  dates in the shapes banks write come in as YYYY-MM-DD
 * CSVIMP-003  quoted fields, semicolons, comma decimals, parentheses
 * CSVIMP-004  a card export's purchases become money out
 * CSVIMP-005  a misread file is refused, not stored
 * CSVIMP-006  an import can be deleted from the Transactions tab
 *
 * The CSV reader split lines with a regex that matched an empty string after
 * every field, so every column after the first shifted by one: an Amex export
 * came in with every amount at zero and the processed date as the description.
 * Dates were stored exactly as written ("02 Aug 2026"), and a card's positive
 * purchases were stored as money in. The delete button existed only under
 * Reconciliations.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const { parseBankCSV, normalizeStatementDate, bankStatementImport, bankStatementsList, bankStatementDelete } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

// Invented figures, same layout as the card's export.
const AMEX = 'Date,Date Processed,Description,Amount\n02 Aug 2026,03 Aug 2026,ACME GOLF CLUB  LA PRAIRIE,48.25\n30 Jul 2026,31 Jul 2026,SAMPLE COFFEE MONTREAL,7.08\n25 Jul 2026,25 Jul 2026,PAYMENT RECEIVED - THANK YOU,-500.00\n';

describe('CSVIMP-001 columns stay in place', () => {
  it('reads date, description and amount from the right columns', () => {
    const rows = parseBankCSV(AMEX, null);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ transaction_date: '2026-08-02', description: 'ACME GOLF CLUB  LA PRAIRIE', amount: 48.25 });
    expect(rows[2]).toMatchObject({ transaction_date: '2026-07-25', description: 'PAYMENT RECEIVED - THANK YOU', amount: -500 });
  });
});

describe('CSVIMP-002 dates', () => {
  it('normalizes the shapes banks export', () => {
    expect(normalizeStatementDate('02 Aug 2026')).toBe('2026-08-02');
    expect(normalizeStatementDate('2 août 2026')).toBe('2026-08-02');
    expect(normalizeStatementDate('02-Aug-26')).toBe('2026-08-02');
    expect(normalizeStatementDate('Aug 2, 2026')).toBe('2026-08-02');
    expect(normalizeStatementDate('2026-08-02')).toBe('2026-08-02');
    expect(normalizeStatementDate('2026/8/2')).toBe('2026-08-02');
    expect(normalizeStatementDate('20260802')).toBe('2026-08-02');
    expect(normalizeStatementDate('08/02/2026')).toBe('2026-08-02');
    expect(normalizeStatementDate('02/08/2026', 'dmy')).toBe('2026-08-02');
    expect(normalizeStatementDate('31 Feb 2026')).toBeNull();
    expect(normalizeStatementDate('soon')).toBeNull();
  });

  it('works out day-first from the file itself', () => {
    const rows = parseBankCSV('Date,Description,Amount\n03/04/2026,A,-1.00\n25/04/2026,B,-2.00\n', null);
    expect(rows.map(r => r.transaction_date)).toEqual(['2026-04-03', '2026-04-25']);
  });
});

describe('CSVIMP-003 field shapes', () => {
  it('quoted separators, semicolon files, comma decimals, parentheses, debit/credit columns', () => {
    const q = parseBankCSV('Date,Description,Amount\n2026-08-01,"SMITH, JOHN ""JR""","1,234.56"\n2026-08-02,REFUND,(12.50)\n', null);
    expect(q[0]).toMatchObject({ description: 'SMITH, JOHN "JR"', amount: 1234.56 });
    expect(q[1].amount).toBe(-12.5);
    const semi = parseBankCSV('﻿Date;Libellé;Montant\n2026-08-01;LOYER;-1 234,56\n', null);
    expect(semi[0]).toMatchObject({ transaction_date: '2026-08-01', description: 'LOYER', amount: -1234.56 });
    const dc = parseBankCSV('Date,Description,Debit,Credit\n2026-08-01,RENT,1200.00,\n2026-08-02,DEPOSIT,,300.00\n', null);
    expect(dc.map(r => r.amount)).toEqual([-1200, 300]);
  });
});

describe('CSVIMP-004/005/006 into the books', () => {
  let db;
  beforeEach(() => {
    db = buildAccountingDb();
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('2210','Carte','Card','liability')`).run();
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('1010','Encaisse','Cash','asset')`).run();
  });
  afterEach(() => { db?.close(); db = null; });
  const account = (type, coa) => db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
     VALUES (?, ?, (SELECT id FROM chart_of_accounts WHERE account_number=?), 0, '2026-01-01')`
  ).run(type, type, coa).lastInsertRowid;

  it('CSVIMP-004 a card purchase is money out and a payment to the card is money in', () => {
    const id = account('credit_card', '2210');
    const r = bankStatementImport({ bankAccountId: id, fileText: AMEX, fileName: 'activity.csv', fileType: 'csv' }, db);
    expect(r.rowCount).toBe(3);
    const lines = db.prepare(`SELECT transaction_date, description, amount FROM bank_transactions WHERE bank_account_id=? ORDER BY transaction_date DESC`).all(id);
    expect(lines[0]).toMatchObject({ transaction_date: '2026-08-02', amount: -48.25 });
    expect(lines[2]).toMatchObject({ transaction_date: '2026-07-25', amount: 500 });
    const chq = account('bank', '1010');
    bankStatementImport({ bankAccountId: chq, fileText: 'Date,Description,Amount\n2026-08-01,RENT,-1200.00\n', fileName: 'b.csv', fileType: 'csv' }, db);
    expect(db.prepare(`SELECT amount FROM bank_transactions WHERE bank_account_id=?`).get(chq).amount).toBe(-1200);
  });

  it('CSVIMP-005 a date it cannot read, or no amount at all, imports nothing', () => {
    const id = account('credit_card', '2210');
    expect(() => bankStatementImport({ bankAccountId: id, fileText: 'Date,Description,Amount\nsoon,X,1.00\n', fileName: 'x.csv', fileType: 'csv' }, db)).toThrow(/ERR_CSV_DATE/);
    expect(() => bankStatementImport({ bankAccountId: id, fileText: 'Date,Description,Amount\n2026-08-01,X,\n', fileName: 'y.csv', fileType: 'csv' }, db)).toThrow(/ERR_CSV_NO_AMOUNTS/);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM bank_statements`).get().n).toBe(0);
  });

  it('CSVIMP-006 the statement list counts its lines, and a statement can be taken back', () => {
    const id = account('credit_card', '2210');
    bankStatementImport({ bankAccountId: id, fileText: AMEX, fileName: 'activity.csv', fileType: 'csv' }, db);
    const [st] = bankStatementsList(id, db);
    expect(st.line_count).toBe(3);
    expect(bankStatementDelete(st.id, db)).toMatchObject({ ok: true, removedTransactions: 3 });
    // The same file can be imported again once it is gone.
    expect(bankStatementImport({ bankAccountId: id, fileText: AMEX, fileName: 'activity.csv', fileType: 'csv' }, db).rowCount).toBe(3);

    const BANQUE = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
    expect(BANQUE).toMatch(/if \(subTab === 'transactions'\) \{[^}]*loadTransactions\(\);[^}]*loadStatements\(\);/);
    expect(BANQUE).toMatch(/\{T\.importedStatements\}/);
    expect(BANQUE).toMatch(/onClick=\{\(\) => deleteStatement\(st\)\}/);
  });
});
