/**
 * CONN-030  every tool is described the same way and marked read-only
 * CONN-031  who_owes_me, list_invoices, get_invoice
 * CONN-032  company_overview, bills_to_pay, bank_balances, profit_and_loss, books_check
 * CONN-033  the service: off by default, one key, this company only, activity
 *
 * The data functions are stubbed here: they have their own tests. What is tested
 * is what a tool asks them for and what it hands to the AI.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ALL_TOOLS } from '../../connector/tools/index.mjs';
import { describeTool, checkArguments } from '../../connector/protocol.mjs';
import { createConnectorService, CONFIG_FILE } from '../../connector/service.mjs';
import { expectWellFormed } from './_conformance.js';

// How many questions an assistant can ask. Changing it is a deliberate act: say why in the commit.
const TOOL_COUNT = 43;

const TODAY = '2026-06-15';
const clients = [
  { id: 'c1', code: 'ACME', entreprise: 'Acme Foods' },
  { id: 'c2', code: 'BETA', entreprise: 'Beta Market', taxExempt: true },
];
const line = (quantite, prixUnitaire, taxed = false) => ({ id: `${quantite}-${prixUnitaire}`, description: 'Item', quantite, prixUnitaire, remise: 0, tps: taxed, tvq: taxed });
const invoices = [
  { id: 'i1', numero: 'F-0001', date: '2026-03-01', dateEcheance: '2026-03-31', clientId: 'c1', statut: 'Envoyée', documentType: 'facture', lignes: [line(10, 10)], paiements: [{ date: '2026-04-02', montant: 40, mode: 'Chèque' }] },
  { id: 'i2', numero: 'F-0002', date: '2026-06-01', dateEcheance: '2026-07-01', clientId: 'c2', statut: 'Envoyée', documentType: 'facture', lignes: [line(2, 100, true)], paiements: [] },
  { id: 'i3', numero: 'F-0003', date: '2026-05-10', dateEcheance: '2026-06-09', clientId: 'c1', statut: 'Payée', documentType: 'facture', lignes: [line(1, 50)], paiements: [{ date: '2026-05-20', montant: 45, mode: 'Virement' }, { date: '2026-05-20', montant: 5, fromCredit: true, reference: 'NC-0001' }] },
  { id: 'i4', numero: 'F-0004', date: '2026-06-10', dateEcheance: '2026-07-10', clientId: 'c1', statut: 'Brouillon', documentType: 'facture', lignes: [line(1, 999)], paiements: [] },
  { id: 'i5', numero: 'P-0001', date: '2026-06-11', dateEcheance: '2026-07-11', clientId: 'c1', statut: 'Envoyée', documentType: 'proforma', lignes: [line(1, 777)], paiements: [] },
];
const kvData = { 'dicann-fac-clients': clients, 'dicann-fac-client-credits': [] };
const data = {
  documentsList: (kind) => (kind === 'facture' ? invoices : []),
  fiscalYearEndGet: () => ({ month: 10, day: 31, set: true }),
  supplierBillList: (opts) => { data._billArgs = opts; return [
    { supplier_name: 'Mayo Maker', invoice_number: 'A-9', bill_date: '2026-06-01', due_date: '2026-07-01', amount: 500.5, paid: 0, note: '', secret_internal: 'x' },
    { supplier_name: 'Hydro', invoice_number: null, bill_date: '2026-05-01', due_date: '2026-06-01', amount: 120, paid: 0, note: 'May' },
  ]; },
  bankSubledgerBalances: (asOf) => { data._bankAsOf = asOf; return [{ bankAccountId: 1, name: 'Chequing', accountNumber: '1010', coaAccountId: 3, cents: 1234567 }, { bankAccountId: 2, name: 'Visa', accountNumber: '2050', coaAccountId: 9, cents: -45010 }]; },
  bankNeedsCategorizingCount: () => 7,
  incomeStatement: (from, to) => ({
    periodStart: from, periodEnd: to, revenueCents: 1000000, cogsCents: 400000, expenseCents: 350000, grossProfitCents: 600000, netIncomeCents: 250000,
    grossMarginPct: 60, netMarginPct: 25,
    lines: [
      { accountId: 1, accountNumber: '4000', nameFr: 'Ventes', nameEn: 'Sales', type: 'revenue', amountCents: 1000000, pctOfRevenue: 100 },
      { accountId: 2, accountNumber: '5000', nameFr: 'Achats', nameEn: 'Purchases', type: 'cogs', amountCents: 400000, pctOfRevenue: 40 },
      { accountId: 3, accountNumber: '6999', nameFr: 'Vide', nameEn: 'Empty', type: 'expense', amountCents: 0, pctOfRevenue: 0 },
    ],
  }),
  booksCheck: () => ({ checked: { invoices: 3, payments: 2, creditNotes: 0 }, findings: [{ code: 'NOT_POSTED', kind: 'invoice', numero: 'F-0002', id: 'i2', detail: { expectedCents: 22995 } }] }),
};
const ctx = { company: { id: 'co1', name: 'Demo Inc.' }, today: TODAY, lang: 'en', level: 'read', db: {}, data, kv: (k) => kvData[k] ?? null };
const tool = (name) => ALL_TOOLS.find((t) => t.name === name);
const run = (name, args = {}) => { expect(checkArguments(tool(name).inputSchema, args)).toBeNull(); return tool(name).run(args, ctx); };

describe('CONN-030 the tool list', () => {
  it('offers the first questions, each named once', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    // The first questions keep their place; every area's tools follow.
    expect(names.slice(0, 8)).toEqual(['company_overview', 'bills_to_pay', 'bank_balances', 'profit_and_loss', 'books_check', 'who_owes_me', 'list_invoices', 'get_invoice']);
    expect(names).toHaveLength(TOOL_COUNT);
    for (const area of ['list_customers', 'list_bills', 'bank_transactions', 'trial_balance', 'tax_position', 'daily_register', 'list_recipes']) expect(names, area).toContain(area);
    expectWellFormed(ALL_TOOLS);
    expect(new Set(names).size).toBe(names.length);
  });

  it('describes every tool for people in both languages and for the AI', () => {
    for (const t of ALL_TOOLS) {
      expect(t.name, t.name).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
      expect(t.title.en && t.title.fr, t.name).toBeTruthy();
      expect(t.description.length, t.name).toBeGreaterThan(40);
      expect(t.inputSchema.type, t.name).toBe('object');
      expect(t.inputSchema.additionalProperties, t.name).toBe(false);
      expect(typeof t.run, t.name).toBe('function');
    }
  });

  it('is read-only at this stage', () => {
    for (const t of ALL_TOOLS) expect(describeTool(t, 'en').annotations.readOnlyHint, t.name).toBe(true);
  });

  it('keeps the em dash out of what the AI app shows', () => {
    expect(JSON.stringify(ALL_TOOLS.map((t) => describeTool(t, 'fr')))).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('CONN-031 invoicing', () => {
  it('who_owes_me ages what is unpaid, by customer, largest first', () => {
    const r = run('who_owes_me');
    expect(r.as_of).toBe(TODAY);
    expect(r.customers).toEqual([
      // exempt customer: the taxed lines carry no tax
      { customer: 'Beta Market', outstanding: 200, not_yet_due: 200, late_1_to_30_days: 0, late_31_to_60_days: 0, late_over_60_days: 0, credits_available: 0, balance_owed: 200 },
      { customer: 'Acme Foods', outstanding: 60, not_yet_due: 0, late_1_to_30_days: 0, late_31_to_60_days: 0, late_over_60_days: 60, credits_available: 0, balance_owed: 60 },
    ]);
    expect(r.total_outstanding).toBe(260);
    expect(r.total_late).toBe(60);
  });

  it('who_owes_me can look back to an earlier date', () => {
    const r = run('who_owes_me', { as_of: '2026-04-10' });
    expect(r.customers.find((c) => c.customer === 'Acme Foods').late_1_to_30_days).toBe(60);
  });

  it('list_invoices shows open invoices by default, never drafts or pro formas', () => {
    const r = run('list_invoices');
    expect(r.invoices.map((i) => i.number)).toEqual(['F-0002', 'F-0001']);
    expect(r.invoices[1]).toEqual({ number: 'F-0001', date: '2026-03-01', due_date: '2026-03-31', customer: 'Acme Foods', status: 'sent', total: 100, paid: 40, balance: 60, overdue: true });
    expect([r.count, r.total, r.balance, r.truncated]).toEqual([2, 300, 260, false]);
  });

  it('list_invoices filters by status, customer and dates, and says when it cuts the list', () => {
    expect(run('list_invoices', { status: 'overdue' }).invoices.map((i) => i.number)).toEqual(['F-0001']);
    expect(run('list_invoices', { status: 'paid' }).invoices.map((i) => i.number)).toEqual(['F-0003']);
    expect(run('list_invoices', { status: 'draft' }).invoices.map((i) => i.number)).toEqual(['F-0004']);
    expect(run('list_invoices', { status: 'all' }).invoices.map((i) => i.number)).toEqual(['F-0002', 'F-0003', 'F-0001']);
    expect(run('list_invoices', { status: 'all', customer: 'acme' }).count).toBe(2);
    expect(run('list_invoices', { status: 'all', from: '2026-05-01', to: '2026-05-31' }).invoices.map((i) => i.number)).toEqual(['F-0003']);
    const cut = run('list_invoices', { status: 'all', limit: 1 });
    expect([cut.count, cut.invoices.length, cut.truncated]).toEqual([3, 1, true]);
  });

  it('get_invoice gives the lines, taxes and every payment with its kind', () => {
    const r = run('get_invoice', { number: 'f-0003' });
    expect(r).toMatchObject({ number: 'F-0003', status: 'paid', total: 50, paid: 50, balance: 0, subtotal: 50, gst: 0, qst: 0 });
    expect(r.lines).toEqual([{ description: 'Item', quantity: 1, unit_price: 50, discount: null, taxed: false }]);
    expect(r.payments).toEqual([
      { date: '2026-05-20', amount: 45, kind: 'money', method: 'Virement', reference: null },
      { date: '2026-05-20', amount: 5, kind: 'credit_note', method: null, reference: 'NC-0001' },
    ]);
  });

  it('get_invoice says so plainly when the number is unknown', () => {
    expect(() => run('get_invoice', { number: 'F-9999' })).toThrow('No invoice has the number F-9999.');
    try { run('get_invoice', { number: 'F-9999' }); } catch (e) { expect(e.forUser).toBe(true); }
  });
});

describe('CONN-032 the books', () => {
  it('company_overview says whose books these are and what the caller may do', () => {
    expect(run('company_overview')).toEqual({
      company: 'Demo Inc.', today: TODAY, fiscal_year_ends: '10-31', currency: 'CAD', access: 'read', can_change_the_books: false,
      counts: { customers: 2, invoices: 3, unpaid_invoices: 2, credit_notes: 0 },
    });
  });

  it('bills_to_pay lists unpaid bills, earliest due first, and only named fields', () => {
    const r = run('bills_to_pay');
    expect(data._billArgs).toEqual({ paid: 0 });
    expect(r.bills.map((b) => b.supplier)).toEqual(['Hydro', 'Mayo Maker']);
    expect(r.bills[0]).toEqual({ supplier: 'Hydro', bill_number: null, bill_date: '2026-05-01', due_date: '2026-06-01', amount: 120, overdue: true, note: 'May' });
    expect([r.count, r.total_owed, r.total_overdue]).toEqual([2, 620.5, 120]);
    expect(JSON.stringify(r)).not.toContain('secret_internal');
    expect(run('bills_to_pay', { supplier: 'mayo' }).count).toBe(1);
  });

  it('bank_balances reports each account in dollars and the lines left to review', () => {
    const r = run('bank_balances');
    expect(data._bankAsOf).toBe(TODAY);
    expect(r).toEqual({ as_of: TODAY, total: 11895.57, accounts: [{ account: 'Chequing', ledger_account: '1010', balance: 12345.67 }, { account: 'Visa', ledger_account: '2050', balance: -450.1 }], statement_lines_to_review: 7 });
    run('bank_balances', { as_of: '2026-01-31' });
    expect(data._bankAsOf).toBe('2026-01-31');
  });

  it('profit_and_loss needs a period and names accounts in the language in use', () => {
    expect(checkArguments(tool('profit_and_loss').inputSchema, { from: '2026-01-01' })).toBe('Missing argument: to.');
    expect(checkArguments(tool('profit_and_loss').inputSchema, { from: 'January', to: '2026-01-31' })).toContain('YYYY-MM-DD');
    const r = run('profit_and_loss', { from: '2026-01-01', to: '2026-03-31' });
    expect(r).toMatchObject({ revenue: 10000, cost_of_goods: 4000, gross_profit: 6000, gross_margin_pct: 60, expenses: 3500, net_income: 2500, net_margin_pct: 25 });
    expect(r.accounts).toEqual([
      { account: '4000', name: 'Sales', kind: 'revenue', amount: 10000, pct_of_revenue: 100 },
      { account: '5000', name: 'Purchases', kind: 'cogs', amount: 4000, pct_of_revenue: 40 },
    ]);
    expect(tool('profit_and_loss').run({ from: '2026-01-01', to: '2026-03-31' }, { ...ctx, lang: 'fr' }).accounts[0].name).toBe('Ventes');
    expect(() => run('profit_and_loss', { from: '2026-04-01', to: '2026-03-31' })).toThrow('The period ends before it starts.');
  });

  it('books_check reports what does not agree with the ledger', () => {
    expect(run('books_check')).toEqual({ agrees: false, checked: { invoices: 3, payments: 2, creditNotes: 0 }, findings: [{ problem: 'NOT_POSTED', document: 'invoice', number: 'F-0002', detail: { expectedCents: 22995 } }] });
  });
});

describe('CONN-033 the service', () => {
  const dirs = [];
  const services = [];
  const make = (company = { id: 'co1', name: 'Demo Inc.' }, dir) => {
    const d = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'biq-conn-'));
    if (!dir) dirs.push(d);
    const s = createConnectorService({ dir: d, company, version: '9.9.9', tools: ALL_TOOLS, makeCtx: () => ({ db: {}, data, kv: (k) => kvData[k] ?? null }), getLang: () => 'en', port: 0, now: () => new Date(2026, 5, 15, 10, 0, 0) });
    services.push(s);
    return { s, d };
  };
  afterEach(async () => {
    for (const s of services.splice(0)) await s.stop();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });
  const call = (url, key, name, args = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });

  it('is off until turned on, and starting it then does nothing', async () => {
    const { s, d } = make();
    const st = await s.start();
    expect(st).toMatchObject({ companyName: 'Demo Inc.', enabled: false, running: false, error: null, level: 'read', keyCreatedAt: null, toolCount: TOOL_COUNT, callCount: 0, lastCallAt: null, lastTool: null });
    expect(fs.existsSync(path.join(d, CONFIG_FILE))).toBe(false);
  });

  it('turning it on gives a key once, keeps only its hash, and answers with it', async () => {
    const { s, d } = make();
    const on = await s.enable();
    expect(on.ok).toBe(true);
    expect(on.status).toMatchObject({ enabled: true, running: true, error: null });
    const saved = fs.readFileSync(path.join(d, CONFIG_FILE), 'utf8');
    expect(saved).not.toContain(on.key);
    expect(JSON.parse(saved).companies.co1.enabled).toBe(true);
    expect(fs.statSync(path.join(d, CONFIG_FILE)).mode & 0o077).toBe(0);

    const r = await call(on.status.url, on.key, 'company_overview');
    expect(r.status).toBe(200);
    expect((await r.json()).result.structuredContent).toMatchObject({ company: 'Demo Inc.', today: '2026-06-15', access: 'read' });
    expect(s.status()).toMatchObject({ callCount: 1, lastTool: 'Company overview' });
    expect(s.status().lastCallAt).toBeTruthy();
  });

  it('a new key shuts the old one out; turning off shuts everyone out', async () => {
    const { s } = make();
    const first = await s.enable();
    const second = await s.newKey();
    expect(second.key).not.toBe(first.key);
    expect((await call(second.status.url, first.key, 'company_overview')).status).toBe(401);
    expect((await call(second.status.url, second.key, 'company_overview')).status).toBe(200);
    const off = await s.disable();
    expect(off.status).toMatchObject({ enabled: false, running: false, keyCreatedAt: null });
    await expect(call(second.status.url, second.key, 'company_overview')).rejects.toThrow();
  });

  it('a key for another company is told to open that company, and reads nothing', async () => {
    const a = make({ id: 'co1', name: 'Demo Inc.' });
    const keyA = (await a.s.enable()).key;
    await a.s.stop();
    const b = make({ id: 'co2', name: 'Other Ltd.' }, a.d);
    const onB = await b.s.enable();
    const r = await call(onB.status.url, keyA, 'company_overview');
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).not.toContain('Other Ltd.');
    // each company kept its own entry in the shared file
    const cfg = JSON.parse(fs.readFileSync(path.join(a.d, CONFIG_FILE), 'utf8'));
    expect(Object.keys(cfg.companies).sort()).toEqual(['co1', 'co2']);
  });

  it('starts again by itself the next time the app opens', async () => {
    const first = make();
    const on = await first.s.enable();
    await first.s.stop();
    const again = make({ id: 'co1', name: 'Demo Inc.' }, first.d);
    const st = await again.s.start();
    expect(st).toMatchObject({ enabled: true, running: true });
    expect((await call(st.url, on.key, 'books_check')).status).toBe(200);
  });

  it('CONN-034 stays stopped until the plan allows it, and keeps the key meanwhile', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-conn-'));
    dirs.push(d);
    const s = createConnectorService({ dir: d, company: { id: 'co1', name: 'Demo Inc.' }, version: '1', tools: ALL_TOOLS, makeCtx: () => ({ db: {}, data, kv: () => null }), port: 0, allowed: false });
    services.push(s);
    // Not on the plan: no key can be made and nothing listens.
    expect(await s.enable()).toMatchObject({ ok: false, error: 'plan', status: { enabled: false, allowed: false, running: false } });
    expect(fs.existsSync(path.join(d, CONFIG_FILE))).toBe(false);
    // The plan includes it: turning on works.
    expect(await s.setAllowed(true)).toMatchObject({ allowed: true, enabled: false, running: false });
    const on = await s.enable();
    expect(on).toMatchObject({ ok: true, status: { enabled: true, running: true } });
    expect((await call(on.status.url, on.key, 'books_check')).status).toBe(200);
    // The plan lapses: it stops answering, the key stays on file, no error is shown.
    expect(await s.setAllowed(false)).toMatchObject({ allowed: false, enabled: true, running: false, error: null });
    await expect(call(on.status.url, on.key, 'books_check')).rejects.toThrow();
    expect(await s.start()).toMatchObject({ running: false });
    // Back on the plan: the same key works again.
    const back = await s.setAllowed(true);
    expect(back).toMatchObject({ enabled: true, running: true });
    expect((await call(back.url, on.key, 'books_check')).status).toBe(200);
    // Turning off is always possible, on the plan or not.
    await s.setAllowed(false);
    expect(await s.disable()).toMatchObject({ ok: true, status: { enabled: false, running: false } });
  });

  it('says so when its address is taken', async () => {
    const a = make();
    const on = await a.s.enable();
    const takenPort = Number(new URL(on.status.url).port);
    const b = createConnectorService({ dir: a.d, company: { id: 'co1', name: 'Demo Inc.' }, version: '1', tools: ALL_TOOLS, makeCtx: () => ({}), port: takenPort });
    services.push(b);
    expect(await b.start()).toMatchObject({ enabled: true, running: false, error: 'port_in_use' });
  });
});
