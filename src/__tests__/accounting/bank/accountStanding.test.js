/**
 * STAND-001  each account's statement cycle, and the periods it has missed
 * STAND-002  one word for where an account stands, most pressing first
 * STAND-003  Today names a statement period that ended and was never imported
 * STAND-004  the Accounts tab shows it on every account, with a summary
 *
 * An account with nothing open looked up to date even when a whole month had
 * ended and never been imported: nothing on screen said so.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { buildWorklist } from '../../../services/todayWorklist.js';

const require = createRequire(import.meta.url);
const { _periodsDue, bankReconciliationStatus, bankStatementImport } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

describe('STAND-001 the cycle', () => {
  it('a card closing on the 5th runs the 6th to the 5th', () => {
    expect(_periodsDue('2026-08-05', '2026-09-18')).toEqual([{ periodStart: '2026-08-06', periodEnd: '2026-09-05' }]);
    expect(_periodsDue('2026-08-05', '2026-09-05')).toEqual([]);          // ends today: not over yet
    expect(_periodsDue('2026-06-05', '2026-09-18').map(p => p.periodEnd)).toEqual(['2026-07-05', '2026-08-05', '2026-09-05']);
  });
  it('a month-end statement stays at month end, February included', () => {
    expect(_periodsDue('2026-01-31', '2026-04-01')).toEqual([
      { periodStart: '2026-02-01', periodEnd: '2026-02-28' },
      { periodStart: '2026-03-01', periodEnd: '2026-03-31' },
    ]);
  });
  it('a day that some months lack is held at their last day, and the year turns', () => {
    expect(_periodsDue('2026-12-30', '2027-03-01').map(p => p.periodEnd)).toEqual(['2027-01-30', '2027-02-28']);
  });
  it('nothing to go on, nothing due', () => {
    expect(_periodsDue(null, '2026-09-18')).toEqual([]);
  });
});

let db;
beforeEach(() => {
  db = buildAccountingDb();
  db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('2210','Carte','Card','liability')`).run();
});
afterEach(() => { db?.close(); db = null; });
const card = (name) => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
   VALUES (?, 'credit_card', (SELECT id FROM chart_of_accounts WHERE account_number='2210'), 0, '2026-07-01')`
).run(name).lastInsertRowid;
const importMonth = (id, start, end, csv) => bankStatementImport({ bankAccountId: id, fileText: csv, fileName: `${start}.csv`, fileType: 'csv', periodStart: start, periodEnd: end, endingBalance: -10 }, db);
const stateOf = (id, today) => bankReconciliationStatus(db, today).find(a => a.accountId === id);

describe('STAND-002 where an account stands', () => {
  it('no statements, in progress, to import, up to date', () => {
    const id = card('Sample Card');
    expect(stateOf(id, '2026-09-18').state).toBe('no_statements');

    const { statementId } = importMonth(id, '2026-07-06', '2026-08-05', '07/10/2026,SAMPLE CAFE,10.00\n');
    expect(stateOf(id, '2026-09-18').state).toBe('in_progress');      // a line still to categorize

    db.prepare(`UPDATE bank_statements SET reconciled=1 WHERE id=?`).run(statementId);
    const s = stateOf(id, '2026-09-18');
    expect(s.state).toBe('to_import');
    expect(s.due).toEqual([{ periodStart: '2026-08-06', periodEnd: '2026-09-05' }]);

    expect(stateOf(id, '2026-08-20').state).toBe('up_to_date');        // the next period has not ended
  });
});

describe('STAND-003 Today', () => {
  it('names the period to import, and nothing for an account up to date', () => {
    const items = buildWorklist({
      lang: 'en', now: new Date('2026-09-18T12:00:00'),
      reconcile: [
        { accountId: 5, name: 'Sample TD', state: 'to_import', due: [{ periodStart: '2026-08-06', periodEnd: '2026-09-05' }] },
        { accountId: 4, name: 'Sample Amex', state: 'up_to_date', due: [] },
      ],
    }).filter(i => String(i.id).startsWith('import-'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'import-5-2026-09-05', title: 'Import Sample TD: 2026-08-06 to 2026-09-05' });
  });
});

describe('STAND-004 the Accounts tab', () => {
  const s = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
  it('loads the status there, shows it per account and sums it up', () => {
    expect(s).toMatch(/if \(subTab === 'comptes'\) loadRecStatus\(\)/);
    expect(s).toMatch(/st\.state === 'to_import' \? \{ text: T\.acctToImport/);
    expect(s).toMatch(/T\.acctSummary\(done, recStatus\.length\)/);
    for (const k of ['acctUpToDate', 'acctToImport', 'acctInProgress', 'acctReady', 'acctNoStatements', 'acctSummary']) {
      expect((s.match(new RegExp('\\b' + k + ':', 'g')) || []).length, k).toBe(2);
    }
  });
});
