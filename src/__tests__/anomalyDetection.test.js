/**
 * Anomaly Detection & DOW Profiling Tests
 * Tests the Intelligence module's sales anomaly logic:
 *  - ±25% from DOW average = anomaly flag
 *  - DOW profile building from historical data
 *  - Cashier variance pattern detection (systematic short/over)
 */
import { describe, it, expect } from 'vitest';
import {
  calcAnomalyPct, isAnomaly, buildDOWProfiles,
} from '../utils/calculations.js';

// ────────────────────────────────────────────────────────────────────────────
describe('Anomaly percentage calculation', () => {
  it('detects no anomaly on average day', () => {
    const pct = calcAnomalyPct(1000, 1000);
    expect(pct).toBe(0);
    expect(isAnomaly(pct)).toBe(false);
  });

  it('detects positive anomaly (above average)', () => {
    // Tuesday avg $1200, actual $1560 → +30%
    const pct = calcAnomalyPct(1560, 1200);
    expect(pct).toBeCloseTo(30, 1);
    expect(isAnomaly(pct)).toBe(true);
  });

  it('detects negative anomaly (below average)', () => {
    // Monday avg $1500, actual $900 → -40%
    const pct = calcAnomalyPct(900, 1500);
    expect(pct).toBeCloseTo(-40, 1);
    expect(isAnomaly(pct)).toBe(true);
  });

  it('exactly at threshold boundary is NOT an anomaly (>25, not ≥25)', () => {
    // Exactly 25% above average
    const pct = calcAnomalyPct(1250, 1000);
    expect(pct).toBe(25);
    expect(isAnomaly(pct)).toBe(false);  // must be OVER 25, not equal
  });

  it('just over threshold IS an anomaly', () => {
    const pct = calcAnomalyPct(1251, 1000);
    expect(pct).toBeCloseTo(25.1, 1);
    expect(isAnomaly(pct)).toBe(true);
  });

  it('handles custom threshold', () => {
    const pct = calcAnomalyPct(1300, 1000);  // 30% above
    expect(isAnomaly(pct, 35)).toBe(false);   // 30 < 35 → not anomaly
    expect(isAnomaly(pct, 25)).toBe(true);    // 30 > 25 → anomaly
  });

  it('returns null when average is zero', () => {
    expect(calcAnomalyPct(500, 0)).toBeNull();
    expect(calcAnomalyPct(500, null)).toBeNull();
  });

  it('null pct is never an anomaly', () => {
    expect(isAnomaly(null)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('DOW profile building', () => {
  // 4 weeks of a typical Dic Ann's pattern
  const historicalSales = [
    // Week 1
    { dow: 1, venteNet: 1100 }, // Mon
    { dow: 2, venteNet: 1250 }, // Tue
    { dow: 3, venteNet: 1300 }, // Wed
    { dow: 4, venteNet: 1400 }, // Thu
    { dow: 5, venteNet: 1800 }, // Fri
    { dow: 6, venteNet: 2100 }, // Sat
    { dow: 0, venteNet: 900  }, // Sun
    // Week 2
    { dow: 1, venteNet: 1050 },
    { dow: 2, venteNet: 1200 },
    { dow: 3, venteNet: 1350 },
    { dow: 4, venteNet: 1450 },
    { dow: 5, venteNet: 1750 },
    { dow: 6, venteNet: 2050 },
    { dow: 0, venteNet: 950  },
    // Week 3
    { dow: 1, venteNet: 1150 },
    { dow: 2, venteNet: 1300 },
    { dow: 3, venteNet: 1280 },
    { dow: 4, venteNet: 1500 },
    { dow: 5, venteNet: 1900 },
    { dow: 6, venteNet: 2200 },
    { dow: 0, venteNet: 880  },
  ];

  it('builds profile with 3 samples per DOW', () => {
    const profiles = buildDOWProfiles(historicalSales);
    // Each DOW has 3 data points
    profiles.forEach((p) => {
      expect(p.n).toBe(3);
    });
  });

  it('calculates correct average for Monday (DOW=1)', () => {
    const profiles = buildDOWProfiles(historicalSales);
    // Mon: 1100 + 1050 + 1150 = 3300 / 3 = 1100
    expect(profiles[1].avgSales).toBe(1100);
  });

  it('calculates correct average for Saturday (DOW=6)', () => {
    const profiles = buildDOWProfiles(historicalSales);
    // Sat: 2100 + 2050 + 2200 = 6350 / 3 = 2116.67
    expect(profiles[6].avgSales).toBeCloseTo(2116.67, 1);
  });

  it('Saturday average is highest (peak day)', () => {
    const profiles = buildDOWProfiles(historicalSales);
    const avgSales = profiles.map((p) => p.avgSales);
    const maxAvg   = Math.max(...avgSales);
    expect(profiles[6].avgSales).toBe(maxAvg);
  });

  it('Sunday average is lowest (slowest day)', () => {
    const profiles = buildDOWProfiles(historicalSales);
    const avgSales = profiles.map((p) => p.avgSales);
    const minAvg   = Math.min(...avgSales.filter((v) => v > 0));
    expect(profiles[0].avgSales).toBe(minAvg);
  });

  it('ignores zero-sale days (closed days)', () => {
    const dataWithClosed = [
      { dow: 1, venteNet: 1000 },
      { dow: 1, venteNet: 0    },  // closed — should not count
      { dow: 1, venteNet: 1200 },
    ];
    const profiles = buildDOWProfiles(dataWithClosed);
    expect(profiles[1].n).toBe(2);          // only 2 open days counted
    expect(profiles[1].avgSales).toBe(1100); // (1000+1200)/2
  });

  it('empty data returns zero profiles', () => {
    const profiles = buildDOWProfiles([]);
    profiles.forEach((p) => {
      expect(p.n).toBe(0);
      expect(p.avgSales).toBe(0);
    });
  });

  it('requires minimum 3 samples before anomaly detection is reliable', () => {
    const sparse = [
      { dow: 3, venteNet: 1000 },
      { dow: 3, venteNet: 1100 },
    ];
    const profiles = buildDOWProfiles(sparse);
    // Profile exists but app should check n<3 before flagging anomalies
    expect(profiles[3].n).toBe(2); // < 3 threshold
    expect(profiles[3].avgSales).toBe(1050);
  });

  it('detects anomaly on a day with sufficient profile', () => {
    const profiles = buildDOWProfiles(historicalSales);
    const mondayAvg = profiles[1].avgSales; // 1100
    const mondayPct = calcAnomalyPct(1600, mondayAvg); // 1600 vs 1100 avg = +45.5%
    expect(isAnomaly(mondayPct)).toBe(true);
    expect(mondayPct).toBeGreaterThan(25);
  });

  it('normal busy Saturday not flagged as anomaly', () => {
    const profiles  = buildDOWProfiles(historicalSales);
    const satAvg    = profiles[6].avgSales; // ~2116
    const satPct    = calcAnomalyPct(2200, satAvg); // ~3.9% above avg
    expect(isAnomaly(satPct)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Cashier variance pattern detection logic', () => {
  // These test the classification logic used in the Intelligence tab:
  // lossAlert = cumul < -50
  // isShort = shortCount >= 3 AND shortCount/n >= 0.5
  // isOver  = overCount  >= 3 AND overCount/n  >= 0.5

  function classifyVariances(ecarts) {
    const n          = ecarts.length;
    const cumul      = ecarts.reduce((s, e) => s + e, 0);
    const shortCount = ecarts.filter((e) => e < -2).length;
    const overCount  = ecarts.filter((e) => e >  2).length;
    const lossAlert  = cumul < -50;
    const isShort    = !lossAlert && shortCount >= 3 && shortCount / n >= 0.5;
    const isOver     = !lossAlert && overCount  >= 3 && overCount  / n >= 0.5;
    return { cumul, shortCount, overCount, lossAlert, isShort, isOver };
  }

  it('flags lossAlert when cumulative variance < -$50', () => {
    const ecarts = [-15, -12, -18, -10, -8];
    const result = classifyVariances(ecarts);
    expect(result.cumul).toBe(-63);
    expect(result.lossAlert).toBe(true);
    expect(result.isShort).toBe(false); // lossAlert takes priority
  });

  it('flags isShort when cashier is short ≥3 times, ≥50% of shifts', () => {
    const ecarts = [-5, -8, -3, 1, -6, 2]; // 4 short out of 6 = 66.7%
    const result = classifyVariances(ecarts);
    expect(result.isShort).toBe(true);
    expect(result.lossAlert).toBe(false);
  });

  it('flags isOver when cashier is over ≥3 times, ≥50% of shifts', () => {
    const ecarts = [5, 3, 8, -1, 4, 2]; // 5 over (>2) out of 6 = 83.3%
    const result = classifyVariances(ecarts);
    expect(result.isOver).toBe(true);
    expect(result.isShort).toBe(false);
  });

  it('clears when cashier has balanced history', () => {
    const ecarts = [1, -1, 0.5, -0.5, 0.8, -0.3];
    const result = classifyVariances(ecarts);
    expect(result.lossAlert).toBe(false);
    expect(result.isShort).toBe(false);
    expect(result.isOver).toBe(false);
  });

  it('does not flag isShort if fewer than 3 short occurrences', () => {
    const ecarts = [-5, -3, 0.5, 1, 2]; // only 2 short
    const result = classifyVariances(ecarts);
    expect(result.isShort).toBe(false);
  });
});
