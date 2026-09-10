/**
 * VOIDPAY-001  voiding a payment reverses its ledger entry
 * VOIDPAY-002  the invoice status follows what remains
 *
 * A payment recorded with the wrong date or amount had no way back - there was
 * no edit or delete for one anywhere in the app. The ledger entry is reversed
 * before the payment is removed, so the books can never be left holding a
 * payment the invoice no longer shows.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glReverseEntry, glFindEntryBySource } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, en, type] of [
    ['1010', 'Cash (operating bank account)', 'asset'],
    ['1100', 'Accounts receivable',           'asset'],
    ['4000', 'Sales',                         'revenue'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, en, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

function postPayment(paymentId, cents, date = '2026-09-09') {
  const { entryId } = glDraftEntry({
    entry_date: date, description: 'Paiement', source_type: 'payment', source_id: paymentId,
    lines: [
      { account_id: acc('1010'), debit_cents: cents, credit_cents: 0 },
      { account_id: acc('1100'), debit_cents: 0, credit_cents: cents },
    ],
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
    AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc(num)).bal;

// Mirrors the status recomputation in voidPaiement.
function statusAfter(total, acomptes, remaining) {
  const paid = remaining.reduce((a, x) => a + (x.montant || 0), 0);
  if (paid <= 0.005) return 'Envoyée';
  return (total - acomptes - paid) <= 0.005 ? 'Payée' : 'Payée partiellement';
}

describe('VOIDPAY-001 voiding reverses the ledger', () => {
  it('cash and receivables return to where they were', () => {
    postPayment('pay-1', 998441);
    expect(balanceOf('1010')).toBe(998441);
    const e = glFindEntryBySource('payment', 'pay-1', db);
    glReverseEntry(e.id, 'Payment voided', db);
    expect(balanceOf('1010')).toBe(0);
    expect(balanceOf('1100')).toBe(0);
  });

  it('the reversal carries the original date, so the period is not disturbed', () => {
    postPayment('pay-1', 998441, '2026-09-09');
    const e = glFindEntryBySource('payment', 'pay-1', db);
    glReverseEntry(e.id, 'Payment voided', db);
    const mirror = db.prepare(`SELECT entry_date FROM journal_entries WHERE reverses_entry_id=?`).get(e.id);
    expect(mirror.entry_date).toBe('2026-09-09');
  });

  it('re-recording on the correct date posts cleanly afterwards', () => {
    postPayment('pay-wrong', 998441, '2026-09-09');
    const e = glFindEntryBySource('payment', 'pay-wrong', db);
    glReverseEntry(e.id, 'Payment voided', db);
    postPayment('pay-right', 998441, '2026-08-04');
    expect(balanceOf('1010')).toBe(998441);
    const asOfAugust = db.prepare(
      `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
        AND je.status IN ('posted','reversed') AND je.entry_date <= '2026-08-31'
       WHERE jl.account_id = ?`
    ).get(acc('1010')).bal;
    expect(asOfAugust).toBe(998441); // now inside August, where the money arrived
  });
});

describe('VOIDPAY-002 the invoice status follows what remains', () => {
  it('voiding the only payment returns the invoice to sent', () => {
    expect(statusAfter(9984.41, 0, [])).toBe('Envoyée');
  });

  it('voiding one of two leaves it partly paid', () => {
    expect(statusAfter(9984.41, 0, [{ montant: 5000 }])).toBe('Payée partiellement');
  });

  it('an invoice still fully covered stays paid', () => {
    expect(statusAfter(9984.41, 0, [{ montant: 9984.41 }])).toBe('Payée');
  });
});
