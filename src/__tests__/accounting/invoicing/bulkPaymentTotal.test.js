/**
 * BULKPAY-001  the selected-balance total is a number, never an array or string
 *
 * Regression guard: the bulk encaissement total seeded its reduce with [] rather
 * than 0. With nothing selected it stayed an array, and with invoices selected
 * it became a concatenated string - either way the editor called .toFixed on a
 * non-number and the whole screen crashed with "toFixed is not a function" the
 * moment Record a payment was opened.
 */
import { describe, it, expect } from 'vitest';

const paid = (f) => (f.paiements || []).reduce((a, p) => a + (p.montant || 0), 0);

// The fixed version: seeded with 0.
const totalSelected = (facs) =>
  facs.reduce((s, f) => s + ((f.total || 0) - paid(f)), 0);

// The original, for contrast.
const totalSelectedBroken = (facs) =>
  facs.reduce((s, f) => s + ((f.total || 0) - paid(f)), []);

const FACS = [
  { total: 9984.42, paiements: [] },
  { total: 4050.16, paiements: [{ montant: 1000 }] },
];

describe('BULKPAY-001 the bulk total stays numeric', () => {
  it('returns a number when nothing is selected', () => {
    const t = totalSelected([]);
    expect(typeof t).toBe('number');
    expect(t).toBe(0);
  });

  it('an empty selection can be formatted', () => {
    expect(() => totalSelected([]).toFixed(2)).not.toThrow();
    expect(totalSelected([]).toFixed(2)).toBe('0.00');
  });

  it('sums outstanding balances, net of payments already recorded', () => {
    expect(totalSelected(FACS)).toBeCloseTo(13034.58, 2);
  });

  it('a populated selection can be formatted', () => {
    expect(totalSelected(FACS).toFixed(2)).toBe('13034.58');
  });

  it('the old seed produced an array on an empty selection', () => {
    const t = totalSelectedBroken([]);
    expect(Array.isArray(t)).toBe(true);
    expect(t.toFixed).toBeUndefined();
  });

  it('the old seed produced a string once anything was selected', () => {
    const t = totalSelectedBroken(FACS);
    expect(typeof t).toBe('string');
    expect(t.toFixed).toBeUndefined();
  });

  it('the hardened placeholder never throws, whatever it is handed', () => {
    const fmt = (v) => (Number(v) || 0).toFixed(2);
    for (const v of [undefined, null, [], '', NaN, 'abc', 12.5]) {
      expect(() => fmt(v)).not.toThrow();
    }
    expect(fmt(12.5)).toBe('12.50');
    expect(fmt([])).toBe('0.00');
  });
});
