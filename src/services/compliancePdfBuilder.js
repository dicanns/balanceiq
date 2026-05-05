/**
 * compliancePdfBuilder.js — Close Compliance PDF report builder.
 * Pure function, no React, no IPC.
 * Called from CloseComplianceTab via window.api.pdf.toPDF (Pro-gated).
 */

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');

const fmtCents = (cents) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format((cents ?? 0) / 100);

const pct = (v) => (v != null ? `${v}%` : '—');

const bandLabel = (band, fr) => ({
  green:  fr ? 'Excellente' : 'Excellent',
  yellow: fr ? 'Acceptable' : 'Acceptable',
  red:    fr ? 'Insuffisante' : 'Needs attention',
}[band] || '—');

const bandColor = { green: '#16a34a', yellow: '#d97706', red: '#dc2626' };

const row = (label, value, color = '#1a1a2e') =>
  `<tr><td style="padding:5px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151">${escapeHtml(label)}</td>` +
  `<td style="padding:5px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:700;color:${color};text-align:right;font-variant-numeric:tabular-nums">${escapeHtml(String(value ?? '—'))}</td></tr>`;

const sectionHeader = (title) =>
  `<h3 style="margin:20px 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${title}</h3>`;

/**
 * @param {object} opts
 * @param {object} opts.kpis       - complianceGetKPIs result
 * @param {object} opts.lists      - complianceGetLists result
 * @param {object|null} opts.scorecard - computeCloseScore result or null
 * @param {string} opts.lang       - 'fr' | 'en'
 * @param {string} [opts.location] - optional location name
 * @returns {string} full HTML document
 */
export function buildCompliancePdfHTML({ kpis, lists, scorecard, lang, location }) {
  const fr = lang !== 'en';
  const generatedAt = new Date().toLocaleString(fr ? 'fr-CA' : 'en-CA', { dateStyle: 'long', timeStyle: 'short' });

  const T = {
    title:          fr ? 'Rapport de conformité des fermetures' : 'Close Compliance Report',
    period:         fr ? 'Période' : 'Period',
    generated:      fr ? 'Généré le' : 'Generated',
    location:       fr ? 'Emplacement' : 'Location',
    score:          fr ? 'Score de conformité' : 'Compliance score',
    kpiTitle:       fr ? 'Indicateurs de performance' : 'Key performance indicators',
    sessions:       fr ? 'Sessions analysées' : 'Sessions analyzed',
    avgTime:        fr ? 'Délai moyen de fermeture' : 'Avg close time',
    minutes:        fr ? 'min' : 'min',
    overrides:      fr ? 'Fermetures avec dérogation' : 'Closes with override',
    reopened:       fr ? 'Réouvertures' : 'Reopened closes',
    checklist:      fr ? 'Conformité liste de vérification' : 'Checklist compliance',
    evidence:       fr ? 'Complétude des dossiers' : 'Evidence completeness',
    depositLag:     fr ? 'Délai vérification dépôts' : 'Deposit verification lag',
    days:           fr ? 'j' : 'd',
    unapproved:     fr ? 'Non-approuvées (>1 jour)' : 'Unapproved closes (>1 day)',
    warnings:       fr ? 'Fermetures avec avertissements' : 'Closes with warnings',
    reopenedList:   fr ? 'Réouvertes après approbation' : 'Reopened after approval',
    topCashiers:    fr ? 'Caissiers - écarts fréquents' : 'Top variance cashiers',
    topRegisters:   fr ? 'Registres - écarts fréquents' : 'Top variance registers',
    missing:        fr ? 'Dossiers de fermeture manquants' : 'Missing close evidence',
    depositMissing: fr ? 'Dépôts non vérifiés' : 'Missing deposit verification',
    none:           fr ? 'Aucun' : 'None',
    date:           fr ? 'Date' : 'Date',
    shift:          fr ? 'Quart' : 'Shift',
    submitted:      fr ? 'Soumis le' : 'Submitted at',
    cashier:        fr ? 'Caissier' : 'Cashier',
    register:       fr ? 'Registre' : 'Register',
    closes:         fr ? 'Fermetures' : 'Closes',
    withVar:        fr ? 'Avec écart' : 'With variance',
    avg:            fr ? 'Moy.' : 'Avg',
    warnings2:      fr ? 'avert.' : 'warn.',
    amount:         fr ? 'Montant' : 'Amount',
    disclaimer:     fr
      ? 'Ce rapport est généré automatiquement par BalanceIQ a des fins de gestion interne. Il ne constitue pas un avis comptable ou fiscal officiel. Consultez votre comptable pour toute decision financiere.'
      : 'This report is generated automatically by BalanceIQ for internal management purposes. It does not constitute official accounting or tax advice. Consult your accountant for any financial decision.',
  };

  // KPI color helpers
  const timeColor = kpis.avgTimeToCloseMinutes == null ? '#6b7280' : kpis.avgTimeToCloseMinutes > 60 ? '#d97706' : '#16a34a';
  const ovColor   = kpis.overrideCount > 0 ? '#d97706' : '#16a34a';
  const rvColor   = kpis.reopenCount   > 0 ? '#d97706' : '#16a34a';
  const ckColor   = kpis.checklistCompliancePct  == null ? '#6b7280' : kpis.checklistCompliancePct  >= 90 ? '#16a34a' : kpis.checklistCompliancePct  >= 70 ? '#d97706' : '#dc2626';
  const evColor   = kpis.evidenceCompletenessPct == null ? '#6b7280' : kpis.evidenceCompletenessPct >= 90 ? '#16a34a' : kpis.evidenceCompletenessPct >= 70 ? '#d97706' : '#dc2626';
  const dpColor   = kpis.depositVerifLagDays     == null ? '#6b7280' : kpis.depositVerifLagDays     >  3  ? '#dc2626' : '#16a34a';

  // Score block
  const scoreBlock = scorecard ? `
    <div style="display:flex;align-items:center;gap:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:16px">
      <div style="text-align:center;min-width:60px">
        <div style="font-size:36px;font-weight:900;color:${bandColor[scorecard.band]};line-height:1">${scorecard.score}</div>
        <div style="font-size:9px;color:#6b7280;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;margin-top:2px">/100</div>
      </div>
      <div>
        <div style="font-size:14px;font-weight:700;color:${bandColor[scorecard.band]};margin-bottom:6px">${bandLabel(scorecard.band, fr)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${scorecard.entries.map(e => {
            const v = e.value;
            const c = v == null ? '#6b7280' : v >= 0.85 ? '#16a34a' : v >= 0.65 ? '#d97706' : '#dc2626';
            const lbl = fr ? e.labelFr : e.label;
            const display = v != null ? `${Math.round(v * 100)}%` : '—';
            return `<span style="font-size:10px;background:#fff;border:1px solid #e5e7eb;border-radius:5px;padding:2px 7px;color:${c};font-weight:700">${escapeHtml(lbl)}: ${display}</span>`;
          }).join('')}
        </div>
      </div>
    </div>` : '';

  // List renderer helpers
  const emptyRow = `<tr><td colspan="3" style="padding:8px 10px;font-size:11px;color:#9ca3af">${T.none}</td></tr>`;

  const sessionRows = (items) =>
    items.length === 0 ? emptyRow : items.map(s =>
      `<tr>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.date_key)}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;color:#7c3aed">${escapeHtml(s.shift_key || '—')}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;color:#6b7280">${escapeHtml(s.submitted_at?.slice(0, 16).replace('T', ' ') || s.status || '—')}</td>
      </tr>`
    ).join('');

  const cashierRows = (items) =>
    items.length === 0 ? emptyRow : items.map(r =>
      `<tr>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;font-weight:600">${escapeHtml(r.cashier_name)}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;text-align:right">${r.variance_count}/${r.total_closures}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;text-align:right">${fmtCents(r.avg_abs_variance_cents)}</td>
      </tr>`
    ).join('');

  const registerRows = (items) =>
    items.length === 0 ? emptyRow : items.map(r =>
      `<tr>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;font-weight:600">${escapeHtml(r.register_key)}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;text-align:right">${r.variance_count}/${r.total_closures}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;text-align:right">${fmtCents(r.avg_abs_variance_cents)}</td>
      </tr>`
    ).join('');

  const warningRows = (items) =>
    items.length === 0 ? emptyRow : items.map(s =>
      `<tr>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6">${escapeHtml(s.date_key)}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;color:#7c3aed">${escapeHtml(s.shift_key || '—')}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;color:#d97706;font-weight:600">⚠ ${s.warning_count} ${T.warnings2}</td>
      </tr>`
    ).join('');

  const depositRows = (items) =>
    items.length === 0 ? emptyRow : items.map(r =>
      `<tr>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6">${escapeHtml(r.date_key)}</td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6"></td>
        <td style="padding:4px 10px;font-size:11px;border-bottom:1px solid #f3f4f6;color:#d97706;font-variant-numeric:tabular-nums">${fmtCents(r.total_drop_cents)}</td>
      </tr>`
    ).join('');

  const tableHeader = (col1, col2, col3) =>
    `<tr style="background:#f9fafb">
      <th style="padding:5px 10px;font-size:10px;color:#6b7280;font-weight:700;text-align:left;border-bottom:1px solid #e5e7eb">${escapeHtml(col1)}</th>
      <th style="padding:5px 10px;font-size:10px;color:#6b7280;font-weight:700;text-align:left;border-bottom:1px solid #e5e7eb">${escapeHtml(col2)}</th>
      <th style="padding:5px 10px;font-size:10px;color:#6b7280;font-weight:700;text-align:right;border-bottom:1px solid #e5e7eb">${escapeHtml(col3)}</th>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="${fr ? 'fr' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${T.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #fff; padding: 32px; font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>

<!-- HEADER -->
<div style="background:linear-gradient(135deg,#f97316,#ea580c);border-radius:10px;padding:18px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <div style="color:#fff;font-size:18px;font-weight:900;letter-spacing:-0.3px">${T.title}</div>
    ${location ? `<div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:3px">${T.location}: ${escapeHtml(location)}</div>` : ''}
    <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px">${T.period}: ${escapeHtml(kpis.dateFrom)} → ${escapeHtml(kpis.dateTo)}</div>
  </div>
  <div style="text-align:right">
    <div style="color:rgba(255,255,255,0.7);font-size:10px">${T.generated}</div>
    <div style="color:#fff;font-size:11px;font-weight:600">${escapeHtml(generatedAt)}</div>
    <div style="color:rgba(255,255,255,0.8);font-size:10px;margin-top:4px;font-weight:700">BIQ</div>
  </div>
</div>

<!-- SCORE -->
${scoreBlock}

<!-- KPIs -->
${sectionHeader(T.kpiTitle)}
<table>
  <tbody>
    ${row(T.sessions,  kpis.sessionCount, '#1a1a2e')}
    ${row(`${T.avgTime} (${T.minutes})`, kpis.avgTimeToCloseMinutes ?? '—', timeColor)}
    ${row(T.overrides, kpis.overrideCount, ovColor)}
    ${row(T.reopened,  kpis.reopenCount,   rvColor)}
    ${row(T.checklist, pct(kpis.checklistCompliancePct),  ckColor)}
    ${row(T.evidence,  pct(kpis.evidenceCompletenessPct), evColor)}
    ${row(`${T.depositLag} (${T.days})`, kpis.depositVerifLagDays ?? '—', dpColor)}
    ${row(fr ? 'Fermetures avec registres' : 'Closes with register closures', kpis.totalClosures ?? 0, '#1a1a2e')}
  </tbody>
</table>

<!-- UNAPPROVED -->
${sectionHeader(T.unapproved)}
<table>
  ${tableHeader(T.date, T.shift, T.submitted)}
  <tbody>${sessionRows(lists.unapproved)}</tbody>
</table>

<!-- WARNINGS -->
${sectionHeader(T.warnings)}
<table>
  ${tableHeader(T.date, T.shift, fr ? 'Avertissements' : 'Warnings')}
  <tbody>${warningRows(lists.withWarnings)}</tbody>
</table>

<!-- REOPENED -->
${sectionHeader(T.reopenedList)}
<table>
  ${tableHeader(T.date, T.shift, fr ? 'Statut' : 'Status')}
  <tbody>${sessionRows(lists.reopened)}</tbody>
</table>

<!-- TOP VARIANCE CASHIERS -->
${sectionHeader(T.topCashiers)}
<table>
  ${tableHeader(T.cashier, T.withVar, T.avg)}
  <tbody>${cashierRows(lists.topVarianceCashiers)}</tbody>
</table>

<!-- TOP VARIANCE REGISTERS -->
${sectionHeader(T.topRegisters)}
<table>
  ${tableHeader(T.register, T.withVar, T.avg)}
  <tbody>${registerRows(lists.topVarianceRegisters)}</tbody>
</table>

<!-- MISSING EVIDENCE -->
${sectionHeader(T.missing)}
<table>
  ${tableHeader(T.date, T.shift, fr ? 'Statut' : 'Status')}
  <tbody>${sessionRows(lists.missingEvidence)}</tbody>
</table>

<!-- MISSING DEPOSIT VERIFICATION -->
${sectionHeader(T.depositMissing)}
<table>
  ${tableHeader(T.date, '', T.amount)}
  <tbody>${depositRows(lists.missingDepositVerif)}</tbody>
</table>

<!-- FOOTER -->
<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:8px">
  <div style="font-size:9px;color:#9ca3af;max-width:480px;line-height:1.5">${T.disclaimer}</div>
  <div style="font-size:10px;color:#d1d5db;font-weight:700;letter-spacing:1px">BalanceIQ</div>
</div>

</body>
</html>`;
}
