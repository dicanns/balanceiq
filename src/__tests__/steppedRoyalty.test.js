/**
 * Stepped Royalty Tests — Bug Fix Validation
 *
 * Before the fix, buildRoyaltyPreview() always used flat rate regardless of
 * paliersMensuels config. calcRoyaltyFull() now correctly applies paliers.
 *
 * Palier logic: Sort tiers descending by minVentes, find the highest tier
 * whose minVentes ≤ monthly sales. That tier's rate applies to ALL sales.
 * Example: paliers = [{minVentes:0,rate:4},{minVentes:30000,rate:5},{minVentes:50000,rate:6}]
 *   - $25 000 sales → tier $0 → 4%
 *   - $35 000 sales → tier $30 000 → 5%
 *   - $55 000 sales → tier $50 000 → 6%
 */
import { describe, it, expect } from 'vitest';
import {
  calcSteppedRoyaltyRate,
  calcRoyaltyFull,
  calcRoyalty,
} from '../utils/calculations.js';

// Standard Dic Ann's paliers
const PALIERS = [
  { minVentes: 0,     rate: 4 },
  { minVentes: 30000, rate: 5 },
  { minVentes: 50000, rate: 6 },
];

// ────────────────────────────────────────────────────────────────────────────
describe('calcSteppedRoyaltyRate — tier selection', () => {
  it('lowest tier for sales below first threshold', () => {
    expect(calcSteppedRoyaltyRate(20000, PALIERS)).toBe(4);
    expect(calcSteppedRoyaltyRate(0,     PALIERS)).toBe(4);
    expect(calcSteppedRoyaltyRate(29999, PALIERS)).toBe(4);
  });

  it('mid tier at exactly the $30 000 threshold', () => {
    expect(calcSteppedRoyaltyRate(30000, PALIERS)).toBe(5);
  });

  it('mid tier for sales between $30K and $50K', () => {
    expect(calcSteppedRoyaltyRate(35000, PALIERS)).toBe(5);
    expect(calcSteppedRoyaltyRate(49999, PALIERS)).toBe(5);
  });

  it('top tier at exactly the $50 000 threshold', () => {
    expect(calcSteppedRoyaltyRate(50000, PALIERS)).toBe(6);
  });

  it('top tier for sales above $50K', () => {
    expect(calcSteppedRoyaltyRate(55000, PALIERS)).toBe(6);
    expect(calcSteppedRoyaltyRate(100000, PALIERS)).toBe(6);
  });

  it('handles single tier (flat rate)', () => {
    const singleTier = [{ minVentes: 0, rate: 4 }];
    expect(calcSteppedRoyaltyRate(0,      singleTier)).toBe(4);
    expect(calcSteppedRoyaltyRate(100000, singleTier)).toBe(4);
  });

  it('handles empty paliers', () => {
    expect(calcSteppedRoyaltyRate(50000, [])).toBe(0);
    expect(calcSteppedRoyaltyRate(50000, null)).toBe(0);
  });

  it('paliers need not be sorted — finds correct tier regardless of order', () => {
    const unsorted = [
      { minVentes: 50000, rate: 6 },
      { minVentes: 0,     rate: 4 },
      { minVentes: 30000, rate: 5 },
    ];
    expect(calcSteppedRoyaltyRate(35000, unsorted)).toBe(5);
    expect(calcSteppedRoyaltyRate(55000, unsorted)).toBe(6);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('calcRoyaltyFull — flat structure', () => {
  const flatConfig = { structure: 'fixed', rate: 4, adRate: 1.5 };
  const noOverride = { royaltyOverride: false };

  it('flat rate applied correctly', () => {
    const result = calcRoyaltyFull(48500, noOverride, flatConfig);
    expect(result.rate).toBe(4);
    expect(result.royalty).toBe(1940);     // 48500 × 4%
    expect(result.ad).toBe(727.50);        // 48500 × 1.5%
    expect(result.total).toBe(2667.50);
  });

  it('zero sales → zero royalty', () => {
    const result = calcRoyaltyFull(0, noOverride, flatConfig);
    expect(result.total).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('calcRoyaltyFull — stepped structure (THE BUG FIX)', () => {
  const steppedConfig = {
    structure: 'paliers',
    paliersMensuels: PALIERS,
    adRate: 1.5,
  };
  const noOverride = { royaltyOverride: false };

  it('low-volume location gets 4% rate', () => {
    const result = calcRoyaltyFull(25000, noOverride, steppedConfig);
    expect(result.rate).toBe(4);
    expect(result.royalty).toBe(1000);     // 25000 × 4%
  });

  it('mid-volume location gets 5% rate (BUG WAS: always used flat rate)', () => {
    const result = calcRoyaltyFull(35000, noOverride, steppedConfig);
    expect(result.rate).toBe(5);           // ← this was failing before the fix
    expect(result.royalty).toBe(1750);     // 35000 × 5%
    expect(result.ad).toBe(525);           // 35000 × 1.5%
    expect(result.total).toBe(2275);
  });

  it('high-volume location gets 6% rate', () => {
    const result = calcRoyaltyFull(55000, noOverride, steppedConfig);
    expect(result.rate).toBe(6);
    expect(result.royalty).toBe(3300);     // 55000 × 6%
  });

  it('confirms flat config produces DIFFERENT result than stepped for $35K sales', () => {
    const flatResult    = calcRoyaltyFull(35000, noOverride, { structure: 'fixed', rate: 4, adRate: 1.5 });
    const steppedResult = calcRoyaltyFull(35000, noOverride, steppedConfig);
    expect(flatResult.royalty).toBe(1400);    // 35000 × 4% (OLD/WRONG behavior)
    expect(steppedResult.royalty).toBe(1750); // 35000 × 5% (CORRECT)
    // This test documents the exact amount the bug was under-charging franchisors
    expect(steppedResult.royalty - flatResult.royalty).toBe(350);
  });

  it('at tier boundary $30K exactly → 5%', () => {
    const result = calcRoyaltyFull(30000, noOverride, steppedConfig);
    expect(result.rate).toBe(5);
    expect(result.royalty).toBe(1500);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('calcRoyaltyFull — location-level override takes priority', () => {
  const steppedConfig = {
    structure: 'paliers',
    paliersMensuels: PALIERS,
    adRate: 1.5,
    rate: 4,
  };

  it('override rate takes priority over paliers and flat rate', () => {
    const locWithOverride = { royaltyOverride: true, royaltyRate: 3.5, adRate: 1.0 };
    const result = calcRoyaltyFull(55000, locWithOverride, steppedConfig);
    // $55K should trigger 6% tier, but override = 3.5%
    expect(result.rate).toBe(3.5);
    expect(result.royalty).toBe(1925);  // 55000 × 3.5%
  });

  it('override adRate takes priority', () => {
    const locWithAdOverride = { royaltyOverride: true, royaltyRate: 4, adRate: 0 };
    const result = calcRoyaltyFull(48500, locWithAdOverride, steppedConfig);
    expect(result.adRate).toBe(0);
    expect(result.ad).toBe(0);
  });

  it('no override uses config paliers normally', () => {
    const noOverride = { royaltyOverride: false };
    const result = calcRoyaltyFull(35000, noOverride, steppedConfig);
    expect(result.rate).toBe(5); // paliers applied
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Multi-location royalty scenario — franchise network', () => {
  const config = {
    structure: 'paliers',
    paliersMensuels: PALIERS,
    adRate: 1.5,
  };

  const locations = [
    { id: 'laval',    sales: 52000, loc: { royaltyOverride: false } },  // → 6%
    { id: 'montreal', sales: 38500, loc: { royaltyOverride: false } },  // → 5%
    { id: 'brossard', sales: 25000, loc: { royaltyOverride: false } },  // → 4%
    { id: 'longueuil',sales: 31000, loc: { royaltyOverride: false } },  // → 5%
  ];

  it('each location uses the correct tier', () => {
    const [laval, montreal, brossard, longueuil] = locations.map(
      (l) => calcRoyaltyFull(l.sales, l.loc, config)
    );
    expect(laval.rate).toBe(6);
    expect(montreal.rate).toBe(5);
    expect(brossard.rate).toBe(4);
    expect(longueuil.rate).toBe(5);
  });

  it('total network royalties calculated correctly', () => {
    const results = locations.map((l) => calcRoyaltyFull(l.sales, l.loc, config));
    const totalRoyalties = results.reduce((s, r) => s + r.royalty, 0);
    // 52000×6% + 38500×5% + 25000×4% + 31000×5%
    // = 3120 + 1925 + 1000 + 1550 = 7595
    expect(totalRoyalties).toBe(7595);
  });

  it('flat-rate bug would have under-charged the network by a measurable amount', () => {
    const steppedTotal = locations
      .map((l) => calcRoyaltyFull(l.sales, l.loc, config).royalty)
      .reduce((s, r) => s + r, 0);

    // What the OLD flat-rate code would have calculated (always 4%)
    const flatTotal = locations.map((l) => l.sales * 0.04).reduce((s, r) => s + r, 0);

    expect(steppedTotal).toBeGreaterThan(flatTotal);
    // Under-charge = steppedTotal - flatTotal
    const undercharge = steppedTotal - flatTotal;
    expect(undercharge).toBeGreaterThan(0);
    // Exact: 7595 - (52000+38500+25000+31000)*0.04 = 7595 - 5860 = 1735
    expect(undercharge).toBe(1735);
  });
});
