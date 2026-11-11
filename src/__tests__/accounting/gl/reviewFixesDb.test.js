/**
 * Review follow-ups in database.js: draft moves into closed periods, locked
 * reconciled lines, account archiving, recurring dates, business-use tax claim.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const db_ = require('../../../db/database.js');
const { glDraftEntry, glUpdateDraft, glPostEntry, bankTransactionUnmatch, bankTransactionCategorize,
  coaArchive, supplierBillPost, _computeNextRun } = db_;

let db;
beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db?.close(); db = null; });

const acct = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n);
const twoLines = () => [
  { account_id: acct('1010').id, debit_cents: 1000 },
  { account_id: acct('4010') ? acct('4010').id : acct('1400').id, credit_cents: 1000 },
];

describe('K12 glUpdateDraft period check', () => {
  it('refuses to move a draft into a closed period and follows the new period when open', () => {
    const { entryId } = glDraftEntry({ entry_date: '2026-03-10', description: 'x', lines: twoLines() }, db);
    glDraftEntry({ entry_date: '2026-02-10', description: 'seed', lines: twoLines() }, db);
    db.prepare(`UPDATE accounting_periods SET status='closed' WHERE start_date='2026-02-01'`).run();
    expect(() => glUpdateDraft(entryId, { entry_date: '2026-02-20', lines: twoLines() }, db)).toThrow('ERR_PERIOD_CLOSED_POST');
    glUpdateDraft(entryId, { entry_date: '2026-04-05', lines: twoLines() }, db);
    const e = db.prepare(`SELECT e.entry_date, p.start_date FROM journal_entries e JOIN accounting_periods p ON p.id=e.period_id WHERE e.id=?`).get(entryId);
    expect(e).toEqual({ entry_date: '2026-04-05', start_date: '2026-04-01' });
    expect(glPostEntry(entryId, db).entryNumber).toBeTruthy();
  });
});

describe('K13 reconciled lines are locked', () => {
  it('unmatch and categorize refuse a reconciled line', () => {
    const coa = acct('1010').id;
    const { lastInsertRowid: ba } = db.prepare(`INSERT INTO bank_accounts (name, currency, opening_balance, coa_account_id, opening_date) VALUES ('B','CAD',0,?,'2026-01-01')`).run(coa);
    const { lastInsertRowid: tx } = db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, match_status, reconciled) VALUES (?,'2026-01-05','x',-5,'manual',1)`).run(ba);
    expect(() => bankTransactionUnmatch(tx, db)).toThrow('ERR_TRANSACTION_RECONCILED');
    expect(() => bankTransactionCategorize(tx, coa, null, null, db)).toThrow('ERR_TRANSACTION_RECONCILED');
    db.prepare(`UPDATE bank_transactions SET reconciled=0 WHERE id=?`).run(tx);
    expect(bankTransactionUnmatch(tx, db)).toBe(true);
  });
});

describe('archiving an account in use', () => {
  it('refuses a balance, allows an empty account', () => {
    const { entryId } = glDraftEntry({ entry_date: '2026-03-10', description: 'x', lines: twoLines() }, db);
    glPostEntry(entryId, db);
    expect(() => coaArchive(acct('1010').id, db)).toThrow('ERR_COA_IN_USE');
    const empty = db.prepare(`SELECT id FROM chart_of_accounts WHERE id NOT IN (SELECT account_id FROM journal_lines) LIMIT 1`).get();
    expect(coaArchive(empty.id, db)).toBe(true);
  });
});

describe('recurring next run', () => {
  it('keeps the day of month and clamps short months', () => {
    expect(_computeNextRun('monthly', '2026-01-01', 1)).toBe('2026-02-01');
    expect(_computeNextRun('monthly', '2026-01-31', 31)).toBe('2026-02-28');
    expect(_computeNextRun('monthly', '2026-02-28', 31)).toBe('2026-03-31');
    expect(_computeNextRun('quarterly', '2026-01-01', null)).toBe('2026-04-01');
    expect(_computeNextRun('quarterly', '2026-11-30', null)).toBe('2027-02-28');
    expect(_computeNextRun('annual', '2024-02-29', null)).toBe('2025-02-28');
    expect(_computeNextRun('weekly', '2026-03-07', null)).toBe('2026-03-14');
  });
});

describe('business-use share of the tax claim', () => {
  function bill(pct) {
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO supplier_bills (supplier_name, month_key, bill_date, amount, tps_paid, tvq_paid, coa_account_id, business_use_pct)
       VALUES ('S','2026-03','2026-03-01',114.98,5,9.98,?,?)`).run(acct('5010') ? acct('5010').id : acct('1010').id, pct);
    return lastInsertRowid;
  }
  it('claims half the tax at 50% and none at 0%', () => {
    const half = supplierBillPost(bill(50), db);
    const g = db.prepare(`SELECT debit_cents d FROM journal_lines WHERE entry_id=? AND account_id=?`);
    expect(g.get(half.entryId, acct('1400').id).d).toBe(250);
    const zero = supplierBillPost(bill(0), db);
    expect(g.get(zero.entryId, acct('1400').id)).toBeUndefined();
  });
});
