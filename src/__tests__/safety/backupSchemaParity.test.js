/**
 * SAFETY-001 — Backup schema parity
 *
 * Asserts that every real SQLite table in the app schema is included in the
 * getAllTablesForBackup output. Fails if a future migration adds a table
 * without updating the backup logic.
 *
 * Run standalone: npm run test:backup-parity
 * Run as part of full suite: npm test
 */
import { describe, it, expect } from 'vitest';
import { buildAccountingDb } from '../accounting/helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getAllTablesForBackup } = require('../../db/database.js');

describe('SAFETY-001 backup schema parity', () => {
  it('every real SQLite table appears in backup output', () => {
    const db = buildAccountingDb();

    const allTables = db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND (sql NOT LIKE 'CREATE VIRTUAL%' OR sql IS NULL)`
    ).all().map(r => r.name);

    const { sqlite } = getAllTablesForBackup(db);
    const backedUpTables = Object.keys(sqlite);

    const missing = allTables.filter(t => {
      // FTS shadow tables are intentionally excluded by getAllTablesForBackup
      if (/_(data|idx|content|docsize|config)$/.test(t)) return false;
      return !backedUpTables.includes(t);
    });

    expect(missing, `Tables not covered by backup: ${missing.join(', ')}`).toEqual([]);

    db.close();
  });

  it('backup output contains no FTS shadow tables', () => {
    const db = buildAccountingDb();
    const { sqlite } = getAllTablesForBackup(db);
    const shadow = Object.keys(sqlite).filter(t => /_(data|idx|content|docsize|config)$/.test(t));
    expect(shadow, `FTS shadow tables leaked into backup: ${shadow.join(', ')}`).toEqual([]);
    db.close();
  });
});
