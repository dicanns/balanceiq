/**
 * Forecast Prediction Engine Tests
 * Tests the rules-based production forecasting engine:
 *  - Weighted DOW base (recent weeks weighted 4-3-2-1)
 *  - Stockout correction (+12%)
 *  - Weather factor (temp sensitivity + condition penalty)
 *  - Trend factor application
 *  - Waste reduction factor
 *  - Final prediction = base × (1+weather) × (1+trend) × wasteFactor
 */
import { describe, it, expect } from 'vitest';
import {
  calcForecastBase,
  calcWeatherFactor,
  calcForecastPrediction,
} from '../utils/calculations.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
// Build a sales history entry for a given DOW and week-ago offset
const sale = (dow, weeksAgo, qty, date, stockout = false) => ({
  dow,
  date: date || `2026-${String(3 - weeksAgo).padStart(2,'0')}-01`, // approx date
  quantity_sold: qty,
  stockout,
});

// ────────────────────────────────────────────────────────────────────────────
describe('Forecast base — weighted DOW average', () => {
  it('single data point returns it as base', () => {
    const history = [sale(2, 0, 120, '2026-03-18')];
    const { base, confidence, dataPoints } = calcForecastBase(history, 2);
    expect(base).toBeCloseTo(120, 1);
    expect(dataPoints).toBe(1);
    expect(confidence).toBe('base');
  });

  it('two data points — low confidence', () => {
    const history = [
      sale(2, 0, 120, '2026-03-18'),
      sale(2, 1, 100, '2026-03-11'),
    ];
    const { confidence } = calcForecastBase(history, 2);
    expect(confidence).toBe('low');
  });

  it('4-7 data points — medium confidence', () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      sale(2, i, 110, `2026-${String(3 - Math.floor(i / 4)).padStart(2,'0')}-${String(18 - i * 7).padStart(2,'0')}`)
    );
    const { confidence } = calcForecastBase(history, 2);
    expect(confidence).toBe('medium');
  });

  it('8+ data points — high confidence', () => {
    const history = Array.from({ length: 9 }, (_, i) =>
      sale(2, i, 110, `2024-0${Math.floor(i/4)+1}-${String(1 + i).padStart(2,'0')}`)
    );
    const { confidence } = calcForecastBase(history, 2);
    expect(confidence).toBe('high');
  });

  it('most recent week weighted 4× vs oldest week weighted 1×', () => {
    // Two points: last week = 200 (weight 4), two weeks ago = 100 (weight 3)
    const history = [
      sale(3, 0, 200, '2026-03-19'), // most recent
      sale(3, 1, 100, '2026-03-12'), // older
    ];
    const { base } = calcForecastBase(history, 3);
    // weighted: (200×4 + 100×3) / (4+3) = 1100/7 = 157.14
    expect(base).toBeCloseTo(157.14, 1);
  });

  it('recent heavy weighting means recent spike affects prediction more', () => {
    // All history around 100, last week was 160 (holiday spike)
    const history = [
      sale(5, 0, 160, '2026-03-20'), // weight 4
      sale(5, 1, 100, '2026-03-13'), // weight 3
      sale(5, 2, 100, '2026-03-06'), // weight 2
      sale(5, 3, 100, '2026-02-27'), // weight 1
    ];
    const { base } = calcForecastBase(history, 5);
    // (160×4 + 100×3 + 100×2 + 100×1) / (4+3+2+1) = (640+300+200+100)/10 = 124
    expect(base).toBeCloseTo(124, 1);
  });

  it('stockout days corrected upward by 12%', () => {
    // Sold 100 but stocked out — real demand was ~112
    const withStockout    = [sale(1, 0, 100, '2026-03-23', true)];
    const withoutStockout = [sale(1, 0, 100, '2026-03-23', false)];

    const stockoutResult   = calcForecastBase(withStockout, 1);
    const normalResult     = calcForecastBase(withoutStockout, 1);

    expect(stockoutResult.base).toBeCloseTo(112, 1);  // 100 × 1.12
    expect(normalResult.base).toBeCloseTo(100, 1);
  });

  it('ignores data points for other days of the week', () => {
    const history = [
      sale(2, 0, 150, '2026-03-18'), // Wed
      sale(3, 0, 999, '2026-03-19'), // Thu — should be ignored when predicting Wed
      sale(2, 1, 130, '2026-03-11'), // Wed
    ];
    const { base, dataPoints } = calcForecastBase(history, 2);
    expect(dataPoints).toBe(2);      // only the 2 Wednesday entries
    expect(base).toBeLessThan(200);  // not influenced by Thursday's 999
  });

  it('returns zero base when no data for target DOW', () => {
    const history = [sale(1, 0, 100, '2026-03-23')]; // only Monday data
    const { base, dataPoints } = calcForecastBase(history, 5); // predicting Friday
    expect(base).toBe(0);
    expect(dataPoints).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Weather factor', () => {
  it('no effect at neutral temperature (8-14°C) with sensitivity=0', () => {
    expect(calcWeatherFactor(12, 0, 0)).toBe(0);   // clear sky
    expect(calcWeatherFactor(10, 0, 1)).toBe(0);   // sensitivity=1 but temp neutral
  });

  it('cold weather (<5°C) reduces demand', () => {
    const factor = calcWeatherFactor(2, 0, 1); // sensitivity=1 (max)
    expect(factor).toBe(-0.15);
  });

  it('cold weather with higher sensitivity = larger reduction', () => {
    const f0 = calcWeatherFactor(-5, 0, 0);  // no sensitivity
    const f1 = calcWeatherFactor(-5, 0, 1);  // full sensitivity
    expect(f0).toBe(0);
    expect(f1).toBe(-0.15);
  });

  it('warm weather (15-24°C) increases demand slightly', () => {
    const factor = calcWeatherFactor(20, 0, 1);
    expect(factor).toBe(0.10);
  });

  it('hot weather (≥25°C) increases demand more', () => {
    const factor = calcWeatherFactor(28, 0, 1);
    expect(factor).toBe(0.20);
  });

  it('rainy day reduces demand by 5% (code 61)', () => {
    const factor = calcWeatherFactor(15, 61, 0);  // rain, no sensitivity
    expect(factor).toBeCloseTo(-0.05, 3);
  });

  it('snowy day reduces demand by 10% (code 71)', () => {
    const factor = calcWeatherFactor(-2, 71, 0);
    expect(factor).toBeCloseTo(-0.10, 3);
  });

  it('cold + snowy = temp penalty + snow penalty', () => {
    // -5°C, sensitivity=1 → -0.15 from temp, -0.10 from snow = -0.25
    const factor = calcWeatherFactor(-5, 73, 1);
    expect(factor).toBeCloseTo(-0.25, 3);
  });

  it('hot + rainy = temp boost partially offset by rain penalty', () => {
    // 30°C sens=1 → +0.20, rain code 80 → -0.05 = +0.15
    const factor = calcWeatherFactor(30, 80, 1);
    expect(factor).toBeCloseTo(0.15, 3);
  });

  it('shower codes (80-82) trigger rain penalty', () => {
    [80, 81, 82].forEach((code) => {
      expect(calcWeatherFactor(15, code, 0)).toBeCloseTo(-0.05, 3);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Full forecast prediction', () => {
  it('no weather or trend adjustment = base rounded', () => {
    expect(calcForecastPrediction(120.4, 0, 0, 1)).toBe(120);
    expect(calcForecastPrediction(119.6, 0, 0, 1)).toBe(120);
  });

  it('weather adjustment increases production on hot sunny day', () => {
    // base=100, hot+sunny → +20%
    const result = calcForecastPrediction(100, 0.20, 0, 1);
    expect(result).toBe(120);
  });

  it('rainy cold day reduces production recommendation', () => {
    // base=150, weather=-25% → 150 × 0.75 = 112.5 → 113
    const result = calcForecastPrediction(150, -0.25, 0, 1);
    expect(result).toBe(113);
  });

  it('trend factor applied on top of weather', () => {
    // base=100, weather=+10%, trend=+5% → 100 × 1.10 × 1.05 = 115.5 → 116
    const result = calcForecastPrediction(100, 0.10, 0.05, 1);
    expect(result).toBe(116);
  });

  it('waste reduction factor cuts production recommendation', () => {
    // base=100, chronic 20% waste → wasteFactor = 1 - 0.20×0.5 = 0.90
    const wasteFactor = 1 - 0.20 * 0.5;
    const result = calcForecastPrediction(100, 0, 0, wasteFactor);
    expect(result).toBe(90);
  });

  it('prediction never goes below 0', () => {
    // extreme negative weather
    expect(calcForecastPrediction(50, -2, 0, 1)).toBe(0);
    expect(calcForecastPrediction(0, 0, 0, 1)).toBe(0);
  });

  it('realistic Dic Ann\'s Friday forecast', () => {
    // base=180 hamburgers (Fri DOW avg), warm sunny day (+15%), positive trend (+3%)
    const base    = 180;
    const weather = calcWeatherFactor(22, 0, 0.8); // 22°C clear, sensitivity 0.8
    const trend   = 0.03;
    const result  = calcForecastPrediction(base, weather, trend, 1);
    // weather = 0.8 × 0.10 = 0.08 (warm range)
    // 180 × 1.08 × 1.03 = 200.1 → 200
    expect(result).toBeCloseTo(200, 0);
  });

  it('combines stockout-corrected base with weather', () => {
    // Stocked out at 150 on last Friday → corrected base = 168
    // Hot day (+20%) → 168 × 1.20 = 201.6 → 202
    const history = [sale(5, 0, 150, '2026-03-20', true)];
    const { base } = calcForecastBase(history, 5);
    expect(base).toBeCloseTo(168, 1);
    const result = calcForecastPrediction(base, 0.20, 0, 1);
    expect(result).toBe(202);
  });
});
