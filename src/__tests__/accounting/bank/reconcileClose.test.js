/**
 * D5 — bankReconcileClose: suggested transactions must NOT be reconciled.
 *
 * Scenario: a statement has one 'matched' and one 'suggested' transaction.
 * Closing the statement must mark only the 'matched' transaction as reconciled=1.
 * The 'suggested' transaction must remain reconciled=0.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { bankReconcileClose, bankReconcilePreview } = require('../../../db/database.js');

let db;

beforeEach(() => { db = buildAccountingDb(); });
afterEach(() => { db?.close(); db = null; });

function seed(database) {
  const { id: coaId } = database.prepare(`SELECT id FROM chart_of_accounts LIMIT 1`).get();
  const { lastInsertRowid: accountId } = database.prepare(
    `INSERT INTO bank_accounts (name, currency, opening_balance, coa_account_id, opening_date) VALUES ('Test Bank','CAD', 0, ?, '2026-01-01')`
  ).run(coaId);

  const { lastInsertRowid: statementId } = database.prepare(
    `INSERT INTO bank_statements (bank_account_id, period_start, period_end, ending_balance)
     VALUES (?, '2026-01-01', '2026-01-31', 100.00)`
  ).run(accountId);

  // matched transaction: $100 credit — will be reconciled after close
  const { lastInsertRowid: matchedId } = database.prepare(
    `INSERT INTO bank_transactions
       (bank_account_id, bank_statement_id, transaction_date, description, amount, match_status)
     VALUES (?, ?, '2026-01-15', 'Virement', 100.00, 'matched')`
  ).run(accountId, statementId);

  // suggested transaction: $0 (balance stays at 100 for statement to close)
  const { lastInsertRowid: suggestedId } = database.prepare(
    `INSERT INTO bank_transactions
       (bank_account_id, bank_statement_id, transaction_date, description, amount, match_status)
     VALUES (?, ?, '2026-01-20', 'Dépense suggérée', 0.00, 'suggested')`
  ).run(accountId, statementId);

  return { accountId, statementId, matchedId, suggestedId };
}

describe('D5 bankReconcileClose — suggested transactions excluded', () => {
  it('matched transaction is reconciled=1 after close', () => {
    const { accountId, statementId, matchedId } = seed(db);
    const result = bankReconcileClose(accountId, statementId, db);
    expect(result.success).toBe(true);
    const row = db.prepare(`SELECT reconciled FROM bank_transactions WHERE id=?`).get(matchedId);
    expect(row.reconciled).toBe(1);
  });

  it('suggested transaction remains reconciled=0 after close', () => {
    const { accountId, statementId, suggestedId } = seed(db);
    bankReconcileClose(accountId, statementId, db);
    const row = db.prepare(`SELECT reconciled FROM bank_transactions WHERE id=?`).get(suggestedId);
    expect(row.reconciled).toBe(0);
  });

  it('suggested transaction appears in unreconciledCount in preview', () => {
    const { accountId } = seed(db);
    const preview = bankReconcilePreview(accountId, '2026-01-31', db);
    // The 'suggested' transaction is unreconciled and not in RECONCILABLE_STATUSES
    expect(preview.unreconciledCount).toBeGreaterThanOrEqual(1);
  });

  it('unmatched transaction appears in unreconciledCount in preview', () => {
    const { accountId, statementId } = seed(db);
    db.prepare(
      `INSERT INTO bank_transactions
         (bank_account_id, bank_statement_id, transaction_date, description, amount, match_status)
       VALUES (?, ?, '2026-01-25', 'Non réconcilié', 0.00, 'unmatched')`
    ).run(accountId, statementId);
    const preview = bankReconcilePreview(accountId, '2026-01-31', db);
    expect(preview.unreconciledCount).toBeGreaterThanOrEqual(2);
  });
});
