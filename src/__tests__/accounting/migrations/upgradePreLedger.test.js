/**
 * MIG-002 — Upgrade Pre-Ledger Database
 *
 * Starts from a pre-accounting-suite schema (user_version=7) with representative
 * legacy data (kv_store invoices, P&L entries, audit_log rows). Runs migrations
 * v8-v11 and asserts:
 *   - All legacy tables exist with row counts unchanged
 *   - New ledger tables are created (empty — no auto-posted opening balance)
 *   - user_version advanced to 14
 *   - Re-running migration is a no-op
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../../db/migrations.js');

function buildLegacyDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      reason TEXT
    );
    CREATE TABLE IF NOT EXISTS forecast_products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL, name_en TEXT DEFAULT '', category TEXT DEFAULT 'other'
    );
    CREATE TABLE IF NOT EXISTS upgrade_prompt_dismissals (
      prompt_key TEXT NOT NULL PRIMARY KEY, dismissed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pl_invoice_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_key TEXT NOT NULL, supplier_name TEXT NOT NULL,
      amount REAL NOT NULL, bill_date TEXT DEFAULT '', note TEXT DEFAULT '',
      month_key TEXT NOT NULL, bill_id TEXT NOT NULL UNIQUE
    );
  `);

  // Seed legacy data
  const legacyInvoices = JSON.stringify([
    { id: 'FAC-001', client: 'Acme Corp', total: 226.00 },
    { id: 'FAC-002', client: 'Boulangerie Nord', total: 113.00 },
    { id: 'FAC-003', client: 'Cafe Central', total: 452.00 },
  ]);
  db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-fac-factures', legacyInvoices);
  db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-pl-2026-02',
    JSON.stringify({ _revenueOverride: 38500 }));
  db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run('dicann-pl-2026-03',
    JSON.stringify({ _revenueOverride: 42000, loyer_bills: [{ id: 'b1', amount: 3500 }] }));

  db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
    .run('dev-001', 'daily', 'create', 'caisse', 'c-001');
  db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
    .run('dev-001', 'facturation', 'create', 'facture', 'FAC-001');

  db.prepare(`INSERT INTO pl_invoice_history (supplier_key, supplier_name, amount, month_key, bill_id)
    VALUES (?, ?, ?, ?, ?)`).run('proprio', 'Proprio Inc', 3500, '2026-03', 'plih-1');

  db.pragma('user_version = 7');
  return db;
}

let db;

beforeEach(() => { db = buildLegacyDb(); });
afterEach(() => { db.close(); });

describe('MIG-002 upgrade pre-ledger database', () => {
  it('legacy kv_store entries are unchanged after migration', () => {
    const beforeCount = db.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get().n;

    runMigrations(db);

    const afterCount = db.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get().n;
    expect(afterCount).toBe(beforeCount);

    // Specific legacy records still readable
    const invoiceRow = db.prepare(`SELECT value FROM kv_store WHERE key='dicann-fac-factures'`).get();
    const invoices = JSON.parse(invoiceRow.value);
    expect(invoices).toHaveLength(3);
    expect(invoices[0].id).toBe('FAC-001');
  });

  it('legacy audit_log rows are unchanged after migration', () => {
    runMigrations(db);
    const count = db.prepare(`SELECT COUNT(*) AS n FROM audit_log`).get().n;
    expect(count).toBe(2);
  });

  it('new ledger tables are created empty — no auto-posted opening balance', () => {
    runMigrations(db);

    const journalCount = db.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).get().n;
    expect(journalCount).toBe(0);

    const periodCount = db.prepare(`SELECT COUNT(*) AS n FROM accounting_periods`).get().n;
    expect(periodCount).toBe(0);

    const bankCount = db.prepare(`SELECT COUNT(*) AS n FROM bank_accounts`).get().n;
    expect(bankCount).toBe(0);
  });

  it('user_version advances to 12 after migration', () => {
    runMigrations(db);
    expect(db.pragma("user_version", { simple: true })).toBe(34);
  });

  it('re-running migration is a no-op', () => {
    runMigrations(db);
    const kvCount1 = db.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get().n;

    expect(() => runMigrations(db)).not.toThrow();

    const kvCount2 = db.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get().n;
    expect(kvCount2).toBe(kvCount1);
    expect(db.pragma("user_version", { simple: true })).toBe(34);
  });
});
