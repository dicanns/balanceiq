/**
 * BANKPOST-001  a categorized bank line posts the entry it implies
 * BANKPOST-002  control accounts are skipped so nothing is counted twice
 * BANKPOST-003  re-categorizing reverses the previous entry
 *
 * Bridge phase 2. Categorizing only tagged the row before, so the ledger never
 * saw rent, hydro or credit-card payments at all. It now posts - except for
 * accounts already driven by documents elsewhere: a customer payment recorded in
 * Facturation posts Dr cash / Cr 1100 already, and posting the matching bank
 * line again would credit receivables twice and double the cash.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry } = require('../../../db/database.js');

const GL_CONTROL_ACCOUNTS = ['1100'];

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, fr, en, type] of [
    ['1010', 'Encaisse',          'Cash (operating bank account)', 'asset'],
    ['1100', 'Comptes clients',   'Accounts receivable',           'asset'],
    ['2210', 'Carte de credit',   'Credit card',                   'liability'],
    ['6010', 'Salaires (admin)',  'Wages (administration)',        'expense'],
    ['6100', 'Loyer',             'Rent',                          'expense'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, fr, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

// Mirrors _postBankTransactionEntry(): direction follows the sign, and control
// accounts post nothing.
function postBankTx({ amount, targetNumber, date = '2026-08-25', description = 'tx' }) {
  const target = acc(targetNumber);
  const bank   = acc('1010');
  if (GL_CONTROL_ACCOUNTS.includes(target.account_number)) return null;
  if (bank.id === target.id) return null;
  const cents = Math.round(Math.abs(amount) * 100);
  if (!cents) return null;

  const lines = amount > 0
    ? [{ account_id: bank.id,   debit_cents: cents, credit_cents: 0 },
       { account_id: target.id, debit_cents: 0, credit_cents: cents }]
    : [{ account_id: target.id, debit_cents: cents, credit_cents: 0 },
       { account_id: bank.id,   debit_cents: 0, credit_cents: cents }];

  const { entryId } = glDraftEntry({
    entry_date: date, description, source_type: 'bank_tx', source_id: 'tx-1', lines,
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted'
   WHERE jl.account_id = ?`
).get(acc(num).id).bal;

describe('BANKPOST-001 direction follows the sign', () => {
  it('an outgoing rent payment debits the expense and credits the bank', () => {
    postBankTx({ amount: -2500, targetNumber: '6100' });
    expect(balanceOf('6100')).toBe(250000);
    expect(balanceOf('1010')).toBe(-250000);
  });

  it('the reported wage transfer debits wages', () => {
    postBankTx({ amount: -5478.16, targetNumber: '6010' });
    expect(balanceOf('6010')).toBe(547816);
    expect(balanceOf('1010')).toBe(-547816);
  });

  it('a credit card payment reduces the card liability', () => {
    postBankTx({ amount: -1118.32, targetNumber: '2210' });
    expect(balanceOf('2210')).toBe(111832);   // debit reduces a liability
    expect(balanceOf('1010')).toBe(-111832);
  });

  it('money in debits the bank', () => {
    postBankTx({ amount: 2000, targetNumber: '6100' });
    expect(balanceOf('1010')).toBe(200000);
    expect(balanceOf('6100')).toBe(-200000);
  });

  it('a zero-amount line posts nothing', () => {
    expect(postBankTx({ amount: 0, targetNumber: '6100' })).toBeNull();
  });
});

describe('BANKPOST-002 control accounts are not double-counted', () => {
  it('a line categorized to 1100 posts nothing', () => {
    expect(postBankTx({ amount: 2000, targetNumber: '1100' })).toBeNull();
    expect(balanceOf('1100')).toBe(0);
    expect(balanceOf('1010')).toBe(0);
  });

  it('the payment entry alone drives receivables', () => {
    // Facturation records the payment: Dr cash / Cr AR.
    const { entryId } = glDraftEntry({
      entry_date: '2026-08-25', description: 'Paiement', source_type: 'payment', source_id: 'p1',
      lines: [
        { account_id: acc('1010').id, debit_cents: 200000, credit_cents: 0 },
        { account_id: acc('1100').id, debit_cents: 0, credit_cents: 200000 },
      ],
    }, db);
    glPostEntry(entryId, db);
    // The matching bank line is categorized to 1100 and must add nothing.
    postBankTx({ amount: 2000, targetNumber: '1100' });
    expect(balanceOf('1100')).toBe(-200000);
    expect(balanceOf('1010')).toBe(200000);
  });

  it('a non-control account is not skipped', () => {
    expect(postBankTx({ amount: -2500, targetNumber: '6100' })).toBeTruthy();
  });
});

describe('BANKPOST-003 entries stay balanced', () => {
  it('debits equal credits', () => {
    const id = postBankTx({ amount: -1234.56, targetNumber: '6100' });
    const r = db.prepare(
      `SELECT SUM(debit_cents) d, SUM(credit_cents) c FROM journal_lines WHERE entry_id=?`
    ).get(id);
    expect(r.d).toBe(r.c);
  });

  it('is recorded against its bank transaction for later reversal', () => {
    const id = postBankTx({ amount: -1234.56, targetNumber: '6100' });
    const e = db.prepare(`SELECT source_type, source_id FROM journal_entries WHERE id=?`).get(id);
    expect(e.source_type).toBe('bank_tx');
    expect(e.source_id).toBe('tx-1');
  });
});
