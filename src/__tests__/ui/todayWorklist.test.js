/**
 * TODAY-001  overdue invoices use the shared outstanding figure
 * TODAY-002  the filing deadline comes from the registration, or not at all
 * TODAY-003  cash is compared to the bank the way Control accounts does it
 * TODAY-004  the list orders by urgency and every item opens a real screen
 * TODAY-005  the badges count work, not setup nudges
 * TODAY-006  a bank opening balance counts as an opening balance
 * TODAY-007  it is wired end to end
 *
 * Phase 5 of the navigation rebuild. The app already knew what was unfinished and
 * said nothing until someone went looking, which is most of why it needed a video
 * tutorial. Figures below are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  overdueInvoices, nextFilingDeadline, filingDueDate, cashVarianceCents,
  buildWorklist, worklistCounts, daysBetween,
} from '../../services/todayWorklist.js';
import { buildAccountingDb } from '../accounting/helpers/testSchema.js';

const require = createRequire(import.meta.url);
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const LINE = (price) => [{ quantite: 1, prixUnitaire: price, tps: false, tvq: false }];
const CLIENTS = [{ id: 'c1', entreprise: 'Acme Distribution' }, { id: 'c2', contact: 'Jo Tremblay' }];

describe('TODAY-001 overdue invoices', () => {
  const inv = (over) => ({ id: 'f1', numero: 'F-0101', clientId: 'c1', statut: 'Envoyée',
    dateEcheance: '2026-08-01', lignes: LINE(500), paiements: [], ...over });

  it('an unpaid invoice past its due date is overdue', () => {
    const r = overdueInvoices([inv()], CLIENTS, '2026-08-15');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ numero: 'F-0101', client: 'Acme Distribution', daysOverdue: 14, amount: 500 });
  });

  it('due today is not overdue yet', () => {
    expect(overdueInvoices([inv({ dateEcheance: '2026-08-15' })], CLIENTS, '2026-08-15')).toEqual([]);
  });

  it('drafts, paid, credited and cancelled invoices never appear', () => {
    for (const statut of ['Brouillon', 'Payée', 'Créditée', 'Annulée']) {
      expect(overdueInvoices([inv({ statut })], CLIENTS, '2026-08-15')).toEqual([]);
    }
  });

  it('a proforma is not a debt', () => {
    expect(overdueInvoices([inv({ documentType: 'proforma' })], CLIENTS, '2026-08-15')).toEqual([]);
  });

  it('a partly paid invoice shows only what is left', () => {
    const r = overdueInvoices([inv({ statut: 'Payée partiellement', paiements: [{ montant: 180 }] })], CLIENTS, '2026-08-15');
    expect(r[0].amount).toBeCloseTo(320, 2);
  });

  it('a fully paid invoice still marked sent does not nag', () => {
    expect(overdueInvoices([inv({ paiements: [{ montant: 500 }] })], CLIENTS, '2026-08-15')).toEqual([]);
  });

  it('an invoice with no due date cannot be overdue', () => {
    expect(overdueInvoices([inv({ dateEcheance: '' })], CLIENTS, '2026-08-15')).toEqual([]);
  });

  it('falls back to the contact name when there is no company', () => {
    expect(overdueInvoices([inv({ clientId: 'c2' })], CLIENTS, '2026-08-15')[0].client).toBe('Jo Tremblay');
  });

  it('oldest first', () => {
    const r = overdueInvoices([inv({ id: 'a', dateEcheance: '2026-08-10' }), inv({ id: 'b', dateEcheance: '2026-07-01' })], CLIENTS, '2026-08-15');
    expect(r.map(x => x.id)).toEqual(['b', 'a']);
  });
});

describe('TODAY-002 the filing deadline', () => {
  const QUARTERLY = { filing_frequency: 'quarterly', fiscal_year_end_month: 12 };

  it('no registration means no deadline, not a guessed one', () => {
    expect(nextFilingDeadline(null, [], '2026-08-15')).toBeNull();
  });

  it('a quarterly return is due one month after the quarter ends', () => {
    expect(filingDueDate('2026-09-30', 'quarterly')).toBe('2026-10-31');
    expect(filingDueDate('2026-12-31', 'quarterly')).toBe('2027-01-31');
  });

  it('an annual return is due three months after the year ends', () => {
    expect(filingDueDate('2026-12-31', 'annual')).toBe('2027-03-31');
  });

  it('flags the most recent unfiled quarter, including when it is already late', () => {
    const d = nextFilingDeadline(QUARTERLY, [], '2026-08-10');
    expect(d).toMatchObject({ periodEnd: '2026-06-30', dueDate: '2026-07-31', upcoming: false });
    expect(d.daysLeft).toBe(-10);
  });

  it('skips a quarter already marked filed', () => {
    const d = nextFilingDeadline(QUARTERLY, [{ period_end: '2026-06-30', status: 'filed' }], '2026-10-05');
    expect(d).toMatchObject({ periodEnd: '2026-09-30', dueDate: '2026-10-31', daysLeft: 26 });
  });

  it('does not dredge up quarters from long ago', () => {
    // Nothing recorded as filed for years; only the last 120 days are a to-do.
    const d = nextFilingDeadline(QUARTERLY, [], '2026-11-20');
    expect(d.periodEnd).toBe('2026-09-30');
  });

  it('gives a heads-up when the current period is about to end', () => {
    const d = nextFilingDeadline(QUARTERLY, [{ period_end: '2026-06-30', status: 'filed' }], '2026-09-20');
    expect(d).toMatchObject({ periodEnd: '2026-09-30', upcoming: true });
  });

  it('says nothing mid-period', () => {
    expect(nextFilingDeadline(QUARTERLY, [{ period_end: '2026-06-30', status: 'filed' }], '2026-08-15')).toBeNull();
  });

  it('handles a monthly filer', () => {
    const filed = ['2026-04-30', '2026-05-31', '2026-06-30'].map(e => ({ period_end: e, status: 'filed' }));
    const d = nextFilingDeadline({ filing_frequency: 'monthly', fiscal_year_end_month: 12 }, filed, '2026-08-10');
    expect(d).toMatchObject({ periodEnd: '2026-07-31', dueDate: '2026-08-31', daysLeft: 21 });
  });

  it('handles an annual filer', () => {
    const d = nextFilingDeadline({ filing_frequency: 'annual', fiscal_year_end_month: 12 }, [], '2027-02-01');
    expect(d).toMatchObject({ periodEnd: '2026-12-31', dueDate: '2027-03-31', daysLeft: 58 });
  });

  it('counts days without drifting across a time change', () => {
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('TODAY-003 cash against the bank', () => {
  it('matches when the ledger and the bank agree', () => {
    const v = cashVarianceCents([{ account_number: '1010', balance_cents: 1250000 }], [{ accountNumber: '1010', cents: 1250000 }]);
    expect(v.cents).toBe(0);
    expect(v.accounts).toEqual([]);
  });

  it('reports the gap and which account it is on', () => {
    const v = cashVarianceCents([{ account_number: '1010', balance_cents: 1100000 }], [{ accountNumber: '1010', cents: 1250000 }]);
    expect(v.cents).toBe(-150000);
    expect(v.accounts).toEqual([{ accountNumber: '1010', cents: -150000 }]);
  });

  it('sums two bank feeds on one ledger account', () => {
    const v = cashVarianceCents([{ account_number: '1010', balance_cents: 300000 }],
      [{ accountNumber: '1010', cents: 200000 }, { accountNumber: '1010', cents: 100000 }]);
    expect(v.cents).toBe(0);
  });

  it('an account with no ledger activity is the whole balance', () => {
    expect(cashVarianceCents([], [{ accountNumber: '1020', cents: 50000 }]).cents).toBe(-50000);
  });
});

describe('TODAY-004 the list', () => {
  const overdue = [{ id: 'f9', numero: 'F-0009', client: 'Acme', daysOverdue: 40, amount: 812.5 }];

  it('overdue comes before routine work, and setup nudges come last', () => {
    const items = buildWorklist({ needsCategorizing: 3, overdue, registration: null, lang: 'en' });
    expect(items.map(i => i.tone)).toEqual(['alert', 'warn', 'info']);
  });

  it('an overdue invoice opens that invoice', () => {
    const [first] = buildWorklist({ overdue, registration: {}, lang: 'en' });
    expect(first.title).toBe('F-0009 is 40 days overdue');
    expect(first.target).toEqual({ kind: 'invoice', invoiceId: 'f9' });
  });

  it('lines to categorize open Bank', () => {
    const item = buildWorklist({ needsCategorizing: 12, registration: {}, lang: 'en' }).find(i => i.id === 'bank-categorize');
    expect(item.title).toBe('12 bank lines to categorize');
    expect(item.target).toEqual({ kind: 'section', section: 'bank', tab: 'comptes' });
  });

  it('singular reads as singular', () => {
    expect(buildWorklist({ needsCategorizing: 1, registration: {}, lang: 'en' })[0].title).toBe('1 bank line to categorize');
  });

  it('no registration asks for one, and says where', () => {
    const item = buildWorklist({ registration: null, lang: 'en' }).find(i => i.id === 'tax-registration');
    expect(item.detail).toMatch(/Taxes, then GST\/QST, then Registration/);
    expect(item.target).toEqual({ kind: 'section', section: 'taxes', tab: 'taxperiod' });
  });

  it('a late return is an alert and says how late', () => {
    const deadline = { periodStart: '2026-04-01', periodEnd: '2026-06-30', dueDate: '2026-07-31', daysLeft: -10, upcoming: false };
    const item = buildWorklist({ deadline, registration: {}, lang: 'en' })[0];
    expect(item.tone).toBe('alert');
    expect(item.title).toBe('GST/QST return overdue by 10 days');
    expect(item.detail).toMatch(/mark it as filed/);
  });

  it('a cash gap names the amount without a sign', () => {
    const item = buildWorklist({ variance: { cents: -150000, accounts: [] }, registration: {}, lang: 'en' })[0];
    expect(item.title).toMatch(/Cash is off from the bank by \$1,500\.00/);
    expect(item.target).toEqual({ kind: 'section', section: 'books', tab: 'grandlivre' });
  });

  it('every known blocker lands on a screen, and unknown ones are dropped', () => {
    const blockers = ['unreconciled_statements', 'no_opening_balance', 'overdue_ap', 'draft_entries', 'something_new']
      .map(type => ({ type, label_en: type, label_fr: type }));
    const items = buildWorklist({ blockers, registration: {}, lang: 'en' });
    expect(items.map(i => i.id).sort()).toEqual(
      ['blocker-draft_entries', 'blocker-no_opening_balance', 'blocker-overdue_ap', 'blocker-unreconciled_statements']);
    for (const i of items) expect(['bank', 'books']).toContain(i.target.section);
  });

  it('a long tail of overdue invoices is summarised rather than listed', () => {
    const many = Array.from({ length: 8 }, (_, n) => ({ id: `f${n}`, numero: `F-${n}`, client: '', daysOverdue: 30 - n, amount: 100 }));
    const items = buildWorklist({ overdue: many, registration: {}, lang: 'en' });
    expect(items.filter(i => i.target.kind === 'invoice')).toHaveLength(5);
    expect(items.find(i => i.id === 'overdue-more').title).toBe('3 more overdue invoices');
  });

  it('nothing to do is an empty list', () => {
    expect(buildWorklist({ registration: {}, lang: 'en' })).toEqual([]);
  });

  it('French is complete, not a fallback to English', () => {
    const items = buildWorklist({ needsCategorizing: 2, overdue, registration: null, lang: 'fr' });
    expect(items.map(i => i.title).join(' ')).toMatch(/en retard de 40 jours/);
    expect(items.map(i => i.title).join(' ')).toMatch(/2 lignes bancaires à catégoriser/);
  });
});

describe('TODAY-005 the badges', () => {
  it('Sales counts overdue invoices, Bank counts lines, Today counts work', () => {
    const overdue = [{ id: 'a' }, { id: 'b' }];
    const items = buildWorklist({
      needsCategorizing: 4,
      overdue: overdue.map((o, n) => ({ ...o, numero: `F-${n}`, client: '', daysOverdue: 5, amount: 10 })),
      registration: null, lang: 'en',
    });
    expect(worklistCounts({ needsCategorizing: 4, overdue, items })).toEqual({ sales: 2, bank: 4, today: 3 });
  });

  it('a setup nudge alone does not light up Today', () => {
    const items = buildWorklist({ registration: null, lang: 'en' });
    expect(worklistCounts({ items }).today).toBe(0);
  });
});

describe('TODAY-006 a bank opening balance counts', () => {
  const { glDraftEntry, glPostEntry, getBalanceSheetBlockers } = require('../../db/database.js');
  let db;
  beforeEach(() => {
    db = buildAccountingDb();
    for (const [num, name, type] of [['1010', 'Cash', 'asset'], ['3400', 'Opening balance equity', 'equity']]) {
      db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
    }
  });
  afterEach(() => { db?.close(); db = null; });
  const acc = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

  it('posted through a bank account, it is not reported missing', () => {
    // Bank accounts post their opening balance as bank_opening. The check looked
    // for opening_balance only, so a posted balance read as missing, forever.
    const { entryId } = glDraftEntry({
      entry_date: '2026-08-01', description: 'Opening', source_type: 'bank_opening', source_id: 'bank:1',
      lines: [{ account_id: acc('1010'), debit_cents: 1000000, credit_cents: 0 },
              { account_id: acc('3400'), debit_cents: 0, credit_cents: 1000000 }],
    }, db);
    glPostEntry(entryId, db);
    const types = getBalanceSheetBlockers('2026-08-31', db).map(b => b.type);
    expect(types).not.toContain('no_opening_balance');
  });

  it('with none posted at all, it still says so', () => {
    const types = getBalanceSheetBlockers('2026-08-31', db).map(b => b.type);
    expect(types).toContain('no_opening_balance');
  });
});

describe('TODAY-007 wired end to end', () => {
  const APP = read('App.jsx');
  const SIDEBAR = read('components/Sidebar.jsx');

  it('To do is the first tab of Today, and where Today opens', () => {
    const today = APP.slice(APP.indexOf('    today:{'), APP.indexOf('    operations:{'));
    expect(today.indexOf('id:"worklist"')).toBeLessThan(today.indexOf('id:"encaisse"'));
    expect(APP).toContain('today:"worklist"');
    expect(APP).toContain('{at("today","worklist")&&<TodayWorklist');
  });

  it('the count of lines to categorize reaches the renderer', () => {
    expect(read('../main.js')).toContain("ipcMain.handle('bank:needsCategorizing'");
    expect(read('../preload.js')).toContain("needsCategorizing: ()   => ipcRenderer.invoke('bank:needsCategorizing')");
  });

  it('each item target is handled', () => {
    for (const kind of ['invoice', 'section', 'tab']) expect(APP).toContain(`target.kind==="${kind}"`);
  });

  it('the sidebar shows the three badges, red only for overdue', () => {
    expect(SIDEBAR).toMatch(/id="facturation"[^\n]*badge=\{counts\.sales\} tone="alert"/);
    expect(SIDEBAR).toMatch(/id="today"[^\n]*badge=\{counts\.today\}/);
    expect(SIDEBAR).toMatch(/id="bank"[^\n]*badge=\{counts\.bank\}/);
    expect(APP).toContain('counts={worklist.counts}');
  });

  it('a failed check degrades to a quieter list rather than a broken screen', () => {
    expect(APP).toContain('const safe=async(fn,fallback)=>{try{');
  });
});
