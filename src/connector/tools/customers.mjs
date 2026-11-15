// Customers, products, quotes and orders, payments received, customer credits, product profit.

import { invoiceTotalsFor } from '../../utils/calculations.js';
import { accountStanding, daysLate } from '../../services/accountStanding.js';
import { CLOSED_INVOICE_STATUSES } from '../../utils/invoiceStatus.mjs';
import { creditAvailableCents } from '../../utils/clientCredits.mjs';
import { costAt, productProfitReport, withLinkedCosts } from '../../utils/productProfit.mjs';
import { ToolError, round2, dollars, dateArg, limitArg, clampLimit, capped, nameMatches, paidOf, paymentKind } from './shared.mjs';

const PRO_FORMA = 'proforma';

const QUOTE_STATUS = { 'Brouillon': 'draft', 'Envoyée': 'sent', 'Acceptée': 'accepted', 'Refusée': 'declined', 'Expirée': 'expired' };
const ORDER_STATUS = { 'Brouillon': 'draft', 'Confirmée': 'confirmed', 'En cours': 'in_progress', 'Complétée': 'completed', 'Annulée': 'cancelled' };

const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

function load(ctx) {
  const clients = list(ctx.kv('dicann-fac-clients'));
  const invoices = list(ctx.data.documentsList('facture', ctx.db)).filter((f) => f.documentType !== PRO_FORMA);
  const nameOf = (c) => (c ? (c.entreprise || c.nom || c.code || '') : '');
  const byId = new Map(clients.map((c) => [c.id, c]));
  return {
    clients,
    invoices,
    nameOf,
    customerName: (id) => nameOf(byId.get(id)),
    totalOf: (doc) => invoiceTotalsFor(doc, clients).total,
  };
}

const clientMatches = (c, wanted) => nameMatches(c.entreprise || c.nom || '', wanted) || nameMatches(c.code || '', wanted);

function standingOf(clientId, books, ctx, asOf) {
  return accountStanding({
    clientId,
    factures: books.invoices,
    creditNotes: list(ctx.data.documentsList('creditnote', ctx.db)),
    clientCredits: list(ctx.kv('dicann-fac-client-credits')),
    asOf,
    totalOf: books.totalOf,
  });
}

// Same text matching as the app's search: exact code or name wins, else it must be unique.
function findCustomer(books, wanted) {
  const text = String(wanted || '').trim().toLowerCase();
  const exact = books.clients.filter((c) => String(c.code || '').toLowerCase() === text || books.nameOf(c).toLowerCase() === text);
  if (exact.length === 1) return exact[0];
  const found = books.clients.filter((c) => clientMatches(c, wanted));
  if (found.length === 1) return found[0];
  if (!found.length) throw new ToolError(`No customer matches "${wanted}".`);
  const names = found.slice(0, 10).map((c) => books.nameOf(c)).join(', ');
  throw new ToolError(`Several customers match "${wanted}": ${names}${found.length > 10 ? ', and more' : ''}. Ask which one is meant.`);
}

function checkPeriod(args) {
  if (args.from && args.to && args.from > args.to) throw new ToolError('The "from" date is after the "to" date.');
}
const inPeriod = (date, args) => (!args.from || date >= args.from) && (!args.to || date <= args.to);

function paymentRow(inv, p, customer) {
  return { date: p.date || null, invoice: inv.numero || '', customer, amount: round2(p.montant), method: p.mode || null, kind: paymentKind(p) };
}

const listCustomers = {
  name: 'list_customers',
  title: { en: 'List customers', fr: 'Lister les clients' },
  description: 'The customer list with contact details, payment terms and what each one owes now (balance owed is net of credits) and how much of it is late. Use it to find a customer or to see who has a balance. Use customer_account for one customer in detail.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      search: { type: 'string', description: 'Part of the customer name or code' },
      limit: limitArg(500, 100),
    },
  },
  run(args, ctx) {
    const books = load(ctx);
    const all = books.clients.filter((c) => clientMatches(c, args.search))
      .sort((a, b) => books.nameOf(a).localeCompare(books.nameOf(b)))
      .map((c) => {
        const s = standingOf(c.id, books, ctx, ctx.today);
        return {
          name: books.nameOf(c),
          code: c.code || null,
          email: c.courriel || null,
          phone: c.tel1 || c.cell || null,
          city: c.ville || null,
          payment_terms: c.conditionsPaiement || null,
          tax_exempt: !!c.taxExempt,
          credit_limit: c.credit_limit_enabled ? round2(c.credit_limit) : null,
          balance_owed: s.balanceOwed,
          overdue: round2(s.aging.d30 + s.aging.d60 + s.aging.d90),
        };
      });
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return { count: all.length, truncated, customers: rows };
  },
};

const customerAccount = {
  name: 'customer_account',
  title: { en: 'Customer account', fr: 'Compte d\'un client' },
  description: 'One customer\'s standing: open invoices with days overdue, aging buckets, credits available and the latest payments. Give part of the name or the code. If several customers match, the answer lists them so you can ask which one is meant.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['customer'],
    properties: {
      customer: { type: 'string', description: 'Part of the customer name, or the customer code' },
      as_of: dateArg('Age the balances as of this date; default today'),
    },
  },
  run(args, ctx) {
    const books = load(ctx);
    const client = findCustomer(books, args.customer);
    const asOf = args.as_of || ctx.today;
    const s = standingOf(client.id, books, ctx, asOf);
    const mine = books.invoices.filter((f) => f.clientId === client.id);
    const open = mine.filter((f) => !CLOSED_INVOICE_STATUSES.includes(f.statut)).map((f) => {
      const total = round2(books.totalOf(f));
      const paid = round2(paidOf(f));
      const late = daysLate(f.dateEcheance, asOf);
      return { number: f.numero || '', date: f.date || null, due_date: f.dateEcheance || null, total, paid, balance: round2(Math.max(0, total - paid)), days_overdue: Math.max(0, late) };
    }).filter((r) => r.balance > 0.005).sort((a, b) => (a.due_date || '') < (b.due_date || '') ? -1 : 1);
    const payments = mine.flatMap((f) => (f.paiements || []).filter(Boolean).map((p) => paymentRow(f, p, books.nameOf(client))))
      .sort(byDateDesc).slice(0, 10)
      .map(({ customer, ...row }) => row);
    return {
      customer: books.nameOf(client),
      code: client.code || null,
      as_of: asOf,
      outstanding: s.outstanding,
      credits_available: s.creditsAvailable,
      balance_owed: s.balanceOwed,
      aging: { not_yet_due: s.aging.current, late_1_to_30_days: s.aging.d30, late_31_to_60_days: s.aging.d60, late_over_60_days: s.aging.d90 },
      open_invoices: open,
      credits: s.credits.map((c) => ({ reference: c.numero || null, kind: c.clientCredit ? 'customer_credit' : 'credit_note', amount_left: round2(c.remaining) })),
      last_payments: payments,
    };
  },
};

const listProducts = {
  name: 'list_products',
  title: { en: 'List products', fr: 'Lister les produits' },
  description: 'The product and service list: code, description, unit, selling price, category, whether tax applies and the current cost per unit when one is entered. Use it for price questions or to see which products have no cost. Use product_profit for what products earned.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      search: { type: 'string', description: 'Part of the product code or description' },
      category: { type: 'string', description: 'Part of the category name' },
      limit: limitArg(500, 100),
    },
  },
  run(args, ctx) {
    const categories = new Map(list(ctx.kv('dicann-fac-categories')).map((c) => [c.id, c.nom || '']));
    const all = list(ctx.kv('dicann-fac-produits'))
      .filter((p) => nameMatches(p.description, args.search) || nameMatches(p.code, args.search))
      .filter((p) => nameMatches(categories.get(p.categorieId) || '', args.category))
      .sort((a, b) => String(a.code || a.description || '').localeCompare(String(b.code || b.description || '')))
      .map((p) => {
        const cost = costAt(p, ctx.today);
        return {
          code: p.code || null,
          description: p.description || '',
          unit: p.uniteMesure || null,
          price: round2(p.prixUnitaire),
          category: categories.get(p.categorieId) || null,
          taxable: !!(p.tps || p.tvq),
          // Costs can be fractions of a cent, so this one keeps four decimals.
          cost_per_unit: cost == null ? null : Math.round(cost * 10000) / 10000,
        };
      });
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return { count: all.length, truncated, products: rows };
  },
};

const listQuotesAndOrders = {
  name: 'list_quotes_and_orders',
  title: { en: 'Quotes and orders', fr: 'Soumissions et commandes' },
  description: 'Quotes (soumissions) or customer orders (commandes), newest first, with number, date, customer, status and total including tax. Choose kind quote or order. Filter by status, customer or date. Use it for "what quotes are waiting" or "what is on order".',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['kind'],
    properties: {
      kind: { type: 'string', enum: ['quote', 'order'], description: 'quote or order' },
      status: { type: 'string', description: 'Quote: draft, sent, accepted, declined, expired. Order: draft, confirmed, in_progress, completed, cancelled' },
      customer: { type: 'string', description: 'Part of the customer name' },
      from: dateArg('Document date on or after'),
      to: dateArg('Document date on or before'),
      limit: limitArg(200, 50),
    },
  },
  run(args, ctx) {
    checkPeriod(args);
    const books = load(ctx);
    const quote = args.kind === 'quote';
    const words = quote ? QUOTE_STATUS : ORDER_STATUS;
    const wantedStatus = String(args.status || '').trim().toLowerCase();
    const all = list(ctx.kv(quote ? 'dicann-fac-soumissions' : 'dicann-fac-commandes'))
      .filter((d) => inPeriod(d.date, args) && nameMatches(books.customerName(d.clientId), args.customer))
      .map((d) => ({ number: d.numero || '', date: d.date || null, customer: books.customerName(d.clientId), status: words[d.statut] || String(d.statut || '').toLowerCase(), total: round2(books.totalOf(d)) }))
      .filter((r) => !wantedStatus || r.status === wantedStatus)
      .sort((a, b) => (a.date || '') < (b.date || '') ? 1 : (a.date || '') > (b.date || '') ? -1 : String(b.number).localeCompare(String(a.number)));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 200, 50));
    return { kind: args.kind, count: all.length, total: round2(all.reduce((s, r) => s + r.total, 0)), truncated, documents: rows };
  },
};

const paymentsReceived = {
  name: 'payments_received',
  title: { en: 'Payments received', fr: 'Paiements reçus' },
  description: 'Every payment row recorded on invoices, newest first, with invoice, customer, amount, method and kind (money, credit_note, customer_credit, write_off). Only money counts in total_money; credits and write-offs settle an invoice without cash coming in.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      from: dateArg('Payment date on or after'),
      to: dateArg('Payment date on or before'),
      customer: { type: 'string', description: 'Part of the customer name' },
      limit: limitArg(500, 100),
    },
  },
  run(args, ctx) {
    checkPeriod(args);
    const books = load(ctx);
    const all = [];
    for (const inv of books.invoices) {
      const customer = books.customerName(inv.clientId);
      if (!nameMatches(customer, args.customer)) continue;
      for (const p of inv.paiements || []) {
        if (!p || !inPeriod(p.date, args)) continue;
        all.push(paymentRow(inv, p, customer));
      }
    }
    all.sort(byDateDesc);
    const { rows, truncated } = capped(all, clampLimit(args.limit, 500, 100));
    return {
      count: all.length,
      total_money: round2(all.filter((r) => r.kind === 'money').reduce((s, r) => s + r.amount, 0)),
      truncated,
      payments: rows,
    };
  },
};

const customerCredits = {
  name: 'customer_credits',
  title: { en: 'Customer credits', fr: 'Crédits clients' },
  description: 'Credit kept on customer accounts after an overpayment, not yet applied or refunded: customer, date, original amount and amount left, with the total left. Use it for "who has a credit with me". Credit notes are shown by customer_account.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { customer: { type: 'string', description: 'Part of the customer name' } } },
  run(args, ctx) {
    const books = load(ctx);
    const rows = list(ctx.kv('dicann-fac-client-credits'))
      .filter((c) => creditAvailableCents(c) > 0 && nameMatches(books.customerName(c.clientId), args.customer))
      .map((c) => ({ customer: books.customerName(c.clientId), date: c.date || null, original_amount: dollars(c.amountCents), amount_left: dollars(creditAvailableCents(c)) }))
      .sort(byDateDesc);
    return { count: rows.length, total_left: round2(rows.reduce((s, r) => s + r.amount_left, 0)), credits: rows };
  },
};

const productProfit = {
  name: 'product_profit',
  title: { en: 'Product profit', fr: 'Profit par produit' },
  description: 'Profit by product on invoices in a period: quantity, sales before tax, credits, cost, profit, margin, money received and still to collect, plus totals and products sold without a cost (not counted). Costs come from the product list. Default period is the calendar year to date.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: { from: dateArg('Invoice date on or after; default January 1 of this year'), to: dateArg('Invoice date on or before; default today') },
  },
  run(args, ctx) {
    checkPeriod(args);
    const books = load(ctx);
    const from = args.from || `${String(ctx.today).slice(0, 4)}-01-01`;
    const to = args.to || ctx.today;
    const r = productProfitReport({
      invoices: books.invoices,
      creditNotes: list(ctx.data.documentsList('creditnote', ctx.db)),
      // A product without a typed cost takes the cost of its linked Forecasting product, as the Profit tab does.
      products: withLinkedCosts(list(ctx.kv('dicann-fac-produits')), ctx.data.forecastProductsGetAll(ctx.db) || []),
      from,
      to,
      totalsOf: (doc) => invoiceTotalsFor(doc, books.clients),
    });
    const pct = (v) => (v == null ? null : round2(v));
    const figures = (x) => ({
      quantity: round2(x.qty), sales: dollars(x.salesCents), credits: dollars(x.creditCents), cost: dollars(x.costCents),
      profit: dollars(x.profitCents), margin_pct: pct(x.marginPct), received: dollars(x.receivedCents), to_collect: dollars(x.outstandingCents),
    });
    return {
      from,
      to,
      invoice_count: r.invoiceCount,
      products: r.rows.map((x) => ({ code: x.code || null, description: x.description, ...figures(x) })),
      totals: figures(r.totals),
      sold_without_cost: r.missing.map((m) => ({ code: m.code || null, description: m.description, quantity: round2(m.qty), sales: dollars(m.salesCents) })),
      credits_not_matched: dollars(r.unallocatedCreditCents),
    };
  },
};

export const customerTools = [listCustomers, customerAccount, listProducts, listQuotesAndOrders, paymentsReceived, customerCredits, productProfit];
