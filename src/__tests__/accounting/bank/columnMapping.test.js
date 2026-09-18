/**
 * MAPCOL-001  a mapping set by hand decides the columns, whatever the file looks like
 * MAPCOL-002  it is remembered for the account and used by the next file
 * MAPCOL-003  the operator's answer about the header row wins over the guess
 * MAPCOL-004  a mapping can rescue a file the app reads wrongly on its own
 * MAPCOL-005  the import screen offers the grid, gated until it can work
 *
 * However well a file is read on its own, some file will be read wrongly. The
 * operator has to be able to say which column is which, once per account.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const { bankStatementImport, parseBankCsvFile } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

// A file the app cannot read on its own: two date-looking columns, the amount
// after the balance, no header. Posted date first, transaction date second.
const AWKWARD = [
  '07/27/2026,07/25/2026,SAMPLE CAFE,301.24,19.50',
  '07/24/2026,07/23/2026,SAMPLE CORNER STORE,281.74,4.00',
].join('\n') + '\n';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('2210','Carte','Card','liability')`).run();
});
afterEach(() => { db?.close(); db = null; });
const account = () => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
   VALUES ('Visa','credit_card',(SELECT id FROM chart_of_accounts WHERE account_number='2210'),0,'2026-07-01')`
).run().lastInsertRowid;

describe('MAPCOL-001 a mapping decides', () => {
  it('reads the columns the operator named, not the ones guessed', () => {
    // By hand: the second date column is the transaction date, column 4 the amount.
    const map = { hasHeader: false, date: 1, description: 2, balance: 3, amount: 4 };
    const parsed = parseBankCsvFile(AWKWARD, map);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ transaction_date: '2026-07-25', description: 'SAMPLE CAFE', amount: 19.5, running_balance: 301.24 });
  });
});

describe('MAPCOL-002 remembered per account', () => {
  it('is saved on import and applied to the next file with no answering again', () => {
    const id = account();
    const map = { hasHeader: false, date: 1, description: 2, balance: 3, amount: 4 };
    bankStatementImport({ bankAccountId: id, fileText: AWKWARD, fileName: 'a.csv', fileType: 'csv', columnMap: map }, db);
    expect(JSON.parse(db.prepare(`SELECT csv_column_map FROM bank_accounts WHERE id=?`).get(id).csv_column_map)).toEqual(map);

    // A card export writes charges positive, so the stored amounts are money out.
    expect(db.prepare(`SELECT amount FROM bank_transactions ORDER BY transaction_date DESC`).all().map(r => r.amount)).toEqual([-19.5, -4]);

    const next = '07/30/2026,07/29/2026,SAMPLE CAFE,320.74,39.50\n';
    const r = bankStatementImport({ bankAccountId: id, fileText: next, fileName: 'b.csv', fileType: 'csv' }, db);
    expect(r.rowCount).toBe(1);
    expect(db.prepare(`SELECT transaction_date, amount FROM bank_transactions WHERE bank_statement_id=?`).get(r.statementId))
      .toEqual({ transaction_date: '2026-07-29', amount: -39.5 });
  });
});

describe('MAPCOL-003 the header answer', () => {
  it('is taken from the operator, both ways', () => {
    // A header the guess would take for data, because it starts with a date.
    const odd = '01/01/2026 opening,Description,Amount\n07/24/2026,SAMPLE CAFE,19.50\n';
    expect(parseBankCsvFile(odd, { hasHeader: true, date: 0, description: 1, amount: 2 }).rows).toHaveLength(1);
    // And a data row the guess would take for a header, if the operator says so.
    const headerless = '07/24/2026,SAMPLE CAFE,19.50\n';
    expect(parseBankCsvFile(headerless, { hasHeader: false, date: 0, description: 1, amount: 2 }).rows).toHaveLength(1);
    expect(parseBankCsvFile(headerless, { hasHeader: true, date: 0, description: 1, amount: 2 }).rows).toHaveLength(0);
  });
});

describe('MAPCOL-004 rescuing a file read wrongly', () => {
  it('what the app guesses badly, a mapping fixes', () => {
    // Left alone, the posted date and the balance column are picked.
    const guessed = parseBankCsvFile(AWKWARD, null);
    expect(guessed.rows[0].transaction_date).toBe('2026-07-27');
    const fixed = parseBankCsvFile(AWKWARD, { hasHeader: false, date: 1, description: 2, amount: 4, balance: 3 });
    expect(fixed.rows[0].transaction_date).toBe('2026-07-25');
  });
});

describe('MAPCOL-005 the import screen', () => {
  it('shows the grid, previews the first row, and refuses to import without date and amount', () => {
    const BANQUE = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
    expect(BANQUE).toMatch(/title: T\.mapTitle/);
    expect(BANQUE).toMatch(/const mapReady = \(\) =>/);
    expect(BANQUE).toMatch(/disabled=\{!importFile \|\| importing \|\| !mapReady\(\)/);
    expect(BANQUE).toMatch(/readsAs: T\.mapReadsAs/);
    expect(BANQUE).toMatch(/columnMap: mapLines\.length \? mapFromRoles\(mapRoles, mapHasHeader, ROLE_KEYS\) : undefined/);
    expect(BANQUE).toMatch(/prepareMapping\(f, importAccountId\)/);
    // Both languages carry every role label.
    for (const k of ['roleIgnore', 'roleDate', 'roleDesc', 'roleAmount', 'roleDebit', 'roleCredit', 'roleBalance', 'mapHasHeader', 'mapNeedDate']) {
      expect((BANQUE.match(new RegExp(k + ':', 'g')) || []).length, k).toBe(2);
    }
  });
});
