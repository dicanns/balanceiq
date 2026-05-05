import React, { useState, useEffect, useCallback } from 'react';
import { computeNetworkScore, scoreGrade, scoreColor, COMPONENT_LABELS, SCORE_WEIGHTS } from '../../services/networkScore.js';

// Maps camelCase component key → DB column name
const DB_COL = {
  closeOnTime:         'close_on_time',
  depositReconciled:   'deposit_reconciled',
  royaltyDataComplete: 'royalty_data_complete',
  documentsComplete:   'documents_complete',
  noAnomalies:         'no_anomalies',
  monthEndReady:       'month_end_ready',
};

const UI = {
  fr: {
    title:       'Standards réseau',
    subtitle:    'Scores de conformité par succursale pour la période sélectionnée.',
    period:      'Période',
    noLocs:      'Aucune succursale configurée.',
    noScore:     'Cliquer pour évaluer',
    editTitle:   'Modifier le score',
    save:        'Enregistrer',
    cancel:      'Annuler',
    saved:       'Score enregistré.',
    weight:      'Pond.',
  },
  en: {
    title:       'Network Standards',
    subtitle:    'Compliance scores per location for the selected period.',
    period:      'Period',
    noLocs:      'No locations configured.',
    noScore:     'Click to evaluate',
    editTitle:   'Edit score',
    save:        'Save',
    cancel:      'Cancel',
    saved:       'Score saved.',
    weight:      'Wt.',
  },
};

function defaultPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ScoreBar({ value, color }) {
  const pct = Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(148,163,184,0.15)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'monospace', minWidth: 26, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function ScoreBadge({ score, size = 'md' }) {
  const color = scoreColor(score);
  const grade = scoreGrade(score);
  const sz = size === 'lg' ? { d: 58, numSz: 20, gradeSz: 13 } : { d: 44, numSz: 15, gradeSz: 11 };
  return (
    <div style={{
      width: sz.d, height: sz.d, borderRadius: '50%',
      background: `${color}18`, border: `2px solid ${color}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: sz.numSz, fontWeight: 800, color, lineHeight: 1, fontFamily: 'monospace' }}>{score}</span>
      <span style={{ fontSize: sz.gradeSz, fontWeight: 700, color }}>{grade}</span>
    </div>
  );
}

export default function NetworkStandards({ t, lang, locations = [] }) {
  const fr = lang !== 'en';
  const T = UI[fr ? 'fr' : 'en'];
  const CL = COMPONENT_LABELS[fr ? 'fr' : 'en'];

  const [period, setPeriod] = useState(defaultPeriod);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);

  const loadScores = useCallback(async (p) => {
    if (!window.api?.networkScore?.list) return;
    setLoading(true);
    const rows = await window.api.networkScore.list(p);
    setScores(rows || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadScores(period); }, [period, loadScores]);

  function startEdit(loc) {
    const row = scores.find(s => s.location_id === loc.id);
    setEditing({
      locationId:   loc.id,
      locationName: loc.nom || loc.name || `#${loc.id}`,
      components: {
        closeOnTime:         row ? row.close_on_time : 0,
        depositReconciled:   row ? row.deposit_reconciled : 0,
        royaltyDataComplete: row ? row.royalty_data_complete : 0,
        documentsComplete:   row ? row.documents_complete : 0,
        noAnomalies:         row ? row.no_anomalies : 0,
        monthEndReady:       row ? row.month_end_ready : 0,
      },
    });
  }

  async function saveEdit() {
    if (!editing || !window.api?.networkScore?.save) return;
    const total = computeNetworkScore(editing.components);
    await window.api.networkScore.save({
      locationId:          editing.locationId,
      period,
      closeOnTime:          editing.components.closeOnTime,
      depositReconciled:    editing.components.depositReconciled,
      royaltyDataComplete:  editing.components.royaltyDataComplete,
      documentsComplete:    editing.components.documentsComplete,
      noAnomalies:          editing.components.noAnomalies,
      monthEndReady:        editing.components.monthEndReady,
      totalScore:           total,
    });
    setEditing(null);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2200);
    loadScores(period);
  }

  const scoreMap = Object.fromEntries(scores.map(s => [s.location_id, s]));

  const ranked = [...locations]
    .map(loc => ({ loc, row: scoreMap[loc.id] ?? null }))
    .sort((a, b) => (b.row?.total_score ?? -1) - (a.row?.total_score ?? -1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{T.title}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{T.subtitle}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: t.textMuted }}>{T.period}</span>
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{
              background: t.inputBg ?? '#f8fafc',
              border: `1px solid ${t.inputBorder ?? '#e2e8f0'}`,
              borderRadius: 6, color: t.text ?? '#1e293b',
              fontSize: 11, padding: '4px 8px', outline: 'none',
            }}
          />
        </div>
      </div>

      {savedMsg && (
        <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, padding: '6px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.2)' }}>
          {T.saved}
        </div>
      )}

      {/* Inline editor */}
      {editing && (
        <div style={{ background: t.card, border: '1px solid rgba(167,139,250,0.35)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', marginBottom: 14 }}>
            {T.editTitle} — {editing.locationName} ({period})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.keys(SCORE_WEIGHTS).map(key => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 40px', gap: 8, alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, color: t.text }}>{CL[key]}</span>
                  <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 5 }}>{Math.round(SCORE_WEIGHTS[key] * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={Math.round(editing.components[key] * 100)}
                  onChange={e => setEditing(ed => ({
                    ...ed,
                    components: { ...ed.components, [key]: parseInt(e.target.value) / 100 },
                  }))}
                  style={{ accentColor: '#a78bfa', width: '100%' }}
                />
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#a78bfa', textAlign: 'right' }}>
                  {Math.round(editing.components[key] * 100)}%
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ScoreBadge score={computeNetworkScore(editing.components)} size="lg" />
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setEditing(null)}
              style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.cardBorder}`, background: 'none', color: t.textSub, cursor: 'pointer', fontSize: 11 }}
            >
              {T.cancel}
            </button>
            <button
              onClick={saveEdit}
              style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            >
              {T.save}
            </button>
          </div>
        </div>
      )}

      {/* Location ranking list */}
      {loading ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: 12 }}>…</div>
      ) : locations.length === 0 ? (
        <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10, padding: 28, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>
          {T.noLocs}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ranked.map(({ loc, row }, idx) => {
            const total = row?.total_score ?? null;
            const color = total != null ? scoreColor(Math.round(total)) : '#94a3b8';
            const isActive = editing?.locationId === loc.id;
            return (
              <div
                key={loc.id}
                onClick={() => !isActive && startEdit(loc)}
                style={{
                  background: t.card,
                  border: `1px solid ${isActive ? 'rgba(167,139,250,0.4)' : t.cardBorder}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  cursor: isActive ? 'default' : 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, minWidth: 22, textAlign: 'right' }}>#{idx + 1}</span>

                  {total != null ? (
                    <ScoreBadge score={Math.round(total)} />
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: 'rgba(148,163,184,0.07)',
                      border: '2px dashed rgba(148,163,184,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 18, color: '#94a3b8' }}>+</span>
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: row ? 6 : 0 }}>
                      {loc.nom || loc.name || `Location ${loc.id}`}
                    </div>
                    {row ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                        {Object.keys(SCORE_WEIGHTS).map(key => (
                          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontSize: 9, color: t.textMuted }}>{CL[key]}</span>
                            <ScoreBar value={row[DB_COL[key]]} color={color} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: t.textMuted, fontStyle: 'italic' }}>{T.noScore}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
