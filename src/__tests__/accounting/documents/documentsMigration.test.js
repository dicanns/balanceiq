/**
 * DOC-001  the migration imports the existing lists in order, with every field untouched
 * DOC-002  it is idempotent: running again changes nothing
 * DOC-003  a missing, empty or malformed list is skipped without failing
 * DOC-004  the kv_store mirror read back equals the list before the change
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations, importDocumentsFromKv, DOCUMENT_KINDS } = require('../../../db/migrations.js');
const { documentsList, documentsReplaceAll } = require('../../../db/database.js');

const open = [];
afterEach(() => { while (open.length) open.pop().close(); });

const KEY_F = 'dicann-fac-factures';
const KEY_C = 'dicann-fac-creditnotes';

// A database as it was before the documents table existed, holding the given kv values.
function dbBefore(kv) {
  const db = buildAccountingDb();
  open.push(db);
  db.exec('DROP TABLE documents');
  db.pragma('user_version = 50');
  for (const [k, v] of Object.entries(kv)) db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(k, v);
  return db;
}

const invoices = [
  { id: 'b', numero: 'FAC-2', clientId: 'c1', statut: 'Envoyée', date: '2026-02-01', notes: 'x'.repeat(30000),
    totauxCents: { sousTotal: 1000, tps: 50, tvq: 100, total: 1150 }, paiements: [{ id: 'p1', montant: 10.5 }], extra: null, flag: false },
  { id: 'a', numero: 'FAC-1', clientId: 'c2', statut: 'Brouillon', date: '2026-01-01', lignes: [{ d: 'é', q: 1.5 }] },
  { id: 3, numero: 'FAC-3', statut: 'Payée', odd: { nested: [1, 2, { z: 0 }] } },
];
const notes = [{ id: 'n1', numero: 'NC-1', statut: 'Envoyée', date: '2026-03-01' }];

describe('DOC-001 import', () => {
  it('keeps list order and every field', () => {
    const db = dbBefore({ [KEY_F]: JSON.stringify(invoices), [KEY_C]: JSON.stringify(notes) });
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(51);
    expect(documentsList('facture', db)).toEqual(invoices);
    expect(documentsList('creditnote', db)).toEqual(notes);
    const rows = db.prepare(`SELECT id, position, numero, client_id, statut, doc_date, total_cents FROM documents WHERE kind='facture' ORDER BY position`).all();
    expect(rows.map(r => [r.id, r.position])).toEqual([['b', 0], ['a', 1], ['3', 2]]);
    expect(rows[0]).toMatchObject({ numero: 'FAC-2', client_id: 'c1', statut: 'Envoyée', doc_date: '2026-02-01', total_cents: 1150 });
    expect(rows[1].total_cents).toBeNull();
  });

  it('uses the kinds named by DOCUMENT_KINDS', () => {
    expect(DOCUMENT_KINDS).toEqual({ [KEY_F]: 'facture', [KEY_C]: 'creditnote' });
  });
});

describe('DOC-002 idempotent', () => {
  it('a second import changes nothing, even if the kv list was edited meanwhile', () => {
    const db = dbBefore({ [KEY_F]: JSON.stringify(invoices) });
    runMigrations(db);
    db.prepare('UPDATE kv_store SET value = ? WHERE key = ?').run(JSON.stringify([{ id: 'zz' }]), KEY_F);
    importDocumentsFromKv(db);
    expect(documentsList('facture', db)).toEqual(invoices);
  });
});

describe('DOC-003 unusable lists', () => {
  it.each([
    ['missing', undefined],
    ['empty text', ''],
    ['not json', '{oops'],
    ['not an array', '{"id":"a"}'],
    ['empty array', '[]'],
    ['element without id', JSON.stringify([{ id: 'a' }, { numero: 'x' }])],
    ['duplicate ids', JSON.stringify([{ id: 'a' }, { id: 'a' }])],
    ['null element', JSON.stringify([{ id: 'a' }, null])],
  ])('skips a %s list', (_name, value) => {
    const db = dbBefore(value === undefined ? {} : { [KEY_F]: value });
    expect(() => runMigrations(db)).not.toThrow();
    expect(documentsList('facture', db)).toEqual([]);
    // The kv copy is never touched by the import.
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(KEY_F);
    expect(row?.value).toBe(value);
  });
});

describe('DOC-004 mirror round trip', () => {
  it('JSON.parse of the mirror equals the original list after a write', () => {
    const db = dbBefore({ [KEY_F]: JSON.stringify(invoices) });
    runMigrations(db);
    documentsReplaceAll('facture', JSON.parse(JSON.stringify(invoices)), db);
    expect(JSON.parse(db.prepare('SELECT value FROM kv_store WHERE key = ?').get(KEY_F).value)).toEqual(invoices);
  });

  it('the money columns of the table are cents integers', () => {
    const db = dbBefore({});
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(documents)').all();
    expect(cols.find(c => c.name === 'total_cents').type).toBe('INTEGER');
  });
});
