import React, { useState, useEffect, useCallback } from 'react';
import IdentityPicker from './IdentityPicker.jsx';

const STAGE_LABELS = {
  submitted: 'capStageSubmitted',
  approved:  'capStageApproved',
  finalized: 'capStageFinalized',
  reopened:  'capStageReopened',
};

const STATUS_COLORS = {
  draft:     '#f59e0b',
  submitted: '#3b82f6',
  approved:  '#a78bfa',
  finalized: '#16a34a',
  reopened:  '#ef4444',
};

/**
 * Props:
 *   session        - close_sessions row (must have id and status)
 *   closePolicy    - close_policies row (manager_signoff_required, approver_identity_method)
 *   t              - theme tokens
 *   T              - translation map
 *   lang           - 'fr' | 'en'
 *   cloudUser      - current cloud user (or null)
 *   onSessionChange- called with updated session after any transition
 */
export default function CloseApprovalPanel({ session, closePolicy, t, T, lang, cloudUser, onSessionChange }) {
  const [approvals, setApprovals] = useState([]);
  const [showIdentity, setShowIdentity] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'submit' | 'approve' | 'finalize' | 'reopen'
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const identityMethod = closePolicy?.approver_identity_method || 'typed_name';
  const signoffRequired = !!(closePolicy?.manager_signoff_required);

  const loadApprovals = useCallback(() => {
    if (!session?.id) return;
    window.api?.closeAssurance?.approval?.list(session.id)
      .then(rows => setApprovals(rows || []))
      .catch(() => {});
  }, [session?.id]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  if (!session) return null;

  const { status } = session;

  const statusLabel = {
    draft:     T.capStatusDraft,
    submitted: T.capStatusSubmitted,
    approved:  T.capStatusApproved,
    finalized: T.capStatusFinalized,
    reopened:  T.capStatusReopened,
  }[status] || status;

  function startAction(action) {
    setErr('');
    setReason('');
    setPendingAction(action);
    setShowIdentity(true);
  }

  async function doTransition(to, actor) {
    setErr('');
    try {
      const updated = await window.api.closeAssurance.session.transition({
        id: session.id,
        to,
        actor_name: actor.name,
        actor_role: actor.role ?? null,
        approval_method: actor.identity_method,
        reason: reason || null,
      });
      loadApprovals();
      if (onSessionChange) onSessionChange(updated);
    } catch (e) {
      setErr(e?.message || 'error');
    }
  }

  function handleIdentityVerified(actor) {
    setShowIdentity(false);
    if (!pendingAction) return;
    const toMap = { submit: 'submitted', approve: 'approved', finalize: 'finalized', reopen: 'reopened' };
    doTransition(toMap[pendingAction], actor);
  }

  function handleIdentityCancel() {
    setShowIdentity(false);
    setPendingAction(null);
  }

  const roleForAction = (action) => {
    if (action === 'submit') return null;
    return 'manager';
  };

  const statusColor = STATUS_COLORS[status] || '#f59e0b';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Status badge */}
      <div style={{
        padding: '6px 12px', borderRadius: 6,
        background: `rgba(${hexToRgb(statusColor)},0.07)`,
        border: `1px solid rgba(${hexToRgb(statusColor)},0.25)`,
        fontSize: 12, color: statusColor, fontWeight: 700,
        textAlign: 'center',
      }}>
        {statusLabel}
      </div>

      {err && (
        <div style={{ fontSize: 11, color: '#ef4444', textAlign: 'center' }}>{err}</div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {(status === 'draft' || status === 'reopened') && (
          <button onClick={() => startAction('submit')} style={btnStyle('#16a34a')}>
            {T.capSubmitBtn}
          </button>
        )}
        {status === 'submitted' && signoffRequired && (
          <button onClick={() => startAction('approve')} style={btnStyle('#3b82f6')}>
            {T.capApproveBtn}
          </button>
        )}
        {status === 'submitted' && !signoffRequired && (
          <button onClick={() => startAction('finalize')} style={btnStyle('#16a34a')}>
            {T.capFinalizeBtn}
          </button>
        )}
        {status === 'approved' && (
          <button onClick={() => startAction('finalize')} style={btnStyle('#16a34a')}>
            {T.capFinalizeBtn}
          </button>
        )}
      </div>

      {/* Identity picker overlay */}
      {showIdentity && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1d27', borderRadius: 10, padding: 24,
            width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12, textAlign: 'center' }}>
              {T.capVerifyIdentity}
            </div>
            {(pendingAction !== 'submit') && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  {T.capReasonLabel}
                </label>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0c0e14', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '5px 8px',
                  }}
                />
              </div>
            )}
            <IdentityPicker
              method={identityMethod}
              requiredRole={roleForAction(pendingAction)}
              onVerified={handleIdentityVerified}
              onCancel={handleIdentityCancel}
              T={T} t={t} lang={lang}
              cloudUser={cloudUser}
            />
          </div>
        </div>
      )}

      {/* Approval log */}
      {approvals.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
            {T.capApprovals}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {approvals.map(a => (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '4px 8px',
                fontSize: 11,
              }}>
                <span style={{ color: '#94a3b8' }}>
                  {T[STAGE_LABELS[a.stage]] || a.stage}
                </span>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{a.actor_name}</span>
                <span style={{ color: '#64748b' }}>
                  {new Date(a.created_at).toLocaleTimeString(lang === 'en' ? 'en-CA' : 'fr-CA', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {approvals.length === 0 && status !== 'draft' && (
        <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>{T.capNoApprovals}</div>
      )}
    </div>
  );
}

function btnStyle(color) {
  return {
    background: `linear-gradient(135deg,${color},${darken(color)})`,
    border: 'none', borderRadius: 7, color: '#fff',
    padding: '7px 18px', fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
  };
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function darken(hex) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 30);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 30);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 30);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
