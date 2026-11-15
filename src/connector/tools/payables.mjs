// Supplier bills (full history), suppliers, recurring bills and what was paid on bills.
// All read-only. coaList, recurringRuleList and recurringPendingList take no `_db`.

import { round2, dateArg, limitArg, clampLimit, capped, nameMatches, NO_ARGS } from './shared.mjs';

const day = (v) => (v ? String(v).slice(0, 10) : null);
const normName = (s) => String(s || '').trim().toLowerCase();
const inRange = (date, from, to) => (!from || (date && date >= from)) && (!to || (date && date <= to));
const RECURRING_CAP = 200;

// Expense account names by id, in the language BalanceIQ is used in.
function accountNames(ctx) {
  const m = new Map();
  for (const a of ctx.data.coaList() || []) m.set(a.id, (ctx.lang === 'fr' ? a.name_fr || a.name_en : a.name_en || a.name_fr) || null);
  return m;
}

const listBills = {
  name: 'list_bills',
  title: { en: 'Supplier bills', fr: 'Factures fournisseurs' },
  description: 'The full history of supplier bills, newest first, paid and unpaid: supplier, bill number, dates, amount with tax, paid or not, payment date, expense account and note. Use it to look up a bill or a supplier\'s history. For only what is still owed, bills_to_pay is shorter.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['unpaid', 'paid', 'all'], description: 'Default all' },
      supplier: { type: 'string', description: 'Part of the supplier name' },
      from: dateArg('First bill date to include'),
      to: dateArg('Last bill date to include'),
      limit: limitArg(500, 100),
    },
  },
  run(args, ctx) {
    const status = args.status || 'all';
    const paidFilter = status === 'paid' ? 1 : status === 'unpaid' ? 0 : null;
    const names = accountNames(ctx);
    const all = (ctx.data.supplierBillList({ paid: paidFilter }, ctx.db) || [])
      .filter((b) => nameMatches(b.supplier_name, args.supplier))
      .filter((b) => inRange(day(b.bill_date), args.from, args.to))
      .map((b) => ({
        supplier: b.supplier_name || '',
        bill_number: b.invoice_number || null,
        bill_date: day(b.bill_date),
        due_date: day(b.due_date),
        amount: round2(b.amount),
        paid: !!b.paid,
        payment_date: b.paid ? day(b.payment_date) : null,
        expense_account: names.get(b.coa_account_id) || null,
        note: b.note || null,
      }))
      .sort((a, b) => String(b.bill_date || '').localeCompare(String(a.bill_date || '')));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return {
      count: all.length,
      total: round2(all.reduce((s, b) => s + b.amount, 0)),
      total_unpaid: round2(all.filter((b) => !b.paid).reduce((s, b) => s + b.amount, 0)),
      truncated,
      bills: rows,
    };
  },
};

const listSuppliers = {
  name: 'list_suppliers',
  title: { en: 'Suppliers', fr: 'Fournisseurs' },
  description: 'The supplier list: each supplier\'s name and category, with how many of its bills are unpaid and their total. BalanceIQ stores no contact details (phone, email, address) for suppliers. Use it to see who the suppliers are and who is owed money.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { search: { type: 'string', description: 'Part of the supplier name' }, limit: limitArg(500, 100) } },
  run(args, ctx) {
    const unpaid = new Map();
    for (const b of ctx.data.supplierBillList({ paid: 0 }, ctx.db) || []) {
      const k = normName(b.supplier_name);
      const cur = unpaid.get(k) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(b.amount) || 0;
      unpaid.set(k, cur);
    }
    const all = (ctx.kv('dicann-suppliers-v2') || [])
      .filter((s) => s && nameMatches(s.name, args.search))
      .map((s) => {
        const u = unpaid.get(normName(s.name)) || { count: 0, total: 0 };
        return { name: s.name || '', category: s.category || null, unpaid_bills: u.count, unpaid_total: round2(u.total) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return { count: all.length, truncated, suppliers: rows };
  },
};

// The amount typed into a rule's template is dollars, sometimes left blank.
const templateAmount = (t) => (t && t.amount !== '' && t.amount != null && Number.isFinite(Number(t.amount)) ? round2(t.amount) : null);

const recurringBills = {
  name: 'recurring_bills',
  title: { en: 'Recurring bills', fr: 'Factures récurrentes' },
  description: 'The recurring rules (rent, subscriptions and the like): what each one is for, supplier, amount, how often, the next date and whether it is active, plus the items generated and still waiting for approval. Use it for "what repeats every month" or "what is waiting to be approved".',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const rulesAll = (ctx.data.recurringRuleList() || []).map((r) => ({
      name: r.name || '',
      type: r.rule_type || null,
      supplier: r.template?.supplier_name || null,
      amount: templateAmount(r.template),
      frequency: r.frequency || null,
      next_date: day(r.next_run_at),
      ends_on: day(r.end_date),
      auto_approve: !!r.auto_approve,
      active: !!r.is_active,
    }));
    const rules = capped(rulesAll, RECURRING_CAP);
    const pendingAll = (ctx.data.recurringPendingList() || []).map((p) => ({
      rule: p.rule_name || '',
      type: p.rule_type || null,
      supplier: p.template?.supplier_name || null,
      amount: templateAmount(p.template),
      scheduled_for: day(p.scheduled_for),
    }));
    const pending = capped(pendingAll, RECURRING_CAP);
    return {
      rule_count: rulesAll.length,
      rules_truncated: rules.truncated,
      rules: rules.rows,
      pending_count: pendingAll.length,
      pending_truncated: pending.truncated,
      pending: pending.rows,
    };
  },
};

const billPayments = {
  name: 'bill_payments',
  title: { en: 'Bill payments', fr: 'Paiements de factures' },
  description: 'Payments made on supplier bills, newest first: date, supplier, bill number, amount, method and the account it was paid from. Built from the bills marked paid (the app records one payment per bill, not part payments). Use it for "what did I pay this supplier" or "what went out last month".',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      supplier: { type: 'string', description: 'Part of the supplier name' },
      from: dateArg('First payment date to include'),
      to: dateArg('Last payment date to include'),
      limit: limitArg(500, 100),
    },
  },
  run(args, ctx) {
    const all = (ctx.data.supplierBillList({ paid: 1 }, ctx.db) || [])
      .filter((b) => nameMatches(b.supplier_name, args.supplier))
      .map((b) => ({
        date: day(b.payment_date || b.paid_tx_date),
        supplier: b.supplier_name || '',
        bill_number: b.invoice_number || null,
        amount: round2(b.amount),
        method: b.payment_method || null,
        paid_from: b.paid_account_name || null,
      }))
      .filter((p) => inRange(p.date, args.from, args.to))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return {
      count: all.length,
      total_paid: round2(all.reduce((s, p) => s + p.amount, 0)),
      truncated,
      payments: rows,
    };
  },
};

export const payablesTools = [listBills, listSuppliers, recurringBills, billPayments];
