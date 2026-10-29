// Which revenue account each part of an invoice belongs to. Each line goes to the
// account of its product's category; a line with no product, or a category with
// no account, goes to the default sales account, which is where every invoice
// went before categories carried an account. Shared by the main process (posting
// invoices and credit notes) and the tests.
import { lineTotal, discountOff } from './discounts.mjs';

export const DEFAULT_REVENUE_ACCOUNT = '4000';

// lignes: the document's lines. accountOf(line) -> account number or null.
// Returns [{ account, amount }] in dollars after line discounts and this
// account's share of the subtotal discount, largest first.
export function revenueByAccount(lignes, { remiseGlobale, remiseGlobaleType } = {}, accountOf = () => null) {
  const by = new Map();
  let gross = 0;
  for (const l of lignes || []) {
    if (!l || l.type === 'section') continue;
    const amt = lineTotal(l);
    if (!amt) continue;
    const acc = accountOf(l) || DEFAULT_REVENUE_ACCOUNT;
    by.set(acc, (by.get(acc) || 0) + amt);
    gross += amt;
  }
  const keep = gross > 0 ? (gross - discountOff(gross, remiseGlobale, remiseGlobaleType)) / gross : 1;
  return [...by.entries()].map(([account, amount]) => ({ account, amount: amount * keep }))
    .sort((a, b) => b.amount - a.amount);
}

// Spreads a total in cents over the parts in proportion, so the pieces add up to
// the total exactly: the cents lost to rounding go to the largest remainders.
export function allocateCents(parts, totalCents) {
  const total = Math.round(Number(totalCents) || 0);
  const list = (parts || []).filter(p => p && p.amount > 0);
  if (!list.length) return [];
  const sum = list.reduce((s, p) => s + p.amount, 0);
  const raw = list.map(p => ({ account: p.account, exact: total * p.amount / sum }));
  const out = raw.map(r => ({ account: r.account, cents: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let left = total - out.reduce((s, o) => s + o.cents, 0);
  for (const o of [...out].sort((a, b) => b.rem - a.rem)) { if (left <= 0) break; o.cents += 1; left -= 1; }
  return out.filter(o => o.cents !== 0).map(({ account, cents }) => ({ account, cents }));
}

export const SALES_RETURNS_ACCOUNT = '4100';

// The revenue lines of one invoice or credit note's journal entry, as
// [{ account_id, cents }]. accounts: the chart; produits and categories: the
// catalog. A category account that is missing, archived or not a revenue account
// is ignored, so a typo cannot send revenue somewhere odd. doc.deduction: a
// chain's remittance deduction, all of it against Sales returns and allowances.
export function planRevenue(doc, revenueCents, { accounts = [], produits = [], categories = [] } = {}) {
  const byNumber = new Map(accounts.filter(a => !a.is_archived).map(a => [String(a.account_number), a]));
  const usable = (num) => { const a = byNumber.get(String(num || '').trim()); return a && a.type === 'revenue' ? a : null; };
  const fallback = usable(DEFAULT_REVENUE_ACCOUNT) || accounts.find(a => String(a.account_number) === DEFAULT_REVENUE_ACCOUNT);
  if (!fallback) return [];
  let parts = null;
  if (doc?.deduction && usable(SALES_RETURNS_ACCOUNT)) {
    parts = [{ account: SALES_RETURNS_ACCOUNT, amount: 1 }];
  } else if (Array.isArray(doc?.lignes) && doc.lignes.length) {
    const accountOf = (l) => {
      const prod = l.produitId ? produits.find(p => p.id === l.produitId) : null;
      const cat = prod ? categories.find(c => c.id === prod.categorieId) : null;
      return usable(cat?.compteRevenu) ? String(cat.compteRevenu).trim() : null;
    };
    parts = revenueByAccount(doc.lignes, doc, accountOf);
  }
  const pieces = parts && parts.length ? allocateCents(parts, revenueCents) : [{ account: DEFAULT_REVENUE_ACCOUNT, cents: Math.round(revenueCents) }];
  return pieces.map(pc => ({ account_id: (usable(pc.account) || fallback).id, cents: pc.cents }));
}
