/**
 * SCORECARD-001  computeCloseScore weighted formula
 * SCORECARD-002  deriveRates from complianceGetKPIs output
 * SCORECARD-003  color band thresholds
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeCloseScore, deriveRates, SCORECARD_WEIGHTS, BAND_COLOR } from '../../services/closeScorecard.js';

// --- helpers ---

function allRates(v) {
  return { onTimeClose: v, varianceCompliance: v, evidenceCompleteness: v, checklistCompliance: v, depositVerification: v, noReopen: v };
}

// Compute expected score from rates manually using the published weights
function expectedScore(rates) {
  const w = SCORECARD_WEIGHTS;
  const get = (k) => rates[k] ?? 1.0;
  const raw = (
    get('onTimeClose')          * w.onTimeClose +
    get('varianceCompliance')   * w.varianceCompliance +
    get('evidenceCompleteness') * w.evidenceCompleteness +
    get('checklistCompliance')  * w.checklistCompliance +
    get('depositVerification')  * w.depositVerification +
    get('noReopen')             * w.noReopen
  );
  return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 10;
}

// --- SCORECARD-001: score formula ---

describe('SCORECARD-001: computeCloseScore weighted formula', () => {
  it('all rates at 1.0 produces score 100', () => {
    const { score } = computeCloseScore(allRates(1));
    expect(score).toBe(100);
  });

  it('all rates at 0.0 produces score 0', () => {
    const { score } = computeCloseScore(allRates(0));
    expect(score).toBe(0);
  });

  it('weights sum to 1.0', () => {
    const total = Object.values(SCORECARD_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(Math.round(total * 1000) / 1000).toBe(1);
  });

  it('matches manually computed expected value', () => {
    const rates = { onTimeClose: 0.9, varianceCompliance: 0.8, evidenceCompleteness: 0.7, checklistCompliance: 0.6, depositVerification: 0.5, noReopen: 1.0 };
    const { score } = computeCloseScore(rates);
    expect(score).toBe(expectedScore(rates));
  });

  it('score is always between 0 and 100 regardless of rate values', () => {
    for (const v of [-0.5, 0, 0.5, 1, 1.5]) {
      const { score } = computeCloseScore(allRates(v));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('null rates are treated as 1.0 (neutral, no penalty)', () => {
    const ratesWithNull = { onTimeClose: null, varianceCompliance: null, evidenceCompleteness: null, checklistCompliance: null, depositVerification: null, noReopen: null };
    const { score } = computeCloseScore(ratesWithNull);
    expect(score).toBe(100);
  });

  it('partial null rates: only non-null rates are penalised', () => {
    // Only varianceCompliance is bad (0), rest null (treated as 1)
    const rates = { onTimeClose: null, varianceCompliance: 0, evidenceCompleteness: null, checklistCompliance: null, depositVerification: null, noReopen: null };
    const { score } = computeCloseScore(rates);
    // Expected: weight 0.25×1 + 0.20×0 + 0.20×1 + 0.15×1 + 0.10×1 + 0.10×1 = 0.80 → 80
    expect(score).toBe(80);
  });

  it('identifies topFactor and topDetractor correctly', () => {
    const rates = { onTimeClose: 0.9, varianceCompliance: 0.3, evidenceCompleteness: 0.8, checklistCompliance: 0.7, depositVerification: 0.6, noReopen: 0.95 };
    const result = computeCloseScore(rates);
    expect(result.topFactor).toBe('noReopen');      // highest rate
    expect(result.topDetractor).toBe('varianceCompliance'); // lowest rate
  });

  it('score rounding: result has at most one decimal place', () => {
    const rates = { onTimeClose: 1/3, varianceCompliance: 2/3, evidenceCompleteness: 0.5, checklistCompliance: 0.5, depositVerification: 0.5, noReopen: 0.5 };
    const { score } = computeCloseScore(rates);
    expect(score).toBe(Math.round(score * 10) / 10);
  });
});

// --- SCORECARD-002: deriveRates from kpis ---

describe('SCORECARD-002: deriveRates from complianceGetKPIs output', () => {
  it('derives on_time_close_rate = onTimeCount / sessionCount', () => {
    const kpis = { sessionCount: 10, onTimeCount: 7, totalClosures: 0, closuresWithVariance: 0, evidenceCompletenessPct: null, checklistCompliancePct: null, safeDropCount: 0, depositMatchedCount: 0, reopenCount: 0 };
    const { onTimeClose } = deriveRates(kpis);
    expect(onTimeClose).toBeCloseTo(0.7);
  });

  it('derives variance_compliance_rate = (total - withVariance) / total', () => {
    const kpis = { sessionCount: 1, onTimeCount: 1, totalClosures: 20, closuresWithVariance: 5, evidenceCompletenessPct: null, checklistCompliancePct: null, safeDropCount: 0, depositMatchedCount: 0, reopenCount: 0 };
    const { varianceCompliance } = deriveRates(kpis);
    expect(varianceCompliance).toBeCloseTo(0.75);
  });

  it('derives evidenceCompletenessRate from pct / 100', () => {
    const kpis = { sessionCount: 1, onTimeCount: 1, totalClosures: 1, closuresWithVariance: 0, evidenceCompletenessPct: 80, checklistCompliancePct: null, safeDropCount: 0, depositMatchedCount: 0, reopenCount: 0 };
    const { evidenceCompleteness } = deriveRates(kpis);
    expect(evidenceCompleteness).toBeCloseTo(0.8);
  });

  it('derives deposit_verification_rate = matched / safeDropCount', () => {
    const kpis = { sessionCount: 1, onTimeCount: 1, totalClosures: 1, closuresWithVariance: 0, evidenceCompletenessPct: null, checklistCompliancePct: null, safeDropCount: 10, depositMatchedCount: 6, reopenCount: 0 };
    const { depositVerification } = deriveRates(kpis);
    expect(depositVerification).toBeCloseTo(0.6);
  });

  it('derives no_reopen_rate = (sessions - reopens) / sessions', () => {
    const kpis = { sessionCount: 10, onTimeCount: 10, totalClosures: 10, closuresWithVariance: 0, evidenceCompletenessPct: null, checklistCompliancePct: null, safeDropCount: 0, depositMatchedCount: 0, reopenCount: 2 };
    const { noReopen } = deriveRates(kpis);
    expect(noReopen).toBeCloseTo(0.8);
  });

  it('returns null rates when there is no data (avoids division by zero)', () => {
    const kpis = { sessionCount: 0, onTimeCount: 0, totalClosures: 0, closuresWithVariance: 0, evidenceCompletenessPct: null, checklistCompliancePct: null, safeDropCount: 0, depositMatchedCount: 0, reopenCount: 0 };
    const rates = deriveRates(kpis);
    expect(rates.onTimeClose).toBeNull();
    expect(rates.varianceCompliance).toBeNull();
    expect(rates.evidenceCompleteness).toBeNull();
    expect(rates.checklistCompliance).toBeNull();
    expect(rates.depositVerification).toBeNull();
    expect(rates.noReopen).toBeNull();
  });

  it('handles missing kpis gracefully', () => {
    expect(() => deriveRates(null)).not.toThrow();
    expect(() => deriveRates({})).not.toThrow();
  });
});

// --- SCORECARD-003: color bands ---

describe('SCORECARD-003: color band thresholds', () => {
  it('score >= 85 is green', () => {
    const { band } = computeCloseScore(allRates(1));
    expect(band).toBe('green');
  });

  it('score 85.0 is green (boundary)', () => {
    // Force score to exactly 85: solve for uniform rate r such that r×100 = 85
    const r = 0.85;
    const { band, score } = computeCloseScore(allRates(r));
    expect(score).toBe(85);
    expect(band).toBe('green');
  });

  it('score 75 is yellow', () => {
    const r = 0.75;
    const { band } = computeCloseScore(allRates(r));
    expect(band).toBe('yellow');
  });

  it('score 65.0 is yellow (boundary)', () => {
    const r = 0.65;
    const { band, score } = computeCloseScore(allRates(r));
    expect(score).toBe(65);
    expect(band).toBe('yellow');
  });

  it('score < 65 is red', () => {
    const r = 0.64;
    const { band } = computeCloseScore(allRates(r));
    expect(band).toBe('red');
  });

  it('score 0 is red', () => {
    const { band } = computeCloseScore(allRates(0));
    expect(band).toBe('red');
  });

  it('BAND_COLOR maps band strings to valid CSS colors', () => {
    expect(BAND_COLOR.green).toMatch(/^#/);
    expect(BAND_COLOR.yellow).toMatch(/^#/);
    expect(BAND_COLOR.red).toMatch(/^#/);
  });
});
