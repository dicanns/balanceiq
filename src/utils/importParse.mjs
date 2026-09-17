// Reading files people hand the app: bank statements, delivery payouts, forecast
// sales, a chart of accounts. Each import used to carry its own CSV splitting,
// date and amount reading, and each got a different part wrong - a regex that
// shifted every column, dates kept as written, "12,50" read as 1250. One module,
// used by the main process (require) and the renderer (import) alike.

// ── CSV ──────────────────────────────────────────────────────────────────────
// The separator a file uses, judged from its header line.
export function detectDelimiter(headerLine) {
  const line = String(headerLine || '');
  return ['\t', ';', ','].reduce((best, d) => (line.split(d).length > line.split(best).length ? d : best), ',');
}

// One line into fields. Quoted fields may hold the separator and doubled quotes.
export function splitCsvLine(line, delim = ',') {
  const out = []; let field = ''; let quoted = false;
  const s = String(line || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { out.push(field.trim()); field = ''; }
    else field += c;
  }
  out.push(field.trim());
  return out;
}

// A whole file: BOM removed, blank lines dropped, separator detected.
export function parseCsvRecords(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [], delim: ',' };
  const delim = detectDelimiter(lines[0]);
  return { headers: splitCsvLine(lines[0], delim), rows: lines.slice(1).map(l => splitCsvLine(l, delim)), delim };
}

// ── DATES ────────────────────────────────────────────────────────────────────
const MONTHS = {
  jan: 1, janv: 1, janvier: 1, january: 1,
  feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, aou: 8, aout: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
};
const pad2 = (n) => String(n).padStart(2, '0');
function isoIfValid(y, m, d) {
  const yy = y < 100 ? 2000 + y : y;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(yy, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${yy}-${pad2(m)}-${pad2(d)}` : null;
}
const monthOf = (word) => MONTHS[String(word).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '')];

// A date in whatever shape a file wrote it, as YYYY-MM-DD, or null. numericOrder
// decides 03/04/2026: 'mdy' or 'dmy' (see detectNumericDateOrder).
export function normalizeStatementDate(raw, numericOrder = 'mdy') {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return null;
  let m;
  if ((m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return isoIfValid(+m[1], +m[2], +m[3]);
  if ((m = v.match(/^(\d{4})(\d{2})(\d{2})(?:\d{0,6})?(?:\.\d+)?(?:\[[^\]]*\])?$/))) return isoIfValid(+m[1], +m[2], +m[3]);
  if ((m = v.match(/^(\d{1,2})[\s\-.\/]+([A-Za-zÀ-ÿ]+\.?)[\s\-.\/,]+(\d{2,4})\b/))) {
    const mo = monthOf(m[2]); return mo ? isoIfValid(+m[3], mo, +m[1]) : null;
  }
  if ((m = v.match(/^([A-Za-zÀ-ÿ]+\.?)[\s\-.\/]+(\d{1,2}),?[\s\-.\/]+(\d{2,4})\b/))) {
    const mo = monthOf(m[1]); return mo ? isoIfValid(+m[3], mo, +m[2]) : null;
  }
  if ((m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/))) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return numericOrder === 'dmy' ? isoIfValid(y, b, a) : isoIfValid(y, a, b);
  }
  return null;
}

// 03/04/2026 cannot be read on its own: the file decides. A first part above 12
// anywhere means day first; a second part above 12 means month first. With
// nothing to go on, month first, as North American exports write it.
export function detectNumericDateOrder(values) {
  for (const raw of values || []) {
    const m = String(raw == null ? '' : raw).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}\b/);
    if (!m) continue;
    if (+m[1] > 12) return 'dmy';
    if (+m[2] > 12) return 'mdy';
  }
  return 'mdy';
}

// ── AMOUNTS ──────────────────────────────────────────────────────────────────
// 1,234.56 / 1 234,56 / $55.00 / (55.00) / -55.00 / 55.00- / +12.50 as a
// number, or null when there is no number.
export function parseStatementAmount(raw) {
  let v = String(raw == null ? '' : raw).trim();
  if (!v) return null;
  const compact = v.replace(/[\s$€£  ]/g, '');
  const negative = /^\(.*\)$/.test(compact) || /^-/.test(compact) || /-$/.test(compact);
  v = compact.replace(/[()]/g, '').replace(/^[+-]|-$/g, '');
  if (/,\d{1,2}$/.test(v) && !/\.\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(v)) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// ── OFX TEXT ─────────────────────────────────────────────────────────────────
export function decodeXmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
