// Profit on what is sold through invoices.
//
// A product can carry what one unit costs the business (couts): a list of
// { depuis, cout } where depuis is the first invoice date the cost applies to
// ('' = from the start). The report multiplies each invoiced quantity by the
// cost in effect on the invoice date and sets it against the line's revenue.
//
// It is a management report. It reads invoices and credit notes and writes
// nothing: the ledger keeps recording purchases through supplier bills.
//
// Two views of the same invoices:
//   billed    revenue (before tax, after discounts) less credit notes less cost
//   received  the part of that revenue paid in money, less the cost of the part
//             of the invoice that is settled (paid, credited or written off)

import { documentTotals, invoiceExportParts } from './calculations.js';
import { lineTotal } from './discounts.mjs';
import { WRITTEN_OFF } from './invoiceStatus.mjs';

const DRAFT = 'Brouillon';
const VOID = 'Annulée';
const PRO_FORMA = 'proforma';

const toCents = (v) => Math.round((Number(v) || 0) * 100);

/** A product's costs, cleaned and in date order. Rows without a cost are dropped. */
export function normalizeCosts(list) {
  const byDate = new Map();
  for (const row of Array.isArray(list) ? list : []) {
    if (!row || row.cout === '' || row.cout == null) continue;
    const cout = typeof row.cout === 'number' ? row.cout : parseFloat(String(row.cout).replace(',', '.'));
    if (!Number.isFinite(cout) || cout < 0) continue;
    const depuis = /^\d{4}-\d{2}-\d{2}$/.test(row.depuis || '') ? row.depuis : '';
    byDate.set(depuis, { depuis, cout: Math.round(cout * 10000) / 10000 });
  }
  return [...byDate.values()].sort((a, b) => (a.depuis < b.depuis ? -1 : a.depuis > b.depuis ? 1 : 0));
}

/** What one unit cost on a given day (dollars), or null when no cost applies. */
export function costAt(product, dateStr) {
  const costs = normalizeCosts(product?.couts);
  let found = null;
  for (const c of costs) {
    if (c.depuis === '' || (dateStr && c.depuis <= dateStr)) found = c.cout;
  }
  return found;
}

/**
 * Products with the cost of their linked Forecasting product filled in where no
 * cost was typed on the product itself (forecast_product_id, the same link that
 * deducts invoiced quantities from Forecasting stock). A typed cost always wins.
 */
export function withLinkedCosts(products, forecastProducts) {
  const linked = new Map((forecastProducts || []).map((fp) => [String(fp.id), fp]));
  return (products || []).map((p) => {
    if (normalizeCosts(p?.couts).length || !p?.forecast_product_id) return p;
    const cost = Number(linked.get(String(p.forecast_product_id))?.unit_cost);
    return Number.isFinite(cost) && cost > 0 ? { ...p, couts: [{ depuis: '', cout: cost }] } : p;
  });
}

// Split an amount of cents across weights so the parts add up to it exactly.
function spread(amount, weights) {
  const total = weights.reduce((a, w) => a + w, 0);
  if (!amount || total <= 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.trunc((amount * w) / total));
  const left = amount - parts.reduce((a, p) => a + p, 0);
  if (left !== 0) {
    let big = 0;
    weights.forEach((w, i) => { if (w > weights[big]) big = i; });
    parts[big] += left;
  }
  return parts;
}

const inRange = (date, from, to) => !!date && (!from || date >= from) && (!to || date <= to);

/**
 * Profit by product for invoices dated from..to (inclusive; either may be empty).
 * totalsOf(invoice) returns the invoice's totals the way the app shows them
 * (with the customer's tax exemption); it defaults to the document's own.
 * Amounts are integer cents.
 */
export function productProfitReport({ invoices, creditNotes, products, from, to, totalsOf } = {}) {
  const totals = totalsOf || ((doc) => documentTotals(doc, doc));
  const productById = new Map((products || []).map((p) => [p.id, p]));
  const rows = new Map();
  const missing = new Map();
  const byInvoice = new Map();
  let unallocatedCreditCents = 0;

  const rowFor = (product) => {
    if (!rows.has(product.id)) {
      rows.set(product.id, {
        productId: product.id, code: product.code || '', description: product.description || '',
        qty: 0, salesCents: 0, creditCents: 0, costCents: 0, receivedCents: 0, receivedCostCents: 0, details: [],
      });
    }
    return rows.get(product.id);
  };

  for (const inv of invoices || []) {
    if (!inv || inv.statut === DRAFT || inv.statut === VOID || inv.documentType === PRO_FORMA) continue;
    const xp = invoiceExportParts(inv, totals(inv));
    const discount = spread(xp.adj ? xp.adj.st : 0, xp.lines.map((x) => Math.max(0, x.st)));
    const parts = xp.lines.map((x, i) => ({ line: x.l, netCents: x.st + discount[i], detail: null }));
    const dated = inRange(inv.date, from, to);
    byInvoice.set(inv.id, { date: inv.date, dated, parts });
    if (!dated) continue;

    const totalCents = xp.frozen.total;
    const paid = (kind) => (inv.paiements || []).filter(kind).reduce((a, p) => a + toCents(p?.montant), 0);
    // Money: a payment or an overpayment kept on the account. A credit note
    // applied to the invoice and a bad-debt write-off settle it without money.
    const moneyCents = paid((p) => p && !p.fromCredit && !p.badDebt);
    const lostCents = paid((p) => p && p.badDebt);
    const settledCents = paid((p) => !!p);
    const share = (c) => (totalCents > 0 ? Math.min(1, Math.max(0, c / totalCents)) : 0);
    const moneyShare = share(moneyCents);
    const settledShare = inv.statut === WRITTEN_OFF ? 1 : share(settledCents);

    for (const part of parts) {
      const product = productById.get(part.line.produitId);
      if (!product) continue;
      const qty = Number(part.line.quantite) || 0;
      const unitCost = costAt(product, inv.date);
      if (unitCost == null) {
        const m = missing.get(product.id) || { productId: product.id, code: product.code || '', description: product.description || '', categorieId: product.categorieId || '', qty: 0, salesCents: 0 };
        m.qty += qty; m.salesCents += part.netCents;
        missing.set(product.id, m);
        continue;
      }
      const costCents = Math.round(qty * unitCost * 100);
      const row = rowFor(product);
      const detail = {
        invoiceId: inv.id, numero: inv.numero || '', date: inv.date, clientId: inv.clientId,
        qty, salesCents: part.netCents, creditCents: 0, costCents,
        receivedCents: Math.round(part.netCents * moneyShare),
        receivedCostCents: Math.round(costCents * settledShare),
        lostCents: Math.round(part.netCents * share(lostCents)),
        openCents: Math.round(part.netCents * (1 - settledShare)),
        settled: settledShare >= 1,
      };
      part.detail = detail;
      row.details.push(detail);
      row.qty += qty; row.salesCents += detail.salesCents; row.costCents += costCents;
      row.receivedCents += detail.receivedCents; row.receivedCostCents += detail.receivedCostCents;
    }
  }

  // Credit notes count with the invoice they are for. A line naming a product
  // goes to that product; any other line is shared across the invoice's lines.
  for (const cn of creditNotes || []) {
    if (!cn || cn.statut === DRAFT || cn.statut === VOID) continue;
    const inv = byInvoice.get(cn.factureId);
    if (inv ? !inv.dated : !inRange(cn.date, from, to)) continue;
    for (const l of cn.lignes || []) {
      if (!l || l.type === 'section') continue;
      const amount = Math.round(lineTotal(l) * 100);
      if (!amount) continue;
      const product = productById.get(l.produitId);
      if (product) {
        if (costAt(product, inv ? inv.date : cn.date) == null) continue;
        const own = inv && inv.parts.find((p) => p.detail && p.line.produitId === product.id);
        rowFor(product).creditCents += amount;
        if (own) own.detail.creditCents += amount;
        continue;
      }
      if (!inv) { unallocatedCreditCents += amount; continue; }
      const shares = spread(amount, inv.parts.map((p) => Math.max(0, p.netCents)));
      inv.parts.forEach((p, i) => {
        if (!p.detail || !shares[i]) return;
        p.detail.creditCents += shares[i];
        rows.get(p.line.produitId).creditCents += shares[i];
      });
    }
  }

  const finish = (r) => {
    const netCents = r.salesCents - r.creditCents;
    const profitCents = netCents - r.costCents;
    return {
      ...r,
      profitCents,
      marginPct: netCents > 0 ? (profitCents / netCents) * 100 : null,
      receivedProfitCents: r.receivedCents - r.receivedCostCents,
    };
  };
  const list = [...rows.values()].map((r) => {
    const details = r.details
      // Still to collect: what is open on the invoice, less a credit note issued
      // against it that has not been applied yet.
      .map((d) => finish({ ...d, outstandingCents: Math.max(0, Math.min(d.openCents, d.salesCents - d.creditCents - d.receivedCents - d.lostCents)) }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.numero).localeCompare(String(b.numero))));
    return { ...finish(r), details, outstandingCents: details.reduce((a, d) => a + d.outstandingCents, 0) };
  }).sort((a, b) => b.profitCents - a.profitCents);

  const sum = (k) => list.reduce((a, r) => a + r[k], 0);
  const totalsRow = finish({
    qty: sum('qty'), salesCents: sum('salesCents'), creditCents: sum('creditCents'), costCents: sum('costCents'),
    receivedCents: sum('receivedCents'), receivedCostCents: sum('receivedCostCents'),
  });
  totalsRow.outstandingCents = sum('outstandingCents');

  return {
    rows: list,
    totals: totalsRow,
    // Only products that sit in a category where another product has a cost:
    // a service in a category of its own (royalties, fees) is not a gap.
    missing: [...missing.values()]
      .filter((m) => list.some((r) => (productById.get(r.productId)?.categorieId || '') === m.categorieId))
      .map(({ categorieId, ...m }) => m)
      .sort((a, b) => b.salesCents - a.salesCents),
    unallocatedCreditCents,
    invoiceCount: new Set(list.flatMap((r) => r.details.map((d) => d.invoiceId))).size,
  };
}
