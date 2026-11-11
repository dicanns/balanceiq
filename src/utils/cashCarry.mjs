// The Encaisse (cash position) carry-forward, in one place. Each day opens with
// the previous day's closing (unless an opening override is set) and closes with
// opening + register cash sales + other receipts - bank deposits - payouts, or
// with the physical count when that day carries the count forward.
//
// The walk covers every day that has an Encaisse entry AND every day in between
// that has register cash sales, so a day with sales but no entry no longer drops
// out of the running balance.

const EMPTY_DAY = { openingOverride: null, autreEntrees: [], deposits: [], sorties: [], physicalCount: {}, carryForwardMode: 'calculated' };

export function registerCashFor(cDay) {
  let cashVentes = 0, totalInterac = 0, hasCaisseData = false;
  if (cDay && Array.isArray(cDay.cashes)) {
    for (const c of cDay.cashes) {
      if (c.finalCash != null && c.float != null) { cashVentes += (c.finalCash - c.float); hasCaisseData = true; }
      if (c.interac != null) { totalInterac += c.interac; hasCaisseData = true; }
    }
  }
  return { cashVentes, totalInterac, hasCaisseData };
}

// encaisseData: { 'YYYY-MM-DD': entry, '_meta': ... }, liveData: { 'YYYY-MM-DD': { cashes: [...] } }
// opts: { locations: [{id}], upTo?: 'YYYY-MM-DD', extraDates?: string[] }
export function walkCashDays(encaisseData, liveData, opts = {}) {
  const locs = opts.locations || [];
  const upTo = opts.upTo || null;
  const enc0 = encaisseData || {};
  const live = liveData || {};
  const entryDates = Object.keys(enc0).filter(k => !k.startsWith('_') && /^\d{4}-\d{2}-\d{2}$/.test(k));
  const first = entryDates.length ? entryDates.slice().sort()[0] : null;
  const dateSet = new Set(entryDates);
  for (const d of opts.extraDates || []) dateSet.add(d);
  if (first) {
    for (const d of Object.keys(live)) {
      if (d >= first && registerCashFor(live[d]).hasCaisseData) dateSet.add(d);
    }
  }
  const allDates = [...dateSet].filter(d => !upTo || d <= upTo).sort();
  const res = {};
  let prevClosing = null;
  for (const dt of allDates) {
    const enc = { ...EMPTY_DAY, ...(enc0[dt] || {}) };
    const opening = enc.openingOverride != null ? enc.openingOverride : (prevClosing ?? null);
    const { cashVentes, totalInterac, hasCaisseData } = registerCashFor(live[dt]);
    const autreEntreesTotal = (enc.autreEntrees || []).reduce((s, e) => s + (e.montant || 0), 0);
    const depositsTotal = (enc.deposits || []).reduce((s, d) => s + (d.montant || 0), 0);
    const sortiesTotal = (enc.sorties || []).reduce((s, x) => s + (x.montant || 0), 0);
    const calculated = (opening || 0) + cashVentes + autreEntreesTotal - depositsTotal - sortiesTotal;
    const pc = enc.physicalCount || {};
    const physTotal = locs.reduce((s, loc) => s + (pc[loc.id] || 0), 0);
    const physEntered = locs.some(loc => pc[loc.id] != null);
    const ecart = physEntered ? physTotal - calculated : null;
    const balanced = ecart != null && Math.abs(ecart) <= 2;
    const closing = (enc.carryForwardMode || 'calculated') === 'physical' && physEntered ? physTotal : calculated;
    res[dt] = { opening, cashVentes, totalInterac, hasCaisseData, autreEntreesTotal, depositsTotal, sortiesTotal, calculated, physTotal, physEntered, ecart, balanced, closing };
    prevClosing = closing;
  }
  return res;
}

// Last day (<= upTo) in a walk, or null.
export function lastWalkedDay(walk, upTo) {
  const ds = Object.keys(walk).filter(d => !upTo || d <= upTo).sort();
  return ds.length ? walk[ds[ds.length - 1]] : null;
}
