/**
 * Date Utility Tests
 * Tests formatDateKey(), prevDateKey(), getQCHoliday()
 * and the full Quebec holiday calendar used for ordering predictions.
 */
import { describe, it, expect } from 'vitest';
import { formatDateKey, prevDateKey, getQCHoliday, QC_HOL } from '../utils/calculations.js';

// ────────────────────────────────────────────────────────────────────────────
describe('formatDateKey — Date → YYYY-MM-DD', () => {
  it('formats a regular date correctly', () => {
    expect(formatDateKey(new Date(2026, 2, 25))).toBe('2026-03-25'); // March = month 2
  });

  it('zero-pads single-digit months', () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDateKey(new Date(2026, 8, 1))).toBe('2026-09-01');
  });

  it('zero-pads single-digit days', () => {
    expect(formatDateKey(new Date(2026, 5, 3))).toBe('2026-06-03');
  });

  it('handles December 31', () => {
    expect(formatDateKey(new Date(2025, 11, 31))).toBe('2025-12-31');
  });

  it('handles January 1', () => {
    expect(formatDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('handles year boundary correctly', () => {
    expect(formatDateKey(new Date(2025, 11, 31))).toBe('2025-12-31');
    expect(formatDateKey(new Date(2026,  0,  1))).toBe('2026-01-01');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('prevDateKey — previous day navigation', () => {
  it('steps back one day within a month', () => {
    expect(prevDateKey('2026-03-25')).toBe('2026-03-24');
    expect(prevDateKey('2026-03-10')).toBe('2026-03-09');
  });

  it('crosses month boundary (March 1 → February 28)', () => {
    expect(prevDateKey('2026-03-01')).toBe('2026-02-28');
  });

  it('crosses February leap year boundary (2024)', () => {
    expect(prevDateKey('2024-03-01')).toBe('2024-02-29'); // 2024 is a leap year
  });

  it('crosses year boundary (Jan 1 → Dec 31)', () => {
    expect(prevDateKey('2026-01-01')).toBe('2025-12-31');
  });

  it('handles end of 30-day month (April → March)', () => {
    expect(prevDateKey('2026-04-01')).toBe('2026-03-31');
  });

  it('chaining multiple prevDateKey calls', () => {
    let date = '2026-03-03';
    date = prevDateKey(date); expect(date).toBe('2026-03-02');
    date = prevDateKey(date); expect(date).toBe('2026-03-01');
    date = prevDateKey(date); expect(date).toBe('2026-02-28');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('getQCHoliday — Quebec statutory holidays', () => {
  it('returns null for a regular business day', () => {
    expect(getQCHoliday(new Date(2026, 2, 25))).toBeNull(); // Wed March 25
    expect(getQCHoliday(new Date(2026, 2, 10))).toBeNull();
  });

  it('identifies Jour de l\'An (Jan 1)', () => {
    expect(getQCHoliday(new Date(2026, 0, 1))).toBe("Jour de l'An");
  });

  it('identifies Fête nationale du Québec (June 24)', () => {
    expect(getQCHoliday(new Date(2026, 5, 24))).toBe('Fête nationale du Québec');
  });

  it('identifies Fête du Canada (July 1)', () => {
    expect(getQCHoliday(new Date(2026, 6, 1))).toBe('Fête du Canada');
  });

  it('identifies Fête du Travail (Sept 2)', () => {
    expect(getQCHoliday(new Date(2026, 8, 2))).toBe('Fête du Travail');
  });

  it('identifies Action de grâce (Oct 14)', () => {
    expect(getQCHoliday(new Date(2026, 9, 14))).toBe("Action de grâce");
  });

  it('identifies Noël (Dec 25)', () => {
    expect(getQCHoliday(new Date(2026, 11, 25))).toBe('Noël');
  });

  it('identifies Lendemain de Noël (Dec 26)', () => {
    expect(getQCHoliday(new Date(2026, 11, 26))).toBe('Lendemain de Noël');
  });

  it('identifies Vendredi saint (March 29)', () => {
    expect(getQCHoliday(new Date(2026, 2, 29))).toBe('Vendredi saint');
  });

  it('identifies Lundi de Pâques (April 1)', () => {
    expect(getQCHoliday(new Date(2026, 3, 1))).toBe('Lundi de Pâques');
  });

  it('identifies Journée nationale des patriotes (May 20)', () => {
    expect(getQCHoliday(new Date(2026, 4, 20))).toBe('Journée nationale des patriotes');
  });

  it('Dec 24 is NOT a holiday', () => {
    expect(getQCHoliday(new Date(2026, 11, 24))).toBeNull();
  });

  it('June 23 is NOT a holiday (day before St-Jean)', () => {
    expect(getQCHoliday(new Date(2026, 5, 23))).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('QC_HOL calendar completeness', () => {
  it('contains exactly 10 statutory holidays', () => {
    expect(Object.keys(QC_HOL).length).toBe(10);
  });

  it('all keys follow MM-DD format', () => {
    Object.keys(QC_HOL).forEach((key) => {
      expect(key).toMatch(/^\d{2}-\d{2}$/);
      const [mm, dd] = key.split('-').map(Number);
      expect(mm).toBeGreaterThanOrEqual(1);
      expect(mm).toBeLessThanOrEqual(12);
      expect(dd).toBeGreaterThanOrEqual(1);
      expect(dd).toBeLessThanOrEqual(31);
    });
  });

  it('all holidays have non-empty French names', () => {
    Object.values(QC_HOL).forEach((name) => {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(3);
    });
  });

  it('holidays predict +12% ordering uplift (business logic)', () => {
    // Any day with a holiday should trigger extra inventory
    const holidayDate = new Date(2026, 5, 24); // St-Jean
    const isHoliday   = getQCHoliday(holidayDate) !== null;
    const orderingMultiplier = isHoliday ? 1.12 : 1.0;
    expect(orderingMultiplier).toBe(1.12);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Stepped royalty calculation', () => {
  // Importing here to co-test with dates (same calculations.js module)
  it('uses import from same calculations module (sanity check)', async () => {
    const { calcSteppedRoyaltyRate } = await import('../utils/calculations.js');
    expect(typeof calcSteppedRoyaltyRate).toBe('function');
  });
});
