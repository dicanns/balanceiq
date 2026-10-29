// Discounts and line totals: the one definition the renderer (through
// calculations.js) and the main process (posting invoices) both use.

const n = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? v : 0; };

// A discount is a value and a kind: DISCOUNT_PERCENT takes that percentage off,
// DISCOUNT_AMOUNT takes that many dollars off. Documents saved before the kind
// existed carry only a percentage, so a missing kind reads as a percentage.
export const DISCOUNT_PERCENT = '%';
export const DISCOUNT_AMOUNT = '$';

// What a discount takes off a base: never negative, never more than the base,
// so a $50 discount on a $30 line leaves it at zero rather than below.
export function discountOff(base, value, kind) {
  const b = n(base);
  const v = n(value);
  if (b <= 0 || v <= 0) return 0;
  const off = kind === DISCOUNT_AMOUNT ? v : b * v / 100;
  return Math.min(b, off);
}

// One line after its own discount. On a line, a dollar discount comes off the
// line as a whole (quantity times price), not off each unit.
export function lineTotal(l) {
  const gross = n(l?.quantite) * n(l?.prixUnitaire);
  return gross - discountOff(gross, l?.remise, l?.remiseType);
}
