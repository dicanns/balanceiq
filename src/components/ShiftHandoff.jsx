import React, { useState } from 'react';
import { SHIFT_KEYS } from '../services/shiftKeys.js';

const STATUS_COLORS = {
  draft:     '#f59e0b',
  submitted: '#3b82f6',
  approved:  '#a78bfa',
  finalized: '#16a34a',
  reopened:  '#ef4444',
};

/**
 * Props:
 *   currentShiftKey      - 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'final' | null
 *   onShiftChange        - (shiftKey) => void
 *   sessionsForDay       - array of close_sessions rows for today (any status)
 *   carryForwardCents    - carry_forward_float_cents from preceding shift (or null)
 *   openingFloatOverride - null | integer cents (user override)
 *   onOverrideFloat      - (cents | null) => void
 *   isFinalShift         - bool
 *   onToggleFinalShift   - (bool) => void
 *   daySummary           - { totalVarianceCents } | null (for final shift view)
 *   T                    - translation map
 *   t                    - theme tokens
 *   lang                 - 'fr' | 'en'
 */
export default function ShiftHandoff({
  currentShiftKey,
  onShiftChange,
  sessionsForDay = [],
  carryForwardCents = null,
  openingFloatOverride = null,
  onOverrideFloat,
  isFinalShift = false,
  onToggleFinalShift,
  daySummary = null,
  T,
  t,
  lang,
}) {
  const fr = lang !== 'en';
  const [overrideInput, setOverrideInput] = useState('');
  const [editingOverride, setEditingOverride] = useState(false);

  const T_ = (key, fallbackFr, fallbackEn) => T?.[key] ?? (fr ? fallbackFr : fallbackEn);

  const shiftLabel = (key) => ({
    dawn:      T_('shiftDawn',      'Aube',            'Dawn'),
    morning:   T_('shiftMorning',   'Matin',           'Morning'),
    afternoon: T_('shiftAfternoon', 'Après-midi',      'Afternoon'),
    evening:   T_('shiftEvening',   'Soirée',          'Evening'),
    night:     T_('shiftNight',     'Nuit',            'Night'),
    final:     T_('shiftFinal',     'Final de journée','End of Day'),
  }[key] || key);

  const sessionForShift = (key) => sessionsForDay.find(s => s.shift_key === key) || null;

  const resolvedFloat = openingFloatOverride != null ? openingFloatOverride : (carryForwardCents ?? 0);
  const fmtCents = (c) => new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format((c ?? 0) / 100);

  function startOverride() {
    setOverrideInput(((resolvedFloat) / 100).toFixed(2));
    setEditingOverride(true);
  }

  function confirmOverride() {
    const cents = Math.round((parseFloat(overrideInput) || 0) * 100);
    onOverrideFloat?.(cents);
    setEditingOverride(false);
  }

  function clearOverride() {
    onOverrideFloat?.(null);
    setEditingOverride(false);
  }

  return (
    <div style={{ marginBottom: 12, borderRadius: 9, border: '1px solid rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.04)', padding: '10px 14px' }}>

      {/* Header */}
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
        {T_('shiftSelector', 'Quart de travail', 'Shift')}
      </div>

      {/* Shift selector pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {SHIFT_KEYS.map(key => {
          const session = sessionForShift(key);
          const statusColor = session ? (STATUS_COLORS[session.status] || '#6b7280') : '#374151';
          const isActive = key === currentShiftKey;
          return (
            <button
              key={key}
              onClick={() => onShiftChange?.(key)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: isActive ? 700 : 500,
                border: `1.5px solid ${isActive ? '#a78bfa' : (session ? statusColor : 'rgba(255,255,255,0.1)')}`,
                background: isActive ? 'rgba(167,139,250,0.12)' : (session ? `rgba(${hexToRgbStr(statusColor)},0.06)` : 'transparent'),
                color: isActive ? '#a78bfa' : (session ? statusColor : '#6b7280'),
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {shiftLabel(key)}
              {session && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: statusColor, flexShrink: 0,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Carry-forward float display */}
      {currentShiftKey && currentShiftKey !== 'dawn' && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>
              {T_('shiftCarryForward', 'Flottant reporté', 'Carry-forward float')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingOverride ? (
                <>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={overrideInput}
                    onChange={e => setOverrideInput(e.target.value)}
                    autoFocus
                    style={{
                      width: 80, background: '#0c0e14', border: '1px solid rgba(167,139,250,0.4)',
                      borderRadius: 4, color: '#e2e8f0', fontSize: 12, padding: '2px 6px', outline: 'none',
                      textAlign: 'right',
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') confirmOverride(); if (e.key === 'Escape') setEditingOverride(false); }}
                  />
                  <button onClick={confirmOverride} style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontSize: 13 }}>✓</button>
                  <button onClick={() => setEditingOverride(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: openingFloatOverride != null ? '#f59e0b' : '#e2e8f0', fontWeight: 600 }}>
                    {fmtCents(resolvedFloat)}
                    {openingFloatOverride != null && (
                      <span style={{ fontSize: 9.5, color: '#f59e0b', marginLeft: 4 }}>({fr ? 'modifié' : 'overridden'})</span>
                    )}
                  </span>
                  <button onClick={startOverride} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 10.5 }}>
                    {T_('shiftOverrideFloat', 'Modifier', 'Override')}
                  </button>
                  {openingFloatOverride != null && (
                    <button onClick={clearOverride} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 10.5 }}>✕</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Final shift controls */}
      {currentShiftKey === 'final' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={isFinalShift}
              onChange={e => onToggleFinalShift?.(e.target.checked)}
              style={{ accentColor: '#a78bfa' }}
            />
            <span style={{ color: '#d1d5db' }}>
              {T_('shiftIsFinal', 'Marquer comme fermeture finale du jour', 'Mark as final close for the day')}
            </span>
          </label>
        </div>
      )}

      {/* Day summary for final shift */}
      {currentShiftKey === 'final' && daySummary && (
        <div style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            {T_('shiftFinalSummary', 'Résumé de la journée', 'Day summary')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>{T_('shiftDayTotal', 'Écart total du jour', 'Total day variance')}</span>
            <span style={{
              fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: daySummary.totalVarianceCents === 0 ? '#16a34a' : daySummary.totalVarianceCents > 0 ? '#4ade80' : '#f87171',
            }}>
              {fmtCents(daySummary.totalVarianceCents)}
            </span>
          </div>
          {daySummary.sessions?.filter(s => s.shift_key && s.shift_key !== 'final').map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }}>
              <span style={{ color: '#64748b' }}>{shiftLabel(s.shift_key)}</span>
              <span style={{ color: STATUS_COLORS[s.status] || '#6b7280', fontSize: 10 }}>{s.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* No session notice */}
      {currentShiftKey && !sessionForShift(currentShiftKey) && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
          {T_('shiftNoSession', 'Aucune fermeture pour ce quart', 'No close for this shift')}
        </div>
      )}
    </div>
  );
}

function hexToRgbStr(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
