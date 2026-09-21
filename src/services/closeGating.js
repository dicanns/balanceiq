/**
 * Pure gating function: can the user confirm close?
 * Kept in a plain .js file (no React) so it can be unit-tested without JSX transforms.
 *
 * Returns false when:
 *   - any policy blocker exists
 *   - a register has null variance (count incomplete), under every rule
 *   - varianceRule !== 'inform' AND a register exceeds threshold without a captured reason
 *   - signoffRequired AND warnings exist AND not all override reasons captured
 *   - signoffRequired AND warnings exist AND manager actor not verified
 */
export function canConfirmClose({
  blockers = [],
  variances = [],
  varianceRule = 'inform',
  localReasons = {},
  warnings = [],
  signoffRequired = false,
  overrideReasons = {},
  overrideActor = null,
} = {}) {
  if (blockers.length > 0) return false;
  // A register with no count has no variance to inform about, require a reason
  // for, or block on: the rule governs a variance that exists. Confirming
  // without a count stored the register as balanced at $0.00.
  for (const v of variances) {
    if (v.variance == null) return false;
  }
  if (varianceRule !== 'inform') {
    for (const v of variances) {
      if (v.exceeds && !v.reasonCode && !localReasons[v.idx]?.code) return false;
    }
  }
  if (signoffRequired && warnings.length > 0) {
    for (let i = 0; i < warnings.length; i++) {
      if (!overrideReasons[i]?.trim()) return false;
    }
    if (!overrideActor) return false;
  }
  return true;
}
