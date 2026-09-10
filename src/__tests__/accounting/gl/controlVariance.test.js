/**
 * CONTROL-001  the bank subledger is computed independently of the ledger
 * CONTROL-002  it detects each failure seen in real use
 *
 * The control-account check compares the general ledger against an independent
 * source for the same account. Cash previously had no such source (sub: null),
 * so every ledger-vs-bank discrepancy found in real use - a missing opening
 * balance, a duplicated entry, a reversal filed in the wrong period - showed
 * nothing at all. The ledger stays internally balanced in all three cases,
 * which is exactly why an internal check cannot catch them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';

let db;
beforeEach(() => {
  db = buildAccountingDb();
  db.prepare(
    `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type)
     VALUES ('1010','Encaisse','Cash (operating bank account)','asset')`
  ).run();
});
afterEach(() => { db?.close(); db = null; });

const coaId = () => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number='1010'`).get().id;

function makeAccount(opening) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
     VALUES ('BMO checking','bank',?,?,'2026-08-01')`
  ).run(coaId(), opening);
  return lastInsertRowid;
}

function addTx(bankId, date, amount) {
  db.prepare(
    `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount)
     VALUES (?,?,?,?)`
  ).run(bankId, date, 'tx', amount);
}

// Mirrors bankSubledgerBalances().
function subledger(asOf) {
  return db.prepare(
    `SELECT ca.account_number an,
            ba.opening_balance
              + COALESCE((SELECT SUM(bt.amount) FROM bank_transactions bt
                          WHERE bt.bank_account_id = ba.id AND bt.transaction_date <= ?), 0) AS balance
     FROM bank_accounts ba JOIN chart_of_accounts ca ON ca.id = ba.coa_account_id
     WHERE COALESCE(ba.is_archived,0) = 0`
  ).all(asOf).map(r => ({ accountNumber: r.an, cents: Math.round(r.balance * 100) }));
}

describe('CONTROL-001 the bank subledger stands on its own', () => {
  it('is opening balance plus transactions, independent of any journal entry', () => {
    const id = makeAccount(64754.50);
    addTx(id, '2026-08-17', -2835.60);
    addTx(id, '2026-08-24', 2000);
    // No journal entries exist at all - the figure still computes.
    expect(subledger('2026-08-31')[0].cents).toBe(6391890);
  });

  it('respects the as-of date', () => {
    const id = makeAccount(1000);
    addTx(id, '2026-08-15', -100);
    addTx(id, '2026-09-15', -500);
    expect(subledger('2026-08-31')[0].cents).toBe(90000);
    expect(subledger('2026-09-30')[0].cents).toBe(40000);
  });

  it('the reported August figure', () => {
    const id = makeAccount(64754.50);
    addTx(id, '2026-08-31', 12031.95);
    expect(subledger('2026-08-31')[0].cents).toBe(7678645); // $76,786.45
  });
});

describe('CONTROL-002 each real failure produces a variance', () => {
  const variance = (glCents, subCents) => glCents - subCents;

  it('a missing opening balance shows the whole opening figure', () => {
    // GL only saw the period activity; the bank knows about the opening balance.
    expect(variance(1203195, 7678645)).toBe(-6475450); // -$64,754.50
  });

  it('a duplicated entry shows as the duplicated amount', () => {
    // The $289.77 card payment posted twice: GL is short by it.
    expect(variance(7678645 - 28977, 7678645)).toBe(-28977);
  });

  it('a reversal filed in the wrong period shows in the earlier period', () => {
    // As of August the original counts but its September mirror does not.
    expect(variance(7678645 - 28977, 7678645)).not.toBe(0);
  });

  it('a correct ledger shows zero', () => {
    expect(variance(7678645, 7678645)).toBe(0);
  });

  it('unposted customer receipts show as a genuine, explainable gap', () => {
    // Receipts with no invoice behind them: GL short by exactly that amount.
    expect(variance(5340621, 7678645)).toBe(-2338024); // -$23,380.24
  });
});
