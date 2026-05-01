import React from 'react';

const STATUS_COLORS = {
  draft:     '#f59e0b',
  submitted: '#3b82f6',
  approved:  '#a78bfa',
  finalized: '#16a34a',
  reopened:  '#ef4444',
};

const STATUS_LABELS_FR = {
  draft:     'Brouillon',
  submitted: 'Soumis',
  approved:  'Approuve',
  finalized: 'Finalise',
  reopened:  'Rouvert',
};
const STATUS_LABELS_EN = {
  draft:     'Draft',
  submitted: 'Submitted',
  approved:  'Approved',
  finalized: 'Finalized',
  reopened:  'Reopened',
};

/**
 * Compact summary band shown above register cards when a close session is active.
 *
 * Props:
 *   session          - close_sessions row | null
 *   policy           - close_policy row | null
 *   exceptionCount   - number of open exceptions (0 = clean)
 *   hasEvidence      - bool: whether an evidence packet has been built
 *   T                - translation map
 *   lang             - 'fr' | 'en'
 */
export default function CloseSummaryPanel({
  session = null,
  policy = null,
  exceptionCount = 0,
  hasEvidence = false,
  T,
  lang,
}) {
  if (!session) return null;

  const fr = lang !== 'en';
  const T_ = (key, fallbackFr, fallbackEn) => T?.[key] ?? (fr ? fallbackFr : fallbackEn);

  const status = session.status ?? 'draft';
  const color  = STATUS_COLORS[status] ?? '#6b7280';
  const label  = (fr ? STATUS_LABELS_FR : STATUS_LABELS_EN)[status] ?? status;

  const policyModeLabel = (() => {
    const parts = [];
    if (policy?.shift_mode_enabled)    parts.push(fr ? 'Multi-quarts' : 'Multi-shift');
    if (policy?.blind_close_mode && policy.blind_close_mode !== 'off') parts.push(fr ? 'Aveugle' : 'Blind');
    if (policy?.tender_mode_enabled)   parts.push(fr ? 'Multi-paiement' : 'Multi-tender');
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  return (
    <div style={{
      marginBottom: 10,
      borderRadius: 8,
      border: `1px solid rgba(${hexToRgbStr(color)},0.3)`,
      background: `rgba(${hexToRgbStr(color)},0.05)`,
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      fontSize: 11.5,
    }}>

      {/* Stage pill */}
      <span style={{
        padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 11,
        color, border: `1px solid ${color}`,
        background: `rgba(${hexToRgbStr(color)},0.1)`,
        flexShrink: 0,
      }}>
        {label}
      </span>

      {/* Policy mode */}
      {policyModeLabel && (
        <span style={{ color: '#64748b', fontSize: 10.5 }}>{policyModeLabel}</span>
      )}

      {/* Prepared-by */}
      {session.prepared_by && (
        <span style={{ color: '#94a3b8' }}>
          <span style={{ color: '#64748b', marginRight: 4 }}>{T_('summaryPreparedBy', 'Preparé par', 'Prepared by')}:</span>
          {session.prepared_by}
        </span>
      )}

      {/* Approved-by */}
      {session.approved_by && (
        <span style={{ color: '#94a3b8' }}>
          <span style={{ color: '#64748b', marginRight: 4 }}>{T_('summaryApprovedBy', 'Approuvé par', 'Approved by')}:</span>
          <span style={{ color: '#a78bfa' }}>{session.approved_by}</span>
        </span>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Exception count */}
      {exceptionCount > 0 && (
        <span style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: '#f59e0b', fontWeight: 700, fontSize: 11,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
          {exceptionCount} {T_('summaryException', exceptionCount === 1 ? 'exception' : 'exceptions', exceptionCount === 1 ? 'exception' : 'exceptions')}
        </span>
      )}

      {/* Evidence completeness */}
      <span style={{
        fontSize: 10.5, fontWeight: 600,
        color: hasEvidence ? '#16a34a' : '#475569',
      }}>
        {hasEvidence
          ? T_('summaryEvidenceReady', 'Dossier complet', 'Evidence ready')
          : T_('summaryEvidencePending', 'Dossier incomplet', 'Evidence pending')}
      </span>
    </div>
  );
}

function hexToRgbStr(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
