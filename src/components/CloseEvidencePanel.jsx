import React from 'react';

const STATUS_COLORS = {
  draft:     '#f59e0b',
  submitted: '#3b82f6',
  approved:  '#a78bfa',
  finalized: '#16a34a',
  reopened:  '#ef4444',
};

const STAGE_LABELS_FR = {
  submitted: 'Soumis',
  approved:  'Approuve',
  finalized: 'Finalise',
  reopened:  'Rouvert',
};
const STAGE_LABELS_EN = {
  submitted: 'Submitted',
  approved:  'Approved',
  finalized: 'Finalized',
  reopened:  'Reopened',
};

/**
 * Props:
 *   packet     - output of buildClosePacket()
 *   T          - translation map
 *   lang       - 'fr' | 'en'
 */
export default function CloseEvidencePanel({ packet, T, lang }) {
  if (!packet) return null;
  const fr = lang !== 'en';

  const T_ = (key, fallbackFr, fallbackEn) => T?.[key] ?? (fr ? fallbackFr : fallbackEn);
  const fmtCents = (c) => new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format((c ?? 0) / 100);
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString(fr ? 'fr-CA' : 'en-CA', { dateStyle: 'short', timeStyle: 'short' }) : '-';

  const { session, registers, approvalChain, safeDrops, summary } = packet;
  const stageLabels = fr ? STAGE_LABELS_FR : STAGE_LABELS_EN;

  const varianceColor = summary.totalVarianceCents === 0
    ? '#16a34a'
    : summary.totalVarianceCents > 0 ? '#4ade80' : '#f87171';

  return (
    <div style={{ fontSize: 12, color: '#e2e8f0' }}>

      {/* Session header */}
      <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            {session?.date_key ?? '-'}
            {session?.shift_key && <span style={{ color: '#a78bfa', marginLeft: 8, fontWeight: 500, fontSize: 11 }}>{session.shift_key}</span>}
          </span>
          <span style={{
            padding: '2px 10px', borderRadius: 12, fontSize: 10.5, fontWeight: 700,
            background: `rgba(${hexToRgbStr(STATUS_COLORS[session?.status] ?? '#6b7280')},0.12)`,
            color: STATUS_COLORS[session?.status] ?? '#6b7280',
            border: `1px solid ${STATUS_COLORS[session?.status] ?? '#6b7280'}`,
          }}>
            {session?.status ?? '-'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, color: '#94a3b8', fontSize: 11 }}>
          {session?.submitted_at && <span>{T_('evidenceSubmitted', 'Soumis', 'Submitted')}: {fmtDate(session.submitted_at)}</span>}
          {session?.approved_at  && <span>{T_('evidenceApproved',  'Approuve', 'Approved')}: {fmtDate(session.approved_at)}</span>}
          {session?.approved_by  && <span style={{ color: '#a78bfa' }}>{session.approved_by}</span>}
        </div>
        {summary.isFinalShift && (
          <div style={{ marginTop: 4, fontSize: 10.5, color: '#4ade80' }}>
            {T_('evidenceFinalShift', 'Fermeture finale du jour', 'Final close for the day')}
          </div>
        )}
        {summary.hasReopened && (
          <div style={{ marginTop: 4, fontSize: 10.5, color: '#ef4444' }}>
            {T_('evidenceReopened', 'Cette session a ete rouverte', 'This session was reopened')}
          </div>
        )}
      </div>

      {/* Net variance */}
      <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(${hexToRgbStr(varianceColor)},0.25)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontWeight: 600 }}>
            {T_('evidenceNetVariance', 'Ecart net', 'Net variance')}
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: varianceColor, fontVariantNumeric: 'tabular-nums' }}>
            {fmtCents(summary.totalVarianceCents)}
          </span>
        </div>
        {summary.carryForwardFloatCents != null && (
          <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11 }}>
            <span>{T_('evidenceCarryForward', 'Flottant reporte', 'Carry-forward float')}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(summary.carryForwardFloatCents)}</span>
          </div>
        )}
      </div>

      {/* Register breakdown */}
      {registers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            {T_('evidenceRegisters', 'Caisses', 'Registers')}
          </div>
          {registers.map((r, i) => {
            const vc = r.variance_cents;
            const vc_color = vc === 0 ? '#16a34a' : vc > 0 ? '#4ade80' : '#f87171';
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 4 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{r.register_key}</span>
                  {r.tender_mode === 'advanced' && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: '#64748b' }}>advanced</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {r.safe_drops_total_cents > 0 && (
                    <span style={{ fontSize: 10.5, color: '#64748b' }}>
                      {T_('evidenceSafeDrops', 'Depot securise', 'Safe drops')}: {fmtCents(r.safe_drops_total_cents)}
                    </span>
                  )}
                  <span style={{ fontWeight: 700, color: vc_color, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCents(vc)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Safe drops detail */}
      {safeDrops.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            {T_('evidenceSafeDropsDetail', 'Detail depots securises', 'Safe drop detail')}
          </div>
          {safeDrops.map((sd, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span>{sd.register_key} {sd.created_at ? `— ${fmtDate(sd.created_at)}` : ''}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(sd.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Approval chain */}
      {approvalChain.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            {T_('evidenceApprovalChain', 'Historique des approbations', 'Approval chain')}
          </div>
          {approvalChain.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', borderBottom: i < approvalChain.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{
                flexShrink: 0, padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                color: STATUS_COLORS[a.stage] ?? '#6b7280',
                border: `1px solid ${STATUS_COLORS[a.stage] ?? '#6b7280'}`,
              }}>
                {stageLabels[a.stage] ?? a.stage}
              </span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{a.actor_name ?? '-'}</span>
                {a.actor_role && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 10.5 }}>{a.actor_role}</span>}
                {a.approval_method && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 10.5 }}>({a.approval_method})</span>}
                {a.reason && <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{a.reason}</div>}
              </div>
              <span style={{ color: '#475569', fontSize: 10.5, flexShrink: 0 }}>{fmtDate(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, textAlign: 'right', fontSize: 9.5, color: '#374151' }}>
        {T_('evidenceGenerated', 'Genere le', 'Generated')} {fmtDate(packet.generatedAt)}
      </div>
    </div>
  );
}

function hexToRgbStr(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
