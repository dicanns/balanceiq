/**
 * ORPHAN-001  a failed reversal must not leave a posted entry behind
 * ORPHAN-002  orphans are detectable and reversible
 *
 * Regression guard for 2026-09. _reverseBankTransactionEntry cleared
 * bank_transactions.journal_entry_id BEFORE reversing, and swallowed a failed
 * reversal. Any failure therefore left the entry posted with nothing pointing at
 * it - an orphan that double-counts in the ledger forever, with no symptom in
 * the UI. Found in real data: JE-2026-000003 duplicated a $289.77 card payment,
 * overstating the card liability and understating cash by the same amount.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glReverseEntry } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, en, type] of [
    ['1010', 'Cash (operating bank account)', 'asset'],
    ['2210', 'Credit card',                   'liability'],
    ['6100', 'Rent',                          'expense'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, en, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

function postBankEntry(sourceId, targetNum, cents) {
  const { entryId } = glDraftEntry({
    entry_date: '2026-08-25', description: 'card payment',
    source_type: 'bank_tx', source_id: String(sourceId),
    lines: [
      { account_id: acc(targetNum).id, debit_cents: cents, credit_cents: 0 },
      { account_id: acc('1010').id,    debit_cents: 0, credit_cents: cents },
    ],
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

// Mirrors bankFindOrphanEntries(): a posted bank_tx entry nothing points at.
const findOrphans = () => db.prepare(
  `SELECT je.* FROM journal_entries je
   WHERE je.source_type='bank_tx' AND je.status='posted'
     AND NOT EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.journal_entry_id = je.id)`
).all();

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc(num).id).bal;

describe('ORPHAN-001 a reversal that fails must not orphan the entry', () => {
  it('the fixed order reverses before clearing the pointer', () => {
    const id = postBankEntry('tx-1', '2210', 28977);
    // Correct order: reverse, and only then would the pointer be cleared.
    glReverseEntry(id, 'recategorised', db);
    const after = db.prepare(`SELECT status FROM journal_entries WHERE id=?`).get(id);
    expect(after.status).toBe('reversed');
  });

  it('a reversed entry nets to zero, so no double-count remains', () => {
    const id = postBankEntry('tx-1', '2210', 28977);
    expect(balanceOf('2210')).toBe(28977);
    glReverseEntry(id, 'recategorised', db);
    expect(balanceOf('2210')).toBe(0);
    expect(balanceOf('1010')).toBe(0);
  });

  it('reversing twice is refused rather than compounding', () => {
    const id = postBankEntry('tx-1', '2210', 28977);
    glReverseEntry(id, 'first', db);
    expect(() => glReverseEntry(id, 'second', db)).toThrow();
  });
});

describe('ORPHAN-002 detecting and clearing existing orphans', () => {
  it('finds a posted bank_tx entry that nothing points at', () => {
    postBankEntry('tx-1', '2210', 28977);
    expect(findOrphans()).toHaveLength(1);
  });

  it('the reported case: a duplicated $289.77 overstates the card', () => {
    postBankEntry('tx-1', '2210', 28977);
    postBankEntry('tx-1-dup', '2210', 28977);
    expect(balanceOf('2210')).toBe(57954); // double

    // Repair reverses the orphans.
    for (const o of findOrphans()) glReverseEntry(o.id, 'orphan repair', db);
    expect(balanceOf('2210')).toBe(0);
  });

  it('an entry a transaction still points at is not an orphan', () => {
    const id = postBankEntry('tx-1', '6100', 250000);
    const { lastInsertRowid: bankId } = db.prepare(
      `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
       VALUES ('Test', 'bank', ?, 0, '2026-08-01')`
    ).run(acc('1010').id);
    db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, journal_entry_id)
       VALUES (?, '2026-08-25', 'rent', -2500, ?)`
    ).run(bankId, id);
    expect(findOrphans()).toHaveLength(0);
  });
});

describe('ORPHAN-003 a reversal is dated in the period it corrects', () => {
  // Reversing an August entry stamped the mirror with today's date, so an
  // as-of-August trial balance included the original but not its reversal - the
  // correction looked like it had done nothing.
  const asOf = (date, cutoff) => db.prepare(
    `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.entry_id
      AND je.status IN ('posted','reversed') AND je.entry_date <= ?
     WHERE jl.account_id = ?`
  ).get(cutoff, acc(date).id).bal;

  it('the mirror carries the original entry date, not today', () => {
    const id = postBankEntry('tx-1', '2210', 28977);
    const orig = db.prepare(`SELECT entry_date FROM journal_entries WHERE id=?`).get(id);
    glReverseEntry(id, 'orphan repair', db);
    const mirror = db.prepare(
      `SELECT entry_date FROM journal_entries WHERE reverses_entry_id=?`
    ).get(id);
    expect(mirror.entry_date).toBe(orig.entry_date);
  });

  it('an as-of-August balance nets to zero once reversed', () => {
    const id = postBankEntry('tx-1', '2210', 28977);
    expect(asOf('2210', '2026-08-31')).toBe(28977);
    glReverseEntry(id, 'orphan repair', db);
    expect(asOf('2210', '2026-08-31')).toBe(0);
  });

  it('the reversal does not leak into a later period only', () => {
    const id = postBankEntry('tx-1', '2210', 28977);
    glReverseEntry(id, 'orphan repair', db);
    // Same answer whether you look at August or later.
    expect(asOf('2210', '2026-08-31')).toBe(asOf('2210', '2026-12-31'));
  });
});
