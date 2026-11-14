/**
 * PROFIT-001  a product's cost: dated changes, cleaned on save
 * PROFIT-002  billed profit: quantity times the cost in effect on the invoice date
 * PROFIT-003  received profit: money paid against the cost of the settled part
 * PROFIT-004  credit notes count with their invoice, shared across its lines
 * PROFIT-005  what is left out: drafts, voided, pro formas, products without a cost
 * PROFIT-006  a linked Forecasting product supplies the cost when none is typed
 * PROFIT-007  the app shows the report and saves the cost with the product
 *
 * The report is read-only and for the owner: purchases still reach the ledger
 * through supplier bills. All amounts in the report are integer cents.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeCosts, costAt, withLinkedCosts, productProfitReport } from '../../../utils/productProfit.mjs';

const widget = { id: 'p1', code: 'W-1', description: 'Widget', categorieId: 'goods', couts: [{ depuis: '', cout: 6 }] };
const gadget = { id: 'p2', code: 'G-1', description: 'Gadget', categorieId: 'goods', couts: [{ depuis: '', cout: 30 }] };
const service = { id: 'p3', code: 'S-1', description: 'Spare part', categorieId: 'goods' };
const fee = { id: 'p4', code: 'F-1', description: 'Monthly fee', categorieId: 'fees' };
const products = [widget, gadget, service, fee];

const line = (produitId, quantite, prixUnitaire, extra = {}) => ({ id: `${produitId}-${quantite}`, produitId, quantite, prixUnitaire, remise: 0, tps: false, tvq: false, ...extra });
const invoice = (id, date, lignes, extra = {}) => ({ id, numero: `F-${id}`, date, clientId: 'c1', statut: 'Envoyée', documentType: 'facture', lignes, paiements: [], ...extra });
const run = (invoices, creditNotes = [], range = {}) => productProfitReport({ invoices, creditNotes, products, ...range });
const row = (report, id) => report.rows.find((r) => r.productId === id);

describe('PROFIT-001 product costs', () => {
  it('keeps valid rows in date order and drops empty ones', () => {
    expect(normalizeCosts([{ depuis: '2026-06-01', cout: '7.5' }, { depuis: '', cout: '6' }, { depuis: '', cout: '' }, { depuis: 'x', cout: -1 }]))
      .toEqual([{ depuis: '', cout: 6 }, { depuis: '2026-06-01', cout: 7.5 }]);
  });

  it('reads a comma as a decimal point and keeps the last row for a date', () => {
    expect(normalizeCosts([{ depuis: '', cout: '6,25' }, { depuis: '', cout: '6,50' }])).toEqual([{ depuis: '', cout: 6.5 }]);
  });

  it('uses the cost in effect on the day', () => {
    const p = { couts: [{ depuis: '', cout: 6 }, { depuis: '2026-06-01', cout: 7.5 }] };
    expect(costAt(p, '2026-05-31')).toBe(6);
    expect(costAt(p, '2026-06-01')).toBe(7.5);
    expect(costAt(p, '2027-01-15')).toBe(7.5);
  });

  it('has no cost before the first dated one, or when none was entered', () => {
    expect(costAt({ couts: [{ depuis: '2026-06-01', cout: 7.5 }] }, '2026-05-31')).toBeNull();
    expect(costAt({}, '2026-05-31')).toBeNull();
    expect(costAt(null, '2026-05-31')).toBeNull();
  });
});

describe('PROFIT-002 billed profit', () => {
  it('is sales less quantity times cost, by product', () => {
    const r = run([invoice('1', '2026-03-01', [line('p1', 10, 10), line('p2', 2, 50)])]);
    expect(row(r, 'p1')).toMatchObject({ qty: 10, salesCents: 10000, costCents: 6000, profitCents: 4000, marginPct: 40 });
    expect(row(r, 'p2')).toMatchObject({ qty: 2, salesCents: 10000, costCents: 6000, profitCents: 4000 });
    expect(r.totals).toMatchObject({ qty: 12, salesCents: 20000, costCents: 12000, profitCents: 8000, marginPct: 40 });
    expect(r.invoiceCount).toBe(1);
  });

  it('uses the cost of the invoice date when the cost changed', () => {
    const dated = [{ ...widget, couts: [{ depuis: '', cout: 6 }, { depuis: '2026-06-01', cout: 8 }] }];
    const r = productProfitReport({ products: dated, invoices: [invoice('1', '2026-05-15', [line('p1', 10, 10)]), invoice('2', '2026-06-15', [line('p1', 10, 10)])] });
    expect(row(r, 'p1').costCents).toBe(6000 + 8000);
    expect(row(r, 'p1').details.map((d) => d.costCents)).toEqual([6000, 8000]);
  });

  it('takes line and subtotal discounts off the sales', () => {
    const r = run([invoice('1', '2026-03-01', [line('p1', 10, 10, { remise: 10 }), line('p2', 1, 110)], { remiseGlobale: 10 })]);
    // lines 90 + 110 = 200, 10 % off the subtotal = 180, shared by value
    expect(row(r, 'p1').salesCents).toBe(8100);
    expect(row(r, 'p2').salesCents).toBe(9900);
    expect(r.totals.salesCents).toBe(18000);
  });

  it('keeps to the dates asked for', () => {
    const invoices = [invoice('1', '2025-12-31', [line('p1', 1, 10)]), invoice('2', '2026-01-01', [line('p1', 2, 10)]), invoice('3', '2027-01-01', [line('p1', 4, 10)])];
    expect(run(invoices, [], { from: '2026-01-01', to: '2026-12-31' }).totals.qty).toBe(2);
    expect(run(invoices).totals.qty).toBe(7);
  });
});

describe('PROFIT-003 received profit', () => {
  it('is nothing until the invoice is paid', () => {
    const r = run([invoice('1', '2026-03-01', [line('p1', 10, 10)])]);
    expect(r.totals).toMatchObject({ receivedCents: 0, receivedCostCents: 0, receivedProfitCents: 0, outstandingCents: 10000 });
  });

  it('follows a partial payment in proportion', () => {
    const r = run([invoice('1', '2026-03-01', [line('p1', 10, 10)], { paiements: [{ montant: 25 }] })]);
    expect(r.totals).toMatchObject({ receivedCents: 2500, receivedCostCents: 1500, receivedProfitCents: 1000, outstandingCents: 7500 });
  });

  it('counts the pre-tax share of a payment that includes tax', () => {
    const taxed = invoice('1', '2026-03-01', [line('p1', 10, 10, { tps: true, tvq: true })], { paiements: [{ montant: 114.98 }], statut: 'Payée' });
    const r = run([taxed]);
    expect(r.totals).toMatchObject({ receivedCents: 10000, receivedCostCents: 6000, receivedProfitCents: 4000, outstandingCents: 0 });
  });

  it('a credit note applied to the invoice settles it without being money', () => {
    const paid = invoice('1', '2026-03-01', [line('p1', 10, 10)], { statut: 'Payée', paiements: [{ montant: 90 }, { montant: 10, fromCredit: true, reference: 'NC-1' }] });
    const cn = { id: 'n1', numero: 'NC-1', factureId: '1', date: '2026-03-20', statut: 'Appliquée', lignes: [{ description: 'Deduction', quantite: 1, prixUnitaire: 10 }] };
    const r = run([paid], [cn]);
    expect(r.totals).toMatchObject({ salesCents: 10000, creditCents: 1000, costCents: 6000, profitCents: 3000 });
    expect(r.totals).toMatchObject({ receivedCents: 9000, receivedCostCents: 6000, receivedProfitCents: 3000, outstandingCents: 0 });
  });

  it('a credit note issued but not applied yet comes off what is left to collect', () => {
    const open = invoice('1', '2026-03-01', [line('p1', 10, 10)], { paiements: [{ montant: 50 }] });
    const cn = { id: 'n1', numero: 'NC-1', factureId: '1', date: '2026-03-20', statut: 'Émise', lignes: [{ description: 'Deduction', quantite: 1, prixUnitaire: 10 }] };
    expect(run([open], [cn]).totals.outstandingCents).toBe(4000);
  });

  it('a settled invoice has nothing left to collect, whatever settled it', () => {
    const paid = invoice('1', '2026-03-01', [line('p1', 10, 10)], { statut: 'Payée', paiements: [{ montant: 90 }, { montant: 10, fromCredit: true, reference: 'NC-9' }] });
    expect(run([paid]).totals.outstandingCents).toBe(0);
  });

  it('an overpayment kept on the account and used here is money; a write-off is not', () => {
    const viaCredit = invoice('1', '2026-03-01', [line('p1', 10, 10)], { statut: 'Payée', paiements: [{ montant: 100, fromClientCredit: true }] });
    expect(run([viaCredit]).totals.receivedCents).toBe(10000);
    const written = invoice('2', '2026-03-01', [line('p1', 10, 10)], { statut: 'Radiée', paiements: [{ montant: 40 }, { montant: 60, badDebt: true }] });
    expect(run([written]).totals).toMatchObject({ receivedCents: 4000, receivedCostCents: 6000, receivedProfitCents: -2000, outstandingCents: 0 });
  });
});

describe('PROFIT-004 credit notes', () => {
  const inv = invoice('1', '2026-03-01', [line('p1', 10, 10), line('p2', 2, 150)]);
  const cn = (extra) => ({ id: 'n1', numero: 'NC-1', factureId: '1', date: '2026-04-02', statut: 'Émise', lignes: [{ description: 'Deduction', quantite: 1, prixUnitaire: 40 }], ...extra });

  it('are shared across the lines of their invoice by value', () => {
    const r = run([inv], [cn()]);
    expect(row(r, 'p1').creditCents).toBe(1000);
    expect(row(r, 'p2').creditCents).toBe(3000);
    expect(row(r, 'p1').profitCents).toBe(10000 - 1000 - 6000);
    expect(row(r, 'p1').details[0].creditCents).toBe(1000);
  });

  it('go to the product a line names', () => {
    const r = run([inv], [cn({ lignes: [{ produitId: 'p2', quantite: 1, prixUnitaire: 40 }] })]);
    expect(row(r, 'p1').creditCents).toBe(0);
    expect(row(r, 'p2').creditCents).toBe(4000);
  });

  it('follow their invoice into or out of the period', () => {
    expect(run([inv], [cn()], { from: '2026-04-01', to: '2026-04-30' }).rows).toEqual([]);
    expect(run([inv], [cn()], { from: '2026-03-01', to: '2026-03-31' }).totals.creditCents).toBe(4000);
  });

  it('ignore drafts and voided credit notes', () => {
    expect(run([inv], [cn({ statut: 'Brouillon' })]).totals.creditCents).toBe(0);
    expect(run([inv], [cn({ statut: 'Annulée' })]).totals.creditCents).toBe(0);
  });

  it('report a credit note tied to nothing instead of guessing', () => {
    const r = run([inv], [cn({ factureId: null })]);
    expect(r.totals.creditCents).toBe(0);
    expect(r.unallocatedCreditCents).toBe(4000);
  });

  it('leave the share of lines without a cost out', () => {
    const mixed = invoice('1', '2026-03-01', [line('p1', 10, 10), line('p3', 1, 300)]);
    const r = run([mixed], [cn()]);
    expect(r.totals.creditCents).toBe(1000);
  });
});

describe('PROFIT-005 what is left out', () => {
  it('drafts, voided invoices and pro formas', () => {
    const r = run([
      invoice('1', '2026-03-01', [line('p1', 1, 10)], { statut: 'Brouillon' }),
      invoice('2', '2026-03-01', [line('p1', 2, 10)], { statut: 'Annulée' }),
      invoice('3', '2026-03-01', [line('p1', 4, 10)], { documentType: 'proforma' }),
      invoice('4', '2026-03-01', [line('p1', 8, 10)]),
    ]);
    expect(r.totals.qty).toBe(8);
  });

  it('products without a cost are listed, not counted', () => {
    const r = run([invoice('1', '2026-03-01', [line('p1', 10, 10), line('p3', 2, 75), { description: 'Free text', quantite: 1, prixUnitaire: 20 }])]);
    expect(r.rows.map((x) => x.productId)).toEqual(['p1']);
    expect(r.missing).toEqual([{ productId: 'p3', code: 'S-1', description: 'Spare part', qty: 2, salesCents: 15000 }]);
  });

  it('a service in a category where nothing has a cost is not listed as a gap', () => {
    const r = run([invoice('1', '2026-03-01', [line('p1', 10, 10), line('p4', 1, 500)])]);
    expect(r.missing).toEqual([]);
  });

  it('is empty without invoices', () => {
    const r = productProfitReport({});
    expect(r.rows).toEqual([]);
    expect(r.totals).toMatchObject({ qty: 0, salesCents: 0, profitCents: 0, marginPct: null });
  });
});

describe('PROFIT-006 cost from a linked Forecasting product', () => {
  const forecast = [{ id: 'fp1', unit_cost: 4.5 }, { id: 'fp2', unit_cost: null }];

  it('fills in a product that has no cost of its own', () => {
    const out = withLinkedCosts([{ id: 'a', forecast_product_id: 'fp1' }], forecast);
    expect(costAt(out[0], '2026-01-01')).toBe(4.5);
  });

  it('never replaces a typed cost, and leaves the rest alone', () => {
    const typed = { id: 'a', forecast_product_id: 'fp1', couts: [{ depuis: '', cout: 9 }] };
    const noCost = { id: 'b', forecast_product_id: 'fp2' };
    const unlinked = { id: 'c' };
    expect(withLinkedCosts([typed, noCost, unlinked], forecast)).toEqual([typed, noCost, unlinked]);
  });
});

describe('PROFIT-007 the app', () => {
  const read = (p) => fs.readFileSync(path.resolve(__dirname, '../../../', p), 'utf8');
  const app = read('App.jsx');

  it('shows the report as an Invoicing tab', () => {
    expect(app).toContain('{id:"profit",label:T.factProfit}');
    expect(app).toContain('subTab==="profit"&&<ProductProfitReport');
  });

  it('saves a cleaned cost list with a new and an edited product', () => {
    expect(app).toContain('actif:true,couts:normalizeCosts(newForm.couts)}');
    expect(app).toContain('couts:normalizeCosts(editForm.couts)}');
  });

  it('has every new label in French and in English', () => {
    const tr = read('i18n/translations.js');
    for (const key of ['factProfit', 'prodCost', 'prodCostFrom', 'prodCostAllDates', 'prodCostAdd', 'prodCostRemove', 'prodCostHint', 'prodCostShort']) {
      expect(tr.match(new RegExp(`\\b${key}:`, 'g')) || [], key).toHaveLength(2);
    }
    const report = read('components/ProductProfitReport.jsx');
    const keysOf = (lang) => [...report.split(`\n  ${lang}: {`)[1].split('\n  },')[0].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
    expect(keysOf('fr')).toEqual(keysOf('en'));
  });
});
