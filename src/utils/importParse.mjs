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

// Every line as fields, the first one included: a file with no header must not
// lose its first transaction.
export function parseCsvLines(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], delim: ',' };
  const delim = detectDelimiter(lines[0]);
  return { rows: lines.map(l => splitCsvLine(l, delim)), delim };
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

// ── A CSV WITH NO HEADER ─────────────────────────────────────────────────────
// Plenty of banks export transactions with no column names at all, one row per
// line: date, description, charge, payment, running balance. Treating line one
// as the header ate a transaction and left no date column, so the whole file
// read as empty.

// A row of data always carries a date; a header never does.
export function looksLikeHeader(fields) {
  return !(fields || []).some(f => normalizeStatementDate(f, 'mdy') || normalizeStatementDate(f, 'dmy'));
}

// Which column is which, judged from the values themselves. Used when a file has
// no header, and as the fallback when a header names nothing recognizable.
export function inferColumns(rows) {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const filled = [], dateHits = [], amountHits = [], textLen = [];
  for (let c = 0; c < width; c++) {
    let f = 0, d = 0, a = 0, len = 0;
    for (const r of rows) {
      const v = (r[c] ?? '').trim();
      if (!v) continue;
      f++;
      if (normalizeStatementDate(v, 'mdy') || normalizeStatementDate(v, 'dmy')) d++;
      else if (parseStatementAmount(v) != null) a++;
      else len += v.length;
    }
    filled.push(f); dateHits.push(d); amountHits.push(a); textLen.push(len);
  }
  const best = (arr, skip = []) => arr.reduce((bi, v, i) => (skip.includes(i) || v <= (arr[bi] ?? -1) ? bi : i), -1);
  const dateIdx = dateHits.some(d => d > 0) ? best(dateHits) : -1;
  const descIdx = textLen.some(l => l > 0) ? best(textLen, [dateIdx]) : -1;
  const numeric = amountHits
    .map((n, i) => ({ i, n, f: filled[i] }))
    .filter(x => x.n > 0 && x.i !== dateIdx && x.i !== descIdx)
    .sort((x, y) => x.i - y.i);

  // A charge column and a payment column never both hold a value on one row; a
  // running balance holds one on nearly every row.
  let amtIdx = -1, debitIdx = -1, creditIdx = -1, balIdx = -1;
  const exclusive = (a, b) => rows.every(r => !((r[a] ?? '').trim() && (r[b] ?? '').trim()));
  for (let x = 0; x < numeric.length && debitIdx < 0; x++) {
    for (let y = x + 1; y < numeric.length; y++) {
      if (!exclusive(numeric[x].i, numeric[y].i)) continue;
      // The fuller of the pair is the charges; on a statement they outnumber payments.
      const [a, b] = [numeric[x], numeric[y]];
      debitIdx = (a.f >= b.f ? a : b).i;
      creditIdx = (a.f >= b.f ? b : a).i;
      break;
    }
  }
  const leftover = numeric.filter(x => x.i !== debitIdx && x.i !== creditIdx);
  if (debitIdx >= 0) {
    // Whatever numeric column is left, filled on nearly every row, is the balance.
    const bal = leftover.find(x => x.f >= Math.max(1, Math.floor(rows.length * 0.8)));
    if (bal) balIdx = bal.i;
  } else if (leftover.length === 1) {
    amtIdx = leftover[0].i;
  } else if (leftover.length > 1) {
    // One amount and a running balance: the balance is the one that changes by
    // the amount from row to row, and is filled throughout.
    const byFill = [...leftover].sort((x, y) => y.f - x.f);
    amtIdx = byFill[byFill.length - 1].i;
    balIdx = byFill[0].i === amtIdx ? byFill[1].i : byFill[0].i;
  }
  return { dateIdx, descIdx, amtIdx, debitIdx, creditIdx, balIdx };
}

// ── OFX TEXT ─────────────────────────────────────────────────────────────────
export function decodeXmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

/**
 * Which column of a chart-of-accounts file holds what. Same idea as
 * inferColumns for statements: a guess good enough that most files need no
 * correcting, and a starting point for the operator when it is wrong.
 *
 * `rows` are data rows (no header line). `headers`, when the file has titles,
 * is matched first, because a title is better evidence than the values.
 */
export function inferCoaColumns(rows, headers = null) {
  const width = (rows || []).reduce((w, r) => Math.max(w, r.length), 0);
  const out = { account_number: -1, name_fr: -1, name_en: -1, type: -1, tax_hint: -1 };
  const taken = new Set();
  const claim = (role, idx) => {
    if (idx < 0 || taken.has(idx) || out[role] >= 0) return;
    out[role] = idx; taken.add(idx);
  };
  const col = (i) => (rows || []).map(r => String(r[i] ?? '').trim());
  const hits = (i, re) => { const c = col(i).filter(Boolean); return c.length ? c.filter(v => re.test(v)).length / c.length : 0; };

  if (headers) {
    const byTitle = [
      ['account_number', /account_?number|num(e|é)ro|^no\b|^num\b|compte/i],
      ['name_fr', /name_?fr|nom/i],
      ['name_en', /name_?en|name$|^name/i],
      ['type', /^type$|cat(e|é)gorie|classe/i],
      ['tax_hint', /tax|tps|tvq|gst|qst/i],
    ];
    for (const [role, re] of byTitle) {
      const idx = headers.findIndex((h, i) => !taken.has(i) && re.test(String(h || '')));
      claim(role, idx);
    }
  }

  // Values, for anything a title did not settle.
  const types = /^(asset|liability|equity|revenue|cogs|expense)$/i;
  for (let i = 0; i < width; i++) if (hits(i, types) >= 0.6) { claim('type', i); break; }
  for (let i = 0; i < width; i++) if (hits(i, /^\d{3,6}(\.\d+)?$/) >= 0.8) { claim('account_number', i); break; }
  for (let i = 0; i < width; i++) if (hits(i, /^(tps|tvq|both|none|gst|qst|tps\+tvq)$/i) >= 0.6) { claim('tax_hint', i); break; }

  // The remaining text columns, widest first, are the names.
  const textCols = [];
  for (let i = 0; i < width; i++) {
    if (taken.has(i)) continue;
    const c = col(i).filter(Boolean);
    if (!c.length || c.every(v => /^-?[\d\s.,$%]+$/.test(v))) continue;
    textCols.push({ i, len: c.reduce((a, v) => a + v.length, 0) / c.length });
  }
  textCols.sort((a, b) => b.len - a.len || a.i - b.i);
  if (textCols[0]) claim('name_fr', textCols[0].i);
  if (textCols[1]) claim('name_en', textCols[1].i);
  return out;
}

/**
 * Whether a spreadsheet's first row is column titles rather than data.
 *
 * The test that actually works on exports: a title row is text where the rows
 * below it are numbers. A product-name column is text all the way down, so
 * "the first row is text" alone proves nothing.
 */
export function looksLikeSheetHeader(rows) {
  if (!rows || rows.length < 2) return false;
  const numeric = (v) => {
    const s = String(v ?? '').trim();
    return s !== '' && !Number.isNaN(Number(s.replace(/[\s,$]/g, '')));
  };
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const body = rows.slice(1);
  for (let i = 0; i < width; i++) {
    const below = body.map(r => r[i]).filter(v => String(v ?? '').trim() !== '');
    if (!below.length) continue;
    const mostlyNumbers = below.filter(numeric).length / below.length >= 0.8;
    if (mostlyNumbers && !numeric(rows[0][i]) && String(rows[0][i] ?? '').trim() !== '') return true;
  }
  return false;
}
