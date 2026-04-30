/**
 * VAR-REASON-001  VARIANCE_REASON_CODES completeness
 * VAR-REASON-002  computeRegisterVariance correctness
 */
import { describe, it, expect } from 'vitest';
import { VARIANCE_REASON_CODES, computeRegisterVariance } from '../../components/RegisterCloseCard.jsx';

// ── VAR-REASON-001: reason codes array ───────────────────────────────────────

describe('VAR-REASON-001: VARIANCE_REASON_CODES', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(VARIANCE_REASON_CODES)).toBe(true);
    expect(VARIANCE_REASON_CODES.length).toBeGreaterThan(0);
  });

  it('every entry has code, fr, and en fields', () => {
    for (const r of VARIANCE_REASON_CODES) {
      expect(typeof r.code).toBe('string');
      expect(r.code.length).toBeGreaterThan(0);
      expect(typeof r.fr).toBe('string');
      expect(r.fr.length).toBeGreaterThan(0);
      expect(typeof r.en).toBe('string');
      expect(r.en.length).toBeGreaterThan(0);
    }
  });

  it('codes are unique', () => {
    const codes = VARIANCE_REASON_CODES.map(r => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('contains expected codes including unknown', () => {
    const codes = VARIANCE_REASON_CODES.map(r => r.code);
    expect(codes).toContain('unknown');
    expect(codes).toContain('counting_error');
    expect(codes).toContain('pos_mismatch');
  });
});

// ── VAR-REASON-002: computeRegisterVariance ───────────────────────────────────

describe('VAR-REASON-002: computeRegisterVariance', () => {
  const base = {
    posVentes: 1000,
    posTPS: 50,
    posTVQ: 99.75,
    posLivraisons: 200,
    interac: 400,
    finalCash: 549.75,
    deposits: 0,
  };

  it('returns null when posVentes missing', () => {
    const { posVentes: _, ...rest } = base;
    expect(computeRegisterVariance(rest)).toBeNull();
  });

  it('returns null when interac missing', () => {
    const { interac: _, ...rest } = base;
    expect(computeRegisterVariance(rest)).toBeNull();
  });

  it('returns null when finalCash missing', () => {
    const { finalCash: _, ...rest } = base;
    expect(computeRegisterVariance(rest)).toBeNull();
  });

  it('computes zero variance for balanced till', () => {
    // posT = 1000 + 50 + 99.75 = 1149.75
    // expectedCash = 1149.75 - 200 - 400 = 549.75
    // physCash = 549.75 + 0 = 549.75
    // variance = 0
    expect(computeRegisterVariance(base)).toBeCloseTo(0, 5);
  });

  it('computes positive variance (over)', () => {
    const cash = { ...base, finalCash: 559.75 }; // $10 over
    expect(computeRegisterVariance(cash)).toBeCloseTo(10, 5);
  });

  it('computes negative variance (short)', () => {
    const cash = { ...base, finalCash: 539.75 }; // $10 short
    expect(computeRegisterVariance(cash)).toBeCloseTo(-10, 5);
  });

  it('includes deposits in physCash', () => {
    const cash = { ...base, finalCash: 449.75, deposits: 100 }; // same physCash = 549.75
    expect(computeRegisterVariance(cash)).toBeCloseTo(0, 5);
  });

  it('uses zero defaults for optional fields', () => {
    // posTPS=0, posTVQ=0, posLivraisons=0
    const cash = { posVentes: 500, interac: 300, finalCash: 200 };
    // expectedCash = 500 + 0 + 0 - 0 - 300 = 200
    // physCash = 200 + 0 = 200
    expect(computeRegisterVariance(cash)).toBeCloseTo(0, 5);
  });
});
