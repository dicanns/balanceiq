/**
 * BENCHMARK-001  cohortBenchmark.js — pure functions
 */
import { describe, it, expect } from 'vitest';
import {
  BENCHMARK_METRICS,
  computeNetworkAverages,
  benchmarkLocation,
  rankTier,
  rankTierColor,
} from '../../services/cohortBenchmark.js';

const makeLocData = (overrides = {}) => ({
  monthlySales: 80000,
  avgDz:        9.50,
  avgLabourPct: 28,
  ...overrides,
});

// ── BENCHMARK-001-A  BENCHMARK_METRICS shape ──────────────────────────────────

describe('BENCHMARK-001-A BENCHMARK_METRICS', () => {
  it('exports three metrics', () => {
    expect(BENCHMARK_METRICS).toHaveLength(3);
  });

  it('includes monthlySales, avgDz, avgLabourPct keys', () => {
    const keys = BENCHMARK_METRICS.map(m => m.key);
    expect(keys).toContain('monthlySales');
    expect(keys).toContain('avgDz');
    expect(keys).toContain('avgLabourPct');
  });

  it('monthlySales and avgDz have higherIsBetter=true', () => {
    const sales  = BENCHMARK_METRICS.find(m => m.key === 'monthlySales');
    const dz     = BENCHMARK_METRICS.find(m => m.key === 'avgDz');
    expect(sales.higherIsBetter).toBe(true);
    expect(dz.higherIsBetter).toBe(true);
  });

  it('avgLabourPct has higherIsBetter=false', () => {
    const labour = BENCHMARK_METRICS.find(m => m.key === 'avgLabourPct');
    expect(labour.higherIsBetter).toBe(false);
  });

  it('each metric has fr and en labels', () => {
    for (const m of BENCHMARK_METRICS) {
      expect(typeof m.labelFr).toBe('string');
      expect(typeof m.labelEn).toBe('string');
    }
  });
});

// ── BENCHMARK-001-B  computeNetworkAverages ───────────────────────────────────

describe('BENCHMARK-001-B computeNetworkAverages — basic stats', () => {
  const data = [
    makeLocData({ monthlySales: 60000, avgDz: 8, avgLabourPct: 30 }),
    makeLocData({ monthlySales: 80000, avgDz: 10, avgLabourPct: 25 }),
    makeLocData({ monthlySales: 100000, avgDz: 12, avgLabourPct: 20 }),
  ];

  it('returns stats for each metric key', () => {
    const stats = computeNetworkAverages(data);
    for (const m of BENCHMARK_METRICS) {
      expect(stats).toHaveProperty(m.key);
    }
  });

  it('computes correct mean for monthlySales', () => {
    const stats = computeNetworkAverages(data);
    expect(stats.monthlySales.mean).toBeCloseTo(80000, 0);
  });

  it('computes correct median for monthlySales', () => {
    const stats = computeNetworkAverages(data);
    expect(stats.monthlySales.median).toBeCloseTo(80000, 0);
  });

  it('computes min and max', () => {
    const stats = computeNetworkAverages(data);
    expect(stats.monthlySales.min).toBe(60000);
    expect(stats.monthlySales.max).toBe(100000);
  });

  it('p25 < median < p75 for monthlySales', () => {
    const stats = computeNetworkAverages(data);
    expect(stats.monthlySales.p25).toBeLessThan(stats.monthlySales.median);
    expect(stats.monthlySales.p75).toBeGreaterThan(stats.monthlySales.median);
  });

  it('count reflects only positive values', () => {
    const stats = computeNetworkAverages(data);
    expect(stats.monthlySales.count).toBe(3);
  });

  it('ignores zero and negative values', () => {
    const dataWithZero = [
      ...data,
      makeLocData({ monthlySales: 0 }),
      makeLocData({ monthlySales: -100 }),
    ];
    const stats = computeNetworkAverages(dataWithZero);
    expect(stats.monthlySales.count).toBe(3);
  });

  it('returns empty stats for empty array', () => {
    const stats = computeNetworkAverages([]);
    for (const m of BENCHMARK_METRICS) {
      expect(stats[m.key].count).toBe(0);
      expect(stats[m.key].mean).toBe(0);
    }
  });
});

// ── BENCHMARK-001-C  benchmarkLocation ───────────────────────────────────────

describe('BENCHMARK-001-C benchmarkLocation — ranking', () => {
  const networkData = [
    makeLocData({ monthlySales: 60000, avgDz: 8,  avgLabourPct: 30 }),
    makeLocData({ monthlySales: 80000, avgDz: 10, avgLabourPct: 25 }),
    makeLocData({ monthlySales: 100000, avgDz: 12, avgLabourPct: 20 }),
  ];
  const stats = computeNetworkAverages(networkData);

  it('top performer gets rank >= 50 for monthlySales', () => {
    const bm = benchmarkLocation(makeLocData({ monthlySales: 100000 }), stats);
    expect(bm.monthlySales.rank).toBeGreaterThanOrEqual(50);
  });

  it('bottom performer gets rank <= 50 for monthlySales', () => {
    const bm = benchmarkLocation(makeLocData({ monthlySales: 60000 }), stats);
    expect(bm.monthlySales.rank).toBeLessThanOrEqual(50);
  });

  it('aboveAvg=true when monthlySales >= mean', () => {
    const bm = benchmarkLocation(makeLocData({ monthlySales: 90000 }), stats);
    expect(bm.monthlySales.aboveAvg).toBe(true);
  });

  it('aboveAvg=false when monthlySales < mean', () => {
    const bm = benchmarkLocation(makeLocData({ monthlySales: 65000 }), stats);
    expect(bm.monthlySales.aboveAvg).toBe(false);
  });

  it('labour: low pct → aboveAvg=true (lower is better)', () => {
    const bm = benchmarkLocation(makeLocData({ avgLabourPct: 20 }), stats);
    expect(bm.avgLabourPct.aboveAvg).toBe(true);
  });

  it('labour: high pct → aboveAvg=false (lower is better)', () => {
    const bm = benchmarkLocation(makeLocData({ avgLabourPct: 32 }), stats);
    expect(bm.avgLabourPct.aboveAvg).toBe(false);
  });

  it('labour: low pct → high rank (inverted)', () => {
    const bm = benchmarkLocation(makeLocData({ avgLabourPct: 20 }), stats);
    expect(bm.avgLabourPct.rank).toBeGreaterThanOrEqual(50);
  });

  it('rank is null when value is 0 or missing', () => {
    const bm = benchmarkLocation(makeLocData({ monthlySales: 0 }), stats);
    expect(bm.monthlySales.rank).toBeNull();
    expect(bm.monthlySales.aboveAvg).toBeNull();
  });

  it('rank is null when count < 2', () => {
    const singleStats = computeNetworkAverages([makeLocData({ monthlySales: 80000 })]);
    const bm = benchmarkLocation(makeLocData({ monthlySales: 80000 }), singleStats);
    expect(bm.monthlySales.rank).toBeNull();
  });

  it('networkMean is populated in result', () => {
    const bm = benchmarkLocation(makeLocData(), stats);
    expect(bm.monthlySales.networkMean).toBeCloseTo(80000, 0);
  });
});

// ── BENCHMARK-001-D  rankTier and rankTierColor ───────────────────────────────

describe('BENCHMARK-001-D rankTier', () => {
  it('returns P75+ for rank >= 75', () => {
    expect(rankTier(75, 'en')).toBe('P75+');
    expect(rankTier(99, 'en')).toBe('P75+');
  });

  it('returns P50+ for rank 50-74', () => {
    expect(rankTier(50, 'en')).toBe('P50+');
    expect(rankTier(74, 'en')).toBe('P50+');
  });

  it('returns P25+ for rank 25-49', () => {
    expect(rankTier(25, 'en')).toBe('P25+');
    expect(rankTier(49, 'en')).toBe('P25+');
  });

  it('returns bottom quartile label for rank < 25', () => {
    expect(rankTier(0,  'en')).toBe('Bottom quartile');
    expect(rankTier(24, 'fr')).toBe('Bas quartile');
  });

  it('returns N/A or N/D for null rank', () => {
    expect(rankTier(null, 'en')).toBe('N/A');
    expect(rankTier(null, 'fr')).toBe('N/D');
  });
});

describe('BENCHMARK-001-D rankTierColor', () => {
  it('returns green for rank >= 75', () => {
    expect(rankTierColor(75)).toBe('#22c55e');
  });

  it('returns amber for rank 25-49', () => {
    expect(rankTierColor(30)).toBe('#f59e0b');
  });

  it('returns red for rank < 25', () => {
    expect(rankTierColor(10)).toBe('#ef4444');
  });

  it('returns grey for null rank', () => {
    expect(rankTierColor(null)).toBe('#64748b');
  });
});
