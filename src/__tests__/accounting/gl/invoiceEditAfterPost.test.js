/**
 * EDITPOST-001  editing is allowed only while an invoice is a draft
 * EDITPOST-002  returning a posted invoice to draft must reverse its entry
 *
 * An invoice locks its lines once it leaves draft, which is the right rule: a
 * document the customer holds must not change underneath them. But the status
 * selector had no guard, so a sent invoice could be set back to draft, which
 * unlocked the lines - while invoicePost only ever fires once, guarded on
 * glEntryId. The invoice would show corrected amounts and the ledger would keep
 * the originals, with nothing to indicate they had diverged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glReverseEntry } = require('../../../db/database.js');

// Mirrors `locked` in FactureEditor.
const isLocked = (statut) => statut !== 'Brouillon';

// Mirrors isFinalize in doSave.
const isFinalize = ({ isProforma = false, statut, prevStatut, isNew = false, glEntryId = null }) =>
  !isProforma && statut !== 'Brouillon' && statut !== 'Annulée'
  && (isNew || prevStatut === 'Brouillon') && !glEntryId;

// Mirrors the revert-to-draft guard added alongside it.
const shouldReverse = ({ isProforma = false, statut, prevStatut, glEntryId }) =>
  !isProforma && statut === 'Brouillon' && !!prevStatut && prevStatut !== 'Brouillon' && !!glEntryId;

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, en, type] of [
    ['1100', 'Accounts receivable', 'asset'],
    ['4000', 'Sales',               'revenue'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, en, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

function postInvoice(cents) {
  const { entryId } = glDraftEntry({
    entry_date: '2026-08-04', description: 'Invoice', source_type: 'invoice', source_id: 'INV-1',
    lines: [
      { account_id: acc('1100'), debit_cents: cents, credit_cents: 0 },
      { account_id: acc('4000'), debit_cents: 0, credit_cents: cents },
    ],
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

const arBalance = () => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
    AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc('1100')).bal;

describe('EDITPOST-001 editing is a draft-only privilege', () => {
  it('a draft is editable', () => {
    expect(isLocked('Brouillon')).toBe(false);
  });

  it('a sent invoice is locked', () => {
    expect(isLocked('Envoyée')).toBe(true);
  });

  it('a paid invoice is locked', () => {
    expect(isLocked('Payée')).toBe(true);
  });

  it('a draft save posts nothing to the ledger', () => {
    expect(isFinalize({ statut: 'Brouillon', prevStatut: 'Brouillon', isNew: true })).toBe(false);
  });

  it('the draft-to-sent transition posts once', () => {
    expect(isFinalize({ statut: 'Envoyée', prevStatut: 'Brouillon' })).toBe(true);
  });

  it('and never posts a second time', () => {
    expect(isFinalize({ statut: 'Envoyée', prevStatut: 'Brouillon', glEntryId: 42 })).toBe(false);
  });
});

describe('EDITPOST-002 returning to draft reverses the entry', () => {
  it('is detected when a posted invoice goes back to draft', () => {
    expect(shouldReverse({ statut: 'Brouillon', prevStatut: 'Envoyée', glEntryId: 42 })).toBe(true);
  });

  it('is not triggered for an invoice that never posted', () => {
    expect(shouldReverse({ statut: 'Brouillon', prevStatut: 'Envoyée', glEntryId: null })).toBe(false);
  });

  it('is not triggered by an ordinary draft save', () => {
    expect(shouldReverse({ statut: 'Brouillon', prevStatut: 'Brouillon', glEntryId: 42 })).toBe(false);
  });

  it('reversing clears receivables so the corrected amount can post', () => {
    const id = postInvoice(998442);
    expect(arBalance()).toBe(998442);
    glReverseEntry(id, 'returned to draft', db);
    expect(arBalance()).toBe(0);
  });

  it('the corrected invoice posts its new amount, not the old one', () => {
    const id = postInvoice(998442);
    glReverseEntry(id, 'returned to draft', db);
    postInvoice(950000); // re-finalized after the correction
    expect(arBalance()).toBe(950000);
  });
});
