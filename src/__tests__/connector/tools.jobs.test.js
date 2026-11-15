/**
 * CONN-110  needs_attention: the Today list, composed by the same function as the screen
 * CONN-111  sales_tax_for_period: the Taxes tab calculation, without its log line
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { jobTools } from '../../connector/tools/jobs.mjs';
import { composeWorklist, buildWorklist, overdueInvoices, worklistCounts } from '../../services/todayWorklist.js';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const TODAY = '2026-06-15';
const clients = [{ id: 'c1', entreprise: 'Acme Foods' }];
const invoices = [
  { id: 'i1', numero: 'F-0001', date: '2026-04-01', dateEcheance: '2026-05-01', clientId: 'c1', statut: 'Envoyée', documentType: 'facture', lignes: [{ id: 'a', description: 'Item', quantite: 1, prixUnitaire: 100, remise: 0, tps: false, tvq: false }], paiements: [], secret_internal: 'x' },
  { id: 'i2', numero: 'F-0002', date: '2026-06-10', dateEcheance: '2026-07-10', clientId: 'c1', statut: 'Envoyée', documentType: 'facture', lignes: [{ id: 'b', description: 'Item', quantite: 1, prixUnitaire: 50, remise: 0, tps: false, tvq: false }], paiements: [] },
];
const seen = {};
const data = {
  documentsList: (kind) => (kind === 'facture' ? invoices : []),
  bankNeedsCategorizingCount: () => 4,
  bankReconciliationStatus: () => [],
  getBalanceSheetBlockers: () => [{ type: 'overdue_ap', count: 2, label_fr: '2 facture(s) fournisseur en souffrance', label_en: '2 overdue supplier bills', blocking: false }],
  taxRegistrationGet: () => null,
  taxPeriodList: () => [],
  trialBalance: () => [],
  bankSubledgerBalances: () => [],
  taxPeriodCompute: (from, to, db, opts) => {
    seen.tax = { from, to, db, opts };
    return {
      tpsCollected: 500, tvqCollected: 997.5, tpsCti: 120.005, tvqRti: 239.4, netTpsOwed: 379.995, netTvqOwed: 758.1, supplies: 10000,
      tpsCollectedFromRegister: 300, tvqCollectedFromRegister: 598.5, tpsCollectedFromInvoices: 200, tvqCollectedFromInvoices: 399, tpsCollectedFromBank: 0, tvqCollectedFromBank: 0,
      billCount: 7, bankTxCount: 3, suspenseCount: 2, blockers: [{ type: 'suspense', count: 2 }], months: ['2026-04'], secret_internal: 'x',
    };
  },
};
const ctx = { company: { id: 'co1', name: 'Demo Inc.' }, today: TODAY, lang: 'en', level: 'read', db: { marker: 'db' }, data, kv: (k) => (k === 'dicann-fac-clients' ? clients : null) };
const tool = (name) => jobTools.find((t) => t.name === name);
const run = (name, args = {}, c = ctx) => { expect(checkArguments(tool(name).inputSchema, args)).toBeNull(); const r = tool(name).run(args, c); expectPlainAnswer(r); return r; };

describe('CONN-110 what needs attention', () => {
  it('are well formed', () => {
    expectWellFormed(jobTools);
    expect(jobTools.map((t) => t.name)).toEqual(['needs_attention', 'sales_tax_for_period']);
  });

  it('gives the Today list, most urgent first, in plain fields', () => {
    const r = run('needs_attention');
    expect(r).toMatchObject({ as_of: TODAY, overdue_invoices: 1, bank_lines_to_categorize: 4 });
    expect(r.items[0]).toEqual({ urgency: 'overdue', what: 'F-0001 is 45 days overdue', detail: expect.stringContaining('Acme Foods') });
    expect(r.items.map((i) => i.urgency)).toEqual([...r.items.map((i) => i.urgency)].sort((a, b) => ['overdue', 'to_do', 'set_up'].indexOf(a) - ['overdue', 'to_do', 'set_up'].indexOf(b)));
    expect(r.items.some((i) => i.what.includes('overdue supplier bill'))).toBe(true);
    expect(r.count).toBe(r.items.length);
    const text = JSON.stringify(r);
    for (const hidden of ['secret_internal', 'target', 'invoiceId', '"cta"', '"id"']) expect(text).not.toContain(hidden);
    // In the language BalanceIQ is used in.
    expect(run('needs_attention', {}, { ...ctx, lang: 'fr' }).items[0].what).toBe('F-0001 est en retard de 45 jours');
  });

  it('is the screen\'s own composition, not a second one', () => {
    const args = { needsCategorizing: 4, blockers: data.getBalanceSheetBlockers(), factures: invoices, clients, today: TODAY, lang: 'en' };
    const overdue = overdueInvoices(invoices, clients, TODAY);
    const items = buildWorklist({ needsCategorizing: 4, overdue, blockers: args.blockers, lang: 'en' });
    expect(composeWorklist(args)).toEqual({ items, overdue, counts: worklistCounts({ needsCategorizing: 4, overdue, items }) });
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');
    expect(app).toContain('const {items,counts}=composeWorklist({needsCategorizing,reconcileStatus,blockers,registration,taxPeriods,trialRows,subledgerRows,factures:facFactures,clients:facClients,today,lang,');
    expect(app).not.toMatch(/buildWorklist\(/);
  });

  it('still answers when one part of the books cannot be read', () => {
    const broken = { ...data, bankReconciliationStatus: () => { throw new Error('no table'); }, trialBalance: () => { throw new Error('boom'); } };
    expect(run('needs_attention', {}, { ...ctx, data: broken }).overdue_invoices).toBe(1);
  });
});

describe('CONN-111 sales tax for a period', () => {
  it('reports the Taxes tab figures and leaves no line in the calculation log', () => {
    const r = run('sales_tax_for_period', { from: '2026-04-01', to: '2026-06-30' });
    expect(seen.tax).toEqual({ from: '2026-04-01', to: '2026-06-30', db: { marker: 'db' }, opts: { log: false } });
    expect(r).toEqual({
      from: '2026-04-01', to: '2026-06-30',
      gst: { collected: 500, credits: 120.01, net_owed: 380, collected_from_register: 300, collected_from_invoices: 200, collected_from_bank: 0 },
      qst: { collected: 997.5, credits: 239.4, net_owed: 758.1, collected_from_register: 598.5, collected_from_invoices: 399, collected_from_bank: 0 },
      net_owed_total: 1138.1, taxable_sales: 10000, bills_counted: 7, bank_lines_counted: 3, bank_lines_still_to_review: 2, ready_to_file: false,
      note: 'An estimate from what is entered so far. A negative net is a refund. Review before filing.',
    });
  });

  it('needs a period that runs forward', () => {
    expect(checkArguments(tool('sales_tax_for_period').inputSchema, { from: '2026-04-01' })).toBe('Missing argument: to.');
    expect(() => run('sales_tax_for_period', { from: '2026-07-01', to: '2026-06-30' })).toThrow('The period ends before it starts.');
  });

  it('the calculation only writes its log when asked to', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../db/database.js'), 'utf8');
    expect(src).toContain('function taxPeriodCompute(periodStart, periodEnd, _db, { log = true } = {}) {');
    expect(src).toContain('if (log) db.transaction(() => {');
    // The screen still logs: its call passes no options.
    expect(fs.readFileSync(path.resolve(__dirname, '../../../main.js'), 'utf8')).toContain('=> taxPeriodCompute(start, end));');
  });
});
