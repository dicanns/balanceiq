import React, { useState, useEffect, useCallback } from 'react';
import { computeCloseScore, deriveRates, BAND_COLOR } from '../services/closeScorecard.js';

function dk(d) { return d.toISOString().slice(0, 10); }

function ScoreRow({ label, value, t }) {
  const pct = value != null ? Math.round(value * 100) : null;
  const color = value == null ? t.textMuted : value >= 0.85 ? '#22c55e' : value >= 0.65 ? '#fbbf24' : '#ef4444';
  return (
    <tr style={{ borderTop: `1px solid ${t.divider}` }}>
      <td style={{ padding: '5px 12px', color: t.text, fontSize: 11 }}>{label}</td>
      <td style={{ padding: '5px 12px', fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 700, color, textAlign: 'right' }}>
        {pct != null ? `${pct}%` : '—'}
      </td>
    </tr>
  );
}

export default function FranchiseCloseScorecard({ lang, t, canUse }) {
  const fr = lang !== 'en';
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!window.api?.closeAssurance?.compliance) { setLoading(false); return; }
    try {
      const today = dk(new Date());
      const from  = dk(new Date(Date.now() - 30 * 86400000));
      const kpis = await window.api.closeAssurance.compliance.kpis({ dateFrom: from, dateTo: today });
      if (kpis?.sessionCount > 0) {
        setScorecard(computeCloseScore(deriveRates(kpis)));
      } else {
        setScorecard(null);
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ padding: '12px 0', fontSize: 11, color: t.textMuted, textAlign: 'center' }}>
      {fr ? 'Chargement...' : 'Loading...'}
    </div>
  );

  if (!scorecard) return (
    <div style={{ padding: '10px 0', fontSize: 11, color: t.textMuted, textAlign: 'center' }}>
      {fr ? 'Aucune session de fermeture dans les 30 derniers jours.' : 'No close sessions in the last 30 days.'}
    </div>
  );

  const bandLabel = {
    green:  fr ? 'Excellente' : 'Excellent',
    yellow: fr ? 'Acceptable' : 'Acceptable',
    red:    fr ? 'Insuffisante' : 'Needs attention',
  }[scorecard.band];

  const rateLabels = {
    onTimeClose:          { fr: 'Fermeture à temps',      en: 'On-time close' },
    varianceCompliance:   { fr: 'Conformité écarts',      en: 'Variance compliance' },
    evidenceCompleteness: { fr: 'Complétude preuves',     en: 'Evidence completeness' },
    checklistCompliance:  { fr: 'Conformité checklist',   en: 'Checklist compliance' },
    depositVerification:  { fr: 'Vérification dépôts',    en: 'Deposit verification' },
    noReopen:             { fr: 'Sans réouverture',        en: 'No-reopen rate' },
  };

  return (
    <div style={{ marginTop: 12, borderTop: `1px dashed ${t.divider}`, paddingTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {fr ? 'Score de conformité fermeture (30 j)' : 'Close compliance score (30 d)'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: BAND_COLOR[scorecard.band], fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {scorecard.score}
        </div>
        <div>
          <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}>/100</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BAND_COLOR[scorecard.band] }}>{bandLabel}</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {scorecard.entries.map(e => (
            <ScoreRow key={e.key} label={fr ? rateLabels[e.key].fr : rateLabels[e.key].en} value={e.value} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
