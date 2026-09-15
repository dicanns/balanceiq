// ── SUPPLIER BILL PARSER ─────────────────────────────────────────────────────
// Reads a supplier invoice and proposes the fields the bill form needs. It
// proposes; it never decides. Every field comes back with the snippet it came
// from, and anything not found comes back null rather than guessed - a wrong
// number typed in confidently is worse than a blank box.
//
// It reads by layout, not by the order text happens to be stored in. A PDF keeps
// its text in whatever order its generator wrote it - one supplier's file starts
// with the table header, another's with the totals - so lines are rebuilt from
// where each word sits on the page. A value is then the thing beside its label:
// to the right on the same line, or directly below. That is what keeps a weight
// in pounds out of the total, a GST registration number out of the tax paid, and
// a tariff code out of the invoice number.
//
// Input is either { items: [{ str, x, y, w, h, page }] } with a top-left origin
// (what the main process sends for PDFs and photos) or plain text.

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
  let s = String(raw).replace(/[\s $]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function findDate(text) {
  // ISO first: unambiguous, and what a machine-generated invoice usually prints.
  let m = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(text);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // "15 mars 2026" / "March 15, 2026"
  m = /\b(\d{1,2})(?:er)?\s+([a-zA-Zéû]+)\.?\s+(20\d{2})\b/.exec(text);
  if (m) {
    const mo = MONTHS_FR[m[2].toLowerCase()] || MONTHS_EN[m[2].toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[1]);
  }
  m = /\b([a-zA-Z]+)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/.exec(text);
  if (m) {
    const mo = MONTHS_EN[m[1].toLowerCase()] || MONTHS_FR[m[1].toLowerCase()];
    if (mo) return iso(+m[3], mo, +m[2]);
  }

  // dd/mm/yyyy. Quebec writes day first, so that is the reading used, except
  // where the first number can only be a month.
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/.exec(text);
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    return iso(+m[3], mo, d);
  }
  return null;
}

function iso(y, m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// A GST number is 9 digits then RT0001; a QST number is 10 digits then TQ0001.
export function findRegistrationNumbers(text) {
  const gst = /\b(\d{9})\s?RT\s?(\d{4})\b/i.exec(text);
  const qst = /\b(\d{10})\s?TQ\s?(\d{4})\b/i.exec(text);
  return {
    gstNumber: gst ? `${gst[1]}RT${gst[2]}` : null,
    qstNumber: qst ? `${qst[1]}TQ${qst[2]}` : null,
  };
}

// ── Layout ──────────────────────────────────────────────────────────────────

const letters = (s) => (String(s).match(/[A-Za-zÀ-ÿ]/g) || []).length;

// A text item can hold several words; each word gets its own approximate box so
// a value can be told apart from the label printed in the same item.
export function tokensFromItems(items) {
  const tokens = [];
  for (const it of items || []) {
    const str = String(it?.str ?? '');
    if (!str.trim()) continue;
    const h = +it.h || 8;
    const charW = (+it.w > 0 ? +it.w : str.length * h * 0.5) / Math.max(1, str.length);
    let from = 0;
    for (const word of str.split(/\s+/).filter(Boolean)) {
      const at = str.indexOf(word, from);
      from = at + word.length;
      tokens.push({ str: word, x: (+it.x || 0) + at * charW, w: word.length * charW, y: +it.y || 0, h, page: +it.page || 1 });
    }
  }
  return tokens;
}

// Plain text keeps its spacing as geometry: one space joins words into a phrase,
// two or more separate phrases, the way columns are laid out in a text export.
export function tokensFromText(text) {
  const tokens = [];
  String(text || '').split(/\r?\n/).forEach((line, li) => {
    const re = /\S+/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      tokens.push({ str: m[0], x: m.index * 5, w: m[0].length * 5, y: li * 12, h: 10, page: 1 });
    }
  });
  return tokens;
}

export function buildLines(tokens) {
  const sorted = [...(tokens || [])].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines = [];
  for (const tok of sorted) {
    const line = lines[lines.length - 1];
    const tol = Math.max(3, tok.h * 0.5);
    if (line && line.page === tok.page && Math.abs(line.y - tok.y) <= tol) line.tokens.push(tok);
    else lines.push({ page: tok.page, y: tok.y, tokens: [tok] });
  }
  for (const line of lines) {
    line.tokens.sort((a, b) => a.x - b.x);
    let offset = 0;
    for (const tok of line.tokens) { tok.start = offset; offset += tok.str.length + 1; }
    line.text = line.tokens.map(t => t.str).join(' ');
    line.phrases = [];
    let cur = null;
    for (const tok of line.tokens) {
      const gap = cur ? tok.x - cur.right : Infinity;
      if (cur && gap <= Math.max(4, tok.h * 0.9)) {
        cur.tokens.push(tok); cur.right = tok.x + tok.w;
      } else {
        cur = { tokens: [tok], x: tok.x, right: tok.x + tok.w };
        line.phrases.push(cur);
      }
    }
    for (const p of line.phrases) p.text = p.tokens.map(t => t.str).join(' ');
  }
  return lines;
}

export function documentLines(doc) {
  if (doc && typeof doc === 'object' && Array.isArray(doc.items) && doc.items.length) {
    return buildLines(tokensFromItems(doc.items));
  }
  return buildLines(tokensFromText(typeof doc === 'string' ? doc : doc?.text || ''));
}

// ── Values beside labels ────────────────────────────────────────────────────

// Another label ("Tax/Taxe:") ends the search for this one's value.
const isLabelToken = (t) => letters(t.str) > 0 && /:$/.test(t.str);
const isRate = (s) => /^\(?\d{1,2}(?:[.,]\d{1,3})?\s*%\)?$/.test(s) || s === '%';

function readValue(tokens, kind) {
  for (let i = 0; i < Math.min(tokens.length, 8); i++) {
    const tok = tokens[i];
    if (isLabelToken(tok)) break;
    const s = tok.str;

    if (kind === 'amount') {
      if (isRate(s) || /^(\$|CAD|CA\$|\$CA)$/i.test(s)) continue;
      let raw = s.replace(/^\$|\$$/g, '');
      const next = tokens[i + 1]?.str || '';
      // "1 234,56" arrives as two words
      if (/^\d{1,3}$/.test(raw) && /^\d{3}[.,]\d{2}\$?$/.test(next)) raw = raw + next.replace(/\$$/, '');
      if (!/^-?\(?\d[\d,.]*\)?$/.test(raw)) continue;
      // A registration number (followed by RT or TQ) or a long whole number
      // (a tariff code, a phone number) is never a dollar figure.
      if (/^(RT|TQ)/i.test(next)) continue;
      if (!/[.,]\d{2}\)?$/.test(raw) && raw.replace(/\D/g, '').length >= 6) continue;
      const value = parseAmount(raw);
      if (value != null) return { value, raw, token: tok };
    } else if (kind === 'date') {
      const joined = tokens.slice(i, i + 3).map(t => t.str).join(' ');
      const d = findDate(joined);
      if (d) return { value: d, raw: joined, token: tok };
    } else if (kind === 'code') {
      const raw = s.replace(/^[#:]+|[,.;:]+$/g, '');
      // A bare year is never an invoice number, and neither is a registration suffix.
      if (/^[A-Z0-9][A-Z0-9\-/]{2,19}$/i.test(raw) && /\d/.test(raw) && !/^(RT|TQ)\d*$/i.test(raw) && !/^(19|20)\d{2}$/.test(raw)) {
        return { value: raw.toUpperCase(), raw, token: tok };
      }
    } else if (kind === 'text') {
      if (letters(s) === 0) continue;
      return { value: s, raw: s, token: tok };
    }
  }
  return null;
}

function tokensBelow(lines, li, labelTokens) {
  const below = lines[li + 1];
  if (!below || below.page !== lines[li].page || !labelTokens.length) return [];
  const x0 = labelTokens[0].x - 20;
  const x1 = labelTokens[labelTokens.length - 1].x + labelTokens[labelTokens.length - 1].w + 60;
  return below.tokens.filter(t => t.x + t.w >= x0 && t.x <= x1);
}

/**
 * Every value found beside a label, in reading order. `labelRe` is matched
 * against each rebuilt line; the value is read from the words after the label
 * on that line, or from the words directly under the label on the next line.
 */
export function scanLabel(lines, labelRe, kind, { excludeLine = null, below = true } = {}) {
  const out = [];
  lines.forEach((line, li) => {
    if (excludeLine && excludeLine.test(line.text)) return;
    const re = new RegExp(labelRe.source, labelRe.flags.includes('g') ? labelRe.flags : labelRe.flags + 'g');
    let m;
    while ((m = re.exec(line.text)) !== null) {
      if (!m[0].length) { re.lastIndex++; continue; }
      const end = m.index + m[0].length;
      const labelTokens = line.tokens.filter(t => t.start < end && t.start + t.str.length > m.index);
      // A label can end inside a word - "INVOICE #INV-3392" - and the rest of
      // that word is the value.
      const after = [];
      for (const t of line.tokens) {
        if (t.start >= end) after.push(t);
        else if (t.start + t.str.length > end) after.push({ ...t, str: t.str.slice(end - t.start) });
      }
      let v = readValue(after, kind);
      if (!v && below) v = readValue(tokensBelow(lines, li, labelTokens), kind);
      if (v) out.push({ value: v.value, evidence: `${m[0].trim()} ${v.raw}`.slice(0, 80), line: li });
    }
  });
  return out;
}

// ── Labels ──────────────────────────────────────────────────────────────────

const TPS_LABEL = /\bT\.?\s?P\.?\s?S\.?(?![A-Za-z])|\bGST\b|\bHST\b|\bTVH\b/i;
const TVQ_LABEL = /\bT\.?\s?V\.?\s?Q\.?(?![A-Za-z])|\bQST\b|\bPST\b/i;
const TAX_LABEL = /\btax(?:e|es)?\b(?:\s*\/\s*taxes?)?\s*:?/i;
const SUBTOTAL_LABEL = /\b(?:sous[-\s]?total|sub[-\s]?total|total\s+avant\s+taxes|montant\s+avant\s+taxes)(?:\s*\/\s*(?:sous[-\s]?total|sub[-\s]?total))?\s*:?/i;
const STRONG_TOTAL = /\b(?:total\s+[àa]\s+payer|montant\s+d[ûu]|solde\s+[àa]\s+payer|amount\s+due|balance\s+due|total\s+due|grand\s+total|total\s+(?:cad|ttc)|total\s+de\s+la\s+facture|invoice\s+total)\s*:?/i;
const BARE_TOTAL = /\btotal\s*:?/i;
// Lines that say "total" without being the invoice total.
const NOT_A_TOTAL = /sous[-\s]?total|sub[-\s]?total|poids|weight|\bkg\b|\blbs?\b|caisses|cases|quantit|\bqty\b|\bitems?\b|articles|heures|hours|colis|boxes/i;
const INVOICE_NO_LABEL = /\b(?:invoice\s*(?:no\.?|number|num\.?|#)|no\.?\s*(?:de\s+)?(?:la\s+)?facture|facture\s*(?:no\.?|n[°o]\.?|#|num[ée]ro)|num[ée]ro\s+de\s+facture|inv\.?\s*#)\s*[:#]?/i;
const GENERIC_NO_LABEL = /(?:#|\bno\.?|\bn[°o]\.?)\s*[:#]?/i;
const NOT_AN_INVOICE_NO = /\bp\.?\s*o\.?\b|order|commande|client|customer|\bitem|hs\s*#|t[ée]l|phone|fax|compte|account|tps|tvq|gst|qst|lot\b/i;
const BILL_DATE_LABEL = /\b(?:invoice\s+date|date\s+(?:de\s+)?(?:la\s+)?facture|date\s+facture|bill\s+date|date\s+d['’]?[ée]mission)\s*:?/i;
const DUE_LABEL = /\b(?:due\s+date|date\s+due|date\s+d['’]?[ée]ch[ée]ance|[ée]ch[ée]ance|payable\s+(?:by|le|avant)|pay\s+by)\s*:?/i;

const REMIT_LABEL = /\b(?:remit\s+to|payer\s+[àa]|payable\s+to|cheques?\s+payable|make\s+cheques?)/i;
const BUYER_LABEL = /\b(?:sold\s*to|vendu\s*[àa]|bill\s*to|factur[ée]\s*[àa]|ship(?:ped)?\s*to|exp[ée]di[ée]z?\s*[àa]|livr[ée]\s*[àa]|deliver\s*to|client\s*:|customer\s*:)/i;
const COMPANY_SUFFIX = /\b(?:inc|lt[ée]e|ltd|limited|limit[ée]e|corp|corporation|enr|s\.?e\.?n\.?c|llc|co)\.?$/i;
const NOISE = /^(facture|invoice|bill|re[çc]u|receipt|statement|[ée]tat|page|date|no\b|n[°o]\b|tel|t[ée]l|fax|www|http|courriel|email|adresse|address|client|customer|vendu|sold|ship|liv|qt[ée]|qty|quantit|description|format|unit|prix|price|montant|amount|total|sous|sub|tax|remit|payer|terms|conditions|due|p\.?o\b|order|commande)/i;

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Addresses printed after "Sold to" or "Ship to" belong to the buyer - often the
// operator's own company - and are never the supplier.
function buyerZones(lines) {
  const zones = [];
  lines.forEach((line, li) => {
    for (const p of line.phrases) {
      if (!BUYER_LABEL.test(p.text)) continue;
      zones.push({ page: line.page, from: li, to: li + 6, x0: p.x - 30, x1: p.x + Math.max(220, (p.right - p.x) * 4) });
    }
  });
  return zones;
}

export function findSupplierInLines(lines, { ownNames = [] } = {}) {
  if (!lines.length) return null;
  const zones = buyerZones(lines);
  const own = ownNames.map(normName).filter(Boolean);
  const usable = (li, p) =>
    letters(p.text) >= 3 && !/:\s*$/.test(p.text) && !BUYER_LABEL.test(p.text)
    && !zones.some(z => z.page === lines[li].page && li > z.from && li <= z.to && p.x >= z.x0 && p.x <= z.x1)
    && !own.includes(normName(p.text));
  const firstPage = lines[0].page;
  const top = lines.map((l, i) => i).filter(i => lines[i].page === firstPage);
  const topCount = Math.max(8, Math.ceil(top.length * 0.3));
  const clean = (s) => s.replace(/\s{2,}/g, ' ').trim();

  // 1. A company name in the letterhead: "... Inc", "... Ltée".
  for (const li of top.slice(0, topCount)) {
    for (const p of lines[li].phrases) {
      if (usable(li, p) && COMPANY_SUFFIX.test(p.text.trim()) && p.text.trim().split(/\s+/).length >= 2) {
        return { value: clean(p.text), evidence: p.text };
      }
    }
  }

  // 2. Who to pay: "Please remit to / SVP payer à:" and the name after or under it.
  for (let li = 0; li < lines.length; li++) {
    const phrases = lines[li].phrases;
    for (let pi = 0; pi < phrases.length; pi++) {
      const p = phrases[pi];
      const m = REMIT_LABEL.exec(p.text);
      if (!m) continue;
      let rest = p.text.slice(m.index + m[0].length);
      rest = rest.includes(':') ? rest.slice(rest.lastIndexOf(':') + 1) : rest.replace(/^[\s/]+/, '');
      if (letters(rest) >= 3) return { value: clean(rest), evidence: p.text };
      const after = phrases[pi + 1];
      if (after && usable(li, after) && after.x - p.right < 60) return { value: clean(after.text), evidence: `${p.text} ${after.text}` };
      const below = lines[li + 1];
      if (below && below.page === lines[li].page) {
        const near = below.phrases
          .filter(q => usable(li + 1, q) && Math.abs(q.x - p.x) <= 150)
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
        if (near) return { value: clean(near.text), evidence: `${p.text} ${near.text}` };
      }
    }
  }

  // 3. The first substantial line of the letterhead, offered as the guess it is.
  for (const li of top.slice(0, topCount)) {
    for (const p of lines[li].phrases) {
      const s = p.text.trim();
      if (!usable(li, p) || s.length > 60 || NOISE.test(s)) continue;
      if ((s.match(/\d/g) || []).length > s.length / 3) continue;
      return { value: clean(s), evidence: s };
    }
  }
  return null;
}

// Kept for callers that only have text.
export function findSupplier(text) {
  return findSupplierInLines(documentLines(String(text || '')))?.value ?? null;
}

export function findInvoiceNumber(text) {
  const lines = documentLines(String(text || ''));
  return (scanLabel(lines, INVOICE_NO_LABEL, 'code')[0]
    || scanLabel(lines, GENERIC_NO_LABEL, 'code', { excludeLine: NOT_AN_INVOICE_NO, below: false })[0])?.value ?? null;
}

// ── Line items ──────────────────────────────────────────────────────────────

const COLUMN = {
  shipped: /^(livr[ée]e?s?|shipped|exp[ée]di[ée]e?s?)\.?$/i,
  qty: /^(qt[ée]e?|qty|quantit[ée]s?|qte)\.?$/i,
  price: /^(prix|price|p\.?u\.?|tarif)\.?$/i,
  amount: /^(montant|amount|extension|ext)\.?$/i,
};
const NUMERIC = /^-?\$?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,4})?\$?$|^-?\$?\d+(?:[.,]\d{1,4})?\$?$/;
const END_OF_TABLE = /sous[-\s]?total|sub[-\s]?total|\btotal\b|poids|weight|remit|payer\s+[àa]/i;

/**
 * Rows of the item table: description, quantity, unit price and amount, read by
 * lining each number up under its column heading. Headings may be stacked over
 * two or three lines ("Livré / Shipped"). Returns [] when no table is found.
 */
export function findLineItems(lines) {
  for (let li = 0; li < lines.length; li++) {
    const band = [lines[li], lines[li + 1], lines[li + 2]]
      .filter(l => l && l.page === lines[li].page && l.y - lines[li].y <= lines[li].tokens[0].h * 4);
    const cols = {};
    for (const l of band) {
      for (const t of l.tokens) {
        for (const [key, re] of Object.entries(COLUMN)) {
          if (re.test(t.str)) (cols[key] ||= []).push(t.x + t.w / 2);
        }
      }
    }
    if (!cols.price || !cols.amount || !(cols.qty || cols.shipped)) continue;

    const centre = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const columns = [];
    if (cols.qty) columns.push({ key: cols.shipped ? 'ordered' : 'quantity', x: centre(cols.qty) });
    if (cols.shipped) columns.push({ key: 'quantity', x: centre(cols.shipped) });
    columns.push({ key: 'unitPrice', x: centre(cols.price) }, { key: 'amount', x: centre(cols.amount) });
    columns.sort((a, b) => a.x - b.x);
    const gaps = columns.slice(1).map((c, i) => c.x - columns[i].x);
    const tol = Math.min(90, Math.max(8, 0.6 * Math.min(...gaps)));
    const firstColX = columns[0].x - tol;

    const items = [];
    const lastBand = band[band.length - 1];
    for (let ri = lines.indexOf(lastBand) + 1; ri < Math.min(lines.length, lines.indexOf(lastBand) + 41); ri++) {
      const row = lines[ri];
      if (row.page !== lastBand.page || END_OF_TABLE.test(row.text)) break;
      const found = {};
      for (const t of row.tokens) {
        if (!NUMERIC.test(t.str)) continue;
        const cx = t.x + t.w / 2;
        const col = columns.map(c => ({ c, d: Math.abs(c.x - cx) })).sort((a, b) => a.d - b.d)[0];
        if (col.d <= tol && found[col.c.key] == null) found[col.c.key] = parseAmount(t.str.replace(/\$/g, ''));
      }
      if (found.amount == null && !(found.quantity != null && found.unitPrice != null)) continue;
      const description = row.phrases
        .filter(p => p.right <= firstColX && letters(p.text) >= 2 && !/^hs\s*#/i.test(p.text))
        .sort((a, b) => letters(b.text) - letters(a.text))[0]?.text || '';
      const amount = found.amount ?? Math.round(found.quantity * found.unitPrice * 100) / 100;
      items.push({ description, quantity: found.quantity ?? null, unitPrice: found.unitPrice ?? null, amount, line: ri });
    }
    if (items.length) return items;
  }
  return [];
}

// ── The whole bill ──────────────────────────────────────────────────────────

const KIND = {
  supplier: 'text', invoiceNumber: 'code', billDate: 'date', dueDate: 'date',
  subtotal: 'amount', tps: 'amount', tvq: 'amount', amount: 'amount', quantity: 'amount', unitCost: 'amount',
};
export const FIELD_KINDS = KIND;

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');

// A remembered label for one supplier's layout: { label, where: 'right' | 'below' }.
export function valueByAnchor(lines, anchor, kind) {
  if (!anchor?.label) return null;
  const re = new RegExp(escapeRe(anchor.label), 'i');
  if (kind === 'text') {
    for (let li = 0; li < lines.length; li++) {
      const phrases = lines[li].phrases;
      const pi = phrases.findIndex(p => re.test(p.text));
      if (pi < 0) continue;
      const target = anchor.where === 'below'
        ? (lines[li + 1]?.phrases || []).sort((a, b) => Math.abs(a.x - phrases[pi].x) - Math.abs(b.x - phrases[pi].x))[0]
        : phrases[pi + 1];
      if (target && letters(target.text) >= 2) return { value: target.text.trim(), evidence: `${anchor.label} ${target.text}`.slice(0, 80) };
    }
    return null;
  }
  const hits = scanLabel(lines, re, kind, { below: anchor.where === 'below' });
  return hits[0] ? { value: hits[0].value, evidence: hits[0].evidence } : null;
}

/**
 * Reads a bill. Returns { looksLikeInvoice, taxFree, fields, lineItems, warnings, lines }.
 * Every field is { value, evidence } or null; a field read through a supplier's
 * remembered layout also carries learned: true.
 */
export function parseBillDocument(doc, { template = null, ownNames = [] } = {}) {
  const lines = documentLines(doc);
  const text = lines.map(l => l.text).join('\n');
  const warnings = [];
  const first = (a) => (a.length ? { value: a[0].value, evidence: a[0].evidence } : null);
  const last = (a) => (a.length ? { value: a[a.length - 1].value, evidence: a[a.length - 1].evidence } : null);

  let tps = last(scanLabel(lines, TPS_LABEL, 'amount', { below: false }));
  let tvq = last(scanLabel(lines, TVQ_LABEL, 'amount', { below: false }));
  const subtotal = last(scanLabel(lines, SUBTOTAL_LABEL, 'amount'));
  const total = last(scanLabel(lines, STRONG_TOTAL, 'amount'))
    || last(scanLabel(lines, BARE_TOTAL, 'amount', { excludeLine: NOT_A_TOTAL, below: false }));
  const generalTax = last(scanLabel(lines, TAX_LABEL, 'amount', { below: false }));

  const billDate = first(scanLabel(lines, BILL_DATE_LABEL, 'date'))
    || (findDate(text) ? { value: findDate(text), evidence: findDate(text) } : null);
  const dueDate = first(scanLabel(lines, DUE_LABEL, 'date'));
  const invoiceNumber = first(scanLabel(lines, INVOICE_NO_LABEL, 'code'))
    || first(scanLabel(lines, GENERIC_NO_LABEL, 'code', { excludeLine: NOT_AN_INVOICE_NO, below: false }));
  const reg = findRegistrationNumbers(text);
  const supplier = findSupplierInLines(lines, { ownNames });
  const lineItems = findLineItems(lines);

  // No GST or QST line, and either a tax line of zero or a total equal to the
  // subtotal: the goods are not taxable, and zero is the right thing to propose.
  let taxFree = false;
  if (!tps && !tvq) {
    const zeroTax = generalTax && generalTax.value === 0;
    const sameTotal = subtotal && total && Math.abs(subtotal.value - total.value) <= 0.01 && !(generalTax?.value > 0);
    if (zeroTax || sameTotal) {
      taxFree = true;
      const evidence = zeroTax ? generalTax.evidence : `${subtotal.evidence} = ${total.evidence}`;
      tps = { value: 0, evidence };
      tvq = { value: 0, evidence };
    }
  }

  const single = lineItems.length === 1 ? lineItems[0] : null;
  const fields = {
    supplier, invoiceNumber, billDate, dueDate,
    amount: total, tps, tvq, subtotal,
    gstNumber: reg.gstNumber ? { value: reg.gstNumber, evidence: reg.gstNumber } : null,
    qstNumber: reg.qstNumber ? { value: reg.qstNumber, evidence: reg.qstNumber } : null,
    quantity: single?.quantity != null ? { value: single.quantity, evidence: single.description } : null,
    unitCost: single?.unitPrice != null ? { value: single.unitPrice, evidence: single.description } : null,
  };

  // A layout this supplier's bills have been corrected to before wins over the
  // general rules, field by field.
  if (template?.fields) {
    for (const [key, anchor] of Object.entries(template.fields)) {
      if (!KIND[key]) continue;
      const v = valueByAnchor(lines, anchor, KIND[key]);
      if (v) fields[key] = { ...v, learned: true };
    }
  }

  const val = (k) => fields[k]?.value;
  if (val('amount') != null && val('subtotal') != null) {
    const expected = val('subtotal') + (val('tps') || 0) + (val('tvq') || 0);
    if (Math.abs(expected - val('amount')) > 0.02) {
      warnings.push({ code: 'total_mismatch', expected: Math.round(expected * 100) / 100, found: val('amount') });
    }
  }
  if (val('tps') && val('tvq')) {
    const ratio = val('tvq') / val('tps');
    if (ratio < 1.6 || ratio > 2.4) warnings.push({ code: 'tax_ratio_odd', tps: val('tps'), tvq: val('tvq') });
  }
  if (val('amount') != null && val('tps') != null && val('tps') > val('amount')) warnings.push({ code: 'tax_exceeds_total' });
  if (val('amount') == null) warnings.push({ code: 'no_total' });
  for (const it of lineItems) {
    if (it.quantity != null && it.unitPrice != null && Math.abs(it.quantity * it.unitPrice - it.amount) > 0.05) {
      warnings.push({ code: 'line_math', description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.amount });
    }
  }

  const signals = [val('tps') != null, val('tvq') != null, val('amount') != null, !!val('billDate'), !!reg.gstNumber, !!reg.qstNumber]
    .filter(Boolean).length;

  return { looksLikeInvoice: signals >= 2, taxFree, fields, lineItems, warnings, lines };
}

// Kept for callers that only have text.
export function parseBillText(text, opts) {
  return parseBillDocument(String(text || ''), opts);
}
