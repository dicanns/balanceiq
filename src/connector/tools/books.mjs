// The company at a glance, bills to pay, bank balances, profit and loss, books check.

import { CLOSED_INVOICE_STATUSES } from '../../utils/invoiceStatus.mjs';
import { ToolError, round2, dollars, dateArg, limitArg, clampLimit, capped, NO_ARGS } from './shared.mjs';

const pad = (n) => String(n).padStart(2, '0');

const companyOverview = {
  name: 'company_overview',
  title: { en: 'Company overview', fr: 'Aperçu de l\'entreprise' },
  description: 'Start here. Which company these books belong to, today\'s date, the fiscal year end, what this connection is allowed to do, and how much data there is.',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const invoices = (ctx.data.documentsList('facture', ctx.db) || []).filter((f) => f && f.documentType !== 'proforma');
    const fye = ctx.data.fiscalYearEndGet(ctx.db);
    return {
      company: ctx.company.name,
      today: ctx.today,
      fiscal_year_ends: `${pad(fye.month)}-${pad(fye.day)}`,
      currency: 'CAD',
      access: ctx.level,
      can_change_the_books: ctx.level !== 'read',
      counts: {
        customers: (ctx.kv('dicann-fac-clients') || []).length,
        invoices: invoices.filter((f) => f.statut !== 'Brouillon').length,
        unpaid_invoices: invoices.filter((f) => !CLOSED_INVOICE_STATUSES.includes(f.statut)).length,
        credit_notes: (ctx.data.documentsList('creditnote', ctx.db) || []).length,
      },
    };
  },
};

const billsToPay = {
  name: 'bills_to_pay',
  title: { en: 'Bills to pay', fr: 'Factures à payer' },
  description: 'Supplier bills that are entered and not yet paid, earliest due first, with the total owed. Use it for "what do I owe" or "what is due this week". Amounts include tax.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { supplier: { type: 'string', description: 'Part of the supplier name' }, limit: limitArg(200, 100) } },
  run(args, ctx) {
    const wanted = String(args.supplier || '').trim().toLowerCase();
    const all = (ctx.data.supplierBillList({ paid: 0 }, ctx.db) || [])
      .filter((b) => !wanted || String(b.supplier_name || '').toLowerCase().includes(wanted))
      .map((b) => ({
        supplier: b.supplier_name || '',
        bill_number: b.invoice_number || null,
        bill_date: b.bill_date || null,
        due_date: b.due_date || null,
        amount: round2(b.amount),
        overdue: !!b.due_date && b.due_date < ctx.today,
        note: b.note || null,
      }))
      .sort((a, b) => String(a.due_date || a.bill_date || '9999').localeCompare(String(b.due_date || b.bill_date || '9999')));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 200, 100));
    return {
      count: all.length,
      total_owed: round2(all.reduce((s, b) => s + b.amount, 0)),
      total_overdue: round2(all.filter((b) => b.overdue).reduce((s, b) => s + b.amount, 0)),
      truncated,
      bills: rows,
    };
  },
};

const bankBalances = {
  name: 'bank_balances',
  title: { en: 'Bank balances', fr: 'Soldes bancaires' },
  description: 'The balance of each bank and credit card account according to the statement lines imported so far, and how many statement lines still need to be reviewed. A balance is only as recent as the last import.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { as_of: dateArg('Balance at the end of this date; default today') } },
  run(args, ctx) {
    const asOf = args.as_of || ctx.today;
    const accounts = (ctx.data.bankSubledgerBalances(asOf, ctx.db) || []).map((a) => ({ account: a.name || '', ledger_account: a.accountNumber || null, balance: dollars(a.cents) }));
    return {
      as_of: asOf,
      total: round2(accounts.reduce((s, a) => s + a.balance, 0)),
      accounts,
      statement_lines_to_review: Number(ctx.data.bankNeedsCategorizingCount(ctx.db)) || 0,
    };
  },
};

const profitAndLoss = {
  name: 'profit_and_loss',
  title: { en: 'Profit and loss', fr: 'État des résultats' },
  description: 'The income statement from the general ledger for a period: revenue, cost of goods, expenses and net income, with each account. Only posted entries count, so a period with unposted or unreviewed items is incomplete.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: dateArg('First day of the period'), to: dateArg('Last day of the period') } },
  run(args, ctx) {
    if (args.from > args.to) throw new ToolError('The period ends before it starts.');
    const s = ctx.data.incomeStatement(args.from, args.to, { _db: ctx.db });
    const pct = (v) => (v == null ? null : Math.round(v * 10) / 10);
    return {
      from: args.from,
      to: args.to,
      revenue: dollars(s.revenueCents),
      cost_of_goods: dollars(s.cogsCents),
      gross_profit: dollars(s.grossProfitCents),
      gross_margin_pct: pct(s.grossMarginPct),
      expenses: dollars(s.expenseCents),
      net_income: dollars(s.netIncomeCents),
      net_margin_pct: pct(s.netMarginPct),
      accounts: (s.lines || []).filter((l) => l.amountCents).map((l) => ({
        account: l.accountNumber,
        name: (ctx.lang === 'fr' ? l.nameFr : l.nameEn) || l.nameFr || l.nameEn || '',
        kind: l.type,
        amount: dollars(l.amountCents),
        pct_of_revenue: pct(l.pctOfRevenue),
      })),
    };
  },
};

const booksCheck = {
  name: 'books_check',
  title: { en: 'Books check', fr: 'Vérification des livres' },
  description: 'Compares every invoice, payment and credit note with what the general ledger holds and lists anything that does not agree. An empty list of findings means the two agree.',
  inputSchema: NO_ARGS,
  run(_args, ctx) {
    const r = ctx.data.booksCheck(ctx.db);
    const findings = (r.findings || []).map((f) => ({ problem: f.code, document: f.kind, number: f.numero || null, detail: f.detail || {} }));
    return { agrees: findings.length === 0, checked: r.checked || {}, findings };
  },
};

export const booksTools = [companyOverview, billsToPay, bankBalances, profitAndLoss, booksCheck];
