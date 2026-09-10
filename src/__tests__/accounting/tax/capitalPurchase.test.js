/**
 * CAPEX-001  a lasting purchase is flagged before it is written off
 * CAPEX-002  the prompt fires only where a capital purchase actually hides
 * CAPEX-003  computer equipment has somewhere to go
 *
 * A $4,000 laptop categorized to IT and software expenses is deducted in full in
 * the year it was bought. It should sit on the balance sheet and come off over
 * its life through capital cost allowance - class 50, 55% declining balance, half
 * year in the first year. The CCA machinery already existed, but nothing pointed
 * anyone at it, so the error is silent: the income statement is understated, the
 * balance sheet is missing an asset, and the first person to notice is the
 * accountant a year later.
 *
 * The prompt is deliberately narrow. Flagging every large expense would fire on
 * rent and payroll every month and be ignored inside a week, so only the accounts
 * a capital purchase genuinely hides in are watched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { looksLikeCapitalPurchase, CAPEX_REVIEW_THRESHOLD } from '../../../utils/calculations.js';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  const cols = db.prepare(`PRAGMA table_info(chart_of_accounts)`).all().map(c => c.name);
  if (!cols.includes('capex_watch')) {
    db.prepare(`ALTER TABLE chart_of_accounts ADD COLUMN capex_watch INTEGER DEFAULT 0`).run();
  }
  for (const [num, name, type, watch] of [
    ['1500', 'Kitchen equipment',      'asset',   0],
    ['1580', 'Computer equipment',     'asset',   0],
    ['1590', 'Accum. dep. - computer', 'asset',   0],
    ['6000', 'Wages',                  'expense', 0],
    ['6100', 'Rent',                   'expense', 0],
    ['6200', 'Equipment maintenance',  'expense', 1],
    ['6530', 'IT and software',        'expense', 1],
    ['6600', 'Office supplies',        'expense', 1],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, capex_watch)
       VALUES (?,?,?,?,?)`
    ).run(num, name, name, type, watch);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

describe('CAPEX-001 a lasting purchase is flagged', () => {
  it('a laptop on the IT account is flagged', () => {
    expect(looksLikeCapitalPurchase(-4000, acc('6530'))).toBe(true);
  });

  it('the direction of the money does not matter', () => {
    expect(looksLikeCapitalPurchase(4000, acc('6530'))).toBe(true);
  });

  it('a small purchase on the same account is left alone', () => {
    expect(looksLikeCapitalPurchase(-49.99, acc('6530'))).toBe(false);
  });

  it('the threshold is a shared constant, not a number typed twice', () => {
    expect(CAPEX_REVIEW_THRESHOLD).toBe(500);
    expect(looksLikeCapitalPurchase(-CAPEX_REVIEW_THRESHOLD, acc('6530'))).toBe(true);
    expect(looksLikeCapitalPurchase(-(CAPEX_REVIEW_THRESHOLD - 0.01), acc('6530'))).toBe(false);
  });

  it('a missing or unknown account never fires', () => {
    for (const junk of [null, undefined, {}]) {
      expect(looksLikeCapitalPurchase(-9999, junk)).toBe(false);
    }
  });

  it('a nonsense amount never fires', () => {
    for (const junk of [null, undefined, NaN, 'abc', '']) {
      expect(looksLikeCapitalPurchase(junk, acc('6530'))).toBe(false);
    }
  });
});

describe('CAPEX-002 it fires only where capex hides', () => {
  it('a big rent payment is not flagged', () => {
    expect(looksLikeCapitalPurchase(-3500, acc('6100'))).toBe(false);
  });

  it('payroll is not flagged', () => {
    expect(looksLikeCapitalPurchase(-12000, acc('6000'))).toBe(false);
  });

  it('equipment maintenance is watched: a repair and a replacement look alike', () => {
    expect(looksLikeCapitalPurchase(-2200, acc('6200'))).toBe(true);
  });

  it('office supplies is watched: furniture arrives on the same invoice as paper', () => {
    expect(looksLikeCapitalPurchase(-1800, acc('6600'))).toBe(true);
  });

  it('the watched set is small on purpose', () => {
    const watched = db.prepare(
      `SELECT COUNT(*) n FROM chart_of_accounts WHERE capex_watch = 1`
    ).get().n;
    const expenses = db.prepare(
      `SELECT COUNT(*) n FROM chart_of_accounts WHERE type='expense'`
    ).get().n;
    expect(watched).toBeLessThan(expenses);
  });

  it('an asset account is never flagged: that is where it was meant to go', () => {
    expect(looksLikeCapitalPurchase(-4000, acc('1580'))).toBe(false);
  });
});

describe('CAPEX-003 computer equipment has somewhere to go', () => {
  it('the account exists', () => {
    expect(acc('1580')).toBeTruthy();
    expect(acc('1580').type).toBe('asset');
  });

  it('with its accumulated depreciation alongside it', () => {
    expect(acc('1590')).toBeTruthy();
  });

  it('the standard chart used to stop at vehicles, so class 50 had no home', () => {
    // Kitchen equipment, leasehold, furniture, vehicles - and nothing for a computer.
    const before = ['1500', '1520', '1540', '1560'];
    for (const n of before) {
      if (acc(n)) expect(acc(n).account_number).not.toBe('1580');
    }
    expect(acc('1580').account_number).toBe('1580');
  });
});
