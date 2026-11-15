// The first things an assistant may prepare: an invoice and a supplier bill.
//
// Nothing here records anything. Each tool checks what it was given against the
// books, fills in the same form the owner would fill in, and leaves it waiting
// in BalanceIQ (ctx.propose). The owner opens it in the normal screen and saves
// it there, so every rule of that screen applies and there is one way to save.

import { invoiceTotalsFor } from '../../utils/calculations.js';
import { lineFromProduct } from '../../utils/invoiceLines.mjs';
import { ToolError, round2, dateArg, nameMatches } from './shared.mjs';
import { loadBooks, findCustomer } from './customers.mjs';

const MAX_LINES = 50;
const NEXT = 'It is waiting in BalanceIQ on the owner\'s computer. Nothing is recorded until the owner opens it, checks it and saves it. Tell them it is waiting; use proposal_status to learn what they decided.';
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const amount = (n) => round2(n).toFixed(2);

function leave(ctx, proposal) {
  if (typeof ctx.propose !== 'function') throw new ToolError('This connection cannot prepare entries.');
  try { return ctx.propose(proposal); } catch (e) {
    if (e && e.code === 'too_many') throw new ToolError('Too many entries are already waiting for the owner in BalanceIQ. Ask them to review or dismiss some first.');
    throw e;
  }
}

// A product by its exact code, else by the only description that contains the text.
function findProduct(products, wanted) {
  const text = String(wanted || '').trim().toLowerCase();
  const byCode = products.filter((p) => String(p.code || '').toLowerCase() === text);
  if (byCode.length === 1) return byCode[0];
  const found = products.filter((p) => nameMatches(p.description, wanted) || nameMatches(p.code, wanted));
  if (found.length === 1) return found[0];
  if (!found.length) throw new ToolError(`No product matches "${wanted}". Use list_products to see the product list, or give the line a description and a unit_price instead.`);
  throw new ToolError(`Several products match "${wanted}": ${found.slice(0, 10).map((p) => p.code || p.description).join(', ')}. Use the exact product code.`);
}

const proposeInvoice = {
  name: 'propose_invoice',
  readOnly: false,
  title: { en: 'Prepare an invoice', fr: 'Préparer une facture' },
  description: 'Prepare a new invoice for the owner to review: it opens as an unsaved draft in BalanceIQ and is recorded only when the owner saves it. Give the customer and the lines. A line names a product from the product list (its price and taxes are used unless unit_price is given) or carries its own description and unit_price. Returns the totals as BalanceIQ calculates them.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['customer', 'lines'],
    properties: {
      customer: { type: 'string', description: 'Part of the customer name, or the customer code' },
      lines: { type: 'array', description: 'One object per line: {"product": product code or part of its description, "quantity": number, "unit_price": number (optional)} or {"description": text, "quantity": number, "unit_price": number}' },
      date: dateArg('Invoice date; default today'),
      customer_reference: { type: 'string', description: 'The customer\'s own reference or purchase order number' },
      notes: { type: 'string', description: 'Notes printed on the invoice; default the company\'s usual notes' },
    },
  },
  run(args, ctx) {
    const books = loadBooks(ctx);
    const client = findCustomer(books, args.customer);
    const products = list(ctx.kv('dicann-fac-produits'));
    if (!args.lines.length || args.lines.length > MAX_LINES) throw new ToolError(`An invoice needs between 1 and ${MAX_LINES} lines.`);
    const lignes = args.lines.map((l, i) => {
      const where = `Line ${i + 1}`;
      if (!l || typeof l !== 'object' || Array.isArray(l)) throw new ToolError(`${where} must be an object.`);
      const quantite = Number(l.quantity);
      if (!Number.isFinite(quantite) || quantite <= 0) throw new ToolError(`${where}: quantity must be a number above zero.`);
      const price = l.unit_price == null ? null : Number(l.unit_price);
      if (price != null && (!Number.isFinite(price) || price < 0)) throw new ToolError(`${where}: unit_price must be a number, zero or more.`);
      const id = `ai${i}${Math.random().toString(36).slice(2, 10)}`;
      if (l.product != null && String(l.product).trim()) {
        const fromProduct = lineFromProduct(findProduct(products, l.product));
        return { id, ...fromProduct, quantite, remise: 0, ...(price != null ? { prixUnitaire: price } : {}) };
      }
      const description = String(l.description || '').trim();
      if (!description || price == null) throw new ToolError(`${where}: give a product, or a description with a unit_price.`);
      return { id, produitId: '', description: description.slice(0, 300), quantite, prixUnitaire: price, remise: 0, tps: true, tvq: true };
    });
    const doc = {
      date: args.date || ctx.today, dateEcheance: '', clientId: client.id,
      referenceClient: String(args.customer_reference || '').slice(0, 80), statut: 'Brouillon', documentType: 'facture',
      notes: args.notes ? String(args.notes).slice(0, 2000) : null,
      paiements: [], sourceType: null, sourceId: null, sourceNumero: null, lignes,
    };
    const totals = invoiceTotalsFor(doc, books.clients);
    const name = books.nameOf(client);
    const total = amount(totals.total);
    const made = leave(ctx, {
      kind: 'invoice', tool: 'propose_invoice', payload: doc,
      summary: { en: `Invoice for ${name}: ${lignes.length} line${lignes.length > 1 ? 's' : ''}, ${total} $ with tax`, fr: `Facture pour ${name} : ${lignes.length} ligne${lignes.length > 1 ? 's' : ''}, ${total.replace('.', ',')} $ taxes incluses` },
    });
    return {
      proposal_id: made.id,
      status: 'waiting_for_owner',
      customer: name,
      date: doc.date,
      lines: lignes.map((l) => ({ description: l.description, quantity: l.quantite, unit_price: round2(l.prixUnitaire), amount: round2(l.quantite * l.prixUnitaire) })),
      subtotal: round2(totals.sousTotal),
      gst: round2(totals.tpsTotal),
      qst: round2(totals.tvqTotal),
      total: round2(totals.total),
      what_happens_next: NEXT,
    };
  },
};

const proposeBill = {
  name: 'propose_bill',
  readOnly: false,
  title: { en: 'Prepare a supplier bill', fr: 'Préparer une facture fournisseur' },
  description: 'Prepare a supplier bill for the owner to review: it opens as an unsaved form in BalanceIQ and is recorded only when the owner saves it. Give the supplier and the amount including tax; add the bill number, dates and the tax amounts when the document shows them. The expense account is taken from this supplier\'s last bill unless expense_account is given; the owner can change it.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['supplier', 'amount'],
    properties: {
      supplier: { type: 'string', description: 'The supplier name as it should appear' },
      amount: { type: 'number', description: 'Total of the bill including tax, in dollars' },
      bill_number: { type: 'string', description: 'The number printed on the supplier\'s bill' },
      bill_date: dateArg('Date of the bill; default today'),
      due_date: dateArg('Date the bill is due'),
      gst_paid: { type: 'number', description: 'GST shown on the bill, in dollars' },
      qst_paid: { type: 'number', description: 'QST shown on the bill, in dollars' },
      expense_account: { type: 'string', description: 'Ledger account number for the expense, for example 5000' },
      note: { type: 'string', description: 'A short note kept with the bill' },
    },
  },
  run(args, ctx) {
    const supplier = String(args.supplier).trim().slice(0, 120);
    if (!supplier) throw new ToolError('Give the supplier name.');
    if (!(args.amount > 0)) throw new ToolError('The amount must be above zero.');
    for (const k of ['gst_paid', 'qst_paid']) if (args[k] != null && !(args[k] >= 0 && args[k] < args.amount)) throw new ToolError(`${k} must be zero or more and less than the amount.`);
    const number = String(args.bill_number || '').trim().slice(0, 60);
    const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    const earlier = list(ctx.data.supplierBillList({}, ctx.db)).filter((b) => same(b.supplier_name, supplier));
    if (number && earlier.some((b) => same(b.invoice_number, number))) throw new ToolError(`A bill numbered ${number} from ${supplier} is already entered.`);

    const accounts = list(ctx.data.coaList());
    let account = null;
    if (args.expense_account) {
      account = accounts.find((a) => String(a.account_number) === String(args.expense_account).trim() && !a.is_archived);
      if (!account) throw new ToolError(`No ledger account has the number ${args.expense_account}. Use chart_of_accounts to see the accounts.`);
    } else {
      // The account this supplier's bills usually go to, as the Bills screen remembers it.
      const last = [...earlier].sort((a, b) => String(b.bill_date || '').localeCompare(String(a.bill_date || '')))[0];
      account = last ? accounts.find((a) => a.id === last.coa_account_id && !a.is_archived) || null : null;
    }
    const payload = {
      supplier_name: supplier, invoice_number: number, bill_date: args.bill_date || ctx.today, due_date: args.due_date || '',
      coa_account_id: account ? String(account.id) : '', amount: amount(args.amount),
      tps_paid: args.gst_paid != null ? amount(args.gst_paid) : '', tvq_paid: args.qst_paid != null ? amount(args.qst_paid) : '',
      note: String(args.note || '').slice(0, 300),
    };
    const made = leave(ctx, {
      kind: 'bill', tool: 'propose_bill', payload,
      summary: { en: `Bill from ${supplier}: ${payload.amount} $`, fr: `Facture de ${supplier} : ${payload.amount.replace('.', ',')} $` },
    });
    return {
      proposal_id: made.id,
      status: 'waiting_for_owner',
      supplier,
      bill_number: number || null,
      bill_date: payload.bill_date,
      due_date: payload.due_date || null,
      amount: round2(args.amount),
      expense_account: account ? String(account.account_number) : null,
      expense_account_to_choose: !account,
      what_happens_next: NEXT,
    };
  },
};

const STATUS_WORDS = { waiting: 'waiting_for_owner', opened: 'owner_is_reviewing', saved: 'saved', dismissed: 'refused', expired: 'expired' };

const proposalStatus = {
  name: 'proposal_status',
  // Reads only, but has nothing to say to a caller that cannot prepare entries.
  level: 'ask',
  title: { en: 'Status of a prepared entry', fr: 'État d\'une saisie préparée' },
  description: 'What the owner did with something prepared by propose_invoice or propose_bill: waiting_for_owner, owner_is_reviewing, saved (with the invoice or bill number), refused or expired. Use it before telling the user that an entry was recorded.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['proposal_id'], properties: { proposal_id: { type: 'string', description: 'The proposal_id returned when the entry was prepared' } } },
  run(args, ctx) {
    const p = typeof ctx.proposal === 'function' ? ctx.proposal(args.proposal_id) : null;
    if (!p) throw new ToolError('No prepared entry has this id. It may have been cleared when BalanceIQ was closed: nothing was recorded.');
    return { proposal_id: p.id, kind: p.kind, status: STATUS_WORDS[p.status] || p.status, reference: p.reference || null, recorded: p.status === 'saved' };
  },
};

export const actionTools = [proposeInvoice, proposeBill, proposalStatus];
