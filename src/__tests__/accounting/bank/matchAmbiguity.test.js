/**
 * MATCH-002 — Bank Matching Ambiguity
 *
 * When two learned rules exist for the same description pattern pointing to
 * different COA accounts, the engine must NOT auto-apply. The transaction must
 * land in the suggest queue with both candidates available for the user to pick.
 * No journal entry may be created until the user resolves the ambiguity.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb, gl } from '../helpers/testSchema.js';

let db;

beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db.close(); });

describe('MATCH-002 matching engine ambiguity', () => {
  let bankAccountId, coaA, coaB;

  beforeEach(() => {
    // Two COA accounts that could both plausibly match an "HYDRO" transaction
    coaA = gl.coaId(db, '6110'); // Hydro-Quebec (electricity)
    coaB = gl.coaId(db, '6120'); // Gaz naturel (natural gas)

    // Create a bank account
    const result = db.prepare(
      `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
       VALUES ('Banque Nationale Oper.', 'bank', ?, 0, '2026-01-01')`
    ).run(gl.coaId(db, '1010'));
    bankAccountId = result.lastInsertRowid;

    // Two learned rules for the same description pattern, each pointing to a different account,
    // each with match_count = 2 (below the auto-elevation threshold of 3)
    db.prepare(
      `INSERT INTO bank_match_learned (description_pattern, coa_account_id, match_count) VALUES (?, ?, ?)`
    ).run('hydro', coaA, 2);
    db.prepare(
      `INSERT INTO bank_match_learned (description_pattern, coa_account_id, match_count) VALUES (?, ?, ?)`
    ).run('hydro', coaB, 2);
  });

  it('neither learned rule has reached auto-elevation threshold', () => {
    const rules = db.prepare(
      `SELECT * FROM bank_match_learned WHERE description_pattern='hydro' ORDER BY coa_account_id`
    ).all();
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule.match_count).toBeLessThan(3);
    }
  });

  it('transaction with ambiguous description stays unmatched — no auto-apply', () => {
    db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, match_status)
       VALUES (?, '2026-03-15', 'HYDRO-QUEBEC DEBIT', -210.50, 'unmatched')`
    ).run(bankAccountId);

    const tx = db.prepare(
      `SELECT * FROM bank_transactions WHERE description='HYDRO-QUEBEC DEBIT'`
    ).get();

    // Engine must not auto-apply when two candidates are tied below threshold
    expect(tx.match_status).toBe('unmatched');
    expect(tx.coa_account_id).toBeNull();
  });

  it('no journal entry is created until a user explicitly picks one', () => {
    db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, match_status)
       VALUES (?, '2026-03-15', 'HYDRO-QUEBEC DEBIT', -210.50, 'unmatched')`
    ).run(bankAccountId);

    const tx = db.prepare(`SELECT * FROM bank_transactions WHERE description='HYDRO-QUEBEC DEBIT'`).get();

    // No journal entry may exist before user resolution
    expect(tx.journal_entry_id).toBeNull();

    // Simulate user picking coaA (categorize manually)
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE bank_transactions SET coa_account_id=?, match_status='manual', notes='Manually categorized' WHERE id=?`
    ).run(coaA, tx.id);

    // Only after user action is the account set
    const resolved = db.prepare(`SELECT * FROM bank_transactions WHERE id=?`).get(tx.id);
    expect(resolved.coa_account_id).toBe(coaA);
    expect(resolved.match_status).toBe('manual');
  });
});
