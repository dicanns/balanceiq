/**
 * FK-001  a child row pointing at a missing parent is refused
 * FK-002  the demo purge removes children before parents and keeps periods in use
 * FK-003  a backup restore with children listed before parents still succeeds
 * FK-004  a restore that would leave orphans is rolled back, not committed
 *
 * Every REFERENCES clause in the schema was decorative: SQLite enforces foreign
 * keys only when asked, per connection, and nothing asked. The app connection
 * now asks, after migrations; the test database does the same.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { demoPurgeSqlite, restoreAllTablesFromBackup, supplierBillRecord, enableForeignKeys } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'], ['1400', 'GST receivable', 'asset'], ['1410', 'QST receivable', 'asset'],
    ['2010', 'AP', 'liability'], ['6100', 'Rent', 'expense'],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type, itc_pct) VALUES (?,?,?,?,100)`)
      .run(num, name, name, type);
  }
});
afterEach(() => { db?.close(); db = null; });
const acc = (n) => db.prepare(`SELECT * FROM chart_of_accounts WHERE account_number=?`).get(n);

describe('FK-001 orphans are refused', () => {
  it('a bank transaction for an account that does not exist cannot be written', () => {
    expect(enableForeignKeys(db)).toBe(true);
    expect(() => db.prepare(
      `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount) VALUES (999, '2026-09-01', 'x', -1)`
    ).run()).toThrow(/FOREIGN KEY/);
  });
});

describe('FK-002 the demo purge', () => {
  it('removes payments before bills and keeps a period that real entries use', () => {
    const { id } = supplierBillRecord({
      month_key: '2026-08', supplier_name: 'Real Supplier', amount: 100, bill_date: '2026-08-04',
      tps_paid: 0, tvq_paid: 0, coa_account_id: acc('6100').id,
    }, db);
    db.prepare(`INSERT INTO supplier_payments (supplier_bill_id, amount, payment_date) VALUES (?, 100, '2026-08-10')`).run(id);
    expect(() => demoPurgeSqlite(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM supplier_payments`).get().n).toBe(0);
    // The real bill's entry is not demo data; its period must survive the purge.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type='supplier_bill'`).get().n).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM accounting_periods`).get().n).toBe(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('FK-003 restore order', () => {
  it('children listed before parents still restore', () => {
    const version = db.pragma('user_version', { simple: true });
    const cash = acc('1010').id;
    restoreAllTablesFromBackup({
      schemaVersion: version,
      sqlite: {
        bank_transactions: [{ id: 1, bank_account_id: 7, transaction_date: '2026-09-01', description: 'first', amount: -5, match_status: 'unmatched', reconciled: 0 }],
        bank_accounts: [{ id: 7, name: 'Chequing', account_type: 'bank', coa_account_id: cash, opening_balance: 0, opening_date: '2026-01-01', currency: 'CAD', is_archived: 0 }],
      },
    }, version, db);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM bank_transactions WHERE bank_account_id=7`).get().n).toBe(1);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

describe('FK-004 a restore that leaves orphans', () => {
  it('is rolled back whole', () => {
    const version = db.pragma('user_version', { simple: true });
    expect(() => restoreAllTablesFromBackup({
      schemaVersion: version,
      sqlite: { bank_transactions: [{ id: 2, bank_account_id: 404, transaction_date: '2026-09-01', description: 'orphan', amount: -5, match_status: 'unmatched', reconciled: 0 }] },
    }, version, db)).toThrow(/foreign_key_violations/);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM bank_transactions`).get().n).toBe(0);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
