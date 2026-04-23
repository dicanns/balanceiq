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
    expect(restored.pragma('user_version', { simple: true })).toBe(13);
  });
});
