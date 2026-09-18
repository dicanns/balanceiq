/**
 * FAILSAFE-001  the chart of accounts reads the columns the operator named
 * FAILSAFE-002  it takes the operator's answer about a title row
 * FAILSAFE-003  a chart of accounts is guessed well enough to start from
 * FAILSAFE-004  a spreadsheet's title row is told apart from data
 * FAILSAFE-005  the mapping grid is one component, used by every import screen
 * FAILSAFE-006  the role map survives the trip to a saved map and back
 *
 * Every import that reads a file column by column has to be correctable by
 * hand, because some file will always be read wrongly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { inferCoaColumns, looksLikeSheetHeader } from '../../../utils/importParse.mjs';
import { rolesFromMap, mapFromRoles, columnTitles } from '../../../components/ColumnMapper.jsx';

const require = createRequire(import.meta.url);
const { coaImportCSV } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let db;
beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db?.close(); db = null; });
const acct = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

describe('FAILSAFE-001 a chart of accounts in another column order', () => {
  it('imports when the operator says which column is which', () => {
    // Type first, then name, then number: nothing like this app's own export.
    const csv = 'expense,Loyer atelier,7910\nrevenue,Redevances,7920\n';
    const blind = coaImportCSV(csv, db);
    expect(blind.created).toBe(0);
    expect(blind.errors.length).toBe(2);

    const r = coaImportCSV(csv, db, { hasHeader: false, type: 0, name_fr: 1, account_number: 2 });
    expect(r.created).toBe(2);
    expect(acct('7910')).toMatchObject({ name_fr: 'Loyer atelier', type: 'expense' });
    expect(acct('7920')).toMatchObject({ name_fr: 'Redevances', type: 'revenue' });
    // No English name given, so the French one stands in rather than going blank.
    expect(acct('7910').name_en).toBe('Loyer atelier');
  });
});

describe('FAILSAFE-002 the title row answer', () => {
  it('imports a first line the app would have taken for titles', () => {
    const csv = 'Type,Nom,Numero\nexpense,Loyer atelier,7910\n';
    expect(coaImportCSV(csv, db, { hasHeader: true, type: 0, name_fr: 1, account_number: 2 }).created).toBe(1);
    expect(acct('7910')).toBeTruthy();
  });
  it('and keeps a first line the app would have thrown away', () => {
    const csv = 'Type,Nom,7910\nexpense,Loyer atelier,7911\n';
    const r = coaImportCSV(csv, db, { hasHeader: false, type: 0, name_fr: 1, account_number: 2 });
    expect(r.created).toBe(1);   // "Type" is not a known account type, so that line is refused
    expect(r.errors.length).toBe(1);
    expect(acct('7911')).toBeTruthy();
  });
});

describe('FAILSAFE-003 the starting guess', () => {
  it('finds the number, the names and the type wherever they sit', () => {
    expect(inferCoaColumns([['4100', 'Ventes', 'Sales', 'revenue', 'both']]))
      .toEqual({ account_number: 0, name_fr: 1, name_en: 2, type: 3, tax_hint: 4 });
    expect(inferCoaColumns([['revenue', 'Ventes de gros', '4100'], ['expense', 'Loyer', '6200']]))
      .toMatchObject({ type: 0, name_fr: 1, account_number: 2 });
  });
  it('believes a column title over the values', () => {
    const rows = [['Ventes', '4100', 'revenue']];
    expect(inferCoaColumns(rows, ['name_fr', 'account_number', 'type']))
      .toMatchObject({ name_fr: 0, account_number: 1, type: 2 });
  });
});

describe('FAILSAFE-004 a spreadsheet title row', () => {
  it('is text above numbers, not merely text', () => {
    expect(looksLikeSheetHeader([['Product', 'Sold'], ['Mayo 1L', '12'], ['Mayo 4L', '7']])).toBe(true);
    // Every column text all the way down: a name column proves nothing.
    expect(looksLikeSheetHeader([['Mayo 1L', 'a'], ['Mayo 4L', 'b']])).toBe(false);
    // Numbers in the first row: it is data.
    expect(looksLikeSheetHeader([['Mayo 1L', '12'], ['Mayo 4L', '7']])).toBe(false);
    expect(looksLikeSheetHeader([['Product', 'Sold']])).toBe(false);
  });
});

describe('FAILSAFE-005 one grid, every import screen', () => {
  const MAPPER = read('src/components/ColumnMapper.jsx');
  it('holds the grid, the title-row question and the reads-as line', () => {
    expect(MAPPER).toMatch(/<select/);
    expect(MAPPER).toMatch(/onHasHeader/);
    expect(MAPPER).toMatch(/labels\.readsAs/);
    expect(MAPPER).toMatch(/warnings/);
  });
  it('is what the bank statement import uses', () => {
    const s = read('src/components/BanqueTab.jsx');
    expect(s).toMatch(/import ColumnMapper, \{ rolesFromMap, mapFromRoles \} from '\.\/ColumnMapper\.jsx'/);
    expect(s).toMatch(/<ColumnMapper/);
    expect(s).toMatch(/disabled=\{!importFile \|\| importing \|\| !mapReady\(\)\}/);
    expect(s).not.toMatch(/const ROLES = \[/);   // the local copy is gone
  });
  it('is what the chart of accounts import uses', () => {
    const s = read('src/components/ChartOfAccountsTab.jsx');
    expect(s).toMatch(/<ColumnMapper/);
    expect(s).toMatch(/window\.api\.coa\.importCSV\(importText, mapFromRoles\(mapRoles, mapHasHeader, COA_ROLE_KEYS\)\)/);
    expect(s).toMatch(/const mapReady = \(\) => mapRoles\.includes\('account_number'\)/);
    // The map reaches the database function through the bridge.
    expect(read('preload.js')).toMatch(/coa:importCSV', csv, map/);
    expect(read('main.js')).toMatch(/coaImportCSV\(csv, undefined, columnMap\)/);
  });
  it('and both remaining imports can be told there is no title row', () => {
    const prev = read('src/components/PrevisionsTab.jsx');
    expect(prev).toMatch(/looksLikeSheetHeader/);
    expect(prev).toMatch(/\{T\.prevImportHasHeader\}/);
    expect(prev).toMatch(/applyHeader\(sheet,h,columns\)/);
    const app = read('src/App.jsx');
    expect(app).toMatch(/\{T\.csvHasHeader\}/);
    expect(app).toMatch(/applyCsvHeader\(e\.target\.checked\)/);
    expect(app).toMatch(/\{T\.csvWrongColumns\}/);   // a way back from a wrong guess
    const i18n = read('src/i18n/translations.js');
    for (const k of ['csvHasHeader', 'csvWrongColumns', 'csvDateCol', 'prevImportHasHeader']) {
      expect((i18n.match(new RegExp('^  ' + k + ':', 'gm')) || []).length, k).toBe(2);
    }
  });
});

describe('FAILSAFE-006 the role map round trip', () => {
  const keys = ['date', 'amount', 'balance'];
  it('turns columns into a map and back unchanged', () => {
    const roles = ['date', 'ignore', 'amount', 'balance'];
    const map = mapFromRoles(roles, true, keys);
    expect(map).toEqual({ hasHeader: true, date: 0, amount: 2, balance: 3 });
    expect(rolesFromMap(map, 4, keys)).toEqual(roles);
  });
  it('ignores a saved column the file does not have', () => {
    expect(rolesFromMap({ date: 0, amount: 9 }, 3, keys)).toEqual(['date', 'ignore', 'ignore']);
  });
  it('names columns by position for a file with no titles', () => {
    expect(columnTitles(3)).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(columnTitles(2, 'Colonne')).toEqual(['Colonne 1', 'Colonne 2']);
  });
});
