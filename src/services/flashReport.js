/**
 * flashReport.js — Daily Flash Report email builder
 * Generates a branded HTML email summary from daily data.
 * Pure function — no React, no IPC. Called from App.jsx.
 */

const fmtCAD = (n) =>
  (n ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });

const fmtPct = (n) => (n != null ? `${n.toFixed(1)}%` : '—');

const escapeHtml = (s) => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');

const arrow = (val, ref) => {
  if (val == null || ref == null || ref === 0) return '';
  const diff = ((val - ref) / ref) * 100;
  if (Math.abs(diff) < 1) return '';
  return diff > 0
    ? `<span style="color:#16a34a">▲ ${diff.toFixed(1)}%</span>`
    : `<span style="color:#ef4444">▼ ${Math.abs(diff).toFixed(1)}%</span>`;
};

const sparkline = (values) => {
  // Text-based sparkline from array of numbers
  const symbols = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  if (!values || values.length === 0) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((v) => symbols[Math.min(7, Math.floor(((v - min) / range) * 7))])
    .join('');
};

// Day-of-week label
const DOW_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr, lang) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = lang === 'en' ? DOW_EN[d.getDay()] : DOW_FR[d.getDay()];
  const months = lang === 'en' ? MONTHS_EN : MONTHS_FR;
  return `${dow} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Build the flash report HTML.
 *
 * @param {Object} data
 *   date         {string}  YYYY-MM-DD of yesterday
 *   day          {Object}  computeDay result for yesterday
 *   closedCount  {number}  registers closed out
 *   totalRegs    {number}  total registers
 *   isClosed     {boolean} was the day formally closed out
 *   wtdSales     {number}  week-to-date net sales (including yesterday)
 *   wtdDays      {number}  number of days in WTD with data
 *   deliveries   {Object}  {doordash, ubereats, skip} totals for yesterday (PRO)
 *   wtdValues    {number[]} last 7 days sales for sparkline (PRO)
 *   prevWeekDay  {Object}  computeDay result same DOW last week (PRO)
 *   locationName {string}  optional location name
 * @param {string} lang  'fr' | 'en'
 * @param {boolean} isPro
 */
export function buildFlashReportHTML(data, lang = 'fr', isPro = false) {
  const {
    date, day, closedCount, totalRegs, isClosed,
    wtdSales, wtdDays, deliveries, wtdValues, prevWeekDay, locationName,
  } = data;

  const fr = lang === 'fr';
  const T = {
    subject:      fr ? 'Rapport flash' : 'Flash Report',
    yesterday:    fr ? 'Hier' : 'Yesterday',
    netSales:     fr ? 'Ventes nettes' : 'Net Sales',
    posSales:     fr ? 'Total POS' : 'POS Total',
    cashStatus:   fr ? 'Statut caisses' : 'Register Status',
    balanced:     fr ? '✓ Balancée' : '✓ Balanced',
    short:        fr ? '$ Manquant' : '$ Short',
    over:         fr ? '$ Surplus' : '$ Over',
    closeout:     fr ? 'Fermeture' : 'Close-out',
    closedOutOf:  (c, t) => fr ? `${c}/${t} caisses fermées` : `${c}/${t} registers closed`,
    notClosed:    fr ? '⚠️ Journée non fermée' : '⚠️ Day not closed out',
    wtd:          fr ? 'Ventes sem. en cours' : 'Week-to-date Sales',
    labour:       fr ? 'Main d\'œuvre' : 'Labour',
    delivery:     fr ? 'Plateformes livraison' : 'Delivery Platforms',
    doordash:     'DoorDash',
    ubereats:     'Uber Eats',
    skip:         'Skip',
    wowTitle:     fr ? 'Semaine vs semaine' : 'Week-over-week',
    wowSame:      fr ? 'Même jour sem. dernière' : 'Same day last week',
    poweredBy:    fr ? 'Propulsé par BalanceIQ' : 'Powered by BalanceIQ',
    proTag:       'PRO',
    noData:       fr ? 'Aucune donnée pour cette journée.' : 'No data for this day.',
    opens:        fr ? 'Ouvrez l\'app pour voir les détails.' : 'Open the app for full details.',
  };

  const dateLabel = formatDate(date, lang);
  const hasData = day?.anyData;

  // Build cash variance summary
  let cashRows = '';
  if (hasData && day.cashes) {
    day.cashes.forEach((c, i) => {
      if (!c.posVentes && !c.interac && !c.finalCash) return;
      const mc = c.interac != null && c.finalCash != null;
      const manT = mc ? (c.interac || 0) + (c.finalCash || 0) + (c.deposits || 0) : null;
      const posT = (c.posVentes || 0) + (c.posTPS || 0) + (c.posTVQ || 0);
      const expected = posT - (c.posLivraisons || 0);
      const ecart = mc && c.posVentes ? manT - expected : null;
      const bal = ecart != null && Math.abs(ecart) <= 1;
      const cashierId = c.cashierId || `#${i + 1}`;

      const statusColor = !mc || !c.posVentes ? '#6b7280' : bal ? '#16a34a' : ecart < 0 ? '#ef4444' : '#f59e0b';
      const statusLabel = !mc || !c.posVentes ? '—' : bal
        ? T.balanced
        : `${ecart < 0 ? T.short : T.over} ${fmtCAD(Math.abs(ecart))}`;

      cashRows += `<tr>
        <td style="padding:5px 10px;font-size:12px;color:#374151">${cashierId}</td>
        <td style="padding:5px 10px;font-size:12px;color:${statusColor};font-weight:600">${statusLabel}</td>
      </tr>`;
    });
  }

  // Delivery rows (PRO)
  let deliveryRows = '';
  if (isPro && deliveries) {
    const platforms = [
      { key: 'doordash', label: T.doordash, color: '#ef4444' },
      { key: 'ubereats',  label: T.ubereats, color: '#16a34a' },
      { key: 'skip',      label: T.skip,     color: '#3b82f6' },
    ];
    platforms.forEach(({ key, label, color }) => {
      const val = deliveries[key];
      if (val > 0) {
        deliveryRows += `<tr>
          <td style="padding:4px 10px;font-size:12px;color:${color};font-weight:600">${label}</td>
          <td style="padding:4px 10px;font-size:12px;color:#374151;text-align:right">${fmtCAD(val)}</td>
        </tr>`;
      }
    });
  }

  // WoW comparison (PRO)
  let wowHtml = '';
  if (isPro && prevWeekDay?.anyData && day?.venteNet != null) {
    const diff = day.venteNet - prevWeekDay.venteNet;
    const diffPct = prevWeekDay.venteNet > 0 ? (diff / prevWeekDay.venteNet) * 100 : 0;
    const color = diff >= 0 ? '#16a34a' : '#ef4444';
    const sym = diff >= 0 ? '▲' : '▼';
    wowHtml = `
    <tr>
      <td colspan="2" style="padding:10px 10px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af">${T.wowTitle}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;color:#374151">${T.wowSame}</td>
      <td style="padding:4px 10px;font-size:12px;color:#374151;text-align:right">${fmtCAD(prevWeekDay.venteNet)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;color:#374151">${fr ? 'Écart' : 'Variance'}</td>
      <td style="padding:4px 10px;font-size:13px;font-weight:700;color:${color};text-align:right">${sym} ${fmtCAD(Math.abs(diff))} (${Math.abs(diffPct).toFixed(1)}%)</td>
    </tr>`;
  }

  // Sparkline WTD (PRO)
  let sparkHtml = '';
  if (isPro && wtdValues && wtdValues.length > 1) {
    sparkHtml = `<div style="font-family:'Courier New',monospace;font-size:18px;letter-spacing:2px;color:#f97316;margin:4px 0">${sparkline(wtdValues)}</div>`;
  }

  const locationHtml = locationName
    ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${escapeHtml(locationName)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${T.subject} — ${dateLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f97316,#ea580c);border-radius:12px 12px 0 0;padding:20px 24px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.3px">BalanceIQ</div>
                  <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:2px">${T.subject} — ${dateLabel}</div>
                  ${locationHtml}
                </td>
                ${isPro ? `<td align="right"><span style="background:rgba(255,255,255,0.2);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:12px;letter-spacing:1px">${T.proTag}</span></td>` : ''}
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;border-radius:0 0 12px 12px;padding:0">
            <table width="100%" cellpadding="0" cellspacing="0">

              ${!hasData ? `
              <tr><td style="padding:24px;text-align:center;color:#6b7280;font-size:13px">${T.noData}</td></tr>
              ` : `

              <!-- Sales section -->
              <tr>
                <td colspan="2" style="padding:16px 10px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af">${T.yesterday}</td>
              </tr>
              <tr>
                <td style="padding:4px 10px">
                  <div style="font-size:28px;font-weight:800;color:#111827">${fmtCAD(day.venteNet)}</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:1px">${T.netSales}</div>
                </td>
                <td style="padding:4px 10px;text-align:right;vertical-align:bottom">
                  <div style="font-size:13px;color:#374151">${T.posSales}: <strong>${fmtCAD(day.total)}</strong></div>
                  ${!isClosed ? `<div style="font-size:11px;color:#f59e0b;margin-top:3px;font-weight:600">${T.notClosed}</div>` : ''}
                </td>
              </tr>

              <!-- Divider -->
              <tr><td colspan="2" style="padding:6px 10px"><div style="height:1px;background:#f3f4f6"></div></td></tr>

              <!-- WTD -->
              <tr>
                <td colspan="2" style="padding:8px 10px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af">${T.wtd}</td>
              </tr>
              <tr>
                <td style="padding:4px 10px">
                  <div style="font-size:20px;font-weight:700;color:#1f2937">${fmtCAD(wtdSales)}</div>
                  ${sparkHtml}
                </td>
                <td style="padding:4px 10px;text-align:right;vertical-align:middle;font-size:12px;color:#6b7280">
                  ${wtdDays} ${fr ? (wtdDays > 1 ? 'jours' : 'jour') : (wtdDays > 1 ? 'days' : 'day')}
                </td>
              </tr>

              <!-- Divider -->
              <tr><td colspan="2" style="padding:6px 10px"><div style="height:1px;background:#f3f4f6"></div></td></tr>

              <!-- Cash status -->
              <tr>
                <td colspan="2" style="padding:8px 10px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af">${T.cashStatus}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:0 0 4px">
                  <table width="100%" cellpadding="0" cellspacing="0">${cashRows}</table>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:2px 10px 8px;font-size:11px;color:#6b7280">
                  ${T.closedOutOf(closedCount, totalRegs)}
                </td>
              </tr>

              ${isPro && day.labourPct != null ? `
              <!-- Divider -->
              <tr><td colspan="2" style="padding:4px 10px"><div style="height:1px;background:#f3f4f6"></div></td></tr>
              <tr>
                <td colspan="2" style="padding:8px 10px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af">${T.labour}</td>
              </tr>
              <tr>
                <td style="padding:4px 10px;font-size:13px;color:#374151">${fr ? 'Coût main d\'œuvre' : 'Labour cost'}</td>
                <td style="padding:4px 10px;font-size:13px;color:#374151;text-align:right;font-weight:600">${fmtCAD(day.labourCost)} (${fmtPct(day.labourPct)})</td>
              </tr>
              ` : ''}

              ${isPro && deliveryRows ? `
              <!-- Divider -->
              <tr><td colspan="2" style="padding:4px 10px"><div style="height:1px;background:#f3f4f6"></div></td></tr>
              <tr>
                <td colspan="2" style="padding:8px 10px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af">${T.delivery}</td>
              </tr>
              <table width="100%" cellpadding="0" cellspacing="0">${deliveryRows}</table>
              ` : ''}

              ${wowHtml ? `
              <!-- Divider -->
              <tr><td colspan="2" style="padding:4px 10px"><div style="height:1px;background:#f3f4f6"></div></td></tr>
              <table width="100%" cellpadding="0" cellspacing="0">${wowHtml}</table>
              ` : ''}

              `}

              <!-- Footer -->
              <tr>
                <td colspan="2" style="padding:16px 24px;border-top:1px solid #f3f4f6;text-align:center">
                  <div style="font-size:11px;color:#9ca3af">${T.poweredBy} · <a href="https://balanceiq.ca" style="color:#f97316;text-decoration:none">balanceiq.ca</a></div>
                  <div style="font-size:10px;color:#d1d5db;margin-top:3px">${T.opens}</div>
                </td>
              </tr>

            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
