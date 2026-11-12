/**
 * RESTORE-001  a backup with posted entries restores into an empty database
 * RESTORE-002  a restore replaces the books, it does not merge into them
 * RESTORE-003  the audit log keeps its history through a restore
 * RESTORE-004  a backup holding an unbalanced entry is refused whole
 * RESTORE-005  the guard triggers are back after a restore, and after a refused one
 * RESTORE-006  a backup from an older version is carried forward by the migrations
 * RESTORE-007  newer backups, and older ones without their structure, are refused
 * RESTORE-008  this machine's credentials and device id survive a restore
 *
 * The daily backup could not be restored on a new or wiped Mac: an entry's lines
 * went in one at a time, and the balance check refused the first line of every
 * posted entry. And a restore merged into whatever was there.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  getAllTablesForBackup, restoreAllTablesFromBackup, glDraftEntry, glPostEntry, backupDatabaseFile,
} = require('../../../db/database.js');

const open = [];
afterEach(() => { while (open.length) open.pop().close(); });

function books() {
  const db = buildAccountingDb();
  open.push(db);
  for (const [num, name, type] of [
    ['1010', 'Cash', 'asset'], ['1100', 'Receivables', 'asset'], ['4000', 'Sales', 'revenue'], ['6100', 'Rent', 'expense'],
  ]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, name, name, type);
  }
  return db;
}
const acc = (db, n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;
function post(db, date, debit, credit, cents, description = 'entry') {
  const { entryId } = glDraftEntry({ entry_date: date, description, lines: [
    { account_id: acc(db, debit), debit_cents: cents, credit_cents: 0 },
    { account_id: acc(db, credit), debit_cents: 0, credit_cents: cents },
  ] }, db);
  glPostEntry(entryId, db);
  return entryId;
}
const count = (db, t, where = '1=1') => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).get().n;
const lines = (db) => db.prepare(`SELECT entry_id, account_id, debit_cents, credit_cents FROM journal_lines ORDER BY id`).all();

describe('RESTORE-001 into an empty database', () => {
  it('brings back every posted entry and its lines', () => {
    const src = books();
    post(src, '2026-10-01', '1100', '4000', 125000, 'Invoice');
    post(src, '2026-10-15', '1010', '1100', 125000, 'Payment');
    post(src, '2026-10-20', '6100', '1010', 40000, 'Rent');
    src.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('dicann-fac-factures', '[{"numero":"F-0001"}]')`).run();
    const backup = JSON.parse(JSON.stringify(getAllTablesForBackup(src)));

    const fresh = buildAccountingDb(); open.push(fresh);
    expect(restoreAllTablesFromBackup(backup, undefined, fresh)).toEqual({ ok: true, upgradedFrom: null });
    expect(count(fresh, 'journal_entries', "status='posted'")).toBe(3);
    expect(lines(fresh)).toEqual(lines(src));
    expect(fresh.prepare(`SELECT value FROM kv_store WHERE key='dicann-fac-factures'`).get().value).toBe('[{"numero":"F-0001"}]');
    expect(fresh.pragma('foreign_key_check')).toEqual([]);
    expect(fresh.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

describe('RESTORE-002 replace, not merge', () => {
  it('removes what was added after the backup and brings back what was deleted', () => {
    const db = books();
    post(db, '2026-10-01', '1100', '4000', 5000, 'Before the backup');
    db.prepare(`INSERT INTO bank_accounts (name, account_type, coa_account_id, opening_balance, opening_date) VALUES ('Old account', 'bank', ?, 0, '2026-01-01')`).run(acc(db, '1010'));
    const backup = getAllTablesForBackup(db);

    post(db, '2026-10-02', '1100', '4000', 7000, 'After the backup');
    db.prepare(`DELETE FROM bank_accounts`).run();
    db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('added-later', '1')`).run();

    restoreAllTablesFromBackup(backup, undefined, db);
    expect(db.prepare(`SELECT description FROM journal_entries ORDER BY id`).all().map(r => r.description)).toEqual(['Before the backup']);
    expect(db.prepare(`SELECT name FROM bank_accounts`).all().map(r => r.name)).toEqual(['Old account']);
    expect(count(db, 'kv_store', "key='added-later'")).toBe(0);
  });
});

describe('RESTORE-003 history', () => {
  it('keeps audit rows written after the backup and adds the backup\'s', () => {
    const db = books();
    db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES ('d', 'GL', 'before', 'x', '1')`).run();
    const backup = getAllTablesForBackup(db);
    db.prepare(`INSERT INTO audit_log (device_id, module, action, record_type, record_id) VALUES ('d', 'GL', 'after', 'x', '2')`).run();

    restoreAllTablesFromBackup(backup, undefined, db);
    expect(db.prepare(`SELECT action FROM audit_log ORDER BY id`).all().map(r => r.action)).toEqual(['before', 'after']);
    expect(() => db.prepare(`DELETE FROM audit_log`).run()).toThrow(/IMMUTABLE/);
  });
});

describe('RESTORE-004 an unbalanced backup', () => {
  it('is refused and the books stay as they were', () => {
    const db = books();
    post(db, '2026-10-01', '1100', '4000', 5000, 'Current');
    const backup = JSON.parse(JSON.stringify(getAllTablesForBackup(db)));
    backup.sqlite.journal_lines[0].debit_cents = 4999;     // a damaged file

    expect(() => restoreAllTablesFromBackup(backup, undefined, db)).toThrow(/unbalanced_entries/);
    expect(db.prepare(`SELECT SUM(debit_cents) AS d FROM journal_lines`).get().d).toBe(5000);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

describe('RESTORE-005 guards come back', () => {
  it('after a restore and after a refused restore', () => {
    const db = books();
    const entryId = post(db, '2026-10-01', '1100', '4000', 5000);
    const triggers = () => db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name`).all();
    const before = triggers();
    const backup = getAllTablesForBackup(db);
    restoreAllTablesFromBackup(backup, undefined, db);
    expect(triggers()).toEqual(before);
    const bad = JSON.parse(JSON.stringify(backup)); bad.sqlite.journal_lines[0].debit_cents = 1;
    expect(() => restoreAllTablesFromBackup(bad, undefined, db)).toThrow();
    expect(triggers()).toEqual(before);
    // The balance check still works on a posted entry.
    expect(() => db.prepare(`INSERT INTO journal_lines (entry_id, line_number, account_id, debit_cents, credit_cents) VALUES (?, 9, ?, 100, 0)`)
      .run(entryId, acc(db, '1010'))).toThrow(/s[ée]quilibr[ée]e/);
  });
});

describe('RESTORE-006 an older backup', () => {
  it('is rebuilt from its own structure and carried forward by the migrations', () => {
    const src = books();
    post(src, '2026-10-01', '1100', '4000', 5000);
    const backup = JSON.parse(JSON.stringify(getAllTablesForBackup(src)));
    const latest = backup.schemaVersion;
    // As written by the version before the cheque register (v50): no cheques table.
    backup.schemaVersion = latest - 1;
    backup.schema = backup.schema.filter(o => o.name !== 'cheques' && !/ON cheques\b/.test(o.sql));
    delete backup.sqlite.cheques;

    const fresh = buildAccountingDb(); open.push(fresh);
    expect(restoreAllTablesFromBackup(backup, undefined, fresh)).toEqual({ ok: true, upgradedFrom: latest - 1 });
    expect(count(fresh, 'journal_entries', "status='posted'")).toBe(1);
    expect(count(fresh, 'cheques')).toBe(0);
    expect(fresh.pragma('user_version', { simple: true })).toBe(latest);
  });
});

describe('RESTORE-007 refused versions', () => {
  it('a newer backup, and an older one that does not carry its structure', () => {
    const db = books();
    const backup = getAllTablesForBackup(db);
    expect(() => restoreAllTablesFromBackup({ ...backup, schemaVersion: backup.schemaVersion + 1 }, undefined, db)).toThrow(/schema_version_newer/);
    const { schema, ...noSchema } = backup;
    // One version back restores directly when the migration in between is marked
    // restoreSafe; further back (49, whose next step 50 is not restoreSafe), without its structure, a backup is refused.
    expect(() => restoreAllTablesFromBackup({ ...noSchema, schemaVersion: 49 }, undefined, db)).toThrow(/schema_version_mismatch/);
  });
});

describe('RESTORE-008 this machine', () => {
  it('keeps its credentials and its device id', () => {
    const db = books();
    db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('balanceiq-device-id', 'old-mac')`).run();
    const backup = getAllTablesForBackup(db);
    db.prepare(`UPDATE kv_store SET value='this-mac' WHERE key='balanceiq-device-id'`).run();
    db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('pos-credentials', '{"tok":1}')`).run();
    restoreAllTablesFromBackup(backup, undefined, db);
    expect(db.prepare(`SELECT value FROM kv_store WHERE key='balanceiq-device-id'`).get().value).toBe('this-mac');
    expect(db.prepare(`SELECT value FROM kv_store WHERE key='pos-credentials'`).get().value).toBe('{"tok":1}');
  });
});

describe('RESTORE-009 file copy', () => {
  it('copies the database to a new file and never overwrites one', async () => {
    const fs = await import('fs'); const os = await import('os'); const path = await import('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-restore-'));
    const file = path.join(dir, 'copy.db');
    const db = books();
    post(db, '2026-10-01', '1100', '4000', 5000);
    backupDatabaseFile(file, db);
    const Database = require('better-sqlite3');
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).get().n).toBe(1);
    copy.close();
    expect(() => backupDatabaseFile(file, db)).toThrow(/backup_file_exists/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
