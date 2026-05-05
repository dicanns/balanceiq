// Pure cohort benchmarking functions for the franchisor network.
// No DB calls, no Electron dependencies.

export const BENCHMARK_METRICS = [
  { key: 'monthlySales', labelFr: 'Ventes mensuelles', labelEn: 'Monthly sales', higherIsBetter: true,  format: 'currency' },
  { key: 'avgDz',        labelFr: 'Revenu / douzaine', labelEn: 'Revenue / dozen', higherIsBetter: true,  format: 'currency' },
  { key: 'avgLabourPct', labelFr: 'Main-d\'oeuvre %',  labelEn: 'Labour %',        higherIsBetter: false, format: 'pct'      },
];

function sorted(arr) {
  return [...arr].sort((a, b) => a - b);
}

function pct(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Compute per-metric statistics across all location data objects.
 *
 * @param {object[]} locationDataArray  - each item should have the metric keys
 * @returns {{ [metricKey]: { mean, median, p25, p75, min, max, count, values } }}
 */
export function computeNetworkAverages(locationDataArray) {
  const stats = {};
  for (const m of BENCHMARK_METRICS) {
    const values = locationDataArray
      .map(d => d[m.key])
      .filter(v => typeof v === 'number' && v > 0);
    const s = sorted(values);
    stats[m.key] = {
      mean:   mean(values),
      median: pct(s, 50),
      p25:    pct(s, 25),
      p75:    pct(s, 75),
      min:    s[0]              ?? 0,
      max:    s[s.length - 1]  ?? 0,
      count:  values.length,
      values: s,
    };
  }
  return stats;
}

/**
 * Compute how a single location ranks on each metric vs the network.
 *
 * @param {object} locData       - { monthlySales, avgDz, avgLabourPct, ... }
 * @param {object} networkStats  - output of computeNetworkAverages
 * @returns {{ [metricKey]: { value, rank, aboveAvg, networkMean } }}
 *   rank: 0-100 percentile (100 = best, adjusted for direction)
 *   aboveAvg: true if the location outperforms the network average for this metric
 */
export function benchmarkLocation(locData, networkStats) {
  const result = {};
  for (const m of BENCHMARK_METRICS) {
    const val  = locData[m.key];
    const stat = networkStats[m.key];
    if (!stat || stat.count < 2 || typeof val !== 'number' || val <= 0) {
      result[m.key] = { value: val ?? 0, rank: null, aboveAvg: null, networkMean: stat?.mean ?? 0 };
      continue;
    }
    const below    = stat.values.filter(v => v < val).length;
    const rawRank  = (below / stat.count) * 100;
    const rank     = m.higherIsBetter ? rawRank : 100 - rawRank;
    result[m.key] = {
      value:       val,
      rank:        Math.round(rank),
      aboveAvg:    m.higherIsBetter ? val >= stat.mean : val <= stat.mean,
      networkMean: stat.mean,
    };
  }
  return result;
}

/**
 * Human-readable tier label for a rank value.
 * @param {number|null} rank
 * @param {'fr'|'en'}   lang
 */
export function rankTier(rank, lang) {
  if (rank === null) return lang === 'fr' ? 'N/D' : 'N/A';
  if (rank >= 75) return 'P75+';
  if (rank >= 50) return 'P50+';
  if (rank >= 25) return 'P25+';
  return lang === 'fr' ? 'Bas quartile' : 'Bottom quartile';
}

export function rankTierColor(rank) {
  if (rank === null) return '#64748b';
  if (rank >= 75) return '#22c55e';
  if (rank >= 50) return '#84cc16';
  if (rank >= 25) return '#f59e0b';
  return '#ef4444';
}
