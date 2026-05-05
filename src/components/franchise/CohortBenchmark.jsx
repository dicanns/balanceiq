import React, { useMemo } from 'react';
import {
  BENCHMARK_METRICS,
  computeNetworkAverages,
  benchmarkLocation,
  rankTier,
  rankTierColor,
} from '../../services/cohortBenchmark.js';

const UI = {
  fr: {
    title:       'Analyse comparative',
    subtitle:    'Performance de chaque succursale par rapport à la moyenne du réseau.',
    networkAvg:  'Moy. réseau',
    noData:      'Données insuffisantes pour comparer (moins de 2 succursales actives).',
    aboveAvg:    'Au-dessus',
    belowAvg:    'En dessous',
    na:          'N/D',
    location:    'Succursale',
    rank:        'Rang',
  },
  en: {
    title:       'Cohort Benchmarking',
    subtitle:    'Each location\'s performance vs the network average.',
    networkAvg:  'Net. avg',
    noData:      'Not enough data to compare (fewer than 2 active locations).',
    aboveAvg:    'Above avg',
    belowAvg:    'Below avg',
    na:          'N/A',
    location:    'Location',
    rank:        'Rank',
  },
};

function fmt(value, format, lang) {
  if (format === 'currency') {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 2,
    }).format(value);
  }
  if (format === 'pct') return `${value.toFixed(1)}%`;
  return String(value);
}

function MetricBar({ value, networkMean, min, max, format, lang, higherIsBetter }) {
  const range    = max - min || 1;
  const valPct   = Math.min(100, Math.max(0, ((value - min) / range) * 100));
  const avgPct   = Math.min(100, Math.max(0, ((networkMean - min) / range) * 100));
  const above    = higherIsBetter ? value >= networkMean : value <= networkMean;
  const barColor = above ? '#22c55e' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ position: 'relative', height: 6, background: 'rgba(148,163,184,0.15)', borderRadius: 3 }}>
        {/* Value bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${valPct}%`, background: barColor, borderRadius: 3, transition: 'width 0.3s',
        }} />
        {/* Network average marker */}
        <div style={{
          position: 'absolute', top: -2, bottom: -2, width: 2,
          left: `${avgPct}%`, background: 'rgba(148,163,184,0.7)',
          borderRadius: 1, transform: 'translateX(-50%)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(148,163,184,0.7)' }}>
        <span>{fmt(value, format, lang)}</span>
        <span>{fmt(networkMean, format, lang)}</span>
      </div>
    </div>
  );
}

function RankBadge({ rank, lang }) {
  const color = rankTierColor(rank);
  const label = rankTier(rank, lang);
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 8,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      whiteSpace: 'nowrap',
    }}>
      {rank !== null ? `${rank}` : label}
    </span>
  );
}

export default function CohortBenchmark({ monthlyData = {}, locations = [], lang, t }) {
  const fr = lang !== 'en';
  const T  = UI[fr ? 'fr' : 'en'];

  const activeLocs = useMemo(
    () => locations.filter(l => monthlyData[l.id] && (monthlyData[l.id].monthlySales > 0 || monthlyData[l.id].avgDz > 0)),
    [locations, monthlyData],
  );

  const dataArray = useMemo(
    () => activeLocs.map(l => monthlyData[l.id] || {}),
    [activeLocs, monthlyData],
  );

  const networkStats = useMemo(() => computeNetworkAverages(dataArray), [dataArray]);

  const locationBenchmarks = useMemo(
    () => activeLocs.map(loc => ({
      loc,
      bm: benchmarkLocation(monthlyData[loc.id] || {}, networkStats),
    })).sort((a, b) => {
      // sort by avg rank descending (best first)
      const rankOf = bm => {
        const ranks = BENCHMARK_METRICS.map(m => bm[m.key]?.rank).filter(r => r !== null);
        return ranks.length ? ranks.reduce((s, r) => s + r, 0) / ranks.length : 0;
      };
      return rankOf(b.bm) - rankOf(a.bm);
    }),
    [activeLocs, monthlyData, networkStats],
  );

  if (activeLocs.length < 2) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>
        {T.noData}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{T.title}</div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{T.subtitle}</div>
      </div>

      {/* Network averages summary row */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {BENCHMARK_METRICS.map(m => {
          const stat = networkStats[m.key];
          if (!stat || stat.count === 0) return null;
          return (
            <div key={m.key} style={{
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 9, padding: '9px 14px', flex: '1 1 auto', minWidth: 120,
            }}>
              <div style={{ fontSize: 8.5, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600, marginBottom: 3 }}>
                {T.networkAvg} — {fr ? m.labelFr : m.labelEn}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#a78bfa' }}>
                {fmt(stat.mean, m.format, lang)}
              </div>
              <div style={{ fontSize: 9, color: t.textMuted, marginTop: 2 }}>
                P25: {fmt(stat.p25, m.format, lang)} &nbsp;·&nbsp; P75: {fmt(stat.p75, m.format, lang)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-location cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {locationBenchmarks.map(({ loc, bm }, idx) => {
          const avgRanks = BENCHMARK_METRICS.map(m => bm[m.key]?.rank).filter(r => r !== null);
          const compositeRank = avgRanks.length ? Math.round(avgRanks.reduce((s, r) => s + r, 0) / avgRanks.length) : null;
          const compositeColor = rankTierColor(compositeRank);

          return (
            <div key={loc.id} style={{
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 9, overflow: 'hidden',
            }}>
              {/* Location header */}
              <div style={{
                padding: '8px 14px', borderBottom: `1px solid ${t.dividerMid}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: '#a78bfa',
                  background: 'rgba(167,139,250,0.1)', padding: '2px 7px', borderRadius: 6,
                }}>
                  #{idx + 1}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.text, flex: 1 }}>{loc.nom}</span>
                <span style={{ fontSize: 9, color: t.textMuted, marginRight: 4 }}>{T.rank}</span>
                <span style={{
                  fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: compositeColor,
                }}>
                  {compositeRank !== null ? `${compositeRank}` : T.na}
                </span>
                <RankBadge rank={compositeRank} lang={lang} />
              </div>

              {/* Metrics grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 0 }}>
                {BENCHMARK_METRICS.map((m, mi) => {
                  const b    = bm[m.key];
                  const stat = networkStats[m.key];
                  const hasData = b && b.rank !== null;
                  return (
                    <div key={m.key} style={{
                      padding: '10px 14px',
                      borderRight: mi < BENCHMARK_METRICS.length - 1 ? `1px solid ${t.dividerMid}` : 'none',
                    }}>
                      <div style={{ fontSize: 9, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                        {fr ? m.labelFr : m.labelEn}
                      </div>
                      {hasData ? (
                        <>
                          <MetricBar
                            value={b.value}
                            networkMean={b.networkMean}
                            min={stat.min}
                            max={stat.max}
                            format={m.format}
                            lang={lang}
                            higherIsBetter={m.higherIsBetter}
                          />
                          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <RankBadge rank={b.rank} lang={lang} />
                            <span style={{ fontSize: 9, color: b.aboveAvg ? '#22c55e' : '#ef4444' }}>
                              {b.aboveAvg ? T.aboveAvg : T.belowAvg}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: t.textMuted }}>{T.na}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
