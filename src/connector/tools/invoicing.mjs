// Invoices, customers and what is owed to the business.

import { invoiceTotalsFor } from '../../utils/calculations.js';
import { accountStanding } from '../../services/accountStanding.js';
import { CLOSED_INVOICE_STATUSES, WRITTEN_OFF, isOverdue } from '../../utils/invoiceStatus.mjs';
import { ToolError, round2, dateArg, limitArg, clampLimit, capped, nameMatches, paidOf, paymentKind } from './shared.mjs';

const PRO_FORMA = 'proforma';
const STATUS_WORDS = { 'Brouillon': 'draft', 'Envoyée': 'sent', 'Payée': 'paid', 'Créditée': 'credited', 'Annulée': 'void', [WRITTEN_OFF]: 'written_off', 'Partiellement payée': 'partly_paid', 'En retard': 'overdue' };
export const statusWord = (statut) => STATUS_WORDS[statut] || String(statut || '').toLowerCase();


function load(ctx) {
  const clients = ctx.kv('dicann-fac-clients') || [];
  const invoices = (ctx.data.documentsList('facture', ctx.db) || []).filter((f) => f && f.documentType !== PRO_FORMA);
  const creditNotes = ctx.data.documentsList('creditnote', ctx.db) || [];
  const byId = new Map(clients.map((c) => [c.id, c]));
  const customerName = (id) => { const c = byId.get(id); return c ? (c.entreprise || c.nom || c.code || '') : ''; };
  const totalOf = (doc) => invoiceTotalsFor(doc, clients).total;
  return { clients, invoices, creditNotes, customerName, totalOf };
}

function invoiceRow(inv, books, today) {
  const total = round2(books.totalOf(inv));
  const paid = round2(paidOf(inv));
  const open = !CLOSED_INVOICE_STATUSES.includes(inv.statut);
  return {
    number: inv.numero || '',
    date: inv.date || null,
    due_date: inv.dateEcheance || null,
    customer: books.customerName(inv.clientId),
    status: statusWord(inv.statut),
    total,
    paid,
    balance: open ? round2(Math.max(0, total - paid)) : 0,
    overdue: isOverdue(inv, today),
  };
}

const whoOwesMe = {
  name: 'who_owes_me',
  title: { en: 'Who owes me', fr: 'Qui me doit de l\'argent' },
  description: 'Accounts receivable: every customer with an unpaid balance, aged by how late it is, with any credit they hold. Use it for "who owes me", "how much is outstanding" or "who is late". Amounts include tax.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { as_of: dateArg('Age the balances as of this date; default today') } },
  run(args, ctx) {
    const books = load(ctx);
    const asOf = args.as_of || ctx.today;
    const ids = [...new Set(books.invoices.map((f) => f.clientId))];
    const customers = [];
    for (const clientId of ids) {
      const s = accountStanding({ clientId, factures: books.invoices, creditNotes: books.creditNotes, clientCredits: ctx.kv('dicann-fac-client-credits') || [], asOf, totalOf: books.totalOf });
      if (s.outstanding <= 0.005) continue;
      customers.push({
        customer: books.customerName(clientId),
        outstanding: s.outstanding,
        not_yet_due: s.aging.current,
        late_1_to_30_days: s.aging.d30,
        late_31_to_60_days: s.aging.d60,
        late_over_60_days: s.aging.d90,
        credits_available: s.creditsAvailable,
        balance_owed: s.balanceOwed,
      });
    }
    customers.sort((a, b) => b.outstanding - a.outstanding);
    const sum = (k) => round2(customers.reduce((a, c) => a + c[k], 0));
    return {
      as_of: asOf,
      total_outstanding: sum('outstanding'),
      total_late: round2(sum('late_1_to_30_days') + sum('late_31_to_60_days') + sum('late_over_60_days')),
      customers,
    };
  },
};

const listInvoices = {
  name: 'list_invoices',
  title: { en: 'List invoices', fr: 'Lister les factures' },
  description: 'Invoices issued to customers, newest first, each with its total, what has been paid and what is left. Filter by status, customer name or date. Use get_invoice for the lines and payments of one invoice.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['open', 'overdue', 'paid', 'draft', 'all'], description: 'open = sent and not fully paid (default); overdue = open and past its due date; all = everything except drafts' },
      customer: { type: 'string', description: 'Part of the customer name' },
      from: dateArg('Invoice date on or after'),
      to: dateArg('Invoice date on or before'),
      limit: limitArg(200, 50),
    },
  },
  run(args, ctx) {
    const books = load(ctx);
    const status = args.status || 'open';
    const keep = (inv) => {
      if (args.from && !(inv.date >= args.from)) return false;
      if (args.to && !(inv.date <= args.to)) return false;
      if (!nameMatches(books.customerName(inv.clientId), args.customer)) return false;
      if (status === 'draft') return inv.statut === 'Brouillon';
      if (inv.statut === 'Brouillon') return false;
      if (status === 'open') return !CLOSED_INVOICE_STATUSES.includes(inv.statut);
      if (status === 'overdue') return isOverdue(inv, ctx.today);
      if (status === 'paid') return inv.statut === 'Payée';
      return true;
    };
    const all = books.invoices.filter(keep).map((inv) => invoiceRow(inv, books, ctx.today))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.number).localeCompare(String(a.number))));
    const { rows, truncated } = capped(all, clampLimit(args.limit, 200, 50));
    return {
      count: all.length,
      total: round2(all.reduce((s, r) => s + r.total, 0)),
      balance: round2(all.reduce((s, r) => s + r.balance, 0)),
      truncated,
      invoices: rows,
    };
  },
};

const getInvoice = {
  name: 'get_invoice',
  title: { en: 'Open an invoice', fr: 'Ouvrir une facture' },
  description: 'One invoice in full, by its number (for example F-0012): its lines, taxes, every payment or credit recorded against it, and the balance.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['number'], properties: { number: { type: 'string', description: 'The invoice number as printed on it' } } },
  run(args, ctx) {
    const books = load(ctx);
    const wanted = String(args.number).trim().toLowerCase();
    const inv = books.invoices.find((f) => String(f.numero || '').toLowerCase() === wanted);
    if (!inv) throw new ToolError(`No invoice has the number ${args.number}.`);
    const totals = invoiceTotalsFor(inv, books.clients);
    return {
      ...invoiceRow(inv, books, ctx.today),
      customer_reference: inv.referenceClient || null,
      subtotal: round2(totals.sousTotal),
      gst: round2(totals.tpsTotal),
      qst: round2(totals.tvqTotal),
      lines: (inv.lignes || []).filter((l) => l && l.type !== 'section').map((l) => ({
        description: l.description || '',
        quantity: Number(l.quantite) || 0,
        unit_price: round2(l.prixUnitaire),
        discount: l.remise ? `${l.remise}${l.remiseType === '$' ? ' $' : ' %'}` : null,
        taxed: !!(l.tps || l.tvq),
      })),
      payments: (inv.paiements || []).map((p) => ({ date: p.date || null, amount: round2(p.montant), kind: paymentKind(p), method: p.mode || null, reference: p.reference || null })),
      notes: inv.notes || null,
    };
  },
};

export const invoicingTools = [whoOwesMe, listInvoices, getInvoice];
