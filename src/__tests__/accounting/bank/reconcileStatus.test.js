/**
 * RECST-001  every account's standing is reported, not hidden behind a picker
 * RECST-002  what blocks a close is named: no balance, lines left, a variance
 * RECST-003  a month already ended and still open becomes a Today reminder
 * RECST-004  the month in progress is not nagged about, and a closed one disappears
 * RECST-005  the screen shows the Close button with its reason instead of hiding it
 *
 * Reconciling meant remembering to pick each account from a dropdown, and the
 * Close button was hidden whenever the variance was not zero - so a statement
 * sat at "open" with nothing saying why it could not be closed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { buildWorklist } from '../../../services/todayWorklist.js';

const require = createRequire(import.meta.url);
const {
  bankStatementImport, bankStatementUpdate, bankReconciliationStatus, bankReconcileClose,
} = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');

const CARD_CSV = 'Date,Description,Amount\n2026-07-10,SAMPLE SUPPLIER,679.18\n2026-07-25,PAYMENT RECEIVED,-500.00\n';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [['1010', 'Encaisse', 'asset'], ['2210', 'Carte', 'liability']]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const account = (name, type = 'credit_card', coa = '2210') => db.prepare(
  `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
   VALUES (?, ?, (SELECT id FROM chart_of_accounts WHERE account_number=?), 0, '2026-07-01')`
).run(name, type, coa).lastInsertRowid;
const markCounted = (id) => db.prepare(`UPDATE bank_transactions SET match_status='manual' WHERE bank_account_id=?`).run(id);

describe('RECST-001/002 what each account needs', () => {
  it('names the blocker at each stage and clears when it is closable', () => {
    const amex = account('Amex');
    bankStatementImport({ bankAccountId: amex, fileText: CARD_CSV, fileName: 'a.csv', fileType: 'csv' }, db);

    let [st] = bankReconciliationStatus(db);
    expect(st).toMatchObject({ name: 'Amex', owedView: true, lastReconciledEnd: null, openCount: 1, canClose: false });
    expect(st.blockers).toContain('balance_not_set');
    expect(st.blockers).toContain('lines_not_counted');
    expect(st.next).toMatchObject({ periodStart: '2026-07-10', periodEnd: '2026-07-25' });

    markCounted(amex);
    [st] = bankReconciliationStatus(db);
    expect(st.blockers).toEqual(['balance_not_set', 'variance']);
    expect(st.ecart).toBe(179.18);

    bankStatementUpdate(st.next.id, { ending_balance: -179.18 }, db);
    [st] = bankReconciliationStatus(db);
    expect(st).toMatchObject({ canClose: true, ecart: 0, balanceSource: 'user' });
    expect(st.blockers).toEqual([]);

    bankReconcileClose(amex, st.next.id, db);
    [st] = bankReconciliationStatus(db);
    expect(st).toMatchObject({ openCount: 0, next: null, lastReconciledEnd: '2026-07-25', canClose: false });
  });

  it('reports every account, including one with nothing imported', () => {
    account('Amex');
    account('Chequing', 'bank', '1010');
    const rows = bankReconciliationStatus(db);
    expect(rows.map(r => r.name)).toEqual(['Amex', 'Chequing']);
    expect(rows.every(r => r.next === null && r.openCount === 0)).toBe(true);
    expect(rows.find(r => r.name === 'Chequing').owedView).toBe(false);
  });
});

describe('RECST-003/004 the Today reminder', () => {
  const acc = (over = {}) => ({
    accountId: 4, name: 'Amex', canClose: false, notCounted: 0, ecart: 179.18,
    blockers: ['variance'], next: { id: 7, periodStart: '2026-07-06', periodEnd: '2026-08-05' }, ...over,
  });
  const now = new Date('2026-09-17T12:00:00Z');

  it('a month that has ended and is still open is listed, with the reason', () => {
    const items = buildWorklist({ reconcile: [acc()], lang: 'en', now });
    const item = items.find(i => i.id === 'reconcile-4-2026-08-05');
    expect(item).toBeTruthy();
    expect(item.title).toBe('Reconcile Amex: 2026-07-06 to 2026-08-05');
    expect(item.detail).toMatch(/Variance of/);
    expect(item.target).toEqual({ kind: 'section', section: 'bank', tab: 'rapprochements' });
    expect(buildWorklist({ reconcile: [acc({ blockers: ['balance_not_set'] })], lang: 'en', now })[0].detail)
      .toMatch(/closing balance is not set/);
    expect(buildWorklist({ reconcile: [acc({ blockers: ['lines_not_counted'], notCounted: 3 })], lang: 'en', now })[0].detail)
      .toMatch(/3 lines still to categorize/);
    expect(buildWorklist({ reconcile: [acc({ blockers: [], canClose: true })], lang: 'en', now })[0].detail)
      .toMatch(/Ready to close/);
    expect(buildWorklist({ reconcile: [acc()], lang: 'fr', now })[0].title).toMatch(/^Rapprocher Amex/);
  });

  it('the month in progress, and an account with nothing open, are left alone', () => {
    // buildWorklist also returns unrelated setup nudges; only reconcile items matter here.
    const reconcileItems = (opts) => buildWorklist({ lang: 'en', now, ...opts }).filter(i => i.id.startsWith('reconcile-'));
    expect(reconcileItems({ reconcile: [acc({ next: { id: 9, periodStart: '2026-09-01', periodEnd: '2026-09-30' } })] })).toEqual([]);
    expect(reconcileItems({ reconcile: [acc({ next: null })] })).toEqual([]);
    expect(reconcileItems({ reconcile: [] })).toEqual([]);
  });
});

describe('RECST-005 the screen', () => {
  it('lists every account and shows why a close is unavailable', () => {
    const BANQUE = fs.readFileSync(path.join(ROOT, 'src/components/BanqueTab.jsx'), 'utf8');
    expect(BANQUE).toMatch(/\{T\.recOverview\}/);
    expect(BANQUE).toMatch(/bank\?\.reconcile\?\.status\?\.\(\)/);
    expect(BANQUE).toMatch(/const closeBlockers = \(stmt\) =>/);
    expect(BANQUE).toMatch(/\/\/ Shown, not hidden: a missing button explains nothing\./);
    expect(BANQUE).toMatch(/if \(subTab === 'rapprochements'\) \{ loadStatements\(\); loadRecPreview\(\); loadRecStatus\(\); \}/);
    const APP = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
    expect(APP).toMatch(/reconcile:Array\.isArray\(reconcileStatus\)\?reconcileStatus:\[\]/);
  });
});
