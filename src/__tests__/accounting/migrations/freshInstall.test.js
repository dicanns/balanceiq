/**
 * MIG-001 — Fresh Install: Accounting Suite Migrations on Clean Database
 *
 * Simulates a brand-new BalanceIQ user (or a user whose DB is at v7 before
 * the accounting suite shipped). Runs migrations v8-v14 and asserts:
 *   - All accounting tables are created
 *   - COA seed data is present (>= 70 accounts)
 *   - PRAGMA user_version reflects v14
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MIGRATIONS, runMigrations } = require('../../../db/migrations.js');

function buildPreAccountingDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Create only the base tables that exist before v8
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forecast_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL,
      name_en TEXT DEFAULT '',
      category TEXT DEFAULT 'other'
    );
  `);
  db.pragma('user_version = 7');
  return db;
}

let db;

beforeEach(() => { db = buildPreAccountingDb(); });
afterEach(() => { db.close(); });

describe('MIG-001 fresh accounting install', () => {
  it('all accounting tables are created after running v8-v12 migrations', () => {
    runMigrations(db);

    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all().map(r => r.name);

    const required = [
      'chart_of_accounts',
      'accounting_periods',
      'journal_entries',
      'journal_lines',
      'bank_accounts',
      'bank_statements',
      'bank_transactions',
      'bank_match_learned',
      'supplier_tax_profiles',
      'tax_periods',
      'tax_calc_log',
      'supplier_bills',
      'supplier_payments',
      'assets',
      'cca_class_rates',
      'asset_depreciation_log',
      'balance_sheet_snapshots',
      'source_documents',
      'recurring_rules',
      'recurring_generated',
    ];

    for (const t of required) {
      expect(tables, `Table '${t}' must be created by migrations`).toContain(t);
    }
  });

  it('COA seed data contains at least 70 accounts after migration', () => {
    runMigrations(db);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM chart_of_accounts`).get().n;
    expect(count).toBeGreaterThanOrEqual(70);
  });

  it('PRAGMA user_version is 14 after all accounting migrations run', () => {
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(24);
  });

  it('running migrations again is a no-op (idempotency)', () => {
    runMigrations(db);
    const countAfterFirst = db.prepare(`SELECT COUNT(*) AS n FROM chart_of_accounts`).get().n;

    // Run again — must not throw and must not change data
    expect(() => runMigrations(db)).not.toThrow();

    const countAfterSecond = db.prepare(`SELECT COUNT(*) AS n FROM chart_of_accounts`).get().n;
    expect(countAfterSecond).toBe(countAfterFirst);

    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(24);
  });
});
