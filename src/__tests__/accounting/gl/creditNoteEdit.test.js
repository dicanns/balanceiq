/**
 * CNEDIT-001  editing a saved credit note carries the correction to the ledger
 * CNEDIT-002  the invoice's credit line follows the new amount
 * CNEDIT-003  the AR subledger counts unapplied credits
 *
 * A credit note posts to the ledger on its first save, whatever its status says,
 * and stays editable while it is a draft. A second save used to update only the
 * document: the corrected amount showed on the credit note while the ledger and
 * the invoice still held the original, with nothing to indicate they had parted
 * company. This is the same defect that was fixed for invoices in EDITPOST-002.
 *
 * The second half is the mirror image. A credit note with no invoice behind it
 * credits 1100 in the ledger, but the AR subledger walks invoices only, so it
 * reported a variance equal to every unapplied credit on the books - a real
 * difference that looked exactly like a mistake.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAccountingDb } from '../helpers/testSchema.js';
import { computeInvoiceTotals, calcInvoiceOutstanding } from '../../../utils/calculations.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glReverseEntry, glFindEntryBySource } = require('../../../db/database.js');

let db;
beforeEach(() => {
  db = buildAccountingDb();
  for (const [num, en, type] of [
    ['1100', 'Accounts receivable', 'asset'],
    ['2100', 'GST collected',       'liability'],
    ['2110', 'QST collected',       'liability'],
    ['4000', 'Sales',               'revenue'],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO chart_of_accounts (account_number, name_fr, name_en, type) VALUES (?,?,?,?)`
    ).run(num, en, en, type);
  }
});
afterEach(() => { db?.close(); db = null; });

const acc = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;

const balanceOf = (num) => db.prepare(
  `SELECT COALESCE(SUM(jl.debit_cents),0) - COALESCE(SUM(jl.credit_cents),0) AS bal
   FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
    AND je.status IN ('posted','reversed')
   WHERE jl.account_id = ?`
).get(acc(num)).bal;

// Mirrors ledger:creditnote:post.
function postCreditNote(cnId, { subtotal, tps, tvq }, date = '2026-09-10') {
  if (glFindEntryBySource('credit_note', cnId, db)) return null; // idempotency guard
  const total = subtotal + tps + tvq;
  const { entryId } = glDraftEntry({
    entry_date: date, description: `Note de crédit ${cnId}`,
    source_type: 'credit_note', source_id: String(cnId),
    lines: [
      { account_id: acc('1100'), debit_cents: 0,        credit_cents: total },
      { account_id: acc('4000'), debit_cents: subtotal, credit_cents: 0 },
      { account_id: acc('2100'), debit_cents: tps,      credit_cents: 0 },
      { account_id: acc('2110'), debit_cents: tvq,      credit_cents: 0 },
    ].filter(l => l.debit_cents || l.credit_cents),
  }, db);
  glPostEntry(entryId, db);
  return entryId;
}

// Mirrors ledger:creditnote:reverse.
function reverseCreditNote(cnId) {
  const e = glFindEntryBySource('credit_note', cnId, db);
  if (!e) return { ok: true, nothingToReverse: true };
  return { ok: true, ...glReverseEntry(e.id, 'Note de crédit modifiée', db) };
}

describe('CNEDIT-001 an edit reaches the ledger', () => {
  it('the original figures post on first save', () => {
    postCreditNote('NC-1', { subtotal: 2460, tps: 2, tvq: 4 });
    expect(balanceOf('1100')).toBe(-2466);
    expect(balanceOf('4000')).toBe(2460);
  });

  it('a second post is refused while the first is still live', () => {
    postCreditNote('NC-1', { subtotal: 2460, tps: 2, tvq: 4 });
    expect(postCreditNote('NC-1', { subtotal: 9999, tps: 0, tvq: 0 })).toBeNull();
    expect(balanceOf('1100')).toBe(-2466);
  });

  it('reversing then re-posting lands the corrected amount, not the sum of both', () => {
    postCreditNote('NC-1', { subtotal: 2460, tps: 2, tvq: 4 });
    expect(reverseCreditNote('NC-1').ok).toBe(true);
    expect(balanceOf('1100')).toBe(0);
    postCreditNote('NC-1', { subtotal: 1800, tps: 1, tvq: 3 });
    expect(balanceOf('1100')).toBe(-1804);
    expect(balanceOf('4000')).toBe(1800);
  });

  it('the reversal does not block the re-post: its mirror is a reversal, not a credit note', () => {
    postCreditNote('NC-1', { subtotal: 2460, tps: 2, tvq: 4 });
    reverseCreditNote('NC-1');
    // glFindEntryBySource matches draft and posted only, and the mirror carries
    // source_type 'reversal'. Both have to hold or the correction never posts.
    expect(glFindEntryBySource('credit_note', 'NC-1', db)).toBeNull();
    const mirror = db.prepare(
      `SELECT source_type, status FROM journal_entries WHERE reverses_entry_id IS NOT NULL`
    ).get();
    expect(mirror.source_type).toBe('reversal');
  });

  it('both the original and its mirror survive - the trail is append-only', () => {
    postCreditNote('NC-1', { subtotal: 2460, tps: 2, tvq: 4 });
    reverseCreditNote('NC-1');
    postCreditNote('NC-1', { subtotal: 1800, tps: 1, tvq: 3 });
    const n = db.prepare(`SELECT COUNT(*) c FROM journal_entries`).get().c;
    expect(n).toBe(3); // original, mirror, correction
  });

  it('a failed reversal must not be followed by a post', () => {
    postCreditNote('NC-1', { subtotal: 2460, tps: 2, tvq: 4 });
    reverseCreditNote('NC-1');
    // Reversing an already-reversed entry throws; the renderer stops there.
    const e = db.prepare(`SELECT id FROM journal_entries WHERE source_type='credit_note'`).get();
    expect(() => glReverseEntry(e.id, 'again', db)).toThrow();
    expect(balanceOf('1100')).toBe(0); // still cancelled, not double-credited
  });

  it('the tax claw-back follows the correction too', () => {
    postCreditNote('NC-1', { subtotal: 2460, tps: 2, tvq: 4 });
    reverseCreditNote('NC-1');
    postCreditNote('NC-1', { subtotal: 1800, tps: 1, tvq: 3 });
    expect(balanceOf('2100')).toBe(1);
    expect(balanceOf('2110')).toBe(3);
  });
});

describe('CNEDIT-002 the invoice credit line follows', () => {
  const NUMERO = 'NC-0001';
  const invoice = () => ({
    total: 10000,
    paiements: [
      { id: 'p1', montant: 1500, mode: 'Virement' },
      { id: 'p2', montant: 2466, fromCredit: true, reference: NUMERO },
    ],
  });

  // Mirrors the edit branch: only this note's own credit line moves.
  const applyEdit = (f, newAmount) =>
    (f.paiements || []).map(p => (p.fromCredit && p.reference === NUMERO) ? { ...p, montant: newAmount } : p);

  it('the corrected amount replaces the old one', () => {
    const ps = applyEdit(invoice(), 1804);
    expect(ps.find(p => p.reference === NUMERO).montant).toBe(1804);
  });

  it('an ordinary payment on the same invoice is left alone', () => {
    const ps = applyEdit(invoice(), 1804);
    expect(ps.find(p => p.id === 'p1').montant).toBe(1500);
  });

  it('a credit from a different note is left alone', () => {
    const f = invoice();
    f.paiements.push({ id: 'p3', montant: 500, fromCredit: true, reference: 'NC-0002' });
    const ps = applyEdit(f, 1804);
    expect(ps.find(p => p.reference === 'NC-0002').montant).toBe(500);
  });

  it('the cap no longer counts this note against itself', () => {
    // alreadyCredited excludes the note being edited, so a correction back up to
    // the same amount is allowed instead of being refused as an over-credit.
    const f = invoice();
    const ownNumero = NUMERO;
    const alreadyCredited = f.paiements
      .filter(p => p.fromCredit && !(ownNumero && p.reference === ownNumero))
      .reduce((s, p) => s + p.montant, 0);
    expect(alreadyCredited).toBe(0);
    expect(Math.max(0, f.total - alreadyCredited)).toBe(10000);
  });

  it('the invoice status is recomputed from what is left owing', () => {
    const status = (total, ps) => {
      const paid = ps.reduce((s, p) => s + (p.montant || 0), 0);
      return (total - paid) <= 0.005 ? 'Créditée' : paid > 0 ? 'Payée partiellement' : 'Envoyée';
    };
    expect(status(10000, applyEdit(invoice(), 1804))).toBe('Payée partiellement');
    expect(status(10000, applyEdit(invoice(), 8500))).toBe('Créditée');
  });
});

describe('CNEDIT-003 the AR subledger counts unapplied credits', () => {
  const LIGNES = [{ quantite: 1, prixUnitaire: 24.60, tps: true, tvq: true }];
  const ASOF = '2026-09-30';

  // Mirrors the subledger walk in GrandLivreTab.
  function subledger(factures, creditNotes, asOf = ASOF) {
    let sum = 0;
    for (const f of factures) {
      if (['Payée','Créditée','Annulée','Brouillon'].includes(f.statut)) continue;
      if (f.documentType === 'proforma') continue;
      if (f.date && f.date > asOf) continue;
      sum += calcInvoiceOutstanding(f);
    }
    for (const n of creditNotes) {
      if (n.factureId) continue;
      if (n.statut === 'Annulée') continue;
      if (n.date && n.date > asOf) continue;
      sum -= computeInvoiceTotals(n.lignes, { tpsOverride: n.tpsOverride, tvqOverride: n.tvqOverride }).total;
    }
    return Math.round(sum * 100);
  }

  const INVOICE = { statut: 'Envoyée', date: '2026-09-01', lignes: [{ quantite: 1, prixUnitaire: 1000, tps: false, tvq: false }], paiements: [] };

  it('an invoice alone is its own balance', () => {
    expect(subledger([INVOICE], [])).toBe(100000);
  });

  it('a standalone credit reduces it, as the ledger already did', () => {
    const cn = { date: '2026-09-05', statut: 'Émise', lignes: LIGNES, tpsOverride: 0.02, tvqOverride: 0.04 };
    expect(subledger([INVOICE], [cn])).toBe(100000 - 2466);
  });

  it('a credit already applied to an invoice is not counted twice', () => {
    const applied = { date: '2026-09-05', statut: 'Émise', factureId: 'F-1', lignes: LIGNES };
    expect(subledger([INVOICE], [applied])).toBe(100000);
  });

  it('a cancelled credit note counts for nothing', () => {
    const cn = { date: '2026-09-05', statut: 'Annulée', lignes: LIGNES };
    expect(subledger([INVOICE], [cn])).toBe(100000);
  });

  it('a credit dated after the as-of date is not counted yet', () => {
    const cn = { date: '2026-10-15', statut: 'Émise', lignes: LIGNES, tpsOverride: 0.02, tvqOverride: 0.04 };
    expect(subledger([INVOICE], [cn])).toBe(100000);
  });

  it('a future-dated invoice is not counted either, matching the trial balance', () => {
    const future = { ...INVOICE, date: '2026-10-15' };
    expect(subledger([INVOICE, future], [])).toBe(100000);
  });

  it('the credit note honours its own tax override here too', () => {
    const stated = { date: '2026-09-05', statut: 'Émise', lignes: LIGNES, tpsOverride: 0.02, tvqOverride: 0.04 };
    const byRate = { date: '2026-09-05', statut: 'Émise', lignes: LIGNES };
    expect(subledger([INVOICE], [stated])).toBe(100000 - 2466);
    expect(subledger([INVOICE], [byRate])).toBe(100000 - 2828);
  });

  it('ledger and subledger agree once both sides see the credit', () => {
    const cn = { date: '2026-09-05', statut: 'Émise', lignes: LIGNES, tpsOverride: 0.02, tvqOverride: 0.04 };
    postCreditNote('NC-9', { subtotal: 2460, tps: 2, tvq: 4 }, '2026-09-05');
    const glAr = balanceOf('1100');                 // -2466, the credit only
    const subAr = subledger([INVOICE], [cn]) - 100000; // the same credit
    expect(glAr).toBe(subAr);
  });
});
