/**
 * CONN-070  list_bills, list_suppliers, recurring_bills, bill_payments
 *
 * The data functions are stubbed with made-up data shaped like the real ones.
 */
import { describe, it, expect } from 'vitest';
import { payablesTools } from '../../connector/tools/payables.mjs';
import { checkArguments } from '../../connector/protocol.mjs';
import { expectWellFormed, expectPlainAnswer } from './_conformance.js';

const TODAY = '2026-06-15';
const calls = [];
const bill = (over) => ({ id: 1, supplier_name: 'Mayo Maker', invoice_number: 'A-9', bill_date: '2026-06-01', due_date: '2026-07-01', amount: 500.5, paid: 0, payment_date: null, payment_method: null, coa_account_id: 10, note: '', paid_tx_date: null, paid_account_name: null, secret_internal: 'x', ...over });
const bills = [
  bill({}),
  bill({ id: 2, supplier_name: 'Hydro', invoice_number: null, bill_date: '2026-05-20', due_date: '2026-06-10', amount: 120, coa_account_id: 11, note: 'May' }),
  bill({ id: 3, supplier_name: 'Mayo Maker', invoice_number: 'A-7', bill_date: '2026-05-02', due_date: '2026-06-01', amount: 300, paid: 1, payment_date: '2026-05-25', payment_method: 'cheque', paid_account_name: 'Business Chequing' }),
  bill({ id: 4, supplier_name: 'Packaging Plus', invoice_number: 'PP-1', bill_date: '2026-04-10', due_date: null, amount: 75.25, paid: 1, payment_date: null, paid_tx_date: '2026-04-20', paid_account_name: 'Business Visa', coa_account_id: 12 }),
];
const rules = [
  { id: 1, rule_type: 'supplier_bill', name: 'Rent', frequency: 'monthly', next_run_at: '2026-07-01', end_date: null, auto_approve: 1, is_active: 1, template_json: '{}', template: { supplier_name: 'Landlord Co', amount: '1800.5' }, secret_internal: 'x' },
  { id: 2, rule_type: 'journal_entry', name: 'Accrual', frequency: 'quarterly', next_run_at: '2026-09-30', end_date: '2027-12-31', auto_approve: 0, is_active: 0, template: { description: 'x' } },
];
const pending = [{ id: 7, rule_id: 1, rule_name: 'Rent', rule_type: 'supplier_bill', scheduled_for: '2026-06-01', status: 'pending', template: { supplier_name: 'Landlord Co', amount: '1800.5' }, template_snapshot: 'raw' }];
const suppliers = [{ id: 's1', name: 'Mayo Maker', category: 'Food', secret_internal: 'x' }, { id: 's2', name: 'Hydro' }, { id: 's3', name: 'Cleaning Crew', category: 'Services' }];
const data = {
  supplierBillList: (opts) => { calls.push(opts); return bills.filter((b) => opts.paid == null || !!b.paid === !!opts.paid); },
  coaList: () => [{ id: 10, account_number: '5000', name_fr: 'Achats', name_en: 'Purchases' }, { id: 11, account_number: '6200', name_fr: 'Services publics', name_en: 'Utilities' }, { id: 12, account_number: '6500', name_fr: 'Emballage', name_en: null }],
  recurringRuleList: () => rules,
  recurringPendingList: () => pending,
};
const kvData = { 'dicann-suppliers-v2': suppliers };
const ctx = { company: { id: 'co1', name: 'Demo Inc.' }, today: TODAY, lang: 'en', level: 'read', db: { marker: 1 }, data, kv: (k) => kvData[k] ?? null };
const tool = (name) => payablesTools.find((t) => t.name === name);
const run = (name, args = {}, c = ctx) => {
  expect(checkArguments(tool(name).inputSchema, args)).toBeNull();
  const r = tool(name).run(args, c);
  expectPlainAnswer(r);
  return r;
};

describe('CONN-070 payables tools', () => {
  it('are well formed', () => {
    expectWellFormed(payablesTools);
    expect(payablesTools.map((t) => t.name)).toEqual(['list_bills', 'list_suppliers', 'recurring_bills', 'bill_payments']);
  });

  it('list_bills gives the full history with account names and totals', () => {
    const r = run('list_bills');
    expect(calls.at(-1)).toEqual({ paid: null });
    expect(r).toEqual({
      count: 4,
      total: 995.75,
      total_unpaid: 620.5,
      truncated: false,
      bills: [
        { supplier: 'Mayo Maker', bill_number: 'A-9', bill_date: '2026-06-01', due_date: '2026-07-01', amount: 500.5, paid: false, payment_date: null, expense_account: 'Purchases', note: null },
        { supplier: 'Hydro', bill_number: null, bill_date: '2026-05-20', due_date: '2026-06-10', amount: 120, paid: false, payment_date: null, expense_account: 'Utilities', note: 'May' },
        { supplier: 'Mayo Maker', bill_number: 'A-7', bill_date: '2026-05-02', due_date: '2026-06-01', amount: 300, paid: true, payment_date: '2026-05-25', expense_account: 'Purchases', note: null },
        { supplier: 'Packaging Plus', bill_number: 'PP-1', bill_date: '2026-04-10', due_date: null, amount: 75.25, paid: true, payment_date: null, expense_account: 'Emballage', note: null },
      ],
    });
  });

  it('list_bills filters by status, supplier and bill date, and says when it cuts the list', () => {
    expect(run('list_bills', { status: 'unpaid' }).bills.map((b) => b.bill_number)).toEqual(['A-9', null]);
    expect(calls.at(-1)).toEqual({ paid: 0 });
    expect(run('list_bills', { status: 'paid' }).count).toBe(2);
    expect(calls.at(-1)).toEqual({ paid: 1 });
    expect(run('list_bills', { supplier: 'mayo' }).count).toBe(2);
    expect(run('list_bills', { from: '2026-05-01', to: '2026-05-31' }).bills.map((b) => b.supplier)).toEqual(['Hydro', 'Mayo Maker']);
    const cut = run('list_bills', { limit: 1 });
    expect([cut.count, cut.bills.length, cut.truncated]).toEqual([4, 1, true]);
    expect(checkArguments(tool('list_bills').inputSchema, { status: 'late' })).not.toBeNull();
  });

  it('list_suppliers names each supplier with what is unpaid to it', () => {
    expect(run('list_suppliers')).toEqual({
      count: 3,
      truncated: false,
      suppliers: [
        { name: 'Cleaning Crew', category: 'Services', unpaid_bills: 0, unpaid_total: 0 },
        { name: 'Hydro', category: null, unpaid_bills: 1, unpaid_total: 120 },
        { name: 'Mayo Maker', category: 'Food', unpaid_bills: 1, unpaid_total: 500.5 },
      ],
    });
    expect(calls.at(-1)).toEqual({ paid: 0 });
    expect(run('list_suppliers', { search: 'cle' }).suppliers.map((s) => s.name)).toEqual(['Cleaning Crew']);
    const cut = run('list_suppliers', { limit: 2 });
    expect([cut.count, cut.suppliers.length, cut.truncated]).toEqual([3, 2, true]);
  });

  it('list_suppliers copes with no stored list', () => {
    expect(run('list_suppliers', {}, { ...ctx, kv: () => null })).toEqual({ count: 0, truncated: false, suppliers: [] });
  });

  it('recurring_bills shows each rule and what is pending', () => {
    expect(run('recurring_bills')).toEqual({
      rule_count: 2,
      rules_truncated: false,
      rules: [
        { name: 'Rent', type: 'supplier_bill', supplier: 'Landlord Co', amount: 1800.5, frequency: 'monthly', next_date: '2026-07-01', ends_on: null, auto_approve: true, active: true },
        { name: 'Accrual', type: 'journal_entry', supplier: null, amount: null, frequency: 'quarterly', next_date: '2026-09-30', ends_on: '2027-12-31', auto_approve: false, active: false },
      ],
      pending_count: 1,
      pending_truncated: false,
      pending: [{ rule: 'Rent', type: 'supplier_bill', supplier: 'Landlord Co', amount: 1800.5, scheduled_for: '2026-06-01' }],
    });
  });

  it('recurring_bills refuses arguments', () => {
    expect(checkArguments(tool('recurring_bills').inputSchema, { active: true })).not.toBeNull();
  });

  it('bill_payments lists what was paid, newest first, from the paid bills', () => {
    const r = run('bill_payments');
    expect(calls.at(-1)).toEqual({ paid: 1 });
    expect(r).toEqual({
      count: 2,
      total_paid: 375.25,
      truncated: false,
      payments: [
        { date: '2026-05-25', supplier: 'Mayo Maker', bill_number: 'A-7', amount: 300, method: 'cheque', paid_from: 'Business Chequing' },
        { date: '2026-04-20', supplier: 'Packaging Plus', bill_number: 'PP-1', amount: 75.25, method: null, paid_from: 'Business Visa' },
      ],
    });
  });

  it('bill_payments filters by supplier and payment date, and says when it cuts the list', () => {
    expect(run('bill_payments', { supplier: 'pack' }).payments.map((p) => p.bill_number)).toEqual(['PP-1']);
    expect(run('bill_payments', { from: '2026-05-01' }).payments.map((p) => p.bill_number)).toEqual(['A-7']);
    expect(run('bill_payments', { to: '2026-04-30' }).payments.map((p) => p.bill_number)).toEqual(['PP-1']);
    const cut = run('bill_payments', { limit: 1 });
    expect([cut.count, cut.payments.length, cut.truncated]).toEqual([2, 1, true]);
    expect(checkArguments(tool('bill_payments').inputSchema, { from: 'May 1' })).not.toBeNull();
  });

  it('never hands over a field it was not asked to name', () => {
    const everything = JSON.stringify(payablesTools.map((t) => t.run({ status: 'all' }, ctx)));
    expect(everything).not.toContain('secret_internal');
    expect(everything).not.toContain('raw');
  });
});
