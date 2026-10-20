/**
 * YE-001  fiscal year bounds for a year ending Oct 31 and Dec 31, Feb 28 included
 * YE-002  the year end is stored on the company and read back
 * YE-003  closing a year locks every month of it; reopening needs a reason
 * YE-004  the balance sheet shows this year's profit apart from earlier years'
 * YE-005  the bookkeeper's opening balances: one entry, the rest to retained earnings
 * YE-006  EBITDA adds interest, income tax and depreciation back to net income
 *
 * Figures are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const {
  fiscalYearBounds, fiscalYearEndGet, fiscalYearEndSet, fiscalYearList, fiscalYearClose, fiscalYearReopen,
  buildBalanceSheet, openingBalancesPreview, openingBalancesPost, incomeStatement, glDraftEntry, glPostEntry,
} = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [n, name, type] of [['1010', 'Bank', 'asset'], ['1100', 'AR', 'asset'], ['2010', 'AP', 'liability'], ['2400', 'Loans', 'liability'],
    ['3100', 'Retained earnings', 'equity'], ['3400', 'Opening equity', 'equity'], ['4000', 'Sales', 'revenue'],
    ['6420', 'Interest paid', 'expense'], ['6700', 'Depreciation', 'expense'], ['6100', 'Rent', 'expense']]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(n, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });
const id = (n) => db.prepare('SELECT id FROM chart_of_accounts WHERE account_number=?').get(n).id;
const post = (date, dr, cr, cents) => {
  const { entryId } = glDraftEntry({ entry_date: date, description: 'sample', source_type: 'manual', source_id: `${date}-${dr}-${cr}-${cents}-${Math.random()}`,
    lines: [{ account_id: id(dr), debit_cents: cents, credit_cents: 0 }, { account_id: id(cr), debit_cents: 0, credit_cents: cents }] }, db);
  glPostEntry(entryId, db);
  return entryId;
};

describe('YE-001 fiscal year bounds', () => {
  it('a year ending Oct 31 runs Nov 1 to Oct 31', () => {
    const oct = { month: 10, day: 31 };
    expect(fiscalYearBounds('2026-10-31', oct)).toEqual({ start: '2025-11-01', end: '2026-10-31' });
    expect(fiscalYearBounds('2026-11-01', oct)).toEqual({ start: '2026-11-01', end: '2027-10-31' });
    expect(fiscalYearBounds('2026-03-15', oct)).toEqual({ start: '2025-11-01', end: '2026-10-31' });
  });
  it('calendar years, and a February year end held at the 28th', () => {
    expect(fiscalYearBounds('2026-07-01', { month: 12, day: 31 })).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(fiscalYearBounds('2027-02-28', { month: 2, day: 29 })).toEqual({ start: '2026-03-01', end: '2027-02-28' });
  });
});

describe('YE-002 the year end setting', () => {
  it('is Dec 31 until set, then what was set; nonsense is refused', () => {
    expect(fiscalYearEndGet(db)).toMatchObject({ month: 12, day: 31, set: false });
    expect(fiscalYearEndSet({ month: 10, day: 31 }, db)).toMatchObject({ month: 10, day: 31, set: true });
    expect(() => fiscalYearEndSet({ month: 11, day: 31 }, db)).toThrow('ERR_FISCAL_YEAR_END_INVALID');
  });
});

describe('YE-003 closing a year', () => {
  it('locks every month of it, and posting there is refused until it is reopened', () => {
    fiscalYearEndSet({ month: 10, day: 31 }, db);
    post('2026-08-15', '1010', '4000', 100000);
    const years = fiscalYearList(db, '2026-11-20').years;
    expect(years.map(y => [y.start, y.end, y.ended])).toEqual([['2026-11-01', '2027-10-31', false], ['2025-11-01', '2026-10-31', true]]);
    const r = fiscalYearClose('2026-10-31', { today: '2026-11-20' }, db);
    expect(r).toMatchObject({ ok: true, netIncomeCents: 100000 });
    expect(() => post('2026-03-10', '1010', '4000', 500)).toThrow('ERR_PERIOD_CLOSED_POST');
    expect(fiscalYearList(db, '2026-11-20').years[1].status).toBe('closed');
    expect(() => fiscalYearReopen('2026-10-31', '', db)).toThrow('ERR_REOPEN_REASON_REQUIRED');
    fiscalYearReopen('2026-10-31', 'Bookkeeper adjustment', db);
    expect(() => post('2026-03-10', '1010', '4000', 500)).not.toThrow();
  });
  it('names what is in the way, and refuses a date that is not a year end', () => {
    fiscalYearEndSet({ month: 10, day: 31 }, db);
    const acct = db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Bank','bank',?,0,'2026-01-01')`).run(id('1010')).lastInsertRowid;
    db.prepare(`INSERT INTO bank_statements (bank_account_id, period_start, period_end, ending_balance) VALUES (?, '2026-09-01', '2026-09-30', 0)`).run(acct);
    const r = fiscalYearClose('2026-10-31', { today: '2026-11-20' }, db);
    expect(r.ok).toBe(false);
    expect(r.blockers[0].code).toBe('statements_open');
    expect(fiscalYearClose('2026-10-31', { force: true, today: '2026-11-20' }, db).ok).toBe(true);
    expect(() => fiscalYearClose('2026-09-30', { today: '2026-11-20' }, db)).toThrow('ERR_NOT_A_FISCAL_YEAR_END');
  });
});

describe('YE-004 the balance sheet', () => {
  it("shows this year's profit apart from earlier years', and still balances", () => {
    fiscalYearEndSet({ month: 10, day: 31 }, db);
    post('2026-08-15', '1010', '4000', 100000);   // last year
    post('2026-09-10', '6100', '1010', 30000);
    post('2026-11-15', '1010', '4000', 50000);   // this year
    const b = buildBalanceSheet('2026-11-30', { _db: db });
    expect(b.sections.equity).toMatchObject({ retainedEarlier: 700, netIncome: 500, fiscalYearStart: '2026-11-01' });
    expect(b.isBalanced).toBe(true);
  });
});

describe("YE-005 the bookkeeper's opening balances", () => {
  it('moves each account the difference, clears opening equity, and puts the rest in retained earnings', () => {
    post('2026-08-01', '1010', '3400', 1000000);   // the side-by-side starting position
    post('2026-09-01', '1010', '4000', 200000);
    // His statements at Oct 31: bank 12,500, a loan of 1,000; equity is what is left.
    const pre = openingBalancesPreview('2026-10-31', { '1010': 12500, '2400': 1000 }, db);
    const row = (n) => pre.rows.find(r => r.accountNumber === n);
    expect(row('1010')).toMatchObject({ haveCents: 1200000, wantCents: 1250000 });
    expect(row('3400')).toMatchObject({ haveCents: 1000000, wantCents: 0 });
    expect(pre.retainedEarningsAfterCents).toBe(1150000);   // 12,500 of assets less 1,000 of loan
    const r = openingBalancesPost('2026-10-31', { '1010': 12500, '2400': 1000 }, db);
    expect(r.ok).toBe(true);
    const bal = (n) => db.prepare(`SELECT COALESCE(SUM(debit_cents)-SUM(credit_cents),0) b FROM journal_lines WHERE account_id=?`).get(id(n)).b;
    expect([bal('1010'), bal('2400'), bal('3400')]).toEqual([1250000, -100000, 0]);
    expect(buildBalanceSheet('2026-10-31', { _db: db }).isBalanced).toBe(true);
    // Run again with the same figures: nothing left to adjust.
    expect(openingBalancesPost('2026-10-31', { '1010': 12500, '2400': 1000 }, db).nothingToDo).toBe(true);
  });
});

describe('YE-006 EBITDA', () => {
  it('adds interest and depreciation back to net income', () => {
    post('2026-09-01', '1010', '4000', 1000000);
    post('2026-09-02', '6100', '1010', 300000);
    post('2026-09-03', '6420', '1010', 20000);
    post('2026-09-04', '6700', '1010', 50000);
    const r = incomeStatement('2026-09-01', '2026-09-30', { _db: db });
    expect(r.netIncomeCents).toBe(630000);
    expect(r).toMatchObject({ interestCents: 20000, depreciationCents: 50000, incomeTaxCents: 0, ebitdaCents: 700000 });
  });
});

describe('YE-007 the screens', () => {
  it('Books has a Year end tab, the income statement shows EBITDA, the balance sheet the split', () => {
    const gl = fs.readFileSync(path.join(ROOT, 'src/components/GrandLivreTab.jsx'), 'utf8');
    expect(gl).toMatch(/\['yearend', t\.tabYearEnd\]/);
    expect(gl).toMatch(/totalRow\(t\.isEbitda, data\.ebitdaCents/);
    expect(fs.readFileSync(path.join(ROOT, 'src/components/BilanTab.jsx'), 'utf8')).toMatch(/L\.retainedEarlier/);
    expect(fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8')).toMatch(/ledger:fiscalYear:close/);
  });
});
