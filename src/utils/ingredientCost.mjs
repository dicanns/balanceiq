// Ingredient pricing helpers: turn "what I paid for a case" into a price per portion.
// Pure functions, no Electron dependency (loaded by database.js, the UI and tests).

// Grams per weight unit and millilitres per volume unit.
const WEIGHT_G = { g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 };
const VOLUME_ML = { mL: 1, L: 1000 };

function familyOf(unit) {
  if (Object.prototype.hasOwnProperty.call(WEIGHT_G, unit)) return { table: WEIGHT_G, name: 'weight' };
  if (Object.prototype.hasOwnProperty.call(VOLUME_ML, unit)) return { table: VOLUME_ML, name: 'volume' };
  return null;
}

// Convert qty from one unit to another of the same family; null when impossible.
export function convertQty(qty, fromUnit, toUnit) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return null;
  if (fromUnit === toUnit) return n;
  const a = familyOf(fromUnit);
  const b = familyOf(toUnit);
  if (!a || !b || a.name !== b.name) return null;
  return (n * a.table[fromUnit]) / b.table[toUnit];
}

// Price in dollars of ONE `unit`, from the price of a pack and what it holds.
// packUnit 'count' (or equal to unit) means the pack holds packQty of `unit`.
// Returns null when it cannot be computed. Not rounded to cents.
export function unitPriceFromPack({ packPriceCents, packQty, packUnit, unit } = {}) {
  const cents = Number(packPriceCents);
  const qty = Number(packQty);
  if (!Number.isFinite(cents) || !Number.isFinite(qty) || cents <= 0 || qty <= 0) return null;
  let unitsInPack;
  if (!packUnit || packUnit === 'count' || packUnit === unit) {
    unitsInPack = qty;
  } else {
    unitsInPack = convertQty(qty, packUnit, unit);
  }
  if (unitsInPack == null || !Number.isFinite(unitsInPack) || unitsInPack <= 0) return null;
  return (cents / 100) / unitsInPack;
}

export function round6(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}
