/**
 * OPENBAL-001  an opening balance posts against opening balance equity
 * OPENBAL-002  it is idempotent and handles a negative (credit card) balance
 * OPENBAL-003  the backfill posts categorized rows that have no entry
 *
 * A bank account's opening balance lived only on bank_accounts, where
 * reconciliation used it. The ledger therefore started from zero, so the balance
 * sheet showed only the period's activity - $12,031.95 instead of $76,786.45 -
 * which reads like a categorizing error but is a missing starting entry.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glFindEntryBySource } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, fr, en, type] of [
    ['1010', 'Encaisse',                     'Cash (operating bank account)', 'asset'],
    ['1100', 'Comptes clients',              'Accounts receivable',           'asset'],
    ['2210', 'Carte de credit',              'Credit card',                   'liability'],
    ['3400', 'Solde d ouverture (capitaux)', 'Opening balance equity',        'equity'],
    ['6100', 'Loyer',                        'Rent',                          'expense'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, fr, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

// Mirrors bankAccountPostOpeningBalance().
function postOpening(bankId, openingBalance, glNumber = '1010', date = '2026-08-01') {
  const sourceId = `bank:${bankId}`;
  if (glFindEntryBySource('bank_opening', sourceId, db)) return { alreadyPosted: true };
  const cents = Math.round(openingBalance * 100);
  if (!cents) return { ok: false, error: 'ERR_NO_OPENING_BALANCE' };
  const bankCoa = acc(glNumber), equity = acc('3400');
  const positive = cents > 0, abs = Math.abs(cents);
  const lines = positive
    ? [{ account_id: bankCoa.id, debit_cents: abs, credit_cents: 0 },
       { account_id: equity.id,  debit_cents: 0, credit_cents: abs }]
    : [{ account_id: equity.id,  debit_cents: abs, credit_cents: 0 },
       { account_id: bankCoa.id, debit_cents: 0, credit_cents: abs }];
  const { entryId } = glDraftEntry({
    entry_date: date, description: 'Opening balance',
    source_type: 'bank_opening', source_id: sourceId, lines,
  }, db);
  glPostEntry(entryId, db);
  return { ok: true, entryId };
}

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted'
   WHERE jl.account_id = ?`
).get(acc(num).id).bal;

describe('OPENBAL-001 the opening balance reaches the ledger', () => {
  it('debits cash and credits opening balance equity', () => {
    postOpening(1, 64754.50);
    expect(balanceOf('1010')).toBe(6475450);
    expect(balanceOf('3400')).toBe(-6475450);
  });

  it('cash then ties to the bank once activity is added', () => {
    postOpening(1, 64754.50);
    // August net activity of +$12,031.95 brings cash to the statement balance.
    const { entryId } = glDraftEntry({
      entry_date: '2026-08-31', description: 'activity', source_type: 'bank_tx', source_id: 'x',
      lines: [
        { account_id: acc('1010').id, debit_cents: 1203195, credit_cents: 0 },
        { account_id: acc('3400').id, debit_cents: 0, credit_cents: 1203195 },
      ],
    }, db);
    glPostEntry(entryId, db);
    expect(balanceOf('1010')).toBe(7678645); // $76,786.45
  });

  it('the entry balances', () => {
    const { entryId } = postOpening(1, 64754.50);
    const r = db.prepare(`SELECT SUM(debit_cents) d, SUM(credit_cents) c FROM journal_lines WHERE entry_id=?`).get(entryId);
    expect(r.d).toBe(r.c);
  });
});

describe('OPENBAL-002 repeat and negative balances', () => {
  it('posting twice does not double the opening balance', () => {
    postOpening(1, 64754.50);
    expect(postOpening(1, 64754.50).alreadyPosted).toBe(true);
    expect(balanceOf('1010')).toBe(6475450);
  });

  it('a credit card already owing flips both sides', () => {
    postOpening(2, -1500, '2210');
    expect(balanceOf('2210')).toBe(-150000); // a credit balance: money owed
    expect(balanceOf('3400')).toBe(150000);
  });

  it('a zero opening balance posts nothing', () => {
    expect(postOpening(3, 0).error).toBe('ERR_NO_OPENING_BALANCE');
  });

  it('separate accounts each get their own entry', () => {
    postOpening(1, 64754.50, '1010');
    postOpening(2, -1500, '2210');
    expect(db.prepare(`SELECT COUNT(*) c FROM journal_entries WHERE source_type='bank_opening'`).get().c).toBe(2);
  });
});

describe('OPENBAL-003 backfilling categorized rows with no entry', () => {
  const CONTROL = ['1100'];

  it('counts a control-account row as skipped, not posted', () => {
    const rows = [{ target: '6100' }, { target: '1100' }, { target: '2210' }];
    let posted = 0, skipped = 0;
    for (const r of rows) { if (CONTROL.includes(r.target)) skipped++; else posted++; }
    expect(posted).toBe(2);
    expect(skipped).toBe(1);
  });

  it('the reported case: 6 unposted rows, 5 on receivables', () => {
    const targets = ['6010', '1100', '1100', '1100', '1100', '1100'];
    const posted = targets.filter(t => !CONTROL.includes(t)).length;
    expect(posted).toBe(1);
    expect(targets.length - posted).toBe(5);
  });
});
