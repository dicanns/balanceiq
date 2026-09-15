// ── COMPANY ACCESS ───────────────────────────────────────────────────────────
// The primary company works on whatever plan it has, Free included. Every other
// company is a separate business and needs its own paid plan: full price, signed in
// with its own BalanceIQ account. A company that has confirmed its plan recently
// keeps working offline for a grace period, so a trip without internet does not
// lock anyone out of their books.

export const PAID_PLANS = ['pro', 'network', 'franchise'];
export const COMPANY_GRACE_DAYS = 14;
export const COMPANY_PLAN_VERIFIED_KEY = 'balanceiq-company-plan-verified';
const DAY = 86400000;

/**
 * state: 'open' | 'grace' | 'needs_plan' | 'checking'
 */
export function companyAccess({ isPrimary = true, cloudChecked = true, signedIn = false, plan = 'free', verifiedPaidAt = null, now = Date.now() } = {}) {
  if (isPrimary) return { state: 'open' };
  if (signedIn && PAID_PLANS.includes(plan)) return { state: 'open', verified: true };
  const at = Date.parse(verifiedPaidAt || '');
  if (Number.isFinite(at) && at <= now && now - at <= COMPANY_GRACE_DAYS * DAY) {
    return { state: 'grace', daysLeft: Math.max(0, Math.ceil((at + COMPANY_GRACE_DAYS * DAY - now) / DAY)) };
  }
  if (!cloudChecked) return { state: 'checking' };
  return { state: 'needs_plan' };
}
