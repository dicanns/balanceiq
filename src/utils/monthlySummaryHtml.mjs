// The printed monthly summary: one sheet per bank or card account, laid out the
// way a bookkeeper's expense sheet reads (a row per category: before tax, GST,
// QST, total), then money in, transfers and anything still uncategorized.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => {
  const v = (Math.round(Number(cents) || 0) / 100);
  return (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' $';
};

export const SUMMARY_LABELS = {
  fr: {
    title: 'Sommaire des transactions', period: 'Période', generated: 'Généré le', company: 'Entreprise',
    expenses: 'Dépenses et paiements', inflows: 'Dépôts et crédits', transfers: 'Virements entre comptes',
    uncategorized: 'Lignes non catégorisées', none: 'Aucune ligne.',
    account: 'Compte', count: 'Nb', net: 'Avant taxes', tps: 'TPS', tvq: 'TVQ', total: 'Total', totals: 'Totaux',
    date: 'Date', description: 'Description', amount: 'Montant', details: 'Détail des lignes',
    restricted: (pct) => `crédit de taxe limité à ${pct} %`,
    transfersNote: (n, a) => `${n} virement${n > 1 ? 's' : ''} (paiements de carte, mouvements entre vos comptes) : ${a}. Ils ne sont pas des dépenses.`,
    uncatNote: 'Ces lignes ne figurent dans aucun total ci-dessus. Catégorisez-les dans Banque, puis réimprimez.',
    foot: 'Produit par BalanceIQ à partir des relevés importés. Les taxes sont celles saisies sur chaque ligne.',
  },
  en: {
    title: 'Transaction summary', period: 'Period', generated: 'Generated', company: 'Business',
    expenses: 'Expenses and payments', inflows: 'Deposits and credits', transfers: 'Transfers between accounts',
    uncategorized: 'Uncategorized lines', none: 'No lines.',
    account: 'Account', count: 'No.', net: 'Before tax', tps: 'GST', tvq: 'QST', total: 'Total', totals: 'Totals',
    date: 'Date', description: 'Description', amount: 'Amount', details: 'Line detail',
    restricted: (pct) => `tax credit limited to ${pct}%`,
    transfersNote: (n, a) => `${n} transfer${n > 1 ? 's' : ''} (card payments, moves between your accounts): ${a}. They are not expenses.`,
    uncatNote: 'These lines are in none of the totals above. Categorize them in Banking, then print again.',
    foot: 'Produced by BalanceIQ from the imported statements. Taxes are those entered on each line.',
  },
};

function table(L, lang, section, withDetail) {
  const name = (r) => r.account_number ? `${r.account_number} · ${lang === 'en' ? (r.name_en || r.name_fr) : (r.name_fr || r.name_en)}` : '-';
  if (!section.rows.length) return `<p class="none">${L.none}</p>`;
  const rows = section.rows.map(r => `
    <tr><td>${esc(name(r))}${r.itc_pct != null && Number(r.itc_pct) !== 100 ? ` <span class="sub">(${L.restricted(r.itc_pct)})</span>` : ''}</td>
      <td class="n">${r.count}</td><td class="n">${money(r.net_cents)}</td><td class="n">${money(r.tps_cents)}</td><td class="n">${money(r.tvq_cents)}</td><td class="n b">${money(r.gross_cents)}</td></tr>
    ${withDetail ? r.items.map(i => `<tr class="d"><td>&nbsp;&nbsp;${esc(i.date)} · ${esc(i.description)}</td><td></td><td></td><td></td><td></td><td class="n">${money(i.cents)}</td></tr>`).join('') : ''}`).join('');
  const t = section.totals;
  return `<table>
    <thead><tr><th>${L.account}</th><th class="n">${L.count}</th><th class="n">${L.net}</th><th class="n">${L.tps}</th><th class="n">${L.tvq}</th><th class="n">${L.total}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>${L.totals}</td><td class="n">${t.count}</td><td class="n">${money(t.net_cents)}</td><td class="n">${money(t.tps_cents)}</td><td class="n">${money(t.tvq_cents)}</td><td class="n b">${money(t.gross_cents)}</td></tr></tfoot>
  </table>`;
}

export function buildMonthlySummaryHtml(summary, { lang = 'fr', companyName = '', withDetail = false } = {}) {
  const L = SUMMARY_LABELS[lang] || SUMMARY_LABELS.fr;
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const p = summary?.period || {};
  const sections = (summary?.accounts || []).map(a => `
    <section class="acct">
      <h2>${esc(a.name)}</h2>
      <h3>${L.expenses}</h3>${table(L, lang, a.expenses, withDetail)}
      <h3>${L.inflows}</h3>${table(L, lang, a.inflows, withDetail)}
      ${a.transfers.count ? `<p class="note">${L.transfersNote(a.transfers.count, money(a.transfers.cents))}</p>` : ''}
      ${a.uncategorized.length ? `<h3 class="warn">${L.uncategorized} (${a.uncategorized.length})</h3><p class="note warn">${L.uncatNote}</p>
        <table><thead><tr><th>${L.date}</th><th>${L.description}</th><th class="n">${L.amount}</th></tr></thead><tbody>
        ${a.uncategorized.map(u => `<tr><td>${esc(u.date)}</td><td>${esc(u.description)}</td><td class="n">${money(u.cents)}</td></tr>`).join('')}</tbody></table>` : ''}
    </section>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(L.title)}</title><style>
    body{font:11.5px/1.45 Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:22px}
    h1{font-size:18px;margin:0 0 2px;color:#ea580c} h2{font-size:14px;margin:18px 0 6px;padding-bottom:3px;border-bottom:2px solid #1a1a1a}
    h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:12px 0 4px} h3.warn{color:#b91c1c}
    .meta{color:#555;font-size:11px;margin-bottom:6px} .meta span{margin-right:18px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px} th,td{padding:4px 6px;border-bottom:1px solid #e5e5e5;vertical-align:top}
    th{text-align:left;font-size:10.5px;color:#555;background:#f3f3f3} td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    td.b{font-weight:700} tfoot td{font-weight:700;border-top:2px solid #1a1a1a;border-bottom:none}
    tr.d td{color:#666;font-size:10.5px;border-bottom:1px dotted #eee} .sub{color:#888;font-size:10px}
    .none{color:#888;font-size:11px;margin:0 0 6px} .note{font-size:11px;color:#555;margin:4px 0} .note.warn{color:#b91c1c}
    .acct{page-break-inside:avoid} .foot{margin-top:18px;font-size:9.5px;color:#999;border-top:1px solid #eee;padding-top:6px}
    @media print{body{padding:8px} .acct{page-break-after:always} .acct:last-child{page-break-after:auto}}
  </style></head><body>
  <h1>${esc(L.title)}</h1>
  <div class="meta">${companyName ? `<span><b>${L.company}:</b> ${esc(companyName)}</span>` : ''}<span><b>${L.period}:</b> ${esc(p.from || '')} → ${esc(p.to || '')}</span><span><b>${L.generated}:</b> ${esc(today)}</span></div>
  ${sections || `<p class="none">${L.none}</p>`}
  <div class="foot">${L.foot}</div>
  </body></html>`;
}
