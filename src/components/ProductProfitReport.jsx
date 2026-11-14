import React, { useEffect, useMemo, useState } from 'react';
import { productProfitReport, withLinkedCosts } from '../utils/productProfit.mjs';

// Invoicing > Profit. What the products sold on invoices earned once their cost
// is taken off: billed in the period, and the part of it already paid.
// Costs are entered on each product (Invoicing > Products); a product linked to
// a Forecasting product without a cost of its own takes that product's cost.
// Nothing is written.

const UI = {
  en: {
    title: 'Profit on sales',
    how: 'For each product that has a cost: what was invoiced in the period, less credit notes, less what the units cost you. Received is the part customers have paid.',
    from: 'From',
    to: 'To',
    thisYear: 'This year',
    lastYear: 'Last year',
    allDates: 'All dates',
    product: 'Product',
    qty: 'Qty',
    sales: 'Sales',
    credits: 'Credit notes',
    cost: 'Cost',
    profit: 'Profit',
    margin: 'Margin',
    received: 'Received',
    receivedProfit: 'Profit received',
    outstanding: 'To collect',
    total: 'Total',
    invoice: 'Invoice',
    date: 'Date',
    customer: 'Customer',
    paid: 'paid',
    empty: 'No product has a cost yet. Open Products, edit a product and enter what one unit costs you: the profit on its invoices shows here.',
    none: 'No invoice in this period for a product that has a cost.',
    missingTitle: 'Sold in this period without a cost (not counted above)',
    missingRow: (qty, sales) => `${qty} sold, ${sales}`,
    unallocated: (amt) => `Credit notes in this period that name no invoice and no product: ${amt}. They are not counted above.`,
    notes: 'Sales are before tax and after discounts. A credit note counts with the invoice it is for. Cost is the cost in effect on the invoice date. Profit received sets the money paid against the cost of the part of each invoice that is settled.',
    invoices: (n) => `${n} invoice${n === 1 ? '' : 's'}`,
  },
  fr: {
    title: 'Profit sur les ventes',
    how: 'Pour chaque produit qui a un coût : ce qui a été facturé dans la période, moins les notes de crédit, moins ce que les unités vous ont coûté. Reçu est la partie payée par les clients.',
    from: 'Du',
    to: 'Au',
    thisYear: 'Cette année',
    lastYear: "L'an dernier",
    allDates: 'Toutes les dates',
    product: 'Produit',
    qty: 'Qté',
    sales: 'Ventes',
    credits: 'Notes de crédit',
    cost: 'Coût',
    profit: 'Profit',
    margin: 'Marge',
    received: 'Reçu',
    receivedProfit: 'Profit reçu',
    outstanding: 'À recevoir',
    total: 'Total',
    invoice: 'Facture',
    date: 'Date',
    customer: 'Client',
    paid: 'payée',
    empty: "Aucun produit n'a encore de coût. Ouvrez Produits, modifiez un produit et entrez ce qu'une unité vous coûte : le profit sur ses factures s'affiche ici.",
    none: 'Aucune facture dans cette période pour un produit qui a un coût.',
    missingTitle: 'Vendu dans cette période sans coût (non compté ci-dessus)',
    missingRow: (qty, sales) => `${qty} vendus, ${sales}`,
    unallocated: (amt) => `Notes de crédit de cette période sans facture ni produit : ${amt}. Elles ne sont pas comptées ci-dessus.`,
    notes: "Les ventes sont avant taxes et après remises. Une note de crédit compte avec la facture qu'elle vise. Le coût est celui en vigueur à la date de la facture. Le profit reçu compare l'argent payé au coût de la partie réglée de chaque facture.",
    invoices: (n) => `${n} facture${n === 1 ? '' : 's'}`,
  },
};

const COLS = '2.4fr 0.6fr 1fr 1fr 1fr 1fr 0.7fr 1fr 1fr 1fr';
const NUM_FONT = { fontFamily: "'Satoshi',-apple-system,BlinkMacSystemFont,sans-serif", fontVariantNumeric: 'tabular-nums' };

export default function ProductProfitReport({ factures, creditNotes, produits, clients, totalsOf, t, lang }) {
  const L = UI[lang] || UI.fr;
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [open, setOpen] = useState(() => new Set());

  const [forecastProducts, setForecastProducts] = useState([]);
  const anyLinked = useMemo(() => (produits || []).some((p) => p.forecast_product_id), [produits]);
  useEffect(() => {
    if (!anyLinked || !window.api?.forecast?.products) return;
    window.api.forecast.products.getAll().then((r) => { if (Array.isArray(r)) setForecastProducts(r); }).catch(() => {});
  }, [anyLinked]);

  const costed = useMemo(() => withLinkedCosts(produits, forecastProducts), [produits, forecastProducts]);
  const report = useMemo(
    () => productProfitReport({ invoices: factures, creditNotes, products: costed, from, to, totalsOf }),
    [factures, creditNotes, costed, from, to, totalsOf],
  );
  const hasCosts = useMemo(() => costed.some((p) => Array.isArray(p.couts) && p.couts.length > 0), [costed]);

  const money = (cents) => (cents / 100).toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' });
  const pct = (v) => (v == null ? '-' : `${v.toFixed(1)} %`);
  const qty = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  const clientName = (id) => { const c = (clients || []).find((x) => x.id === id); return c ? (c.entreprise || c.code || '') : ''; };
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setYear = (y) => { setFrom(`${y}-01-01`); setTo(`${y}-12-31`); };

  const inputS = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.inputText, fontSize: 11, padding: '3px 6px', outline: 'none', ...NUM_FONT };
  const quick = { fontSize: 11, padding: '3px 9px', borderRadius: 5, border: `1px solid ${t.cardBorder}`, background: t.section, color: t.textSub, cursor: 'pointer', fontWeight: 600 };
  const head = { fontSize: 10, color: t.textMuted, fontWeight: 600, textAlign: 'right' };
  const cell = { fontSize: 12, color: t.text, textAlign: 'right', ...NUM_FONT };
  const profitColor = (c) => (c < 0 ? '#dc2626' : '#16a34a');

  const cells = (r, strong) => (<>
    <span style={cell}>{qty(r.qty)}</span>
    <span style={cell}>{money(r.salesCents)}</span>
    <span style={{ ...cell, color: r.creditCents ? '#dc2626' : t.textMuted }}>{r.creditCents ? `-${money(r.creditCents)}` : '-'}</span>
    <span style={cell}>{money(r.costCents)}</span>
    <span style={{ ...cell, fontWeight: 700, color: profitColor(r.profitCents) }}>{money(r.profitCents)}</span>
    <span style={{ ...cell, color: t.textSub }}>{pct(r.marginPct)}</span>
    <span style={cell}>{money(r.receivedCents)}</span>
    <span style={{ ...cell, fontWeight: strong ? 700 : 600, color: profitColor(r.receivedProfitCents) }}>{money(r.receivedProfitCents)}</span>
    <span style={{ ...cell, color: r.outstandingCents ? '#f59e0b' : t.textMuted }}>{r.outstandingCents ? money(r.outstandingCents) : '-'}</span>
  </>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{L.title}</span>
          {report.invoiceCount > 0 && <span style={{ fontSize: 11, color: t.textMuted }}>{L.invoices(report.invoiceCount)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: t.textMuted }}>{L.from}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputS} />
          <span style={{ fontSize: 11, color: t.textMuted }}>{L.to}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputS} />
          <button onClick={() => setYear(year)} style={quick}>{L.thisYear}</button>
          <button onClick={() => setYear(year - 1)} style={quick}>{L.lastYear}</button>
          <button onClick={() => { setFrom(''); setTo(''); }} style={quick}>{L.allDates}</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>{L.how}</div>

      {!hasCosts && <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '18px 14px', fontSize: 12, color: t.textSub, textAlign: 'center' }}>{L.empty}</div>}
      {hasCosts && report.rows.length === 0 && <div style={{ textAlign: 'center', padding: '24px 0', color: t.textMuted, fontSize: 12 }}>{L.none}</div>}

      {report.rows.length > 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: 10, overflowX: 'auto' }}>
          <div style={{ minWidth: 860 }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '3px 6px', borderBottom: `1px solid ${t.dividerMid}` }}>
              <span style={{ ...head, textAlign: 'left' }}>{L.product}</span>
              {[L.qty, L.sales, L.credits, L.cost, L.profit, L.margin, L.received, L.receivedProfit, L.outstanding].map((h) => <span key={h} style={head}>{h}</span>)}
            </div>
            {report.rows.map((r) => {
              const isOpen = open.has(r.productId);
              return (
                <div key={r.productId} style={{ borderBottom: `1px solid ${t.divider}` }}>
                  <div onClick={() => toggle(r.productId)} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '7px 6px', cursor: 'pointer', alignItems: 'center', background: isOpen ? t.rowBg : 'transparent' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.text, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 9, color: t.textMuted, display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || r.code}</span>
                    </span>
                    {cells(r, false)}
                  </div>
                  {isOpen && r.details.map((d) => (
                    <div key={d.invoiceId} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '4px 6px 4px 22px', alignItems: 'center', opacity: 0.9 }}>
                      <span style={{ fontSize: 11, color: t.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.numero} · {d.date} · {clientName(d.clientId)}{d.settled ? ` · ${L.paid}` : ''}
                      </span>
                      {cells(d, false)}
                    </div>
                  ))}
                </div>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '8px 6px 3px', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{L.total}</span>
              {cells(report.totals, true)}
            </div>
          </div>
        </div>
      )}

      {report.missing.length > 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: '8px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>{L.missingTitle}</div>
          {report.missing.map((m) => (
            <div key={m.productId} style={{ fontSize: 11, color: t.textMuted, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{m.description || m.code}</span>
              <span style={NUM_FONT}>{L.missingRow(qty(m.qty), money(m.salesCents))}</span>
            </div>
          ))}
        </div>
      )}
      {report.unallocatedCreditCents > 0 && <div style={{ fontSize: 11, color: '#f59e0b' }}>{L.unallocated(money(report.unallocatedCreditCents))}</div>}
      {report.rows.length > 0 && <div style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.5 }}>{L.notes}</div>}
    </div>
  );
}
