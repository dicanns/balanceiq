// Reading a bank or card statement out of a PDF.
//
// A PDF has no rows or columns, only words placed on a page. What this module
// gets is every word with its position (from pdf-worker.js, top-left origin),
// and what it gives back is the statement: its period, the balance it opened
// and closed on, and its lines. It never opens a file itself, so it can be
// tested with invented statements and trusted with nothing but coordinates.
//
// Written against real TD, BMO and American Express statements, and kept to
// rules any statement follows rather than one bank's quirks:
//   - the table starts at a title row naming a description and an amount;
//   - a line of the table starts with a date, written with a month name and no
//     year, the year coming from the statement period;
//   - totals, subtotals and repeated page titles carry no date, so they are
//     never lines;
//   - a line with no date and no amount right under a line belongs to it
//     (a payment reference, a foreign currency conversion);
//   - the balances are printed next to a label saying which is which.
//
// The last rule gives the check that makes a PDF worth reading at all: the
// opening balance plus the lines has to land on the closing balance. When it
// does not, something was misread, and the operator is told before anything is
// imported rather than finding a variance a month later.

const MONTHS = {
  jan: 1, january: 1, janv: 1, janvier: 1,
  feb: 2, february: 2, fev: 2, 'fév': 2, fevr: 2, 'févr': 2, fevrier: 2, 'février': 2,
  mar: 3, march: 3, mars: 3,
  apr: 4, april: 4, avr: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, july: 7, juil: 7, juillet: 7,
  aug: 8, august: 8, aou: 8, 'aoû': 8, aout: 8, 'août': 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, 'déc': 12, decembre: 12, 'décembre': 12,
};

export function monthOf(word) {
  const w = String(word || '').toLowerCase().replace(/\.$/, '');
  if (MONTHS[w]) return MONTHS[w];
  // "June", "Sept." and the like: the first three letters of an English month.
  if (w.length > 3 && /^[a-z]+$/.test(w) && MONTHS[w.slice(0, 3)] && ['jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec'].includes(w.slice(0, 3))) {
    const full = ['january','february','march','april','june','july','august','september','october','november','december'];
    if (full.some(f => f.startsWith(w))) return MONTHS[w.slice(0, 3)];
  }
  return null;
}

/**
 * A printed amount as a number, or null when the text is not one. Handles a
 * dollar sign, thousands separators either way round, a leading or trailing
 * minus, brackets, and "CR" for a credit.
 */
export function moneyValue(raw) {
  let s = String(raw ?? '').replace(/[  ]/g, ' ').trim();
  if (!s) return null;
  let neg = false;
  const cr = /\s*(CR|CRÉDIT|CREDIT)$/i;
  if (cr.test(s)) { neg = true; s = s.replace(cr, ''); }
  if (/^\(.*\)$/.test(s)) { neg = !neg; s = s.slice(1, -1); }
  s = s.replace(/\$/g, '').replace(/\s/g, '').replace(/^\+/, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  s = s.replace(/\$/g, '');
  const m = s.match(/^(\d{1,3}(?:[,.]\d{3})*|\d+)([.,])(\d{2})$/);
  if (!m) return null;
  const v = Number(m[1].replace(/[,.]/g, '') + '.' + m[3]);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// A full date: "May 06, 2026", "Jul. 29, 2026", "6 juil. 2026", "2026-07-06".
const FULL_DATE = /([A-Za-zÀ-ÿ]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9})\.?,?\s+(\d{4})|(\d{4})-(\d{2})-(\d{2})/g;

export function fullDates(text) {
  const out = [];
  for (const m of String(text || '').matchAll(FULL_DATE)) {
    let y, mo, d;
    if (m[1]) { mo = monthOf(m[1]); d = +m[2]; y = +m[3]; }
    else if (m[4]) { mo = monthOf(m[5]); d = +m[4]; y = +m[6]; }
    else { y = +m[7]; mo = +m[8]; d = +m[9]; }
    if (mo && validDay(y, mo, d)) out.push({ iso: ymd(y, mo, d), index: m.index });
  }
  return out;
}

// A line's date, no year: "MAY 6", "Aug. 3", "Jul 6", "06 juil.". Two of them
// when the statement prints the posting date too.
const SHORT_DATE = /([A-Za-zÀ-ÿ]{3,9})\.?\s+(\d{1,2})(?!\d)|(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9})\.?/g;

export function shortDates(text) {
  const out = [];
  for (const m of String(text || '').matchAll(SHORT_DATE)) {
    const mo = monthOf(m[1] || m[4]);
    const d = +(m[2] || m[3]);
    if (mo && d >= 1 && d <= 31) out.push({ month: mo, day: d });
  }
  return out;
}

/**
 * The year of a date printed without one. The statement's closing date sets
 * it; a date well after the close belongs to the year before (a December line
 * on a statement closing in January).
 */
export function resolveYear(month, day, periodEnd) {
  const endY = periodEnd ? +periodEnd.slice(0, 4) : new Date().getFullYear();
  let y = endY;
  if (periodEnd && validDay(y, month, day) && ymd(y, month, day) > addDays(periodEnd, 31)) y = endY - 1;
  return validDay(y, month, day) ? ymd(y, month, day) : null;
}

// ── Lines from words ────────────────────────────────────────────────────────

export function buildLines(items) {
  const byPage = new Map();
  for (const it of items || []) {
    const s = String(it?.str ?? '').trim();
    if (!s) continue;
    const page = it.page || 1;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push({ s, x: +it.x || 0, w: +it.w || 0, h: +it.h || 8, cy: (+it.y || 0) + (+it.h || 8) / 2 });
  }
  const pages = [];
  for (const [page, list] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.cy - b.cy || a.x - b.x);
    const lines = [];
    for (const it of list) {
      const last = lines[lines.length - 1];
      if (!last || Math.abs(it.cy - last.cy) > Math.max(2.5, it.h * 0.4)) lines.push({ page, cy: it.cy, cells: [it] });
      else last.cells.push(it);
    }
    for (const l of lines) {
      l.cells.sort((a, b) => a.x - b.x);
      l.text = l.cells.map(c => c.s).join(' ');
    }
    pages.push({ page, lines });
  }
  return pages;
}

// ── The title row of the transaction table ──────────────────────────────────

const DESC_WORD = /^(activity|description|descriptions|details|détails|detail|libellé|libelle|transaction details|activité|description de l'opération)$/i;
const MONEY_HEADERS = [
  { role: 'debit',   re: /^(withdrawals?|retraits?|debits?|débits?|cheques? ?& ?debits|chèques? et débits)\b/i },
  { role: 'credit',  re: /^(deposits?|dépôts?|credits?|crédits?|deposits? ?& ?credits)\b/i },
  { role: 'balance', re: /^(balance|solde)(\s*\(\$\))?$/i },
  { role: 'amount',  re: /^(amount|montant)\b/i },
];

function findHeader(line) {
  const desc = line.cells.find(c => DESC_WORD.test(c.s) || /^(activity|activité)\s+description$/i.test(c.s));
  if (!desc) return null;
  const money = [];
  for (const c of line.cells) {
    if (c.x <= desc.x) continue;
    const h = MONEY_HEADERS.find(m => m.re.test(c.s));
    if (h) money.push({ role: h.role, x: c.x, right: c.x + (c.w || c.s.length * 5) });
  }
  if (!money.length) return null;
  return { descX: desc.x, dateMaxX: desc.x - 2, money, moneyMinX: Math.min(...money.map(m => m.x)) - 80 };
}

// ── Balances and period ─────────────────────────────────────────────────────

const OPENING_RE = /(previous (statement |total )?balance|balance from (your )?(last|previous) statement|opening balance|solde (précédent|antérieur|d'ouverture|au début)|ancien solde)/i;
const CLOSING_RE = /(new balance|total balance|closing balance|nouveau solde|solde de (clôture|fermeture)|solde à la fin|solde total)/i;
const PAYMENTS_RE = /(payments? (and|&) credits|less payments|paiements (et|&) crédits)/i;
const PURCHASES_RE = /(purchases? (and|&) other charges|plus purchases|achats (et|&) autres frais)/i;

// The first amount printed after a label on the same line, or null.
function amountAfterLabel(line, re) {
  let acc = '';
  for (let i = 0; i < line.cells.length; i++) {
    acc = (acc ? acc + ' ' : '') + line.cells[i].s;
    if (!re.test(acc)) continue;
    for (let j = i + 1; j < line.cells.length; j++) {
      let v = moneyValue(line.cells[j].s);
      if (v == null) continue;
      if (line.cells[j + 1] && /^CR$/i.test(line.cells[j + 1].s)) v = -v;
      return v;
    }
    return null;
  }
  return null;
}

function findPeriod(pages) {
  const all = pages.flatMap(p => p.lines);
  // A line that says it is the period.
  for (const l of all) {
    if (!/period|période/i.test(l.text)) continue;
    const ds = fullDates(l.text);
    if (ds.length >= 2) return { start: ds[0].iso, end: ds[1].iso };
  }
  // American Express: "Opening Date" and "Closing Date" titles, the dates on
  // the line below. These are the statement's, not the account's.
  for (const p of pages) {
    for (let i = 0; i < p.lines.length - 1; i++) {
      const t = p.lines[i].text;
      if (/(opening date|date d'ouverture|date de début)/i.test(t) && /(closing date|date de (clôture|fermeture|fin))/i.test(t)) {
        const ds = fullDates(p.lines[i + 1].text);
        if (ds.length >= 2) return { start: ds[0].iso, end: ds[1].iso };
      }
    }
  }
  // Two dates joined by "to" or a dash on the first page.
  for (const l of pages[0]?.lines || []) {
    const ds = fullDates(l.text);
    if (ds.length >= 2 && /\b(to|au|à|through)\b|[-–]/i.test(l.text.slice(ds[0].index, ds[1].index))) return { start: ds[0].iso, end: ds[1].iso };
  }
  // At least the date the statement was made.
  for (const l of all) {
    if (!/(statement date|date du relevé)/i.test(l.text)) continue;
    const ds = fullDates(l.text);
    if (ds.length) return { start: null, end: ds[0].iso };
  }
  return { start: null, end: null };
}

// ── The check ───────────────────────────────────────────────────────────────

const cents = (v) => Math.round((Number(v) || 0) * 100);

/**
 * Whether the lines take the opening balance to the closing one. The direction
 * is whichever way balances: a card statement prints what is owed and adds the
 * charges, and the rare statement printing the other way round is still read
 * correctly instead of every line coming out backwards.
 */
export function balanceCheck(opening, closing, deltas) {
  if (opening == null || closing == null) return { ok: null, direction: 1, gap: null };
  const sum = (deltas || []).reduce((s, d) => s + cents(d), 0);
  const want = cents(closing) - cents(opening);
  if (sum === want) return { ok: true, direction: 1, gap: 0 };
  if (-sum === want && sum !== 0) return { ok: true, direction: -1, gap: 0 };
  return { ok: false, direction: 1, gap: (want - sum) / 100 };
}

// ── The statement ───────────────────────────────────────────────────────────

const LINE_START = /^([A-Za-zÀ-ÿ]{3,9}\.?\s+\d{1,2}(?!\d)|\d{1,2}\s+[A-Za-zÀ-ÿ]{3,9}\.?)/;
const TOTAL_RE = /\b(sub-?total|total|sous-total|subtotal|balance|solde)\b/i;
const HOLDER_RE = /(card ?number|numéro de (la )?carte)/i;

export function parseStatementPdf(items) {
  const pages = buildLines(items);
  const text = pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n');
  const bank = /american express|americanexpress/i.test(text) ? 'amex'
    : /\bBMO\b|bank of montreal|banque de montréal/i.test(text) ? 'bmo'
    : /\bTD\b.*(visa|aeroplan|canada trust)|TD CANADA TRUST/i.test(text) ? 'td'
    : 'other';

  const period = findPeriod(pages);
  let opening = null, closing = null, printedPayments = null, printedPurchases = null;
  for (const p of pages) {
    for (const l of p.lines) {
      if (OPENING_RE.test(l.text)) { if (opening == null) opening = amountAfterLabel(l, OPENING_RE); continue; }
      if (closing == null && CLOSING_RE.test(l.text)) closing = amountAfterLabel(l, CLOSING_RE);
      if (printedPayments == null && PAYMENTS_RE.test(l.text)) { const v = amountAfterLabel(l, PAYMENTS_RE); if (v != null) printedPayments = Math.abs(v); }
      if (printedPurchases == null && PURCHASES_RE.test(l.text)) { const v = amountAfterLabel(l, PURCHASES_RE); if (v != null) printedPurchases = Math.abs(v); }
    }
  }

  const rows = [];
  const columns = new Set();
  const holders = new Set();
  for (const p of pages) {
    let header = null;
    let holder = null;
    let last = null;
    for (const l of p.lines) {
      const h = findHeader(l);
      if (h) { header = h; last = null; continue; }
      if (!header) continue;

      if (HOLDER_RE.test(l.text)) {
        const name = l.cells[l.cells.length - 1].s;
        if (/^[A-Za-zÀ-ÿ' .-]{3,}$/.test(name) && !HOLDER_RE.test(name)) { holder = name.trim(); holders.add(holder); }
        last = null;
        continue;
      }

      // The date has to open the line: a sentence under the table that
      // happens to mention a date ("withdrawn on Sep. 22") is not a line.
      const dateText = l.cells.filter(c => c.x < header.dateMaxX).map(c => c.s).join(' ');
      const dates = l.cells[0].x < header.dateMaxX && dateText.length <= 32 && LINE_START.test(dateText)
        ? shortDates(dateText) : [];

      // The amounts on the line, each under the nearest amount title.
      const money = [];
      for (let i = 0; i < l.cells.length; i++) {
        const c = l.cells[i];
        if (c.x < header.moneyMinX || c.x < header.dateMaxX) continue;
        let v = moneyValue(c.s);
        if (v == null) continue;
        if (l.cells[i + 1] && /^CR$/i.test(l.cells[i + 1].s)) v = -v;
        const right = c.x + (c.w || c.s.length * 5);
        const col = header.money.reduce((best, m) => (Math.abs(m.right - right) < Math.abs(best.right - right) ? m : best), header.money[0]);
        money.push({ role: col.role, value: v, x: c.x });
      }

      // Totals and subtotals carry no date, so a dated line is always a line:
      // a merchant called TOTAL is still a purchase.
      if (dates.length) {
        const firstMoneyX = money.length ? Math.min(...money.map(m => m.x)) : Infinity;
        const description = l.cells
          .filter(c => c.x >= header.dateMaxX && c.x < firstMoneyX && !/^CR$/i.test(c.s))
          .map(c => c.s).join(' ').replace(/\s+/g, ' ').trim();
        const row = {
          date: resolveYear(dates[0].month, dates[0].day, period.end),
          postDate: dates[1] ? resolveYear(dates[1].month, dates[1].day, period.end) : null,
          description,
          amount: null, debit: null, credit: null, balance: null,
          note: '', cardholder: holder, page: p.page,
        };
        for (const m of money) { row[m.role] = m.value; columns.add(m.role); }
        rows.push(row);
        last = { row, cy: l.cy };
        continue;
      }

      // A line under a line, with no date: its reference, its currency
      // conversion, or the end of a description too long for one line.
      // Only inside the table: a bank's reference codes down the margin fall
      // between lines too.
      const tableRight = Math.max(...header.money.map(m => m.right)) + 40;
      if (last && l.cy - last.cy <= 12 && !TOTAL_RE.test(l.text) && l.cells[0].x >= header.dateMaxX - 2
          && l.cells.every(c => c.x < tableRight)) {
        const hasAmount = money.length > 0;
        if (!hasAmount) {
          last.row.note = (last.row.note ? last.row.note + ' ' : '') + l.text.trim();
          last.cy = l.cy;
          continue;
        }
        // An amount printed on the line below its description.
        if (last.row.amount == null && last.row.debit == null && last.row.credit == null) {
          for (const m of money) { last.row[m.role] = m.value; columns.add(m.role); }
          last.cy = l.cy;
          continue;
        }
      }
      last = null;
    }
  }

  // A dated line that never found an amount was not a transaction.
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.amount == null && r.debit == null && r.credit == null) rows.splice(i, 1);
  }

  // Each line's effect on the balance the statement prints.
  const deltaOf = (r) => (r.amount != null ? r.amount : (r.credit || 0) - (r.debit || 0));
  const check = balanceCheck(opening, closing, rows.map(deltaOf));
  const charges = rows.map(deltaOf).map(d => d * check.direction);
  const found = {
    payments: charges.filter(d => d < 0).reduce((s, d) => s - d, 0),
    purchases: charges.filter(d => d > 0).reduce((s, d) => s + d, 0),
  };

  // The rebuilt table, for the operator to look over and correct.
  const moneyCols = ['amount', 'debit', 'credit', 'balance'].filter(c => columns.has(c));
  const table = rows.map(r => [
    r.date || '', r.postDate || '', r.description,
    ...moneyCols.map(c => (r[c] == null ? '' : r[c].toFixed(2))),
  ]);

  return {
    bank,
    period,
    opening,
    closing,
    printed: { payments: printedPayments, purchases: printedPurchases },
    found: { payments: Math.round(found.payments * 100) / 100, purchases: Math.round(found.purchases * 100) / 100 },
    check,
    rows: rows.map(r => ({ ...r, delta: Math.round(deltaOf(r) * check.direction * 100) / 100 })),
    columns: ['date', 'postDate', 'description', ...moneyCols],
    table,
    cardholders: [...holders],
    hasText: pages.some(p => p.lines.length > 0),
  };
}
