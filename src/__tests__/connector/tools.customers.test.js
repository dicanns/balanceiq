/**
 * CONN-040  customers: list_customers, customer_account, list_products
 * CONN-041  quotes, orders, payments, credits and product profit
 *
 * The data functions are stubbed (they have their own tests). What is tested is
 * what each tool asks for and what it hands to the AI.
 */
import { describe, it, expect } from 'vitest';
import { customerTools } from '../../connector/tools/customers.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const TODAY = '2026-06-15';
const clients = [
  { id: 'c1', code: 'ACME', entreprise: 'Acme Foods', courriel: 'buyer@acme.test', tel1: '555-0100', ville: 'Laval', conditionsPaiement: 'Net 30', credit_limit_enabled: true, credit_limit: 5000, secret_internal: 'leak-me' },
  { id: 'c2', code: 'BETA', entreprise: 'Beta Market', taxExempt: true, conditionsPaiement: 'Net 15' },
  { id: 'c3', code: 'ACRE', entreprise: 'Acme Bakery' },
];
const line = (quantite, prixUnitaire, taxed = false, produitId = '') => ({ id: `${quantite}-${prixUnitaire}-${produitId}`, description: 'Item', quantite, prixUnitaire, remise: 0, tps: taxed, tvq: taxed, produitId });
const invoices = [
  { id: 'i1', numero: 'F-0001', date: '2026-03-01', dateEcheance: '2026-03-31', clientId: 'c1', statut: 'Envoyée', documentType: 'facture', lignes: [line(10, 10, false, 'p1')], paiements: [{ date: '2026-04-02', montant: 40, mode: 'Chèque', secret_internal: 'x' }] },
  { id: 'i2', numero: 'F-0002', date: '2026-06-01', dateEcheance: '2026-07-01', clientId: 'c2', statut: 'Envoyée', documentType: 'facture', lignes: [line(2, 100, true, 'p2')], paiements: [] },
  { id: 'i3', numero: 'F-0003', date: '2026-05-10', dateEcheance: '2026-06-09', clientId: 'c1', statut: 'Payée', documentType: 'facture', lignes: [line(1, 50, false, 'p1')], paiements: [{ date: '2026-05-20', montant: 45, mode: 'Virement' }, { date: '2026-05-20', montant: 5, fromCredit: true, reference: 'NC-0001' }] },
  { id: 'i4', numero: 'P-0001', date: '2026-06-11', dateEcheance: '2026-07-11', clientId: 'c1', statut: 'Envoyée', documentType: 'proforma', lignes: [line(1, 777)], paiements: [{ date: '2026-06-12', montant: 777 }] },
];
const kvData = {
  'dicann-fac-clients': clients,
  'dicann-fac-client-credits': [
    { id: 'k1', clientId: 'c1', date: '2026-05-01', amountCents: 2500, applications: [{ amountCents: 500 }], refunds: [], secret_internal: 'x' },
    { id: 'k2', clientId: 'c2', date: '2026-05-02', amountCents: 1000, applications: [{ amountCents: 1000 }], refunds: [] },
  ],
  'dicann-fac-categories': [{ id: 'cat1', nom: 'Sauces' }],
  'dicann-fac-produits': [
    { id: 'p1', code: 'MAY1', description: 'Mayo 1L', categorieId: 'cat1', prixUnitaire: 10, uniteMesure: 'unité', tps: true, tvq: true, couts: [{ depuis: '', cout: 6 }], secret_internal: 'x' },
    { id: 'p2', code: 'SVC', description: 'Delivery', categorieId: 'cat1', prixUnitaire: 100, uniteMesure: 'service', tps: false, tvq: false, couts: [] },
  ],
  'dicann-fac-soumissions': [
    { id: 's1', numero: 'S-0001', date: '2026-06-01', clientId: 'c1', statut: 'Envoyée', lignes: [line(3, 10)], secret_internal: 'x' },
    { id: 's2', numero: 'S-0002', date: '2026-05-01', clientId: 'c2', statut: 'Acceptée', lignes: [line(1, 100, true)] },
  ],
  'dicann-fac-commandes': [
    { id: 'o1', numero: 'C-0001', date: '2026-06-05', clientId: 'c2', statut: 'Confirmée', lignes: [line(4, 25)] },
  ],
};
const data = { documentsList: (kind) => (kind === 'facture' ? invoices : []), forecastProductsGetAll: () => [] };
const ctx = { company: { id: 'co1', name: 'Demo Inc.' }, today: TODAY, lang: 'en', level: 'read', db: {}, data, kv: (k) => kvData[k] ?? null };
const tool = (name) => customerTools.find((t) => t.name === name);
const run = (name, args = {}, context = ctx) => {
  expect(checkArguments(tool(name).inputSchema, args)).toBeNull();
  const answer = tool(name).run(args, context);
  expectPlainAnswer(answer, name);
  expect(JSON.stringify(answer)).not.toContain('secret_internal');
  expect(JSON.stringify(answer)).not.toContain('leak-me');
  return answer;
};

describe('CONN-040 customers and products', () => {
  it('every tool is well formed', () => {
    expectWellFormed(customerTools);
    expect(customerTools.map((t) => t.name)).toEqual(['list_customers', 'customer_account', 'list_products', 'list_quotes_and_orders', 'payments_received', 'customer_credits', 'product_profit']);
  });

  it('list_customers gives contact details and what each one owes, by name', () => {
    const r = run('list_customers');
    expect(r.customers).toEqual([
      { name: 'Acme Bakery', code: 'ACRE', email: null, phone: null, city: null, payment_terms: null, tax_exempt: false, credit_limit: null, balance_owed: 0, overdue: 0 },
      { name: 'Acme Foods', code: 'ACME', email: 'buyer@acme.test', phone: '555-0100', city: 'Laval', payment_terms: 'Net 30', tax_exempt: false, credit_limit: 5000, balance_owed: 40, overdue: 60 },
      { name: 'Beta Market', code: 'BETA', email: null, phone: null, city: null, payment_terms: 'Net 15', tax_exempt: true, credit_limit: null, balance_owed: 200, overdue: 0 },
    ]);
    expect([r.count, r.truncated]).toEqual([3, false]);
  });

  it('list_customers searches by name or code and says when it cuts the list', () => {
    expect(run('list_customers', { search: 'acme' }).customers.map((c) => c.code)).toEqual(['ACRE', 'ACME']);
    expect(run('list_customers', { search: 'beta' }).count).toBe(1);
    const cut = run('list_customers', { limit: 1 });
    expect([cut.count, cut.customers.length, cut.truncated]).toEqual([3, 1, true]);
    expect(checkArguments(tool('list_customers').inputSchema, { limit: 'ten' })).not.toBeNull();
  });

  it('customer_account shows open invoices, aging, credits and last payments', () => {
    const r = run('customer_account', { customer: 'acme foods' });
    expect(r).toEqual({
      customer: 'Acme Foods',
      code: 'ACME',
      as_of: TODAY,
      outstanding: 60,
      credits_available: 20,
      balance_owed: 40,
      aging: { not_yet_due: 0, late_1_to_30_days: 0, late_31_to_60_days: 0, late_over_60_days: 60 },
      open_invoices: [{ number: 'F-0001', date: '2026-03-01', due_date: '2026-03-31', total: 100, paid: 40, balance: 60, days_overdue: 76 }],
      credits: [{ reference: null, kind: 'customer_credit', amount_left: 20 }],
      last_payments: [
        { date: '2026-05-20', invoice: 'F-0003', amount: 45, method: 'Virement', kind: 'money' },
        { date: '2026-05-20', invoice: 'F-0003', amount: 5, method: null, kind: 'credit_note' },
        { date: '2026-04-02', invoice: 'F-0001', amount: 40, method: 'Chèque', kind: 'money' },
      ],
    });
  });

  it('customer_account takes a code, looks back with as_of, and asks which one when the text is ambiguous', () => {
    expect(run('customer_account', { customer: 'BETA' }).open_invoices.map((i) => i.number)).toEqual(['F-0002']);
    expect(run('customer_account', { customer: 'ACME', as_of: '2026-04-10' }).aging.late_1_to_30_days).toBe(60);
    expect(() => run('customer_account', { customer: 'acm' })).toThrow(/Acme Foods, Acme Bakery|Acme Bakery, Acme Foods/);
    expect(() => run('customer_account', { customer: 'nobody' })).toThrow(/No customer matches/);
    expect(checkArguments(tool('customer_account').inputSchema, {})).not.toBeNull();
    expect(checkArguments(tool('customer_account').inputSchema, { customer: 'a', as_of: 'June' })).not.toBeNull();
  });

  it('list_products gives price, category, tax and the cost in effect', () => {
    const r = run('list_products');
    expect(r.products).toEqual([
      { code: 'MAY1', description: 'Mayo 1L', unit: 'unité', price: 10, category: 'Sauces', taxable: true, cost_per_unit: 6 },
      { code: 'SVC', description: 'Delivery', unit: 'service', price: 100, category: 'Sauces', taxable: false, cost_per_unit: null },
    ]);
    expect([r.count, r.truncated]).toEqual([2, false]);
    expect(run('list_products', { search: 'mayo' }).count).toBe(1);
    expect(run('list_products', { category: 'sauce' }).count).toBe(2);
    expect(run('list_products', { category: 'drinks' }).count).toBe(0);
    const cut = run('list_products', { limit: 1 });
    expect([cut.count, cut.products.length, cut.truncated]).toEqual([2, 1, true]);
  });
});

describe('CONN-041 quotes, payments, credits and product profit', () => {
  it('list_quotes_and_orders lists quotes newest first with the tax-aware total', () => {
    const r = run('list_quotes_and_orders', { kind: 'quote' });
    expect(r).toEqual({
      kind: 'quote', count: 2, total: 130, truncated: false,
      documents: [
        { number: 'S-0001', date: '2026-06-01', customer: 'Acme Foods', status: 'sent', total: 30 },
        { number: 'S-0002', date: '2026-05-01', customer: 'Beta Market', status: 'accepted', total: 100 },
      ],
    });
  });

  it('list_quotes_and_orders reads orders, filters, limits and refuses a bad period', () => {
    expect(run('list_quotes_and_orders', { kind: 'order' }).documents).toEqual([{ number: 'C-0001', date: '2026-06-05', customer: 'Beta Market', status: 'confirmed', total: 100 }]);
    expect(run('list_quotes_and_orders', { kind: 'quote', status: 'accepted' }).documents.map((d) => d.number)).toEqual(['S-0002']);
    expect(run('list_quotes_and_orders', { kind: 'quote', customer: 'acme' }).count).toBe(1);
    expect(run('list_quotes_and_orders', { kind: 'quote', from: '2026-05-15' }).count).toBe(1);
    const cut = run('list_quotes_and_orders', { kind: 'quote', limit: 1 });
    expect([cut.count, cut.documents.length, cut.truncated]).toEqual([2, 1, true]);
    expect(checkArguments(tool('list_quotes_and_orders').inputSchema, {})).not.toBeNull();
    expect(checkArguments(tool('list_quotes_and_orders').inputSchema, { kind: 'invoice' })).not.toBeNull();
    expect(() => run('list_quotes_and_orders', { kind: 'quote', from: '2026-06-30', to: '2026-06-01' })).toThrow(/after/);
  });

  it('payments_received lists every row with its kind and totals money only', () => {
    const r = run('payments_received');
    expect(r.payments).toEqual([
      { date: '2026-05-20', invoice: 'F-0003', customer: 'Acme Foods', amount: 45, method: 'Virement', kind: 'money' },
      { date: '2026-05-20', invoice: 'F-0003', customer: 'Acme Foods', amount: 5, method: null, kind: 'credit_note' },
      { date: '2026-04-02', invoice: 'F-0001', customer: 'Acme Foods', amount: 40, method: 'Chèque', kind: 'money' },
    ]);
    expect([r.count, r.total_money, r.truncated]).toEqual([3, 85, false]);
  });

  it('payments_received tells customer credit and bad debt apart, filters and limits', () => {
    const more = [...invoices, { id: 'i5', numero: 'F-0005', date: '2026-02-01', dateEcheance: '2026-03-01', clientId: 'c2', statut: 'Radiée', documentType: 'facture', lignes: [line(1, 30)], paiements: [{ date: '2026-06-01', montant: 10, fromClientCredit: true }, { date: '2026-06-02', montant: 20, badDebt: true }] }];
    const r = run('payments_received', { customer: 'beta' }, { ...ctx, data: { documentsList: (k) => (k === 'facture' ? more : []) } });
    expect(r.payments.map((p) => p.kind)).toEqual(['write_off', 'customer_credit']);
    expect(r.total_money).toBe(0);
    expect(run('payments_received', { from: '2026-05-01', to: '2026-05-31' }).count).toBe(2);
    const cut = run('payments_received', { limit: 1 });
    expect([cut.count, cut.payments.length, cut.truncated]).toEqual([3, 1, true]);
    expect(() => run('payments_received', { from: '2026-06-30', to: '2026-06-01' })).toThrow(/after/);
  });

  it('customer_credits lists what is left on account and skips used-up credits', () => {
    expect(run('customer_credits')).toEqual({ count: 1, total_left: 20, credits: [{ customer: 'Acme Foods', date: '2026-05-01', original_amount: 25, amount_left: 20 }] });
    expect(run('customer_credits', { customer: 'beta' })).toEqual({ count: 0, total_left: 0, credits: [] });
  });

  it('product_profit gives profit by product and the products sold without a cost', () => {
    const r = run('product_profit', { from: '2026-01-01', to: '2026-12-31' });
    expect(r).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      invoice_count: 2,
      products: [{ code: 'MAY1', description: 'Mayo 1L', quantity: 11, sales: 150, credits: 0, cost: 66, profit: 84, margin_pct: 56, received: 85, to_collect: 60 }],
      totals: { quantity: 11, sales: 150, credits: 0, cost: 66, profit: 84, margin_pct: 56, received: 85, to_collect: 60 },
      sold_without_cost: [{ code: 'SVC', description: 'Delivery', quantity: 2, sales: 200 }],
      credits_not_matched: 0,
    });
  });

  it('product_profit defaults to the year so far and refuses a backwards period', () => {
    expect(run('product_profit').from).toBe('2026-01-01');
    expect(run('product_profit').to).toBe(TODAY);
    expect(run('product_profit', { from: '2026-05-01', to: '2026-05-31' }).totals.sales).toBe(50);
    expect(() => run('product_profit', { from: '2026-06-30', to: '2026-06-01' })).toThrow(/after/);
    expect(checkArguments(tool('product_profit').inputSchema, { from: 'May' })).not.toBeNull();
  });
});
