/**
 * PDFIMP-001  a card statement's lines land as money owed, with their notes
 * PDFIMP-002  the PDF's balances become the closing and, on a first import, the opening
 * PDFIMP-003  the same month again by another route is refused unless asked for
 * PDFIMP-004  the review screen learns what the books already hold
 * PDFIMP-005  a typed opening that disagrees with the file is named on the reconciliation
 * PDFIMP-006  the import screen, the bridge and both languages
 *
 * Figures are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const { bankStatementImport, bankStatementPdfCheck, bankReconcilePreview } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('2210','Carte','Card','liability')`).run();
  db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('1010','Banque','Bank','asset')`).run();
});
afterEach(() => { db?.close(); db = null; });

const card = (opening = 0) => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
   VALUES ('Sample Visa','credit_card',(SELECT id FROM chart_of_accounts WHERE account_number='2210'),?,'2026-07-01')`
).run(opening).lastInsertRowid;

// As the review screen sends it: amounts as the statement prints them.
const statement = (over = {}) => ({
  rows: [
    { date: '2026-07-26', description: 'PAYMENT RECEIVED - THANK YOU', amount: -50, note: 'Reference AB0000' },
    { date: '2026-07-24', description: 'SAMPLE SOFTWARE NEW YORK', amount: 60, note: 'UNITED STATES DOLLAR 43.00 @ 1.39535' },
    { date: '2026-08-02', description: 'SAMPLE GOLF', amount: 30 },
  ],
  opening: 50, closing: 90, periodStart: '2026-07-06', periodEnd: '2026-08-05',
  sourceHash: 'a'.repeat(64),
  ...over,
});
const importPdf = (id, st = statement(), extra = {}) =>
  bankStatementImport({ bankAccountId: id, fileName: 's.pdf', fileType: 'pdf', pdfStatement: st, ...extra }, db);

describe('PDFIMP-001 lines as money owed', () => {
  it('stores a charge negative and the payment positive, with each note', () => {
    const id = card();
    const r = importPdf(id);
    expect(r.rowCount).toBe(3);
    const lines = db.prepare(`SELECT transaction_date d, amount a, notes n FROM bank_transactions WHERE bank_account_id=? ORDER BY transaction_date`).all(id);
    expect(lines).toEqual([
      { d: '2026-07-24', a: -60, n: 'UNITED STATES DOLLAR 43.00 @ 1.39535' },
      { d: '2026-07-26', a: 50, n: 'Reference AB0000' },
      { d: '2026-08-02', a: -30, n: null },
    ]);
  });
});

describe('PDFIMP-002 the balances from the file', () => {
  it('sets the closing, and an empty opening, both as what is owed', () => {
    const id = card();
    const r = importPdf(id);
    const s = db.prepare(`SELECT * FROM bank_statements WHERE id=?`).get(r.statementId);
    expect(s).toMatchObject({ period_start: '2026-07-06', period_end: '2026-08-05', ending_balance: -90, ending_balance_source: 'file', file_opening_cents: -5000 });
    expect(r.openingSet).toEqual({ balance: -50, date: '2026-07-05' });
    // Opening plus the lines is the closing, so the month reconciles once the
    // lines are categorized (the preview counts only categorized lines).
    const sum = db.prepare(`SELECT ROUND(SUM(amount),2) s FROM bank_transactions WHERE bank_account_id=?`).get(id).s;
    expect(Math.round((-50 + sum) * 100) / 100).toBe(-90);
  });
  it('never overwrites an opening somebody typed, but keeps what the file said', () => {
    const id = card(-20);
    const r = importPdf(id);
    expect(r.openingSet).toBeNull();
    expect(db.prepare(`SELECT opening_balance FROM bank_accounts WHERE id=?`).get(id).opening_balance).toBe(-20);
    expect(db.prepare(`SELECT file_opening_cents FROM bank_statements WHERE id=?`).get(r.statementId).file_opening_cents).toBe(-5000);
  });
  it('puts the opening before a line dated ahead of the period', () => {
    const id = card();
    const st = statement({ rows: [...statement().rows, { date: '2026-07-05', description: 'SAMPLE SECOND CARD', amount: 0.01 }], closing: 90.01 });
    expect(importPdf(id, st).openingSet.date).toBe('2026-07-04');
  });
});

describe('PDFIMP-003 the same month twice', () => {
  it('is refused when a statement already covers the period', () => {
    const id = card();
    importPdf(id);
    expect(() => importPdf(id, statement({ sourceHash: 'b'.repeat(64) }))).toThrow('ERR_STATEMENT_PERIOD_EXISTS');
  });
  it('the same file again is refused as a duplicate file', () => {
    const id = card();
    importPdf(id);
    expect(() => importPdf(id)).toThrow('ERR_STATEMENT_DUPLICATE');
  });
  it('goes through when the operator says so', () => {
    const id = card();
    importPdf(id);
    const r = importPdf(id, statement({ sourceHash: 'c'.repeat(64) }), { allowOverlap: true });
    expect(r.statementId).toBeTruthy();
  });
  it('the next month is not the same month', () => {
    const id = card();
    importPdf(id);
    const next = statement({
      rows: [{ date: '2026-08-10', description: 'SAMPLE CAFE', amount: 5 }],
      opening: 90, closing: 95, periodStart: '2026-08-06', periodEnd: '2026-09-05', sourceHash: 'd'.repeat(64),
    });
    expect(importPdf(id, next).rowCount).toBe(1);
  });
});

describe('PDFIMP-004 what the books already hold', () => {
  it('counts lines already there by date and amount, and names the statement covering the period', () => {
    const id = card();
    const before = bankStatementPdfCheck(id, { periodStart: '2026-07-06', periodEnd: '2026-08-05', rows: statement().rows }, db);
    expect(before).toMatchObject({ overlap: null, alreadyInBooks: 0, owed: true });
    importPdf(id);
    const after = bankStatementPdfCheck(id, { periodStart: '2026-07-06', periodEnd: '2026-08-05', rows: statement().rows }, db);
    expect(after.alreadyInBooks).toBe(3);
    expect(after.overlap).toMatchObject({ periodStart: '2026-07-06', periodEnd: '2026-08-05', reconciled: false });
  });
});

describe('PDFIMP-005 the opening hint', () => {
  it('names the file figure while the first statement is open, and not once the opening is right', () => {
    // The mistake this exists for: the closing balance typed as the opening.
    const id = card(-90);
    importPdf(id);
    expect(bankReconcilePreview(id, '2026-08-05', db)).toMatchObject({ openingMismatch: true, fileOpening: -50 });

    db.prepare(`UPDATE bank_accounts SET opening_balance=-50 WHERE id=?`).run(id);
    const fixed = bankReconcilePreview(id, '2026-08-05', db);
    expect(fixed.openingMismatch).toBe(false);
  });
  it('comes from a CSV too, from the running balance in the file', () => {
    const id = card(-90);
    const csv = '07/26/2026,PAYMENT - THANK YOU,,50.00,70.00\n07/24/2026,SAMPLE CAFE,20.00,,120.00\n';
    bankStatementImport({ bankAccountId: id, fileText: csv, fileName: 'a.csv', fileType: 'csv' }, db);
    expect(bankReconcilePreview(id, '2026-08-05', db)).toMatchObject({ openingMismatch: true, fileOpening: -100 });
  });
  it('stays quiet once the first statement is reconciled', () => {
    const id = card(-90);
    const r = importPdf(id);
    db.prepare(`UPDATE bank_statements SET reconciled=1 WHERE id=?`).run(r.statementId);
    expect(bankReconcilePreview(id, '2026-08-05', db).openingMismatch).toBe(false);
  });
});

describe('PDFIMP-006 wiring', () => {
  it('the bridge reads the PDF in the isolated reader and never imports on read', () => {
    const main = read('main.js');
    expect(main).toMatch(/ipcMain\.handle\('bank:statement:readPdf'/);
    expect(main).toMatch(/readPdfIsolated\(buffer, \{ maxPages: 20 \}\)/);
    expect(main).toMatch(/require\('\.\/src\/utils\/statementPdf\.mjs'\)/);
    const handler = main.slice(main.indexOf("'bank:statement:readPdf'"), main.indexOf("'bank:statement:pdfCheck'"));
    expect(handler).not.toMatch(/bankStatementImport\(/);
    expect(read('preload.js')).toMatch(/readPdf: \(bytes, bankAccountId\) => ipcRenderer\.invoke\('bank:statement:readPdf'/);
  });
  it('the import screen takes a PDF, checks it and gates the import on it', () => {
    const s = read('src/components/BanqueTab.jsx');
    expect(s).toMatch(/accept='\.csv,\.ofx,\.qfx,\.qbo,\.pdf'/);
    expect(s).toMatch(/if \(f && isPdfFile\(f\)\) readPdfFile\(f, importAccountId\)/);
    expect(s).toMatch(/\(isPdfFile\(importFile\) && !pdfReady\(\)\)/);
    expect(s).toMatch(/included=\{pdfIncluded\}/);
    expect(s).toMatch(/allowOverlap: pdfForce/);
    expect(s).toMatch(/recPreview\.openingMismatch/);
    for (const k of ['pdfTitle', 'pdfCheckOk', 'pdfCheckOff', 'pdfOverlap', 'pdfNoText', 'pdfForce', 'openingFromFile', 'openingUseFile', 'ERR_STATEMENT_PERIOD_EXISTS']) {
      expect((s.match(new RegExp('\\b' + k + ':', 'g')) || []).length, k).toBe(2);
    }
  });
  it('the grid can untick a line', () => {
    const m = read('src/components/ColumnMapper.jsx');
    expect(m).toMatch(/onIncluded && onIncluded\(included\.map/);
  });
});
