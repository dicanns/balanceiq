/**
 * Close exception pattern detection — pure functions, no side effects.
 * All thresholds are exported constants so tests can reference them.
 */

export const PATTERNS = {
  CASHIER_VARIANCE_RATE:    0.30,  // > 30% of closes have variance above threshold
  CASHIER_VARIANCE_CENTS:    500,  // $5.00 variance threshold
  REGISTER_VARIANCE_RATE:   0.30,
  REGISTER_VARIANCE_CENTS:   500,
  DOW_MIN_SAMPLES:             4,  // need at least 4 days-of-week samples
  DOW_VARIANCE_RATE:        0.50,  // that day has >50% variance rate
  MIN_SESSIONS_FOR_RATE:       5,  // don't flag patterns with fewer sessions
  REOPEN_RATE:              0.10,  // >10% of finalized closes were reopened
  DELAYED_APPROVAL_MINUTES:  120,  // avg submit→finalize gap > 2h
};

export const DOW_NAMES_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const DOW_NAMES_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

/**
 * Pattern 1 — cashier with repeated variance.
 * @param {Array<{cashier_name:string, total_closures:number, variance_closures:number}>} cashierSummary
 */
export function detectCashierVariancePattern(cashierSummary) {
  if (!Array.isArray(cashierSummary)) return [];
  return cashierSummary
    .filter(c =>
      c.cashier_name &&
      c.total_closures >= PATTERNS.MIN_SESSIONS_FOR_RATE &&
      c.variance_closures / c.total_closures > PATTERNS.CASHIER_VARIANCE_RATE
    )
    .map(c => ({
      type: 'cashier_variance',
      subject: c.cashier_name,
      rate: Math.round((c.variance_closures / c.total_closures) * 100),
      count: c.variance_closures,
      total: c.total_closures,
    }))
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Pattern 2 — register with repeated variance.
 * @param {Array<{register_key:string, total_closures:number, variance_closures:number}>} registerSummary
 */
export function detectRegisterVariancePattern(registerSummary) {
  if (!Array.isArray(registerSummary)) return [];
  return registerSummary
    .filter(r =>
      r.total_closures >= PATTERNS.MIN_SESSIONS_FOR_RATE &&
      r.variance_closures / r.total_closures > PATTERNS.REGISTER_VARIANCE_RATE
    )
    .map(r => ({
      type: 'register_variance',
      subject: r.register_key,
      rate: Math.round((r.variance_closures / r.total_closures) * 100),
      count: r.variance_closures,
      total: r.total_closures,
    }))
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Pattern 3 — day-of-week variance pattern.
 * @param {Array<{dow:number, total_closures:number, variance_closures:number}>} dowSummary
 *         dow: 0=Sunday … 6=Saturday (SQLite strftime %w)
 */
export function detectDayOfWeekPattern(dowSummary) {
  if (!Array.isArray(dowSummary)) return [];
  return dowSummary
    .filter(d =>
      d.total_closures >= PATTERNS.DOW_MIN_SAMPLES &&
      d.variance_closures / d.total_closures > PATTERNS.DOW_VARIANCE_RATE
    )
    .map(d => ({
      type: 'dow_variance',
      subject: DOW_NAMES_EN[d.dow] || `Day ${d.dow}`,
      subjectFr: DOW_NAMES_FR[d.dow] || `Jour ${d.dow}`,
      dow: d.dow,
      rate: Math.round((d.variance_closures / d.total_closures) * 100),
      count: d.variance_closures,
      total: d.total_closures,
    }))
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Pattern 4 — delayed approval (avg submit→finalize lag > 2h).
 * @param {number[]} lagMinutes  list of per-session lags in minutes
 */
export function detectDelayedApprovalPattern(lagMinutes) {
  if (!Array.isArray(lagMinutes) || lagMinutes.length < PATTERNS.MIN_SESSIONS_FOR_RATE) return [];
  const avg = lagMinutes.reduce((s, v) => s + v, 0) / lagMinutes.length;
  if (avg <= PATTERNS.DELAYED_APPROVAL_MINUTES) return [];
  return [{
    type: 'delayed_approval',
    avgMinutes: Math.round(avg),
    sampleCount: lagMinutes.length,
  }];
}

/**
 * Pattern 5 — reopen frequency > 10%.
 * @param {{ sessionCount:number, reopenCount:number }} counts
 */
export function detectReopenPattern({ sessionCount = 0, reopenCount = 0 } = {}) {
  if (sessionCount < PATTERNS.MIN_SESSIONS_FOR_RATE) return [];
  const rate = reopenCount / sessionCount;
  if (rate <= PATTERNS.REOPEN_RATE) return [];
  return [{
    type: 'reopen_frequency',
    rate: Math.round(rate * 100),
    count: reopenCount,
    total: sessionCount,
  }];
}

/**
 * Run all five detectors and return a flat list of flagged patterns.
 * Each pattern: { type, subject?, rate?, count?, total?, ... }
 */
export function runExceptionAnalytics({ cashierSummary, registerSummary, dowSummary, sessionCounts, approvalLags }) {
  return [
    ...detectCashierVariancePattern(cashierSummary  || []),
    ...detectRegisterVariancePattern(registerSummary || []),
    ...detectDayOfWeekPattern(dowSummary            || []),
    ...detectReopenPattern(sessionCounts            || {}),
    ...detectDelayedApprovalPattern(approvalLags    || []),
  ];
}
