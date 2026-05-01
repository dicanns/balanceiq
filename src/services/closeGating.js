/**
 * Pure gating function: can the user confirm close?
 * Kept in a plain .js file (no React) so it can be unit-tested without JSX transforms.
 *
 * Returns false when:
 *   - any policy blocker exists
 *   - varianceRule !== 'inform' AND a register has null variance (count incomplete)
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
  if (varianceRule !== 'inform') {
    for (const v of variances) {
      if (v.variance == null) return false;
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
