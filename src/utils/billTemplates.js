// ── SUPPLIER BILL LAYOUTS ────────────────────────────────────────────────────
// A supplier sends the same invoice layout every time. When the operator points
// at the right value for a field, the label printed beside it ("Total CAD:") is
// remembered for that supplier, and the next bill from them is read that way.
// The expense account chosen last time is remembered too, so a supplier whose
// bills always go to the same account arrives pre-filled.
//
// Stored under one storage key as { [supplierKey]: template }.

export const BILL_TEMPLATES_KEY = 'dicann-bill-templates';

const letters = (s) => (String(s).match(/[A-Za-zÀ-ÿ]/g) || []).length;
const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Registration numbers identify a supplier better than a name a reader can
// spell two ways; the name is the fallback.
export function supplierKey({ gstNumber, qstNumber, supplier } = {}) {
  if (gstNumber) return `gst:${gstNumber}`;
  if (qstNumber) return `qst:${qstNumber}`;
  const n = normName(supplier);
  return n ? `name:${n}` : null;
}

export function findTemplate(templates, fields = {}) {
  const all = Object.values(templates || {});
  const gst = fields.gstNumber?.value;
  const qst = fields.qstNumber?.value;
  const name = normName(fields.supplier?.value);
  return all.find(t => (gst && t.gstNumber === gst) || (qst && t.qstNumber === qst))
    || (name ? all.find(t => (t.names || []).includes(name)) : null)
    || null;
}

const trimLabel = (s) => String(s).replace(/\s{2,}/g, ' ').trim().slice(-40);

/**
 * The label beside a word the operator picked: text before it in the same phrase,
 * the phrase just left of it on the line, or the phrase directly above it.
 * Returns { label, where } or null when nothing label-like is near.
 */
export function anchorForPick(lines, lineIndex, tokenIndex) {
  const line = lines?.[lineIndex];
  const tok = line?.tokens?.[tokenIndex];
  if (!tok) return null;
  const pi = line.phrases.findIndex(p => p.tokens.includes(tok));
  const phrase = line.phrases[pi];
  const before = phrase.tokens.slice(0, phrase.tokens.indexOf(tok)).map(t => t.str).join(' ');
  if (letters(before) >= 2) return { label: trimLabel(before), where: 'right' };
  const left = line.phrases[pi - 1];
  if (left && letters(left.text) >= 2 && tok.x - left.right < 320) return { label: trimLabel(left.text), where: 'right' };
  const above = lines[lineIndex - 1];
  if (above && above.page === line.page) {
    const near = [...above.phrases].sort((a, b) => Math.abs(a.x - tok.x) - Math.abs(b.x - tok.x))[0];
    if (near && letters(near.text) >= 2 && Math.abs(near.x - tok.x) <= 150) return { label: trimLabel(near.text), where: 'below' };
  }
  return null;
}

/**
 * Updates the stored layouts after a bill is saved.
 * read: the parser's fields; saved: { supplier_name, coa_account_id }; picks: { field: anchor }.
 */
export function rememberBill(templates, { read = {}, saved = {}, picks = {}, now = new Date().toISOString() } = {}) {
  const identity = {
    gstNumber: read.gstNumber?.value || null,
    qstNumber: read.qstNumber?.value || null,
    supplier: saved.supplier_name || read.supplier?.value || '',
  };
  const key = supplierKey(identity);
  if (!key) return templates || {};
  const existing = findTemplate(templates, read) || (templates || {})[key] || {};
  const names = new Set(existing.names || []);
  for (const n of [read.supplier?.value, saved.supplier_name]) if (normName(n)) names.add(normName(n));
  const fields = { ...(existing.fields || {}) };
  for (const [field, anchor] of Object.entries(picks || {})) if (anchor?.label) fields[field] = anchor;

  const next = { ...(templates || {}) };
  for (const [k, t] of Object.entries(next)) if (t === existing && k !== key) delete next[k];
  next[key] = {
    ...existing,
    supplierName: saved.supplier_name || existing.supplierName || identity.supplier,
    gstNumber: identity.gstNumber || existing.gstNumber || null,
    qstNumber: identity.qstNumber || existing.qstNumber || null,
    names: [...names],
    fields,
    ...(saved.coa_account_id ? { coaAccountId: Number(saved.coa_account_id) } : {}),
    updatedAt: now,
  };
  return next;
}
