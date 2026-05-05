import React, { useState, useEffect, useCallback } from 'react';
import { buildActionItems, actionItemCount } from '../../services/actionCenter.js';

const SEV_COLOR  = { critical: '#ef4444', warning: '#f59e0b', info: '#60a5fa' };
const SEV_BG     = { critical: 'rgba(239,68,68,0.08)', warning: 'rgba(245,158,11,0.08)', info: 'rgba(96,165,250,0.08)' };
const SEV_BORDER = { critical: 'rgba(239,68,68,0.25)', warning: 'rgba(245,158,11,0.25)', info: 'rgba(96,165,250,0.25)' };

const UI = {
  fr: {
    title:      'Centre d\'action',
    subtitle:   'Éléments réseau nécessitant votre attention.',
    allClear:   'Aucune action requise.',
    allClearSub:'Le réseau fonctionne normalement.',
    period:     'Période',
    goTo:       'Voir',
    loading:    '…',
    acked:      'Acquitté',
    types: {
      royalty_exception: 'Redevance',
      low_score:         'Score bas',
      no_score:          'Non évalué',
    },
    badge: (n) => n === 1 ? '1 action requise' : `${n} actions requises`,
    critical: 'Critique',
    warning:  'Avertissement',
    info:     'Info',
  },
  en: {
    title:      'Action Center',
    subtitle:   'Network items requiring your attention.',
    allClear:   'No actions required.',
    allClearSub:'The network is operating normally.',
    period:     'Period',
    goTo:       'View',
    loading:    '…',
    acked:      'Acknowledged',
    types: {
      royalty_exception: 'Royalty',
      low_score:         'Low score',
      no_score:          'Not evaluated',
    },
    badge: (n) => n === 1 ? '1 action required' : `${n} actions required`,
    critical: 'Critical',
    warning:  'Warning',
    info:     'Info',
  },
};

function defaultPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function SevBadge({ severity, T }) {
  const label = T[severity] || severity;
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
      padding: '2px 7px', borderRadius: 8,
      background: SEV_BG[severity], color: SEV_COLOR[severity],
      border: `1px solid ${SEV_BORDER[severity]}`, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export default function ActionCenter({ t, lang, locations = [], onNavigate }) {
  const fr = lang !== 'en';
  const T = UI[fr ? 'fr' : 'en'];

  const [period, setPeriod]   = useState(defaultPeriod);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [exceptions, scores] = await Promise.all([
      window.api?.royaltyException?.list?.({ includeResolved: false }) ?? [],
      window.api?.networkScore?.list?.(period) ?? [],
    ]);
    setItems(buildActionItems({ exceptions, networkScores: scores, locations, period }));
    setLoading(false);
  }, [period, locations]);

  useEffect(() => { load(); }, [load]);

  const counts = actionItemCount(items);
  const grouped = {
    critical: items.filter(i => i.severity === 'critical'),
    warning:  items.filter(i => i.severity === 'warning'),
    info:     items.filter(i => i.severity === 'info'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{T.title}</span>
            {counts.total > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
                background: counts.critical > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                color: counts.critical > 0 ? '#ef4444' : '#f59e0b',
              }}>
                {T.badge(counts.total)}
              </span>
            )}
          </div>
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

      {loading ? (
        <div style={{ fontSize: 12, color: t.textMuted, padding: 12 }}>{T.loading}</div>
      ) : items.length === 0 ? (
        <div style={{
          background: t.card, border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 12, padding: 32,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28 }}>✓</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>{T.allClear}</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{T.allClearSub}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(['critical', 'warning', 'info']).map(sev => {
            const group = grouped[sev];
            if (group.length === 0) return null;
            return (
              <div key={sev}>
                <div style={{ fontSize: 10, fontWeight: 700, color: SEV_COLOR[sev], textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>
                  {T[sev]} ({group.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.map(item => (
                    <div
                      key={item.id}
                      style={{
                        background: item.acknowledged ? t.section : t.card,
                        border: `1px solid ${item.acknowledged ? t.divider : SEV_BORDER[sev]}`,
                        borderRadius: 9, padding: '10px 14px',
                        opacity: item.acknowledged ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      }}
                    >
                      <SevBadge severity={sev} T={T} />

                      <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {T.types[item.type] || item.type}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.locName}
                        </div>
                        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>
                          {fr ? item.bodyFr : item.bodyEn}
                        </div>
                      </div>

                      {item.acknowledged && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#818cf8', padding: '2px 6px', borderRadius: 6, background: 'rgba(129,140,248,0.1)' }}>
                          {T.acked}
                        </span>
                      )}

                      {item.navigateTo && onNavigate && (
                        <button
                          onClick={() => onNavigate(item.navigateTo)}
                          style={{
                            padding: '3px 10px', borderRadius: 5, border: `1px solid ${SEV_BORDER[sev]}`,
                            background: SEV_BG[sev], color: SEV_COLOR[sev],
                            cursor: 'pointer', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                          }}
                        >
                          {T.goTo}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
