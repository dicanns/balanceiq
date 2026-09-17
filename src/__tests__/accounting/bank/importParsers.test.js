/**
 * IMPORT-001  one reader for dates, amounts and CSV lines, shared by every import
 * IMPORT-002  OFX: comma decimals, entities, a bad date refused, all-zero refused
 * IMPORT-003  identical rows in one statement are kept; rows already in the books are not doubled
 * IMPORT-004  a chart of accounts with commas in names, semicolons, a BOM, an unknown type
 * IMPORT-005  the delivery payout and forecast imports read through the shared module
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';
import {
  parseCsvRecords, splitCsvLine, detectDelimiter, normalizeStatementDate, detectNumericDateOrder,
  parseStatementAmount, decodeXmlEntities,
} from '../../../utils/importParse.mjs';

const require = createRequire(import.meta.url);
const { bankStatementImport, coaImportCSV } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

describe('IMPORT-001 the shared readers', () => {
  it('dates', () => {
    for (const [raw, want] of [
      ['02 Aug 2026', '2026-08-02'], ['2 août 2026', '2026-08-02'], ['12 déc. 2026', '2026-12-12'], ['3 févr. 2026', '2026-02-03'],
      ['Aug 2, 2026', '2026-08-02'], ['20260802', '2026-08-02'], ['20260802120000[-5:EST]', '2026-08-02'], ['2026/8/2', '2026-08-02'],
      ['08/02/2026', '2026-08-02'], ['2026-08-02T14:30:00Z', '2026-08-02'],
    ]) expect(normalizeStatementDate(raw), raw).toBe(want);
    expect(normalizeStatementDate('02/08/2026', 'dmy')).toBe('2026-08-02');
    expect(normalizeStatementDate('30 Feb 2026')).toBeNull();
    expect(detectNumericDateOrder(['01/02/2026', '25/02/2026'])).toBe('dmy');
    expect(detectNumericDateOrder(['02/25/2026'])).toBe('mdy');
  });

  it('amounts', () => {
    for (const [raw, want] of [
      ['12.50', 12.5], ['12,50', 12.5], ['-12,50', -12.5], ['1 234,56', 1234.56], ['1,234.56', 1234.56], ['$1,234.56', 1234.56],
      ['(55.00)', -55], ['55.00-', -55], ['+12.50', 12.5], ['1.234,56', 1234.56],
    ]) expect(parseStatementAmount(raw), raw).toBe(want);
    expect(parseStatementAmount('')).toBeNull();
    expect(parseStatementAmount('n/a')).toBeNull();
  });

  it('CSV lines', () => {
    expect(splitCsvLine('a,"b, c","say ""hi"""', ',')).toEqual(['a', 'b, c', 'say "hi"']);
    expect(detectDelimiter('Date;Montant;Libellé')).toBe(';');
    expect(detectDelimiter('Date\tAmount')).toBe('\t');
    expect(parseCsvRecords('﻿Date,Amount\n\n2026-08-01,5\n')).toMatchObject({ headers: ['Date', 'Amount'], rows: [['2026-08-01', '5']] });
    expect(decodeXmlEntities('A&amp;W &#39;GO&#39;')).toBe("A&W 'GO'");
  });
});

describe('IMPORT-002..004 into the books', () => {
  let db;
  beforeEach(() => {
    db = buildAccountingDb();
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('1010','Encaisse','Cash','asset')`).run();
  });
  afterEach(() => { db?.close(); db = null; });
  const bank = () => db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
     VALUES ('Chequing','bank',(SELECT id FROM chart_of_accounts WHERE account_number='1010'),0,'2026-01-01')`
  ).run().lastInsertRowid;
  const ofx = (txs) => `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>${txs.map(([d, a, n]) =>
    `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${d}<TRNAMT>${a}<NAME>${n}</STMTTRN>`).join('')}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it('IMPORT-002 OFX reads comma decimals and entities, refuses a bad date or no amounts', () => {
    const id = bank();
    bankStatementImport({ bankAccountId: id, fileText: ofx([['20260801120000', '-12,50', 'A&amp;W']]), fileName: 'a.ofx', fileType: 'ofx' }, db);
    expect(db.prepare(`SELECT amount, description, transaction_date FROM bank_transactions`).get())
      .toEqual({ amount: -12.5, description: 'A&W', transaction_date: '2026-08-01' });
    expect(() => bankStatementImport({ bankAccountId: id, fileText: ofx([['2026ABCD', '-1.00', 'X']]), fileName: 'b.ofx', fileType: 'ofx' }, db)).toThrow(/ERR_CSV_DATE/);
    expect(() => bankStatementImport({ bankAccountId: id, fileText: ofx([['20260802', '', 'Y']]), fileName: 'c.ofx', fileType: 'ofx' }, db)).toThrow(/ERR_CSV_NO_AMOUNTS/);
  });

  it('IMPORT-003 two identical coffees stay two; an overlapping statement adds only what is new', () => {
    const id = bank();
    const july = 'Date,Description,Amount\n2026-07-30,SAMPLE COFFEE,-7.08\n2026-07-30,SAMPLE COFFEE,-7.08\n2026-07-31,RENT,-1200.00\n';
    const r1 = bankStatementImport({ bankAccountId: id, fileText: july, fileName: 'july.csv', fileType: 'csv' }, db);
    expect(r1).toMatchObject({ rowCount: 3, duplicateRows: 0 });
    // The next export overlaps the last days of July and adds one more coffee.
    const overlap = 'Date,Description,Amount\n2026-07-30,SAMPLE COFFEE,-7.08\n2026-07-30,SAMPLE COFFEE,-7.08\n2026-07-30,SAMPLE COFFEE,-7.08\n2026-08-01,HYDRO,-90.00\n';
    const r2 = bankStatementImport({ bankAccountId: id, fileText: overlap, fileName: 'aug.csv', fileType: 'csv' }, db);
    expect(r2).toMatchObject({ rowCount: 2, duplicateRows: 2 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM bank_transactions WHERE description='SAMPLE COFFEE'`).get().n).toBe(3);
  });

  it('IMPORT-004 chart of accounts', () => {
    // 79xx: numbers the default chart does not seed, so each row is a real insert.
    const csv = '﻿account_number;name_fr;name_en;type;tax_hint\n7910;"Repas; représentation";Meals;expense;\n7920;Cadeaux;Gifts;EXPENSE;\n7930;Divers;Misc;expenses;\n;Vide;Empty;expense;\n';
    const r = coaImportCSV(csv, db);
    expect(r.created).toBe(2);
    expect(r.errors.join(' ')).toMatch(/7930: type inconnu "expenses"/);
    expect(db.prepare(`SELECT name_fr, type FROM chart_of_accounts WHERE account_number='7910'`).get()).toEqual({ name_fr: 'Repas; représentation', type: 'expense' });
    const commas = coaImportCSV('account_number,name_fr,name_en,type\n7940,"Frais, bancaires",Bank fees,expense\n', db);
    expect(commas.created).toBe(1);
    expect(db.prepare(`SELECT name_fr FROM chart_of_accounts WHERE account_number='7940'`).get().name_fr).toBe('Frais, bancaires');
  });
});

describe('IMPORT-005 every import reads through the shared module', () => {
  it('delivery payouts and forecast sales', () => {
    const APP = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
    const PREV = fs.readFileSync(path.join(ROOT, 'src/components/PrevisionsTab.jsx'), 'utf8');
    const DB = fs.readFileSync(path.join(ROOT, 'src/db/database.js'), 'utf8');
    expect(APP).toMatch(/from "\.\/utils\/importParse\.mjs"/);
    expect(APP).not.toMatch(/sanitizeCSVCell\(cur/);
    expect(APP).toMatch(/const order=detectNumericDateOrder\(src\.rows\.map\(r=>r\[dc\]\)\)/);
    expect(PREV).toMatch(/from '\.\.\/utils\/importParse\.mjs'/);
    expect(PREV).not.toMatch(/date\.substring\(0,10\)/);
    expect(PREV).toMatch(/if \(badDates\.length\) \{/);
    expect(DB).toMatch(/require\('\.\.\/utils\/importParse\.mjs'\)/);
    expect(DB).not.toMatch(/line\.split\(','\)/);
    expect(DB).not.toMatch(/parseFloat\(get\('TRNAMT'\)\)/);
  });
});
