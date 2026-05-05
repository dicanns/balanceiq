/**
 * Close compliance scorecard — pure computation, no side effects.
 *
 * Weighted formula (per spec Sub-Sprint 6B):
 *   0.25 × on_time_close_rate
 *   0.20 × variance_compliance_rate
 *   0.20 × evidence_completeness_rate
 *   0.15 × checklist_compliance_rate
 *   0.10 × deposit_verification_rate
 *   0.10 × no_reopen_rate
 *
 * Each rate is 0–1. Score is 0–100 (rounded to one decimal).
 * A rate of null (insufficient data) is treated as 1.0 (neutral, not penalised).
 */

export const SCORECARD_WEIGHTS = {
  onTimeClose:            0.25,
  varianceCompliance:     0.20,
  evidenceCompleteness:   0.20,
  checklistCompliance:    0.15,
  depositVerification:    0.10,
  noReopen:               0.10,
};

/**
 * Derive the six rates from a complianceGetKPIs result object.
 *
 * @param {object} kpis  — return value of complianceGetKPIs
 * @returns {{ onTimeClose, varianceCompliance, evidenceCompleteness, checklistCompliance, depositVerification, noReopen }}
 *          Each value is a number 0–1, or null if there is no data.
 */
export function deriveRates(kpis) {
  const {
    sessionCount = 0,
    onTimeCount = 0,
    totalClosures = 0,
    closuresWithVariance = 0,
    evidenceCompletenessPct,
    checklistCompliancePct,
    safeDropCount = 0,
    depositMatchedCount = 0,
    reopenCount = 0,
  } = kpis || {};

  const onTimeClose = sessionCount > 0 ? onTimeCount / sessionCount : null;

  const varianceCompliance = totalClosures > 0
    ? (totalClosures - closuresWithVariance) / totalClosures
    : null;

  const evidenceCompleteness = evidenceCompletenessPct != null
    ? evidenceCompletenessPct / 100
    : null;

  const checklistCompliance = checklistCompliancePct != null
    ? checklistCompliancePct / 100
    : null;

  const depositVerification = safeDropCount > 0
    ? depositMatchedCount / safeDropCount
    : null;

  const noReopen = sessionCount > 0
    ? Math.max(0, (sessionCount - reopenCount) / sessionCount)
    : null;

  return { onTimeClose, varianceCompliance, evidenceCompleteness, checklistCompliance, depositVerification, noReopen };
}

/**
 * Compute the weighted compliance score from the six rates.
 * Null rates are treated as 1.0 (not penalised when there is no data).
 *
 * @param {object} rates — output of deriveRates()
 * @returns {{ score: number, rates: object, band: 'green'|'yellow'|'red', topFactor: string, topDetractor: string }}
 */
export function computeCloseScore(rates) {
  const w = SCORECARD_WEIGHTS;
  const entries = [
    { key: 'onTimeClose',          label: 'On-time close',           labelFr: 'Fermeture à temps',       weight: w.onTimeClose,          value: rates.onTimeClose },
    { key: 'varianceCompliance',   label: 'Variance compliance',     labelFr: 'Conformité des écarts',   weight: w.varianceCompliance,   value: rates.varianceCompliance },
    { key: 'evidenceCompleteness', label: 'Evidence completeness',   labelFr: 'Complétude des preuves',  weight: w.evidenceCompleteness, value: rates.evidenceCompleteness },
    { key: 'checklistCompliance',  label: 'Checklist compliance',    labelFr: 'Conformité checklist',    weight: w.checklistCompliance,  value: rates.checklistCompliance },
    { key: 'depositVerification',  label: 'Deposit verification',    labelFr: 'Vérification des dépôts', weight: w.depositVerification,  value: rates.depositVerification },
    { key: 'noReopen',             label: 'No-reopen rate',          labelFr: 'Taux sans réouverture',   weight: w.noReopen,             value: rates.noReopen },
  ];

  let weighted = 0;
  let totalWeight = 0;
  for (const e of entries) {
    const v = e.value ?? 1.0;
    weighted += v * e.weight;
    totalWeight += e.weight;
  }

  const raw = totalWeight > 0 ? weighted / totalWeight : 1;
  const score = Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 10;

  const band = score >= 85 ? 'green' : score >= 65 ? 'yellow' : 'red';

  const dataEntries = entries.filter(e => e.value != null);
  const best  = dataEntries.length ? dataEntries.reduce((a, b) => a.value >= b.value ? a : b) : null;
  const worst = dataEntries.length ? dataEntries.reduce((a, b) => a.value <= b.value ? a : b) : null;

  return {
    score,
    band,
    rates: Object.fromEntries(entries.map(e => [e.key, e.value])),
    entries,
    topFactor:    best  ? best.key  : null,
    topDetractor: worst ? worst.key : null,
  };
}

export const BAND_COLOR = { green: '#22c55e', yellow: '#fbbf24', red: '#ef4444' };
