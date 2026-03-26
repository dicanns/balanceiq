/**
 * Encaisse Running Chain Tests
 * Verifies the day-to-day opening balance carry-forward logic.
 * Rules:
 *  - opening[t] = closing[t-1]  (or openingOverride if set)
 *  - calculated = opening + cashVentes + autres - depots - sorties
 *  - closing = physicalCount (if counted) else calculated
 *  - First day opening = 0 if no prior closing and no override
 */
import { describe, it, expect } from 'vitest';
import { computeEncaisseChain } from '../utils/calculations.js';

// ────────────────────────────────────────────────────────────────────────────
describe('Encaisse running chain — basic chain', () => {
  it('first day starts at 0 when no prior closing', () => {
    const result = computeEncaisseChain([
      { date: '2026-03-24', cashVentes: 850, autresEntrees: 0, depots: 800, sorties: 50 },
    ]);
    expect(result[0].opening).toBe(0);
    expect(result[0].calculated).toBe(0);  // 0 + 850 - 800 - 50
    expect(result[0].closing).toBe(0);
  });

  it('day 2 opening = day 1 closing (calculated)', () => {
    const result = computeEncaisseChain([
      { date: '2026-03-24', cashVentes: 900, autresEntrees: 0, depots: 800, sorties: 50 },  // closing = 50
      { date: '2026-03-25', cashVentes: 850, autresEntrees: 0, depots: 750, sorties: 100 }, // opening should = 50
    ]);
    expect(result[0].closing).toBe(50);     // 0 + 900 - 800 - 50
    expect(result[1].opening).toBe(50);     // carries from day 1
    expect(result[1].calculated).toBe(50);  // 50 + 850 - 750 - 100
  });

  it('physical count overrides calculated closing', () => {
    const result = computeEncaisseChain([
      { cashVentes: 900, depots: 800, sorties: 50, physicalCount: 80 },  // calculated=50, physical=80
      { cashVentes: 500, depots: 400, sorties: 50 },
    ]);
    expect(result[0].calculated).toBe(50);   // formula result
    expect(result[0].closing).toBe(80);       // physical wins
    expect(result[1].opening).toBe(80);       // next day gets physical, not calculated
  });

  it('opening override breaks the chain', () => {
    const result = computeEncaisseChain([
      { cashVentes: 900, depots: 800, sorties: 50 },                              // closing = 50
      { openingOverride: 200, cashVentes: 500, depots: 400, sorties: 100 },       // override = 200
      { cashVentes: 600, depots: 500, sorties: 50 },                              // opening from day 2 closing
    ]);
    expect(result[0].closing).toBe(50);
    expect(result[1].opening).toBe(200);      // override ignores day 1 closing
    expect(result[1].calculated).toBe(200);   // 200 + 500 - 400 - 100
    expect(result[2].opening).toBe(200);      // day 3 opening = day 2 closing
  });

  it('7-day rolling chain — matches a full restaurant week', () => {
    const week = [
      { cashVentes: 1200, depots: 1100, sorties: 50 },   // Mon closing = 50
      { cashVentes: 980,  depots: 900,  sorties: 80 },   // Tue closing = 50
      { cashVentes: 1100, depots: 1000, sorties: 100 },  // Wed closing = 50
      { cashVentes: 1350, depots: 1250, sorties: 100 },  // Thu closing = 50
      { cashVentes: 1500, depots: 1400, sorties: 100 },  // Fri closing = 50
      { cashVentes: 1800, depots: 1700, sorties: 100 },  // Sat closing = 50
      { cashVentes: 900,  depots: 800,  sorties: 100 },  // Sun closing = 50
    ];
    const result = computeEncaisseChain(week);
    result.forEach((day, i) => {
      expect(day.calculated).toBe(50);
      if (i > 0) expect(day.opening).toBe(50); // each day opens with previous closing
    });
  });

  it('rounding: fractional cents chain correctly', () => {
    const result = computeEncaisseChain([
      { cashVentes: 850.75, depots: 800.00, sorties: 25.50 }, // 25.25
      { cashVentes: 0,      depots: 0,      sorties: 10.10 }, // 25.25 - 10.10 = 15.15
    ]);
    expect(result[0].calculated).toBe(25.25);
    expect(result[1].opening).toBe(25.25);
    expect(result[1].calculated).toBe(15.15);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Encaisse chain — edge cases', () => {
  it('empty array returns empty array', () => {
    expect(computeEncaisseChain([])).toEqual([]);
  });

  it('single day with all zeros', () => {
    const result = computeEncaisseChain([{ cashVentes: 0, depots: 0, sorties: 0 }]);
    expect(result[0].opening).toBe(0);
    expect(result[0].calculated).toBe(0);
    expect(result[0].closing).toBe(0);
  });

  it('negative calculated (overdraft) propagates correctly', () => {
    const result = computeEncaisseChain([
      { cashVentes: 100, depots: 200, sorties: 0 },   // calculated = -100
      { cashVentes: 500, depots: 300, sorties: 0 },   // opening = -100, calc = 100
    ]);
    expect(result[0].calculated).toBe(-100);
    expect(result[1].opening).toBe(-100);
    expect(result[1].calculated).toBe(100);
  });

  it('day with only sorties (petty cash out)', () => {
    const result = computeEncaisseChain([
      { cashVentes: 0, depots: 0, sorties: 50, physicalCount: 200 }, // closing = 200
      { cashVentes: 0, depots: 0, sorties: 30 },                     // 200 - 30 = 170
    ]);
    expect(result[1].calculated).toBe(170);
  });

  it('openingOverride of 0 is respected (not treated as falsy)', () => {
    const result = computeEncaisseChain([
      { cashVentes: 500, depots: 400, sorties: 50 },    // closing = 50
      { openingOverride: 0, cashVentes: 200, depots: 100, sorties: 50 },  // override = 0
    ]);
    expect(result[1].opening).toBe(0);    // 0, not 50
    expect(result[1].calculated).toBe(50); // 0 + 200 - 100 - 50
  });
});
