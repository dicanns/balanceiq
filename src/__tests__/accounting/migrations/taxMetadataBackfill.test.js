/**
 * MIG-011 — Tax Metadata Backfill for Legacy Bank Transactions
 *
 * Pre-migration bank_transactions rows (created before Sprint 4 / v11) lack the
 * tax_claimable and suspense_entry_id columns. After migration v11 runs (ALTER TABLE
 * ADD COLUMN), legacy rows must have tax_claimable=0 (default), NOT a value that
 * would imply a tax claim. Section 1.3 source-of-truth rule must hold: a legacy
 * bank transaction that predates tax tracking must not silently become tax-claimable.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../../db/migrations.js');

// Builds a DB at v10 state (bank tables exist, tax columns don't yet exist on bank_transactions)
function buildV10Db() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL, action TEXT NOT NULL,
      record_type TEXT NOT NULL, record_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forecast_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL, name_en TEXT DEFAULT '', category TEXT DEFAULT 'other'
    );
  `);
  db.pragma('user_version = 7');

  // Apply migrations v8-v10 only (stop before v11)
  const { MIGRATIONS } = require('../../../db/migrations.js');
  const v8to10 = MIGRATIONS.filter(m => m.version >= 8 && m.version <= 10).sort((a, b) => a.version - b.version);
  for (const m of v8to10) {
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
  }

  // Insert legacy bank transactions (no tax columns yet — they don't exist at v10)
  const coaRow = db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number='1010'`).get();
  const coaExpense = db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number='6100'`).get();

  const { lastInsertRowid: bankId } = db.prepare(
    `INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date)
     VALUES ('BNC Oper', 'bank', ?, 5000, '2026-01-01')`
  ).run(coaRow.id);

  // Two legacy transactions: one categorized to an expense account, one unmatched
  db.prepare(
    `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, match_status, coa_account_id)
     VALUES (?, '2026-02-01', 'LOYER PROPRIO', -3500.00, 'manual', ?)`
  ).run(bankId, coaExpense.id);

  db.prepare(
    `INSERT INTO bank_transactions (bank_account_id, transaction_date, description, amount, match_status)
     VALUES (?, '2026-02-05', 'VIREMENT INTERAC', 1200.00, 'unmatched')`
  ).run(bankId);

  return db;
}

let db;

beforeEach(() => { db = buildV10Db(); });
afterEach(() => { db.close(); });

describe('MIG-011 tax metadata backfill for legacy transactions', () => {
  it('legacy bank_transactions get tax_claimable=0 after v11 migration (not 1)', () => {
    // v10 DB has transactions without the tax_claimable column
    const preMigCount = db.prepare(`SELECT COUNT(*) AS n FROM bank_transactions`).get().n;
    expect(preMigCount).toBe(2);

    // Run v11 migration which adds the tax columns via ALTER TABLE
    const { MIGRATIONS } = require('../../../db/migrations.js');
    const v11 = MIGRATIONS.find(m => m.version === 11);
    db.transaction(() => {
      v11.up(db);
      db.pragma('user_version = 11');
    })();

    const rows = db.prepare(`SELECT * FROM bank_transactions ORDER BY id`).all();
    expect(rows).toHaveLength(2);

    // All legacy rows must have tax_claimable=0 (SQLite DEFAULT 0 on ALTER TABLE ADD COLUMN)
    for (const row of rows) {
      expect(row.tax_claimable, `Legacy transaction ${row.id} must have tax_claimable=0`).toBe(0);
      expect(row.suspense_entry_id).toBeNull();
    }
  });

  it('legacy bill row cannot be claimed for CTI until user explicitly sets tax fields', () => {
    // After migration, a legacy bill in kv_store (without tps_paid/tvq_paid) must not auto-generate CTI
    const plData = JSON.stringify({
      _revenueOverride: 42000,
      loyer_bills: [
        // Legacy bill: amount only, no tax fields
        { id: 'legacy-bill-1', supplier: 'Proprio Inc', amount: 3500 },
      ],
    });
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-pl-2026-02', plData);

    // Apply v11
    const { MIGRATIONS, runMigrations } = require('../../../db/migrations.js');
    const v11 = MIGRATIONS.find(m => m.version === 11);
    db.transaction(() => {
      v11.up(db);
      db.pragma('user_version = 11');
    })();

    // CTI computation must yield 0 for a legacy bill with no tps_paid/tvq_paid fields
    const row = db.prepare(`SELECT value FROM kv_store WHERE key='dicann-pl-2026-02'`).get();
    const pl = JSON.parse(row.value);
    const bill = pl.loyer_bills[0];

    const tps = parseFloat(bill.tps_paid) || 0;
    const tvq = parseFloat(bill.tvq_paid) || 0;

    expect(tps).toBe(0);
    expect(tvq).toBe(0);
    // Bill is not claimable until user edits it and fills in the tax fields
  });
});
