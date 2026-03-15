import React, { useState, useCallback } from 'react';

// Helper: compute net sales for a day from raw caisse data
function dayVenteNet(dayData) {
  if (!dayData?.cashes) return 0;
  return dayData.cashes.reduce((s, c) => {
    if (c.finalCash != null && c.float != null) {
      return s + (c.interac || 0) + (c.livraisons || 0) + (c.deposits || 0) + (c.finalCash || 0) - (c.float || 0);
    }
    return s;
  }, 0);
}

// Helper: sum bills array or fallback to direct value
function billsSum(bills, fallback) {
  if (Array.isArray(bills) && bills.length > 0) return bills.reduce((s, b) => s + (b.amount || 0), 0);
  return fallback || 0;
}

// Generate months between start and end inclusive (YYYY-MM format)
function monthRange(start, end) {
  const months = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// Build the combined year-end HTML report
async function buildYearEndHTML(fiscalStart, fiscalEnd, liveData, suppliers, facFactures, companyInfo, lang) {
  const months = monthRange(fiscalStart, fiscalEnd);
  const rows = [];
  let totRev = 0, totFP = 0, totLab = 0, totExp = 0, totNP = 0;

  for (const month of months) {
    let plData = {};
    try {
      const r = await window.api.storage.get(`dicann-pl-${month}`);
      if (r?.value) plData = JSON.parse(r.value);
    } catch (e) { /* no data */ }

    // Revenue: from daily data for the month
    const [my, mm] = month.split('-');
    const daysInMonth = new Date(parseInt(my), parseInt(mm), 0).getDate();
    let revenue = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${my}-${mm}-${String(d).padStart(2, '0')}`;
      revenue += dayVenteNet(liveData[key]);
    }
    if (plData._revenueOverride != null) revenue = plData._revenueOverride;

    // F&P: sum all supplier bills
    let fpT = 0;
    (suppliers || []).forEach(sup => {
      const bills = plData[`sup_${sup.id}_bills`];
      fpT += billsSum(bills, plData[`sup_${sup.id}`]);
    });
    // Also include petty cash F&P
    fpT += plData.pettyCashFP || 0;

    // Labour
    const labC = plData.labourCostOverride != null ? plData.labourCostOverride : (plData._labourCostFromDaily || 0);

    // Expenses (16 categories)
    let expT = 0;
    ['hydro','gazNat','loyer','csst','telephone','internet','publicite','entretien',
     'assurances','honoraires','fournitures','uniforme','autres','transport','equipement','divers'
    ].forEach(k => { expT += plData[k] || 0; });

    const np = revenue - fpT - labC - expT;
    const fpPct = revenue > 0 ? (fpT / revenue * 100).toFixed(1) : '—';
    const labPct = revenue > 0 ? (labC / revenue * 100).toFixed(1) : '—';
    const npPct = revenue > 0 ? (np / revenue * 100).toFixed(1) : '—';

    const fmt = n => `${n >= 0 ? '' : '-'}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    const monthLabel = new Date(parseInt(my), parseInt(mm) - 1, 1).toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { month: 'long', year: 'numeric' });

    rows.push({ month, monthLabel, revenue, fpT, labC, expT, np, fpPct, labPct, npPct, fmt, plData, daysInMonth, my, mm });
    totRev += revenue; totFP += fpT; totLab += labC; totExp += expT; totNP += np;
  }

  const fmt = n => `${n >= 0 ? '' : '-'}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const fmtPct = (v, rev) => rev > 0 ? `${(v / rev * 100).toFixed(1)}%` : '—';
  const co = companyInfo || {};
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const titleYE = lang === 'en' ? 'Year-End Package' : 'Dossier de fin d\'année';
  const titlePL = lang === 'en' ? 'Monthly P&L Summary' : 'Sommaire P&L mensuel';
  const titleInv = lang === 'en' ? 'Invoice Journal' : 'Journal des factures';
  const titleAR = lang === 'en' ? 'Year-End AR Aging' : 'Vieillissement AR fin d\'exercice';
  const titleSup = lang === 'en' ? 'Supplier Cost Breakdown' : 'Détail par fournisseur';

  // Invoice journal — filter by date range
  const fyStart = `${fiscalStart}-01`;
  const fyEndDate = `${fiscalEnd}-${new Date(parseInt(fiscalEnd.split('-')[0]), parseInt(fiscalEnd.split('-')[1]), 0).getDate()}`;
  const invoices = (facFactures || []).filter(f => f.date >= fyStart && f.date <= fyEndDate);

  // AR aging as of fiscal year end
  const today2 = new Date(fyEndDate + 'T12:00:00');
  const unpaid = invoices.filter(f => f.statut !== 'Annulée' && (f.montantDu || 0) > 0.01);
  const agingBuckets = { current: [], d30: [], d60: [], d90: [], d90plus: [] };
  unpaid.forEach(f => {
    const age = Math.floor((today2 - new Date(f.date + 'T12:00:00')) / 86400000);
    if (age <= 30) agingBuckets.current.push(f);
    else if (age <= 60) agingBuckets.d30.push(f);
    else if (age <= 90) agingBuckets.d60.push(f);
    else if (age <= 120) agingBuckets.d90.push(f);
    else agingBuckets.d90plus.push(f);
  });
  const agingSum = arr => arr.reduce((s, f) => s + (f.montantDu || 0), 0);

  // Supplier annual breakdown
  const supTotals = {};
  (suppliers || []).forEach(sup => {
    let total = 0;
    rows.forEach(r => {
      const bills = r.plData[`sup_${sup.id}_bills`];
      total += billsSum(bills, r.plData[`sup_${sup.id}`]);
    });
    if (total > 0) supTotals[sup.name] = total;
  });

  const fiscalLabel = `${fiscalStart} → ${fiscalEnd}`;

  let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titleYE}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:12px/1.5 Arial,sans-serif;color:#222;padding:24px}
h1{font-size:22px;color:#ea580c;margin-bottom:4px}
h2{font-size:15px;color:#ea580c;margin:28px 0 10px;padding-bottom:5px;border-bottom:2px solid #ea580c}
h3{font-size:12px;color:#555;margin:16px 0 6px;text-transform:uppercase;letter-spacing:0.5px}
table{border-collapse:collapse;width:100%;margin-bottom:12px}
th,td{border:1px solid #ddd;padding:5px 9px;font-size:11px}
th{background:#f7f7f7;font-weight:600;text-align:left}
td:not(:first-child){text-align:right}
.g{color:#16a34a;font-weight:700}
.r{color:#dc2626;font-weight:700}
.tot{background:#fff8f0;font-weight:700}
.sub{font-size:10px;color:#888}
.cover{margin-bottom:32px;padding:24px;background:#fff8f0;border-radius:8px;border-left:4px solid #ea580c}
.disclaimer{font-size:10px;color:#888;border-left:3px solid #f97316;padding:6px 10px;margin-bottom:16px;background:#fff8f0}
@media print{body{padding:10px}h2{page-break-before:auto}}
</style></head><body>`;

  // Cover
  h += `<div class="cover">
  <h1>${titleYE}</h1>
  <p class="sub">${co.name || 'BalanceIQ'} &nbsp;|&nbsp; ${fiscalLabel} &nbsp;|&nbsp; ${lang === 'en' ? 'Generated' : 'Généré le'} ${today}</p>
  ${co.address ? `<p class="sub">${co.address}</p>` : ''}
  ${co.tps ? `<p class="sub">TPS: ${co.tps}${co.tvq ? ` &nbsp;|&nbsp; TVQ: ${co.tvq}` : ''}</p>` : ''}
</div>
<div class="disclaimer">
  ${lang === 'en'
    ? 'Operational estimates only — always validate with your accountant.'
    : 'Estimations opérationnelles seulement — toujours valider avec votre comptable.'}
</div>`;

  // Monthly P&L summary table
  h += `<h2>${titlePL}</h2>
<table>
<tr>
  <th>${lang === 'en' ? 'Month' : 'Mois'}</th>
  <th>${lang === 'en' ? 'Revenue' : 'Revenus'}</th>
  <th>F&P %</th>
  <th>${lang === 'en' ? 'Labour %' : 'Main-d\'œuvre %'}</th>
  <th>${lang === 'en' ? 'Expenses' : 'Dépenses'}</th>
  <th>${lang === 'en' ? 'Net Profit' : 'Profit net'} %</th>
</tr>`;

  rows.forEach(r => {
    const npClass = r.np >= 0 ? 'g' : 'r';
    h += `<tr>
  <td>${r.monthLabel}</td>
  <td>${fmt(r.revenue)}</td>
  <td>${r.fpPct}%</td>
  <td>${r.labPct}%</td>
  <td>${fmt(r.expT)}</td>
  <td class="${npClass}">${fmt(r.np)} (${r.npPct}%)</td>
</tr>`;
  });

  h += `<tr class="tot">
  <td>${lang === 'en' ? 'TOTAL' : 'TOTAL'}</td>
  <td>${fmt(totRev)}</td>
  <td>${fmtPct(totFP, totRev)}</td>
  <td>${fmtPct(totLab, totRev)}</td>
  <td>${fmt(totExp)}</td>
  <td class="${totNP >= 0 ? 'g' : 'r'}">${fmt(totNP)} (${fmtPct(totNP, totRev)})</td>
</tr></table>`;

  // Invoice journal
  h += `<h2>${titleInv}</h2>`;
  if (invoices.length === 0) {
    h += `<p class="sub">${lang === 'en' ? 'No invoices in this period.' : 'Aucune facture dans cette période.'}</p>`;
  } else {
    h += `<table>
<tr>
  <th>${lang === 'en' ? 'No.' : 'No.'}</th>
  <th>${lang === 'en' ? 'Date' : 'Date'}</th>
  <th>${lang === 'en' ? 'Client' : 'Client'}</th>
  <th>${lang === 'en' ? 'Subtotal' : 'Sous-total'}</th>
  <th>TPS</th>
  <th>TVQ</th>
  <th>${lang === 'en' ? 'Total' : 'Total'}</th>
  <th>${lang === 'en' ? 'Balance due' : 'Solde dû'}</th>
  <th>${lang === 'en' ? 'Status' : 'Statut'}</th>
</tr>`;
    let invTot = 0, invDue = 0;
    invoices.forEach(f => {
      const total = (f.subtotalHT || 0) + (f.tps || 0) + (f.tvq || 0);
      invTot += total; invDue += f.montantDu || 0;
      h += `<tr>
  <td>${f.numero || '—'}</td>
  <td>${f.date || '—'}</td>
  <td>${f.clientNom || '—'}</td>
  <td>${fmt(f.subtotalHT || 0)}</td>
  <td>${fmt(f.tps || 0)}</td>
  <td>${fmt(f.tvq || 0)}</td>
  <td>${fmt(total)}</td>
  <td class="${(f.montantDu || 0) > 0.01 ? 'r' : 'g'}">${fmt(f.montantDu || 0)}</td>
  <td>${f.statut || '—'}</td>
</tr>`;
    });
    h += `<tr class="tot"><td colspan="6">${lang === 'en' ? 'TOTAL' : 'TOTAL'}</td><td>${fmt(invTot)}</td><td class="r">${fmt(invDue)}</td><td></td></tr>`;
    h += `</table>`;
  }

  // AR Aging
  h += `<h2>${titleAR}</h2>`;
  const agingLabels = lang === 'en'
    ? ['0–30 days', '31–60 days', '61–90 days', '91–120 days', '120+ days']
    : ['0–30 jours', '31–60 jours', '61–90 jours', '91–120 jours', '120+ jours'];
  const bucketKeys = ['current', 'd30', 'd60', 'd90', 'd90plus'];
  const totAging = agingSum(unpaid);
  if (totAging === 0) {
    h += `<p class="sub" style="color:#16a34a">✓ ${lang === 'en' ? 'No outstanding AR.' : 'Aucun solde AR en attente.'}</p>`;
  } else {
    h += `<table><tr><th>${lang === 'en' ? 'Bucket' : 'Tranche'}</th><th>${lang === 'en' ? 'Count' : 'Nb'}</th><th>${lang === 'en' ? 'Amount' : 'Montant'}</th></tr>`;
    bucketKeys.forEach((k, i) => {
      const sum = agingSum(agingBuckets[k]);
      if (sum > 0) h += `<tr><td>${agingLabels[i]}</td><td>${agingBuckets[k].length}</td><td class="r">${fmt(sum)}</td></tr>`;
    });
    h += `<tr class="tot"><td colspan="2">${lang === 'en' ? 'Total outstanding' : 'Total en souffrance'}</td><td class="r">${fmt(totAging)}</td></tr></table>`;
  }

  // Supplier breakdown
  h += `<h2>${titleSup}</h2>`;
  if (Object.keys(supTotals).length === 0) {
    h += `<p class="sub">${lang === 'en' ? 'No supplier costs recorded.' : 'Aucun coût fournisseur enregistré.'}</p>`;
  } else {
    h += `<table><tr><th>${lang === 'en' ? 'Supplier' : 'Fournisseur'}</th><th>${lang === 'en' ? 'Annual total' : 'Total annuel'}</th><th>%</th></tr>`;
    const supEntries = Object.entries(supTotals).sort((a, b) => b[1] - a[1]);
    supEntries.forEach(([name, total]) => {
      h += `<tr><td>${name}</td><td>${fmt(total)}</td><td>${totFP > 0 ? (total / totFP * 100).toFixed(1) + '%' : '—'}</td></tr>`;
    });
    h += `<tr class="tot"><td>${lang === 'en' ? 'TOTAL F&P' : 'TOTAL F&P'}</td><td>${fmt(totFP)}</td><td>100%</td></tr></table>`;
  }

  h += `<p class="sub" style="margin-top:24px">BalanceIQ &nbsp;|&nbsp; ${today}</p></body></html>`;
  return h;
}

// Build quarterly TPS/TVQ summary HTML
async function buildTaxHTML(fiscalStart, fiscalEnd, liveData, suppliers, lang) {
  const months = monthRange(fiscalStart, fiscalEnd);

  // Group months into quarters
  const quarters = [];
  let i = 0;
  while (i < months.length) {
    const qMonths = months.slice(i, i + 3);
    const [qy, qm] = qMonths[0].split('-').map(Number);
    const qNum = Math.ceil(qm / 3);
    quarters.push({ label: `T${qNum} ${qy}`, months: qMonths });
    i += 3;
  }

  const fmt = n => `${n >= 0 ? '' : '-'}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const today = new Date().toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  let totTpsC = 0, totTvqC = 0, totTpsN = 0, totTvqN = 0, totRev = 0;
  const qRows = [];

  for (const q of quarters) {
    let qRev = 0, qTpsC = 0, qTvqC = 0;
    for (const month of q.months) {
      const [my, mm] = month.split('-');
      const daysInMonth = new Date(parseInt(my), parseInt(mm), 0).getDate();
      let plData = {};
      try {
        const r = await window.api.storage.get(`dicann-pl-${month}`);
        if (r?.value) plData = JSON.parse(r.value);
      } catch (e) { /* no data */ }

      let monthRev = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${my}-${mm}-${String(d).padStart(2, '0')}`;
        monthRev += dayVenteNet(liveData[key]);
      }
      if (plData._revenueOverride != null) monthRev = plData._revenueOverride;
      qRev += monthRev;
      qTpsC += monthRev * 0.05;
      qTvqC += monthRev * 0.09975;
    }
    totRev += qRev; totTpsC += qTpsC; totTvqC += qTvqC;
    // Net = collected (input credits not tracked in bills — show 0)
    totTpsN += qTpsC; totTvqN += qTvqC;
    qRows.push({ label: q.label, rev: qRev, tpsC: qTpsC, tvqC: qTvqC, tpsNet: qTpsC, tvqNet: qTvqC });
  }

  const titleTax = lang === 'en' ? 'GST/QST Quarterly Summary' : 'Sommaire TPS/TVQ trimestriel';
  const disclaimer = lang === 'en'
    ? 'Estimate only. Validate with your accountant before filing.'
    : 'Estimation à titre indicatif. Validez avec votre comptable avant de produire vos déclarations.';
  const creditsNote = lang === 'en'
    ? '* Input tax credits not tracked — manual entry required in your accounting software (Acomba/Sage 50).'
    : '* Crédits intrants non disponibles — saisie manuelle requise dans votre logiciel de comptabilité.';

  let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titleTax}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font:12px/1.5 Arial,sans-serif;color:#222;padding:24px}
h1{font-size:20px;color:#ea580c;margin-bottom:4px}
h2{font-size:14px;color:#ea580c;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #ea580c}
table{border-collapse:collapse;width:100%;margin-bottom:12px}
th,td{border:1px solid #ddd;padding:6px 10px;font-size:11px}
th{background:#f7f7f7;font-weight:600}
td:not(:first-child){text-align:right}
.tot{background:#fff8f0;font-weight:700}
.sub{font-size:10px;color:#888}
.disclaimer{font-size:10px;color:#888;border-left:3px solid #f97316;padding:6px 10px;margin:12px 0;background:#fff8f0}
.note{font-size:10px;color:#b45309;margin-top:8px;font-style:italic}
</style></head><body>`;

  h += `<h1>${titleTax}</h1>
<p class="sub">${lang === 'en' ? 'Period' : 'Période'}: ${fiscalStart} → ${fiscalEnd} &nbsp;|&nbsp; ${lang === 'en' ? 'Generated' : 'Généré le'} ${today}</p>
<div class="disclaimer">${disclaimer}</div>`;

  h += `<h2>TPS ${lang === 'en' ? '(GST)' : '(TPS)'}</h2>
<table>
<tr>
  <th>${lang === 'en' ? 'Quarter' : 'Trimestre'}</th>
  <th>${lang === 'en' ? 'Revenue' : 'Revenus'}</th>
  <th>${lang === 'en' ? 'TPS Collected (5%)' : 'TPS collectée (5%)'}</th>
  <th>${lang === 'en' ? 'Input Credits *' : 'Crédits intrants *'}</th>
  <th>${lang === 'en' ? 'Net Owing' : 'Net à remettre'}</th>
</tr>`;

  qRows.forEach(q => {
    h += `<tr>
  <td><strong>${q.label}</strong></td>
  <td>${fmt(q.rev)}</td>
  <td>${fmt(q.tpsC)}</td>
  <td class="sub" style="text-align:right;color:#b45309">—*</td>
  <td><strong>${fmt(q.tpsNet)}</strong></td>
</tr>`;
  });

  h += `<tr class="tot">
  <td>TOTAL</td>
  <td>${fmt(totRev)}</td>
  <td>${fmt(totTpsC)}</td>
  <td>—*</td>
  <td>${fmt(totTpsN)}</td>
</tr></table>`;

  h += `<h2>TVQ ${lang === 'en' ? '(QST)' : '(TVQ)'}</h2>
<table>
<tr>
  <th>${lang === 'en' ? 'Quarter' : 'Trimestre'}</th>
  <th>${lang === 'en' ? 'Revenue' : 'Revenus'}</th>
  <th>${lang === 'en' ? 'TVQ Collected (9.975%)' : 'TVQ collectée (9,975%)'}</th>
  <th>${lang === 'en' ? 'Input Credits *' : 'Crédits intrants *'}</th>
  <th>${lang === 'en' ? 'Net Owing' : 'Net à remettre'}</th>
</tr>`;

  qRows.forEach(q => {
    h += `<tr>
  <td><strong>${q.label}</strong></td>
  <td>${fmt(q.rev)}</td>
  <td>${fmt(q.tvqC)}</td>
  <td class="sub" style="text-align:right;color:#b45309">—*</td>
  <td><strong>${fmt(q.tvqNet)}</strong></td>
</tr>`;
  });

  h += `<tr class="tot">
  <td>TOTAL</td>
  <td>${fmt(totRev)}</td>
  <td>${fmt(totTvqC)}</td>
  <td>—*</td>
  <td>${fmt(totTvqN)}</td>
</tr></table>`;

  h += `<p class="note">${creditsNote}</p>`;
  h += `<p class="sub" style="margin-top:20px">BalanceIQ &nbsp;|&nbsp; ${today}</p></body></html>`;
  return h;
}

export default function YearEndPackage({ liveData, suppliers, facFactures, companyInfo, canUse, lang, T }) {
  const now = new Date();
  const defaultEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const defaultStart = `${now.getFullYear() - 1}-${String(now.getMonth() + 2).padStart(2, '0') === '13' ? '01' : String(now.getMonth() + 2).padStart(2, '0')}`;

  const [fiscalStart, setFiscalStart] = useState(() => {
    const d = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [fiscalEnd, setFiscalEnd] = useState(defaultEnd);
  const [generating, setGenerating] = useState(null); // 'yearend' | 'tax' | null

  const locked = !canUse('yearEndPackage');

  const openPDF = useCallback(html => {
    window.dispatchEvent(new CustomEvent('biq:pdf-preview', { detail: { html } }));
  }, []);

  const handleYearEnd = useCallback(async () => {
    if (locked || generating) return;
    setGenerating('yearend');
    try {
      const html = await buildYearEndHTML(fiscalStart, fiscalEnd, liveData, suppliers, facFactures, companyInfo, lang);
      openPDF(html);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(null);
    }
  }, [fiscalStart, fiscalEnd, liveData, suppliers, facFactures, companyInfo, lang, locked, generating]);

  const handleTax = useCallback(async () => {
    if (locked || generating) return;
    setGenerating('tax');
    try {
      const html = await buildTaxHTML(fiscalStart, fiscalEnd, liveData, suppliers, lang);
      openPDF(html);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(null);
    }
  }, [fiscalStart, fiscalEnd, liveData, suppliers, lang, locked, generating]);

  const inputStyle = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, color: 'inherit', fontSize: 12, padding: '5px 10px',
    fontFamily: "'DM Mono', monospace",
  };
  const btnStyle = (disabled) => ({
    padding: '8px 18px', borderRadius: 7, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, fontSize: 12, opacity: disabled ? 0.5 : 1,
    background: disabled ? '#555' : 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Fiscal period selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{T.yearEndFiscalStart}</label>
        <input type="month" value={fiscalStart} onChange={e => setFiscalStart(e.target.value)} style={inputStyle} max={fiscalEnd} />
        <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{T.yearEndFiscalEnd}</label>
        <input type="month" value={fiscalEnd} onChange={e => setFiscalEnd(e.target.value)} style={inputStyle} min={fiscalStart} />
      </div>

      {/* Year-end package */}
      <div style={{ padding: '14px 16px', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{T.yearEndTitle}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>{T.yearEndDesc}</div>
        {locked
          ? <div style={{ fontSize: 11, color: '#f97316', fontStyle: 'italic' }}>{T.yearEndLocked}</div>
          : <button onClick={handleYearEnd} disabled={!!generating} style={btnStyle(!!generating)}>
              {generating === 'yearend' ? T.yearEndGenerating : T.yearEndGenerate}
            </button>
        }
      </div>

      {/* Quarterly tax summary */}
      <div style={{ padding: '14px 16px', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{T.taxSummaryTitle}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>{T.taxSummaryDesc}</div>
        <div style={{ fontSize: 10, color: '#b45309', marginBottom: 10, fontStyle: 'italic' }}>{T.taxCreditsNote}</div>
        {locked
          ? <div style={{ fontSize: 11, color: '#f97316', fontStyle: 'italic' }}>{T.yearEndLocked}</div>
          : <button onClick={handleTax} disabled={!!generating} style={btnStyle(!!generating)}>
              {generating === 'tax' ? T.taxGenerating : T.taxGenerate}
            </button>
        }
      </div>

      <div style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic' }}>{T.taxDisclaimer}</div>
    </div>
  );
}
