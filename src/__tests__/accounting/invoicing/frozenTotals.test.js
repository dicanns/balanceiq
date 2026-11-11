/**
 * FROZEN-001  computed totals round each part and add up
 * FROZEN-002  freezeTotals / frozenFromPosted / documentTotals
 * FROZEN-003  backfillFrozenTotals
 * FROZEN-004  invoicePostedTotals reads the ledger
 * FROZEN-005  every poster freezes first and sends those cents
 * FROZEN-006  export rows built from the frozen cents balance
 *
 * A document in the ledger carries its totals in integer cents (totauxCents) and
 * every reader uses them, so the invoice PDF, the statement, the exports and the
 * ledger can no longer differ by a cent.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import {
  computeInvoiceTotals, freezeTotals, frozenFromPosted, documentTotals,
  backfillFrozenTotals, calcInvoiceOutstanding, invoiceExportParts,
} from '../../../utils/calculations.js';
import { buildAccountingDb } from '../helpers/testSchema.js';

const require = createRequire(import.meta.url);
const { glDraftEntry, glPostEntry, glReverseEntry, invoicePostedTotals } = require('../../../db/database.js');
const ROOT = path.resolve(__dirname, '../../../..');
const APP = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

const line = (prixUnitaire, extra = {}) => ({ quantite: 1, prixUnitaire, tps: true, tvq: true, ...extra });
const cents = (v) => Math.round(v * 100);

describe('FROZEN-001 computed totals round each part and add up', () => {
  it('one taxed line of 100.00: 5.00 + 9.98 (9.975 rounds up) = 114.98', () => {
    const t = computeInvoiceTotals([line(100)]);
    expect(t.sousTotal).toBe(100);
    expect(t.tpsTotal).toBe(5);
    expect(t.tvqTotal).toBe(9.98);
    expect(t.total).toBe(114.98);
  });

  it('a multi-line invoice: 19.99 + 0.49 taxed = 20.48, GST 1.02, QST 2.04, total 23.54', () => {
    // GST 20.48 x 5% = 1.024, QST 20.48 x 9.975% = 2.04288
    const t = computeInvoiceTotals([line(19.99), line(0.49)]);
    expect(t.sousTotal).toBe(20.48);
    expect(t.tpsTotal).toBe(1.02);
    expect(t.tvqTotal).toBe(2.04);
    expect(t.total).toBe(23.54);
  });

  it('every part is a whole number of cents and the parts add up to the total', () => {
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 2000; i++) {
      const lignes = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => ({
        quantite: 1 + Math.floor(rnd() * 9), prixUnitaire: Math.round(rnd() * 30000) / 100,
        remise: rnd() < 0.2 ? Math.floor(rnd() * 25) : 0, tps: rnd() > 0.1, tvq: rnd() > 0.1,
      }));
      const t = computeInvoiceTotals(lignes, rnd() < 0.3 ? { remiseGlobale: 7 } : undefined);
      for (const k of ['sousTotal', 'tpsTotal', 'tvqTotal', 'total', 'sousTotalBrut', 'remiseGlobaleMontant']) {
        expect(Math.abs(t[k] * 100 - Math.round(t[k] * 100))).toBeLessThan(1e-6);
      }
      expect(cents(t.total)).toBe(cents(t.sousTotal) + cents(t.tpsTotal) + cents(t.tvqTotal));
    }
  });
});

describe('FROZEN-002 frozen totals', () => {
  it('freezeTotals gives integer cents that add up', () => {
    const f = freezeTotals(computeInvoiceTotals([line(100)]));
    expect(f).toEqual({ sousTotal: 10000, tps: 500, tvq: 998, total: 11498 });
  });

  it('frozenFromPosted books the revenue as what is left after the taxes', () => {
    expect(frozenFromPosted({ totalCents: 11497, tpsCents: 500, tvqCents: 997 }))
      .toEqual({ sousTotal: 10000, tps: 500, tvq: 997, total: 11497 });
    expect(frozenFromPosted({ totalCents: 5000, tpsCents: 0, tvqCents: 0 }))
      .toEqual({ sousTotal: 5000, tps: 0, tvq: 0, total: 5000 });
  });

  const posted = { id: 'a', statut: 'Envoyée', lignes: [line(100)], totauxCents: { sousTotal: 10000, tps: 500, tvq: 997, total: 11497 } };

  it('documentTotals: the frozen totals win for a sent invoice, in dollars', () => {
    const t = documentTotals(posted);
    expect(t.total).toBe(114.97);
    expect(t.tvqTotal).toBe(9.97);
    expect(t.sousTotal).toBe(100);
    expect(t.sousTotalBrut).toBe(100); // display fields still come from the lines
  });

  it('documentTotals: a draft ignores them', () => {
    expect(documentTotals({ ...posted, statut: 'Brouillon' }).total).toBe(114.98);
  });

  it('documentTotals: a malformed frozen object is ignored', () => {
    for (const bad of [
      { sousTotal: 10000, tps: 500, tvq: 997, total: 11498 },      // does not add up
      { sousTotal: 100.5, tps: 5, tvq: 10, total: 115.5 },          // not integers
      { sousTotal: 10000, tps: 500, tvq: 997 },                     // incomplete
      'x', 12, [],
    ]) {
      expect(documentTotals({ ...posted, totauxCents: bad }).total).toBe(114.98);
    }
    expect(documentTotals({ ...posted, totauxCents: undefined }).total).toBe(114.98);
  });

  it('calcInvoiceOutstanding uses the frozen total', () => {
    expect(calcInvoiceOutstanding({ ...posted, paiements: [{ montant: 14.97 }] })).toBeCloseTo(100, 6);
  });
});

describe('FROZEN-003 backfillFrozenTotals', () => {
  const postedMap = {
    a: { totalCents: 11497, tpsCents: 500, tvqCents: 997 },
    b: { totalCents: 2000, tpsCents: 0, tvqCents: 0 },
    c: { totalCents: 3000, tpsCents: 0, tvqCents: 0 },
    d: { totalCents: 4000, tpsCents: 0, tvqCents: 0 },
  };

  it('fills what is missing from the ledger and reports the change', () => {
    const r = backfillFrozenTotals([{ id: 'a', statut: 'Envoyée' }, { id: 'b', statut: 'Payée' }], postedMap);
    expect(r.changed).toBe(true);
    expect(r.invoices[0].totauxCents).toEqual({ sousTotal: 10000, tps: 500, tvq: 997, total: 11497 });
    expect(r.invoices[1].totauxCents.total).toBe(2000);
  });

  it('never overwrites an existing frozen total', () => {
    const own = { sousTotal: 1, tps: 0, tvq: 0, total: 1 };
    const r = backfillFrozenTotals([{ id: 'a', statut: 'Envoyée', totauxCents: own }], postedMap);
    expect(r.changed).toBe(false);
    expect(r.invoices[0].totauxCents).toBe(own);
  });

  it('skips drafts, voided invoices and invoices with no posted entry', () => {
    const list = [
      { id: 'c', statut: 'Brouillon' }, { id: 'd', statut: 'Annulée' }, { id: 'zzz', statut: 'Envoyée' },
    ];
    const r = backfillFrozenTotals(list, postedMap);
    expect(r.changed).toBe(false);
    expect(r.invoices).toBe(list);
  });

  it('is idempotent', () => {
    const once = backfillFrozenTotals([{ id: 'a', statut: 'Envoyée' }], postedMap);
    const twice = backfillFrozenTotals(once.invoices, postedMap);
    expect(twice.changed).toBe(false);
    expect(twice.invoices).toEqual(once.invoices);
  });

  it('copes with a missing map or list', () => {
    expect(backfillFrozenTotals([{ id: 'a', statut: 'Envoyée' }], null).changed).toBe(false);
    expect(backfillFrozenTotals(undefined, postedMap).changed).toBe(false);
  });
});

describe('FROZEN-004 invoicePostedTotals', () => {
  let db;
  const id = (n) => db.prepare(`SELECT id FROM chart_of_accounts WHERE account_number=?`).get(n).id;
  beforeEach(() => { db = buildAccountingDb(); });

  const postInvoice = (invoiceId, total, tps, tvq, sourceType = 'invoice') => {
    const lines = [
      { account_id: id('1100'), debit_cents: total, credit_cents: 0 },
      { account_id: id('4000'), debit_cents: 0, credit_cents: total - tps - tvq },
    ];
    if (tps) lines.push({ account_id: id('2100'), debit_cents: 0, credit_cents: tps });
    if (tvq) lines.push({ account_id: id('2110'), debit_cents: 0, credit_cents: tvq });
    const { entryId } = glDraftEntry({ entry_date: '2026-10-05', description: invoiceId, source_type: sourceType, source_id: invoiceId, lines }, db);
    glPostEntry(entryId, db);
    return entryId;
  };

  it('returns the receivable and the taxes of posted invoice entries only', () => {
    postInvoice('inv1', 11497, 500, 997);
    const rev = postInvoice('inv2', 5000, 250, 499);
    glReverseEntry(rev, 'test', db);
    // an opening balance invoice: receivable against opening equity, no tax
    const { entryId } = glDraftEntry({
      entry_date: '2026-10-05', description: 'open', source_type: 'invoice', source_id: 'inv3',
      lines: [
        { account_id: id('1100'), debit_cents: 7000, credit_cents: 0 },
        { account_id: id('3400'), debit_cents: 0, credit_cents: 7000 },
      ],
    }, db);
    glPostEntry(entryId, db);
    postInvoice('pay1', 100, 0, 0, 'payment');

    const out = invoicePostedTotals(db);
    expect(out).toEqual({
      inv1: { totalCents: 11497, tpsCents: 500, tvqCents: 997 },
      inv3: { totalCents: 7000, tpsCents: 0, tvqCents: 0 },
    });
    expect(frozenFromPosted(out.inv1)).toEqual({ sousTotal: 10000, tps: 500, tvq: 997, total: 11497 });
  });

  it('a draft entry is not counted', () => {
    glDraftEntry({
      entry_date: '2026-10-05', description: 'd', source_type: 'invoice', source_id: 'inv9',
      lines: [
        { account_id: id('1100'), debit_cents: 100, credit_cents: 0 },
        { account_id: id('4000'), debit_cents: 0, credit_cents: 100 },
      ],
    }, db);
    expect(invoicePostedTotals(db)).toEqual({});
  });
});

describe('FROZEN-005 every poster freezes first and sends those cents', () => {
  const callLines = APP.split('\n').filter((l) => /ledger\??\.invoicePost\??\.?\(\{/.test(l) || /\.invoicePost\(\{/.test(l));

  it('finds every posting call site in App.jsx', () => {
    expect(callLines.length).toBe(7);
  });

  it('each one passes cents taken from a frozen object, never a recomputed dollar amount', () => {
    for (const l of callLines) {
      expect(l).toMatch(/subtotalCents:(\w+)\.sousTotal,tpsCents:\1\.tps,tvqCents:\1\.tvq,totalCents:\1\.total/);
      expect(l).not.toMatch(/\*100/);
    }
  });

  it('the editor, the generators and the royalty poster set totauxCents before saving', () => {
    expect(APP).toMatch(/if\(willFinalize\)\{doc\.totauxCents=fz;/);
    expect(APP).toMatch(/depFac\.totauxCents=frozenTotalsFor\(depFac,clients\);\s*saveFactures/);
    expect(APP).toMatch(/intFac\.totauxCents=frozenTotalsFor\(intFac,clients\);/);
    expect(APP).toMatch(/fac\.totauxCents=frozenTotalsFor\(fac,clients\);/);
    expect(APP).toMatch(/inv\.totauxCents=tot;/);
  });

  it('an invoice returned to draft loses its frozen totals', () => {
    expect(APP).toMatch(/else if\(form\.statut==="Brouillon"\)\{delete doc\.totauxCents;/);
  });

  it('the opening balance import freezes one amount with no tax', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/components/OpeningReceivablesModal.jsx'), 'utf8');
    expect(src).toMatch(/totauxCents: \{ sousTotal: frozenCents, tps: 0, tvq: 0, total: frozenCents \}/);
  });

  it('invoiceTotalsFor reads the frozen totals and the startup backfill is wired', () => {
    expect(APP).toMatch(/function invoiceTotalsFor\(doc,clients\)\{\s*return documentTotals\(doc,/);
    expect(APP).toMatch(/ledger\?\.invoicePostedTotals\?\.\(\)/);
    expect(fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8')).toMatch(/invoicePostedTotals:/);
    expect(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8')).toMatch(/'ledger:invoice:postedTotals'/);
  });
});

describe('FROZEN-006 export rows built from the frozen cents balance', () => {
  it('lines, adjustment row and totals add up to the frozen total, with a discount and a frozen override', () => {
    const doc = { lignes: [line(33.33, { quantite: 3 }), line(10.01), line(7.77, { tps: false, tvq: false })], remiseGlobale: 7 };
    const totals = documentTotals({ ...doc, statut: 'Envoyée', totauxCents: freezeTotals(computeInvoiceTotals(doc.lignes, doc)) }, doc);
    const p = invoiceExportParts(doc, totals, {});
    const sum = (k) => p.lines.reduce((a, x) => a + x[k], 0) + (p.adj ? p.adj[k] : 0);
    expect(sum('st')).toBe(p.frozen.sousTotal);
    expect(sum('tps')).toBe(p.frozen.tps);
    expect(sum('tvq')).toBe(p.frozen.tvq);
    expect(sum('st') + sum('tps') + sum('tvq')).toBe(p.frozen.total);
  });
});
