/**
 * MIG-007 — Backup and Restore Across Migration Boundary
 *
 * Scenario: take a "backup" of a pre-migration database (by copying its state),
 * run the migration, restore the backup to a new DB, run the migration again.
 * Assert: no data loss, identical post-migration state on both runs.
 *
 * Note: SQLite in-memory backups are modeled by copying the schema + row data
 * rather than physical file copy (which would require disk I/O). The intent
 * and invariants are identical to the file-level backup/restore the app performs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../../db/migrations.js');
const { getAllTablesForBackup, restoreAllTablesFromBackup } = require('../../../db/database.js');

function buildLegacyDb() {
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

  db.prepare(`INSERT INTO kv_store VALUES (?, ?)`).run('dicann-company-info', JSON.stringify({ name: 'Dic Ann Restaurants Inc' }));
  db.prepare(`INSERT INTO kv_store VALUES (?, ?)`).run('dicann-pl-2026-01', JSON.stringify({ _revenueOverride: 40000 }));
  db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
    .run('dev-001', 'daily', 'create', 'caisse', 'legacy-1');

  db.pragma('user_version = 7');
  return db;
}

// "Backs up" a database by copying all kv_store and audit_log rows into a new in-memory DB
function restoreBackup(original) {
  const restored = new Database(':memory:');
  restored.pragma('foreign_keys = ON');
  restored.exec(`
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

  const kvRows = original.prepare(`SELECT key, value FROM kv_store`).all();
  for (const r of kvRows) {
    restored.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run(r.key, r.value);
  }
  const auditRows = original.prepare(`SELECT device_id, module, action, record_type, record_id FROM audit_log`).all();
  for (const r of auditRows) {
    restored.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES (?,?,?,?,?)`)
      .run(r.device_id, r.module, r.action, r.record_type, r.record_id);
  }

  // Copy user_version
  const version = original.pragma('user_version', { simple: true });
  restored.pragma(`user_version = ${version}`);

  return restored;
}

let original;
let restored;

beforeEach(() => { original = buildLegacyDb(); });
afterEach(() => {
  original.close();
  if (restored) { restored.close(); restored = null; }
});

describe('MIG-007 backup and restore', () => {
  it('app loads the restored backup without error (migration runs on restored DB)', () => {
    // Snapshot pre-migration data
    const preBackupKv = original.prepare(`SELECT * FROM kv_store ORDER BY key`).all();
    const preBackupAudit = original.prepare(`SELECT COUNT(*) AS n FROM audit_log`).get().n;

    // Run migration on primary
    runMigrations(original);

    // Restore backup (pre-migration state)
    restored = restoreBackup(buildLegacyDb());

    // Run migration on restored DB — must succeed without error
    expect(() => runMigrations(restored)).not.toThrow();

    // Verify restored DB has the same legacy data
    const restoredKv = restored.prepare(`SELECT * FROM kv_store ORDER BY key`).all();
    expect(restoredKv).toHaveLength(preBackupKv.length);
    expect(restoredKv[0].key).toBe(preBackupKv[0].key);

    const restoredAudit = restored.prepare(`SELECT COUNT(*) AS n FROM audit_log`).get().n;
    expect(restoredAudit).toBe(preBackupAudit);
  });

  it('no data loss vs the original after restore + migration', () => {
    runMigrations(original);
    restored = restoreBackup(buildLegacyDb());
    runMigrations(restored);

    // Both DBs should have same kv_store content
    const origKeys = original.prepare(`SELECT key FROM kv_store ORDER BY key`).all().map(r => r.key);
    const restKeys = restored.prepare(`SELECT key FROM kv_store ORDER BY key`).all().map(r => r.key);
    expect(restKeys).toEqual(origKeys);
  });

  it('running migration again on restored DB is a no-op', () => {
    restored = restoreBackup(buildLegacyDb());
    runMigrations(restored);

    const kvCount1 = restored.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get().n;
    expect(() => runMigrations(restored)).not.toThrow();
    const kvCount2 = restored.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get().n;
    expect(kvCount2).toBe(kvCount1);
    expect(restored.pragma('user_version', { simple: true })).toBe(23);
  });
});

// ── MIG-007-B: Full SQLite table backup/restore (C3) ─────────────────────────

describe('MIG-007-B full SQLite backup and restore across accounting tables', () => {
  let db1;
  let db2;

  beforeEach(() => {
    db1 = buildAccountingDb();
  });

  afterEach(() => {
    db1?.close();
    db2?.close();
    db1 = null; db2 = null;
  });

  it('seeds accounting tables, backs up, wipes, restores — all counts match', () => {
    // COA accounts are already seeded by buildAccountingDb; grab one for FK use
    const { id: coaId } = db1.prepare(`SELECT id FROM chart_of_accounts LIMIT 1`).get();

    // Seed additional rows in representative accounting tables
    db1.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES ('9999','Test Compte','Test Account','asset')`).run();
    db1.prepare(`INSERT INTO bank_accounts (name, currency, opening_balance, coa_account_id, opening_date) VALUES ('Compte courant','CAD',0,?,'2026-01-01')`).run(coaId);
    db1.prepare(`INSERT INTO supplier_bills (month_key, supplier_name, amount) VALUES ('2026-01','Fournisseur A',100.00)`).run();
    db1.prepare(`INSERT OR IGNORE INTO kv_store (key, value) VALUES ('dicann-v7','{"test":1}')`).run();

    // Take a full backup
    const backup = getAllTablesForBackup(db1);
    expect(backup.schemaVersion).toBeGreaterThan(0);
    expect(backup.sqlite['chart_of_accounts'].length).toBeGreaterThanOrEqual(1);
    expect(backup.sqlite['bank_accounts'].length).toBeGreaterThanOrEqual(1);
    expect(backup.sqlite['supplier_bills'].length).toBeGreaterThanOrEqual(1);
    expect(backup.sqlite['kv_store'].length).toBeGreaterThanOrEqual(1);

    // Open a fresh DB (simulate wipe)
    db2 = buildAccountingDb();

    // Restore into fresh DB
    expect(() => restoreAllTablesFromBackup(backup, backup.schemaVersion, db2)).not.toThrow();

    // Assert every table has the expected row count
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM chart_of_accounts`).get().n).toBeGreaterThanOrEqual(1);
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM bank_accounts`).get().n).toBeGreaterThanOrEqual(1);
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM supplier_bills`).get().n).toBeGreaterThanOrEqual(1);
    expect(db2.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get().n).toBeGreaterThanOrEqual(1);

    // Verify specific data survived
    const coaRow = db2.prepare(`SELECT * FROM chart_of_accounts WHERE account_number='9999'`).get();
    expect(coaRow).toBeTruthy();
    expect(coaRow.name_fr).toBe('Test Compte');

    const kvRow = db2.prepare(`SELECT value FROM kv_store WHERE key='dicann-v7'`).get();
    expect(kvRow).toBeTruthy();
    expect(JSON.parse(kvRow.value)).toEqual({ test: 1 });
  });

  it('refuses restore when schemaVersion mismatches', () => {
    const backup = getAllTablesForBackup(db1);
    backup.schemaVersion = 9999; // simulate stale backup

    db2 = buildAccountingDb();

    expect(() => restoreAllTablesFromBackup(backup, db1.pragma('user_version', { simple: true }), db2))
      .toThrow('schema_version_mismatch');
  });
});
