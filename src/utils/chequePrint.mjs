// Printing a cheque on pre-printed laser cheque stock (CPA Standard 006): the
// bank, account and coded line are already on the paper; only the date, payee,
// amounts and memo are printed, plus the two stubs. Positions are in inches from
// the top-left of the cheque's third of a letter page, then moved by the
// calibration nudge the owner sets per bank account.

export const CHEQUE_POSITIONS = ['top', 'middle', 'bottom'];
export const DATE_FORMATS = ['YYYYMMDD', 'DDMMYYYY', 'MMDDYYYY'];
export const DEFAULT_PRINT_SETTINGS = { position: 'top', dateFormat: 'YYYYMMDD', offsetXmm: 0, offsetYmm: 0, wordsLang: 'fr' };

const THIRD_IN = 11 / 3;
// Where each piece sits on a standard Canadian laser cheque.
export const CHEQUE_FIELDS = {
  date:    { x: 6.05, y: 0.62, digitGap: 0.235 },
  words:   { x: 0.55, y: 1.12, width: 6.3 },
  amount:  { x: 6.75, y: 1.12 },
  payee:   { x: 0.95, y: 1.55, width: 5.0 },
  memo:    { x: 0.55, y: 2.55, width: 3.6 },
};

// ── Amount in words ─────────────────────────────────────────────────────────
const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelowThousand(n) {
  const parts = [];
  if (n >= 100) { parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) parts.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ''));
  else if (n > 0) parts.push(EN_ONES[n]);
  return parts.join(' ');
}
function enWords(n) {
  if (n === 0) return 'zero';
  const out = [];
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= size) { out.push(`${enBelowThousand(Math.floor(n / size))} ${name}`); n %= size; }
  }
  if (n) out.push(enBelowThousand(n));
  return out.join(' ');
}

const FR_ONES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
  'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

// 0-99, traditional spelling: "vingt et un", "soixante-dix", "quatre-vingts".
// plural: whether "quatre-vingt" may take its s (only at the very end of the
// number, and not before "mille").
function frBelowHundred(n, plural) {
  if (n < 20) return FR_ONES[n];
  const t = Math.floor(n / 10), u = n % 10;
  if (t <= 6) return FR_TENS[t] + (u === 1 ? ' et un' : u ? `-${FR_ONES[u]}` : '');
  if (t === 7) return 'soixante' + (n === 71 ? ' et onze' : `-${FR_ONES[10 + u]}`);
  return 'quatre-vingt' + (n === 80 ? (plural ? 's' : '') : `-${FR_ONES[n - 80]}`);
}
function frBelowThousand(n, plural) {
  const h = Math.floor(n / 100), r = n % 100;
  const parts = [];
  if (h) parts.push(h === 1 ? 'cent' : `${FR_ONES[h]} cent${!r && plural ? 's' : ''}`);
  if (r) parts.push(frBelowHundred(r, plural));
  return parts.join(' ');
}
function frWords(n) {
  if (n === 0) return 'zéro';
  const out = [];
  const millions = Math.floor(n / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1e3;
  if (millions) out.push(`${frBelowThousand(millions, true)} million${millions > 1 ? 's' : ''}`);
  if (thousands) out.push(thousands === 1 ? 'mille' : `${frBelowThousand(thousands, false)} mille`);
  if (rest) out.push(frBelowThousand(rest, true));
  return out.join(' ');
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "One thousand two hundred thirty-four and 56/100" / "Mille deux cent trente-quatre et 56/100".
export function amountInWords(cents, lang = 'fr') {
  const c = Math.max(0, Math.round(Number(cents) || 0));
  const dollars = Math.floor(c / 100);
  const rest = String(c % 100).padStart(2, '0');
  return lang === 'en' ? `${cap(enWords(dollars))} and ${rest}/100` : `${cap(frWords(dollars))} et ${rest}/100`;
}

// The figure in the amount box, guarded so nothing can be written in front of it.
export function amountFigure(cents) {
  const c = Math.round(Number(cents) || 0);
  const [d, r] = (c / 100).toFixed(2).split('.');
  return `**${d.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${r}`;
}

// The eight digits for the date boxes, in the order the stock's guide shows.
export function dateDigits(iso, format = 'YYYYMMDD') {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!y || !m || !d) return [];
  const s = format === 'DDMMYYYY' ? d + m + y : format === 'MMDDYYYY' ? m + d + y : y + m + d;
  return s.split('');
}

// ── Page ────────────────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = (cents) => (Math.round(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' $';

function settingsOf(s) {
  const o = { ...DEFAULT_PRINT_SETTINGS, ...(s || {}) };
  if (!CHEQUE_POSITIONS.includes(o.position)) o.position = 'top';
  if (!DATE_FORMATS.includes(o.dateFormat)) o.dateFormat = 'YYYYMMDD';
  o.offsetXmm = Number(o.offsetXmm) || 0;
  o.offsetYmm = Number(o.offsetYmm) || 0;
  return o;
}

function chequeBlock(ch, s, testMarks) {
  const F = CHEQUE_FIELDS;
  const at = (x, y, extra = '') => `position:absolute;left:${x}in;top:${y}in;${extra}`;
  const digits = dateDigits(ch.cheque_date, s.dateFormat)
    .map((dg, i) => `<span style="${at(F.date.x + i * F.date.digitGap, F.date.y, 'width:0.2in;text-align:center')}">${dg}</span>`).join('');
  const guide = testMarks ? [F.date, F.words, F.amount, F.payee, F.memo]
    .map(f => `<span style="${at(f.x, f.y - 0.04, 'width:0.06in;height:0.06in;background:#e11;border-radius:50%')}"></span>`).join('') : '';
  return `${guide}${digits}
    <div style="${at(F.words.x, F.words.y, `width:${F.words.width}in;white-space:nowrap;overflow:hidden`)}">${esc(amountInWords(ch.amount_cents, s.wordsLang))} ${'*'.repeat(60)}</div>
    <div style="${at(F.amount.x, F.amount.y, 'font-weight:bold')}">${esc(amountFigure(ch.amount_cents))}</div>
    <div style="${at(F.payee.x, F.payee.y, `width:${F.payee.width}in;white-space:nowrap;overflow:hidden`)}">${esc(ch.party_name || '')}</div>
    <div style="${at(F.memo.x, F.memo.y, `width:${F.memo.width}in;white-space:nowrap;overflow:hidden;font-size:9pt`)}">${esc(ch.memo || '')}</div>`;
}

function stubBlock(ch, labels) {
  return `<div style="position:absolute;left:0.5in;top:0.45in;right:0.5in;font-size:10pt;line-height:1.55">
    <div style="display:flex;justify-content:space-between;font-weight:bold"><span>${esc(labels.cheque)} ${esc(ch.cheque_number || '')}</span><span>${esc(ch.cheque_date || '')}</span></div>
    <div>${esc(labels.payee)}: ${esc(ch.party_name || '')}</div>
    <div>${esc(labels.amount)}: ${esc(money(ch.amount_cents))}</div>
    ${ch.forLabel ? `<div>${esc(labels.for)}: ${esc(ch.forLabel)}</div>` : ''}
    ${ch.memo ? `<div>${esc(labels.memo)}: ${esc(ch.memo)}</div>` : ''}
    ${ch.bank_account_name ? `<div style="color:#555">${esc(ch.bank_account_name)}</div>` : ''}
  </div>`;
}

// One letter page per cheque: the cheque in its third, a stub in each of the others.
// testMarks: a red dot where each field starts, for checking alignment on plain paper.
export function buildChequesHtml(cheques, settings, { labels, testMarks = false, title = 'Cheques' } = {}) {
  const s = settingsOf(settings);
  const L = { cheque: 'Cheque', payee: 'Pay to', amount: 'Amount', for: 'For', memo: 'Memo', ...(labels || {}) };
  const slot = CHEQUE_POSITIONS.indexOf(s.position);
  const pages = (cheques || []).map(ch => {
    const thirds = [0, 1, 2].map(i => {
      const inner = i === slot ? chequeBlock(ch, s, testMarks) : stubBlock(ch, L);
      return `<div style="position:absolute;left:0;top:${(i * THIRD_IN).toFixed(4)}in;width:8.5in;height:${THIRD_IN.toFixed(4)}in">${inner}</div>`;
    }).join('');
    return `<section class="page"><div style="position:absolute;left:${s.offsetXmm}mm;top:${s.offsetYmm}mm;width:8.5in;height:11in">${thirds}</div></section>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: letter; margin: 0 }
    html, body { margin: 0; padding: 0 }
    body { font: 11pt "Helvetica Neue", Arial, sans-serif; color: #000 }
    .page { position: relative; width: 8.5in; height: 11in; overflow: hidden; page-break-after: always }
    .page:last-child { page-break-after: auto }
  </style></head><body>${pages}</body></html>`;
}
