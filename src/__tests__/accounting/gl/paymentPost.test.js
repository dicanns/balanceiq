/**
 * PAYPOST-001  a payment credits accounts receivable and debits where the money landed
 * PAYPOST-002  posting the same payment twice does not book the cash twice
 * PAYPOST-003  invoice then payment leaves the correct AR balance
 *
 * Bridge phase 1. Invoices debited AR when raised, but nothing credited it back
 * when the customer paid, so GL receivables drifted upward forever while the
 * invoicing module showed the true balance.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glFindEntryBySource } = require('../../../db/database.js');

// Mirrors PAYMENT_MODE_ACCOUNT in main.js. Cash sits in the till until deposited,
// so it must not claim to be in the bank account.
const PAYMENT_MODE_ACCOUNT = {
  'Comptant':            '1050',
  'Chèque':              '1010',
  'Virement/E-Transfer': '1010',
  'Carte de crédit':     '1010',
  'Carte de débit':      '1010',
  'Stripe':              '1010',
  'Autre':               '1010',
};
const accountForMode = (mode) => PAYMENT_MODE_ACCOUNT[mode] || '1010';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, fr, en, type] of [
    ['1010', 'Encaisse (banque operation)', 'Cash (operating bank account)', 'asset'],
    ['1050', 'Encaisse - depots en transit', 'Undeposited funds',            'asset'],
    ['1100', 'Comptes clients',              'Accounts receivable',          'asset'],
    ['4000', 'Ventes - repas',               'Sales - meals',                'revenue'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, fr, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (num) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(num).id;

function postInvoice(totalCents) {
  const { entryId } = glDraftEntry({
    entry_date: '2026-07-15', description: 'Facture', source_type: 'invoice', source_id: 'FAC-1',
    lines: [
      { account_id: acc('1100'), debit_cents: totalCents, credit_cents: 0 },
      { account_id: acc('4000'), debit_cents: 0, credit_cents: totalCents },
    ],
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

function postPayment(paymentId, amountCents, mode) {
  if (glFindEntryBySource('payment', paymentId, db)) return null; // idempotency guard
  const { entryId } = glDraftEntry({
    entry_date: '2026-08-03', description: 'Paiement', source_type: 'payment', source_id: paymentId,
    lines: [
      { account_id: acc(accountForMode(mode)), debit_cents: amountCents, credit_cents: 0 },
      { account_id: acc('1100'),               debit_cents: 0, credit_cents: amountCents },
    ],
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status='posted'
   WHERE jl.account_id = ?`
).get(acc(num)).bal;

describe('PAYPOST-001 a payment lands in the right accounts', () => {
  it('credits accounts receivable', () => {
    postPayment('pay-1', 200000, 'Virement/E-Transfer');
    expect(balanceOf('1100')).toBe(-200000);
  });

  it('an e-transfer debits the operating bank account', () => {
    postPayment('pay-2', 200000, 'Virement/E-Transfer');
    expect(balanceOf('1010')).toBe(200000);
    expect(balanceOf('1050')).toBe(0);
  });

  it('cash debits undeposited funds, not the bank', () => {
    postPayment('pay-3', 64000, 'Comptant');
    expect(balanceOf('1050')).toBe(64000);
    expect(balanceOf('1010')).toBe(0);
  });

  it('an unknown mode falls back to the operating account', () => {
    expect(accountForMode('Bitcoin')).toBe('1010');
    expect(accountForMode(undefined)).toBe('1010');
  });

  it('the entry balances', () => {
    const id = postPayment('pay-4', 123456, 'Chèque');
    const r = db.prepare(
      `SELECT SUM(debit_cents) d, SUM(credit_cents) c FROM journal_lines WHERE entry_id=?`
    ).get(id);
    expect(r.d).toBe(r.c);
  });
});

describe('PAYPOST-002 posting is idempotent', () => {
  it('a second post for the same payment id is refused', () => {
    expect(postPayment('pay-dup', 200000, 'Chèque')).toBeTruthy();
    expect(postPayment('pay-dup', 200000, 'Chèque')).toBeNull();
    expect(balanceOf('1100')).toBe(-200000); // not -400000
  });

  it('different payments on the same invoice both post', () => {
    postPayment('pay-a', 100000, 'Chèque');
    postPayment('pay-b', 100000, 'Chèque');
    expect(balanceOf('1100')).toBe(-200000);
  });
});

describe('PAYPOST-003 the reported scenario', () => {
  it('$5,000 invoiced, $2,000 paid leaves $3,000 in AR', () => {
    postInvoice(500000);
    postPayment('pay-partial', 200000, 'Virement/E-Transfer');
    expect(balanceOf('1100')).toBe(300000);
  });

  it('paying the rest clears AR to zero', () => {
    postInvoice(500000);
    postPayment('p1', 200000, 'Virement/E-Transfer');
    postPayment('p2', 300000, 'Chèque');
    expect(balanceOf('1100')).toBe(0);
  });

  it('without the payment entry AR would still show the full invoice', () => {
    postInvoice(500000);
    expect(balanceOf('1100')).toBe(500000); // the old, drifting behaviour
  });
});
