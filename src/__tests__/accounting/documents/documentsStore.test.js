/**
 * DOC-010  documentsSaveChanges upserts, deletes and orders in one transaction
 * DOC-011  documentsReplaceAll makes the table equal the list
 * DOC-012  every write rewrites the kv_store mirror, without the size cap or clamping
 * DOC-013  withTransaction rolls everything back when its function throws
 * DOC-014  restoring a backup without the documents table rebuilds it from the restored lists
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  documentsList, documentsSaveChanges, documentsReplaceAll, withTransaction,
  getAllTablesForBackup, restoreAllTablesFromBackup,
} = require('../../../db/database.js');

const open = [];
afterEach(() => { while (open.length) open.pop().close(); });
function fresh() { const db = buildAccountingDb(); open.push(db); return db; }
const mirror = (db, key = 'dicann-fac-factures') => {
  const r = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
  return r ? JSON.parse(r.value) : undefined;
};
const ids = (db, kind = 'facture') => documentsList(kind, db).map(d => d.id);
const d = (id, extra = {}) => ({ id, numero: 'N' + id, statut: 'Brouillon', ...extra });

describe('DOC-010 documentsSaveChanges', () => {
  it('inserts new documents at the end and replaces existing ones by id', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a'), d('b')] }, db);
    documentsSaveChanges('facture', { upserts: [d('c'), d('a', { statut: 'Envoyée' })] }, db);
    expect(ids(db)).toEqual(['a', 'b', 'c']);
    expect(documentsList('facture', db)[0].statut).toBe('Envoyée');
  });

  it('deletes ids and ignores ids that are not stored', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a'), d('b'), d('c')] }, db);
    documentsSaveChanges('facture', { deletes: ['b', 'nope'] }, db);
    expect(ids(db)).toEqual(['a', 'c']);
  });

  it('rewrites positions from order and ignores unknown ids in it', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a'), d('b'), d('c')] }, db);
    documentsSaveChanges('facture', { order: ['c', 'ghost', 'a', 'b'] }, db);
    expect(ids(db)).toEqual(['c', 'a', 'b']);
  });

  it('keeps documents missing from order after the ordered ones', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a'), d('b'), d('c')] }, db);
    documentsSaveChanges('facture', { order: ['c'] }, db);
    expect(ids(db)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the two kinds apart', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('x')] }, db);
    documentsSaveChanges('creditnote', { upserts: [d('x')] }, db);
    documentsSaveChanges('facture', { deletes: ['x'] }, db);
    expect(ids(db)).toEqual([]);
    expect(ids(db, 'creditnote')).toEqual(['x']);
  });

  it('refuses a document without an id and writes nothing', () => {
    const db = fresh();
    const r = documentsSaveChanges('facture', { upserts: [d('a'), { numero: 'x' }] }, db);
    expect(r.ok).toBe(false);
    expect(ids(db)).toEqual([]);
  });

  it('refuses an unknown kind', () => {
    expect(documentsSaveChanges('quote', { upserts: [d('a')] }, fresh()).ok).toBe(false);
  });
});

describe('DOC-011 documentsReplaceAll', () => {
  it('upserts changed, deletes missing and sets positions', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a'), d('b'), d('c')] }, db);
    const next = [d('c'), d('new'), d('a', { statut: 'Payée' })];
    expect(documentsReplaceAll('facture', next, db).ok).toBe(true);
    expect(documentsList('facture', db)).toEqual(next);
  });

  it('replaces with an empty list', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a')] }, db);
    documentsReplaceAll('facture', [], db);
    expect(ids(db)).toEqual([]);
    expect(mirror(db)).toEqual([]);
  });

  it('refuses a list with a duplicate id or a missing id and leaves the table alone', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a')] }, db);
    expect(documentsReplaceAll('facture', [d('x'), d('x')], db).ok).toBe(false);
    expect(documentsReplaceAll('facture', [{ numero: 1 }], db).ok).toBe(false);
    expect(documentsReplaceAll('facture', 'nope', db).ok).toBe(false);
    expect(ids(db)).toEqual(['a']);
  });
});

describe('DOC-012 mirror', () => {
  it('follows every kind of write', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a'), d('b')] }, db);
    expect(mirror(db)).toEqual(documentsList('facture', db));
    documentsSaveChanges('facture', { deletes: ['a'] }, db);
    expect(mirror(db).map(x => x.id)).toEqual(['b']);
    documentsReplaceAll('creditnote', [d('n1')], db);
    expect(mirror(db, 'dicann-fac-creditnotes').map(x => x.id)).toEqual(['n1']);
  });

  it('is not subject to the size cap or to field clamping', () => {
    const db = fresh();
    const big = d('a', { notes: 'y'.repeat(60000), note: 'z'.repeat(60000) });
    documentsSaveChanges('facture', { upserts: [big] }, db);
    expect(mirror(db)[0].notes.length).toBe(60000);
    expect(mirror(db)[0].note.length).toBe(60000);
  });
});

describe('DOC-013 withTransaction', () => {
  it('returns the result and commits', () => {
    const db = fresh();
    const r = withTransaction(() => { documentsSaveChanges('facture', { upserts: [d('a')] }, db); return 7; }, db);
    expect(r).toBe(7);
    expect(ids(db)).toEqual(['a']);
  });

  it('rolls back every write when the function throws', () => {
    const db = fresh();
    expect(() => withTransaction(() => {
      documentsSaveChanges('facture', { upserts: [d('a')] }, db);
      throw new Error('ledger refused');
    }, db)).toThrow('ledger refused');
    expect(ids(db)).toEqual([]);
    expect(mirror(db)).toBeUndefined();
  });
});

describe('DOC-014 restore of a backup without the table', () => {
  it('rebuilds documents from the restored kv lists, dropping stale rows', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('stale1'), d('stale2')] }, db);
    documentsSaveChanges('creditnote', { upserts: [d('staleN')] }, db);
    const backup = getAllTablesForBackup(db);
    delete backup.sqlite.documents;
    const restoredList = [d('r2', { statut: 'Envoyée' }), d('r1')];
    backup.sqlite.kv_store = backup.sqlite.kv_store.filter(r => r.key !== 'dicann-fac-creditnotes' && r.key !== 'dicann-fac-factures');
    backup.sqlite.kv_store.push({ key: 'dicann-fac-factures', value: JSON.stringify(restoredList) });
    expect(restoreAllTablesFromBackup(backup, undefined, db).ok).toBe(true);
    expect(documentsList('facture', db)).toEqual(restoredList);
    expect(documentsList('creditnote', db)).toEqual([]);
  });

  it('restores a backup that carries the table as it is', () => {
    const db = fresh();
    documentsSaveChanges('facture', { upserts: [d('a'), d('b')] }, db);
    const backup = getAllTablesForBackup(db);
    documentsSaveChanges('facture', { upserts: [d('later')], deletes: ['a'] }, db);
    restoreAllTablesFromBackup(backup, undefined, db);
    expect(ids(db)).toEqual(['a', 'b']);
    expect(mirror(db).map(x => x.id)).toEqual(['a', 'b']);
  });
});
