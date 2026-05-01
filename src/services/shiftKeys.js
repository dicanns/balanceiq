const SHIFT_KEYS = ['dawn', 'morning', 'afternoon', 'evening', 'night', 'final'];

/**
 * Returns the shift key that immediately precedes the given shift key,
 * or null if there is no preceding shift (i.e. 'dawn' or unknown).
 */
function precedingShiftKey(shiftKey) {
  const idx = SHIFT_KEYS.indexOf(shiftKey);
  if (idx <= 0) return null;
  return SHIFT_KEYS[idx - 1];
}

function isFinalShift(shiftKey) {
  return shiftKey === 'final';
}

/**
 * Given a carry_forward_float_cents value from the previous shift and
 * an optional user override (also in cents), returns the resolved opening float.
 */
function resolveOpeningFloat(carryForwardCents, overrideCents) {
  if (overrideCents != null) return overrideCents;
  return carryForwardCents ?? 0;
}

export { SHIFT_KEYS, precedingShiftKey, isFinalShift, resolveOpeningFloat };
