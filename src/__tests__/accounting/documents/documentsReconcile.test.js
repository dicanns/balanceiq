/**
 * DOC-020  a kv list written by something that does not know the table wins at load
 * DOC-021  a table in step with its mirror is returned as is, and nothing is rewritten
 * DOC-022  a mirror that cannot be stored as rows is left alone
 *
 * Going back to an older version of the app must lose nothing: that version
 * edits the kv list only. When the newer version starts again, the list is the
 * newer of the two and the table takes it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { documentsList, documentsListReconciled, documentsSaveChanges } = require('../../../db/database.js');

const open = [];
afterEach(() => { while (open.length) open.pop().close(); });
function fresh() { const db = buildAccountingDb(); open.push(db); return db; }
const KEY = 'dicann-fac-factures';
const d = (id, extra = {}) => ({ id, numero: 'F-' + id, statut: 'Brouillon', ...extra });
const setKv = (db, list) => db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(KEY, JSON.stringify(list));

describe('DOC-020 an outside write to the list', () => {
  it('is adopted: edits, additions and removals made by an older version', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('1'), d('2'), d('3')], deletes: [], order: ['1', '2', '3'] }, db);
    setKv(db, [d('1', { notes: 'edited in the old version' }), d('3'), d('4')]);
    const got = documentsListReconciled('facture', db);
    expect(got.map(x => x.id)).toEqual(['1', '3', '4']);
    expect(got[0].notes).toBe('edited in the old version');
    expect(documentsList('facture', db)).toEqual(got);
  });
});

describe('DOC-021 in step', () => {
  it('returns the table and writes nothing', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('1'), d('2')], deletes: [], order: ['1', '2'] }, db);
    const before = db.prepare('SELECT total_changes() AS n').get().n;
    expect(documentsListReconciled('facture', db).map(x => x.id)).toEqual(['1', '2']);
    expect(db.prepare('SELECT total_changes() AS n').get().n).toBe(before);
  });
});

describe('DOC-022 a mirror that is not a storable list', () => {
  it('leaves the table as it is', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('1')], deletes: [], order: ['1'] }, db);
    db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(KEY, '{not json');
    expect(documentsListReconciled('facture', db).map(x => x.id)).toEqual(['1']);
    setKv(db, [{ numero: 'no id' }]);
    expect(documentsListReconciled('facture', db).map(x => x.id)).toEqual(['1']);
  });
});

describe('DOC-023 a backup from just before the documents table', () => {
  it('restores without carrying its structure, and the table is rebuilt from its lists', () => {
    const { getAllTablesForBackup, restoreAllTablesFromBackup, backupRestoreVerdict } = require('../../../db/database.js');
    const src = fresh();
    setKv(src, [d('7', { statut: 'Envoyée' }), d('8')]);
    const backup = JSON.parse(JSON.stringify(getAllTablesForBackup(src)));
    // As an app one version back wrote it: no structure, no documents table.
    backup.schemaVersion -= 1;
    delete backup.schema;
    delete backup.sqlite.documents;

    const target = fresh();
    expect(backupRestoreVerdict(backup, target)).toBe('direct');
    restoreAllTablesFromBackup(backup, undefined, target);
    expect(documentsList('facture', target).map(x => x.id)).toEqual(['7', '8']);
    // Two versions back is not known to be safe without the structure.
    expect(backupRestoreVerdict({ ...backup, schemaVersion: backup.schemaVersion - 1 }, target)).toBe('too_old');
  });
});
