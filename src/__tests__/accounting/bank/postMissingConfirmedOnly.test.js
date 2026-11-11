/**
 * POSTMISS-001  "Post missing entries" posts only lines a person confirmed;
 *               a suggested category is not a decision.
 * Figures and names are invented.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const { bankPostMissingEntries } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [['2210', 'Card', 'liability'], ['6100', 'Supplies', 'expense']])
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
});
afterEach(() => { db?.close(); db = null; });

describe('POSTMISS-001', () => {
  it('skips suggested lines and posts confirmed ones', () => {
    const coa = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;
    const acct = db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Sample Card','credit_card',?,0,'2026-08-01')`).run(coa('2210')).lastInsertRowid;
    const ins = db.prepare(`INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, match_status, coa_account_id) VALUES (?, '2026-08-20', ?, -25, ?, ?)`);
    const sug = ins.run(acct, 'SAMPLE SUGGESTED', 'suggested', coa('6100')).lastInsertRowid;
    const man = ins.run(acct, 'SAMPLE CONFIRMED', 'manual', coa('6100')).lastInsertRowid;
    bankPostMissingEntries(acct, db);
    const entry = (id) => db.prepare(`SELECT journal_entry_id AS j FROM bank_transactions WHERE id=?`).get(id).j;
    expect(entry(sug)).toBeNull();
    expect(entry(man)).not.toBeNull();
  });
});
