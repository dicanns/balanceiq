// ── SUPPLIER BILL PARSER ─────────────────────────────────────────────────────
// Reads the text of a supplier invoice and proposes the handful of fields the
// bill form needs. It proposes; it never decides. Every field comes back with the
// snippet it came from so the operator can see what was read and correct it, and
// anything not found comes back null rather than guessed - a wrong number typed
// in confidently is worse than a blank box.
//
// Quebec invoices are unusually easy to read because the tax lines are labelled
// and the registration numbers have fixed shapes. That is what this leans on,
// rather than trying to understand the document.

const MONTHS_FR = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};
const MONTHS_EN = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// "1 234,56" and "1,234.56" are the same number written two ways, and both turn
// up on Quebec invoices - often on the same one.
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/[\s $]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const AMOUNT_RE = String.raw`\$?\s*(-?[\d]{1,3}(?:[  ,.]\d{3})*(?:[.,]\d{2})|-?\d+[.,]\d{2}|-?\d+)`;

// The last match wins: invoices repeat their totals in a summary block at the
// foot, and that block is the one that is actually right.
//
// Two things have to be stepped over. A tax line usually prints its rate next to
// the label - "T.P.S. (5%)  7,00" - and the 5 is not the amount; and a rate can
// appear bare - "TVQ 9,975%  13,97" - so an amount immediately followed by a per
// cent sign is a rate, never a figure.
function findLabelled(text, labels) {
  const alts = labels.join('|');
  const rate = String.raw`(?:\s*\(?\s*\d{1,2}(?:[.,]\d{1,3})?\s*%\s*\)?)?`;
  const re = new RegExp(`(?:${alts})${rate}[^\\n\\r]{0,40}?${AMOUNT_RE}(?!\\s*%)`, 'gi');
  let m, last = null;
  while ((m = re.exec(text)) !== null) last = m;
  if (!last) return null;
  const value = parseAmount(last[1]);
  return value == null ? null : { value, evidence: last[0].trim().slice(0, 80) };
}

export function findDate(text) {
  // ISO first: unambiguous, and what a machine-generated invoice usually prints.
  let m = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(text);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // "15 mars 2026" / "March 15, 2026"
  m = /\b(\d{1,2})(?:er)?\s+([a-zA-Zéû]+)\s+(20\d{2})\b/.exec(text);
  if (m) {
    const mo = MONTHS_FR[m[2].toLowerCase()] || MONTHS_EN[m[2].toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[1]);
  }
  m = /\b([a-zA-Z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/.exec(text);
  if (m) {
    const mo = MONTHS_EN[m[1].toLowerCase()] || MONTHS_FR[m[1].toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[2]);
  }

  // dd/mm/yyyy. Quebec writes day first, so that is the reading used, except
  // where the first number can only be a month.
  m = /\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/.exec(text);
  if (m) {
    let d = +m[1], mo = +m[2];
    if (d > 12 && mo <= 12) { /* day first, as written */ }
    else if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    return iso(+m[3], mo, d);
  }
  return null;
}

function iso(y, m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// A GST number is 9 digits then RT0001; a QST number is 10 digits then TQ0001.
// Finding them is the strongest signal that this really is a Quebec invoice, and
// their position is usually right beside the supplier's name.
export function findRegistrationNumbers(text) {
  const gst = /\b(\d{9})\s?RT\s?(\d{4})\b/i.exec(text);
  const qst = /\b(\d{10})\s?TQ\s?(\d{4})\b/i.exec(text);
  return {
    gstNumber: gst ? `${gst[1]}RT${gst[2]}` : null,
    qstNumber: qst ? `${qst[1]}TQ${qst[2]}` : null,
  };
}

// The supplier's name is the one field with no label to anchor on. The first
// substantial line of a letterhead is the best available guess, and it is
// offered as exactly that - a guess in an editable box.
export function findSupplier(text) {
  const NOISE = /^(facture|invoice|bill|re[çc]u|receipt|statement|[ée]tat|page|date|no\b|n[°o]\b|tel|t[ée]l|fax|www|http|courriel|email|adresse|address|client|customer|vendu|sold|ship|liv)/i;
  for (const raw of String(text).split(/[\r\n]+/).slice(0, 14)) {
    const line = raw.trim().replace(/\s{2,}/g, ' ');
    if (line.length < 3 || line.length > 60) continue;
    if (NOISE.test(line)) continue;
    if (!/[A-Za-zÀ-ÿ]{3}/.test(line)) continue;       // needs real letters
    if ((line.match(/\d/g) || []).length > line.length / 3) continue;  // mostly digits
    return line;
  }
  return null;
}

export function findInvoiceNumber(text) {
  const re = /(?:facture|invoice|inv|no\.?|n[°o]\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,19})\b/gi;
  let m, best = null;
  while ((m = re.exec(text)) !== null) {
    const v = m[1].toUpperCase();
    if (/^(20\d{2}|TPS|TVQ|GST|QST|RT\d+|TQ\d+)$/.test(v)) continue;   // dates and tax ids
    if (!/\d/.test(v)) continue;                                        // must carry a digit
    if (!best) best = v;
  }
  return best;
}

// Labels are matched in both languages and in the abbreviations that actually
// appear: "T.P.S.", "GST/HST", "5%" beside the amount.
const TPS_LABELS = [
  String.raw`T\.?\s?P\.?\s?S\.?`, String.raw`GST`, String.raw`HST`, String.raw`TVH`,
];
const TVQ_LABELS = [
  String.raw`T\.?\s?V\.?\s?Q\.?`, String.raw`QST`, String.raw`PST`,
];
const TOTAL_LABELS = [
  String.raw`total\s+[àa]\s+payer`, String.raw`montant\s+d[ûu]`, String.raw`solde\s+[àa]\s+payer`,
  String.raw`amount\s+due`, String.raw`balance\s+due`, String.raw`total\s+due`,
  String.raw`grand\s+total`, String.raw`total\s+TTC`, String.raw`total`,
];
const SUBTOTAL_LABELS = [
  String.raw`sous[-\s]?total`, String.raw`subtotal`, String.raw`sub[-\s]total`, String.raw`total\s+avant\s+taxes`,
];

/**
 * Reads an invoice's text and proposes what the bill form should contain.
 * Returns { fields, warnings, looksLikeInvoice } where every field is
 * { value, evidence } or null - never a bare value, so the UI can always show
 * what a number was read from.
 */
export function parseBillText(text) {
  const t = String(text || '');
  const warnings = [];

  const tps = findLabelled(t, TPS_LABELS);
  const tvq = findLabelled(t, TVQ_LABELS);
  const total = findLabelled(t, TOTAL_LABELS);
  const subtotal = findLabelled(t, SUBTOTAL_LABELS);
  const date = findDate(t);
  const reg = findRegistrationNumbers(t);
  const supplier = findSupplier(t);
  const invoiceNumber = findInvoiceNumber(t);

  // A total that does not equal subtotal plus the taxes means something was
  // misread. Saying so is more useful than silently proposing a wrong figure.
  if (total && subtotal) {
    const expected = subtotal.value + (tps?.value || 0) + (tvq?.value || 0);
    if (Math.abs(expected - total.value) > 0.02) {
      warnings.push({ code: 'total_mismatch', expected: Math.round(expected * 100) / 100, found: total.value });
    }
  }
  // Quebec rates, as a sanity check on the two tax figures against each other.
  if (tps?.value && tvq?.value) {
    const ratio = tvq.value / tps.value;
    if (ratio < 1.6 || ratio > 2.4) warnings.push({ code: 'tax_ratio_odd', tps: tps.value, tvq: tvq.value });
  }
  if (total && tps?.value != null && tps.value > total.value) {
    warnings.push({ code: 'tax_exceeds_total' });
  }
  if (!total) warnings.push({ code: 'no_total' });

  const signals = [!!tps, !!tvq, !!total, !!date, !!reg.gstNumber, !!reg.qstNumber].filter(Boolean).length;

  return {
    looksLikeInvoice: signals >= 2,
    fields: {
      supplier: supplier ? { value: supplier, evidence: supplier } : null,
      invoiceNumber: invoiceNumber ? { value: invoiceNumber, evidence: invoiceNumber } : null,
      billDate: date ? { value: date, evidence: date } : null,
      amount: total,
      tps,
      tvq,
      subtotal,
      gstNumber: reg.gstNumber ? { value: reg.gstNumber, evidence: reg.gstNumber } : null,
      qstNumber: reg.qstNumber ? { value: reg.qstNumber, evidence: reg.qstNumber } : null,
    },
    warnings,
  };
}
