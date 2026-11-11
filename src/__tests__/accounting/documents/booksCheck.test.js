/**
 * DOC-030  booksCheck compares documents with the ledger, one finding code per kind of difference
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { booksCheck, documentsReplaceAll, glDraftEntry, glPostEntry, glReverseEntry } = require('../../../db/database.js');

const open = [];
afterEach(() => { while (open.length) open.pop().close(); });

function books() {
  const db = buildAccountingDb();
  open.push(db);
  for (const [num, type] of [['1010', 'asset'], ['1050', 'asset'], ['1100', 'asset'], ['4000', 'revenue']]) {
    db.prepare(`INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`).run(num, num, num, type);
  }
  return db;
}
const acc = (db, n) => db.prepare('SELECT id FROM chart_of_accounts WHERE account_number=?').get(n).id;
function post(db, sourceType, sourceId, cents, { debit = '1100', credit = '4000' } = {}) {
  const { entryId } = glDraftEntry({
    entry_date: '2026-05-01', description: sourceType, source_type: sourceType, source_id: String(sourceId),
    lines: [
      { account_id: acc(db, debit), debit_cents: cents, credit_cents: 0 },
      { account_id: acc(db, credit), debit_cents: 0, credit_cents: cents },
    ],
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}
const inv = (id, extra = {}) => ({ id, numero: 'FAC-' + id, statut: 'Envoyée', date: '2026-05-01', totauxCents: { total: 11500 }, paiements: [], ...extra });
const codes = (r) => r.findings.map(f => f.code);

describe('DOC-030 booksCheck', () => {
  it('is clear when documents and ledger agree', () => {
    const db = books();
    post(db, 'invoice', 'i1', 11500);
    post(db, 'payment', 'p1', 5000, { debit: '1010', credit: '1100' });
    post(db, 'credit_note', 'n1', 2000, { debit: '4000', credit: '1100' });
    documentsReplaceAll('facture', [
      inv('i1', { paiements: [{ id: 'p1', montant: 50, mode: 'Chèque' }] }),
      inv('d1', { statut: 'Brouillon' }),
      inv('v1', { statut: 'Annulée' }),
      inv('pf', { documentType: 'proforma' }),
    ], db);
    documentsReplaceAll('creditnote', [{ id: 'n1', numero: 'NC-1', statut: 'Envoyée' }, { id: 'n2', numero: 'NC-2', statut: 'Brouillon' }], db);
    const r = booksCheck(db);
    expect(r.findings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checked).toEqual({ invoices: 3, payments: 1, creditNotes: 1 });
  });

  it('is clear on an empty database', () => {
    expect(booksCheck(books())).toEqual({ ok: true, checked: { invoices: 0, payments: 0, creditNotes: 0 }, findings: [] });
  });

  it('invoice_not_posted: a sent invoice with no posted entry', () => {
    const db = books();
    documentsReplaceAll('facture', [inv('i1')], db);
    const r = booksCheck(db);
    expect(codes(r)).toEqual(['invoice_not_posted']);
    expect(r.findings[0]).toMatchObject({ kind: 'invoice', numero: 'FAC-i1', id: 'i1' });
    expect(r.ok).toBe(false);
  });

  it('invoice_not_posted: a reversed entry does not count', () => {
    const db = books();
    const e = post(db, 'invoice', 'i1', 11500);
    glReverseEntry(e, 'test', db);
    documentsReplaceAll('facture', [inv('i1')], db);
    expect(codes(booksCheck(db))).toEqual(['invoice_not_posted']);
  });

  it('invoice_total_differs: the frozen total is not what the ledger holds', () => {
    const db = books();
    post(db, 'invoice', 'i1', 11400);
    documentsReplaceAll('facture', [inv('i1')], db);
    const r = booksCheck(db);
    expect(codes(r)).toEqual(['invoice_total_differs']);
    expect(r.findings[0].detail).toMatchObject({ documentCents: 11500, ledgerCents: 11400 });
  });

  it('does not compare totals when the invoice has no frozen totals', () => {
    const db = books();
    post(db, 'invoice', 'i1', 11400);
    documentsReplaceAll('facture', [inv('i1', { totauxCents: undefined })], db);
    expect(booksCheck(db).findings).toEqual([]);
  });

  it('draft_or_void_posted: a draft or voided invoice that is still in the ledger', () => {
    const db = books();
    post(db, 'invoice', 'd1', 100);
    post(db, 'invoice', 'v1', 100);
    documentsReplaceAll('facture', [inv('d1', { statut: 'Brouillon' }), inv('v1', { statut: 'Annulée' })], db);
    expect(codes(booksCheck(db))).toEqual(['draft_or_void_posted', 'draft_or_void_posted']);
  });

  it('payment_not_posted: a cash payment with no entry; credits and bad debts are not cash', () => {
    const db = books();
    post(db, 'invoice', 'i1', 11500);
    documentsReplaceAll('facture', [inv('i1', { paiements: [
      { id: 'p1', montant: 20 },
      { id: 'p2', montant: 5, fromCredit: true },
      { id: 'p3', montant: 5, fromClientCredit: true },
      { id: 'p4', montant: 5, badDebt: true },
    ] })], db);
    const r = booksCheck(db);
    expect(codes(r)).toEqual(['payment_not_posted']);
    expect(r.findings[0]).toMatchObject({ kind: 'payment', id: 'p1', numero: 'FAC-i1' });
    expect(r.checked.payments).toBe(1);
  });

  it('payment_amount_differs: the entry is for another amount', () => {
    const db = books();
    post(db, 'invoice', 'i1', 11500);
    post(db, 'payment', 'p1', 1999, { debit: '1010', credit: '1100' });
    documentsReplaceAll('facture', [inv('i1', { paiements: [{ id: 'p1', montant: 20 }] })], db);
    const r = booksCheck(db);
    expect(codes(r)).toEqual(['payment_amount_differs']);
    expect(r.findings[0].detail).toMatchObject({ documentCents: 2000, ledgerCents: 1999 });
  });

  it('credit_note_not_posted: a credit note that counts but has no entry', () => {
    const db = books();
    documentsReplaceAll('creditnote', [
      { id: 'n1', numero: 'NC-1', statut: 'Envoyée' },
      { id: 'n2', numero: 'NC-2', statut: 'Brouillon' },
      { id: 'n3', numero: 'NC-3', statut: 'Annulée' },
    ], db);
    const r = booksCheck(db);
    expect(codes(r)).toEqual(['credit_note_not_posted']);
    expect(r.findings[0]).toMatchObject({ kind: 'credit_note', id: 'n1', numero: 'NC-1' });
  });

  it('does not change anything', () => {
    const db = books();
    documentsReplaceAll('facture', [inv('i1')], db);
    const before = db.prepare('SELECT COUNT(*) n FROM journal_entries').get().n;
    booksCheck(db);
    expect(db.prepare('SELECT COUNT(*) n FROM journal_entries').get().n).toBe(before);
  });
});
