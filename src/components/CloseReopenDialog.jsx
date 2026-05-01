import React, { useState } from 'react';
import IdentityPicker from './IdentityPicker.jsx';

/**
 * Props:
 *   open           - bool
 *   session        - close_sessions row (must have id and status === 'finalized')
 *   closePolicy    - close_policies row (approver_identity_method)
 *   T              - translation map
 *   t              - theme tokens
 *   lang           - 'fr' | 'en'
 *   cloudUser      - current cloud user or null
 *   onConfirm      - called with updated session after successful reopen
 *   onCancel       - called on cancel
 */
export default function CloseReopenDialog({ open, session, closePolicy, T, t, lang, cloudUser, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [actor, setActor] = useState(null);
  const [showIdentity, setShowIdentity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fr = lang !== 'en';
  const identityMethod = closePolicy?.approver_identity_method || 'typed_name';
  const reasonTrimmed = reason.trim();
  const canConfirm = !!reasonTrimmed && !!actor;

  const T_ = (key, fallbackFr, fallbackEn) => T?.[key] ?? (fr ? fallbackFr : fallbackEn);

  function handleCancel() {
    resetState();
    onCancel?.();
  }

  function resetState() {
    setReason('');
    setActor(null);
    setShowIdentity(false);
    setLoading(false);
    setErr('');
  }

  async function handleConfirm() {
    setErr('');
    if (!reasonTrimmed) { setErr(T_('crdErrReasonRequired', 'Une raison est obligatoire pour la réouverture.', 'A reason is required to reopen.')); return; }
    if (!actor)         { setErr(T_('crdErrManagerRequired', "L'identité du responsable est requise.", 'Manager identity is required.')); return; }
    setLoading(true);
    try {
      const updated = await window.api.closeAssurance.session.transition({
        id: session.id,
        to: 'reopened',
        actor_name: actor.name,
        actor_role: actor.role ?? null,
        approval_method: actor.identity_method,
        reason: reasonTrimmed,
      });
      resetState();
      onConfirm?.(updated);
    } catch (e) {
      setErr(e?.message || 'error');
      setLoading(false);
    }
  }

  if (!open) return null;

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9998,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const card = {
    background: '#1a1d27', border: '1px solid #374151', borderRadius: 12,
    padding: '24px 28px', width: 440, maxWidth: '94vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div style={card}>

        {/* Title */}
        <h3 style={{ margin: '0 0 14px', color: '#f9fafb', fontSize: '1rem', fontWeight: 700 }}>
          {T_('crdTitle', 'Réouverture de la fermeture', 'Reopen Session')}
        </h3>

        {/* Warning banner */}
        <div style={{
          marginBottom: 14, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          fontSize: 12, color: '#f87171', display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>{T_('crdWarning', 'Cette fermeture est finalisée. La réouverture permettra de modifier les données.', 'This session is finalized. Reopening will allow data to be modified.')}</span>
        </div>

        {/* Reason */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 5 }}>
            {T_('crdReasonLabel', 'Raison de la réouverture (obligatoire)', 'Reason for reopening (required)')}
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={T_('crdReasonPlaceholder', 'Ex : erreur de saisie détectée', 'e.g., data entry error detected')}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: t?.inputBg ?? '#0c0e14',
              border: `1px solid ${reasonTrimmed ? 'rgba(239,68,68,0.4)' : (t?.inputBorder ?? '#374151')}`,
              borderRadius: 6, color: t?.text ?? '#f9fafb',
              fontSize: 12, padding: '7px 10px', outline: 'none',
              resize: 'vertical', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Manager identity */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
            {T_('crdManagerRequired', 'Approbation du responsable requise', 'Manager approval required')}
          </div>
          {actor ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)', fontSize: 12 }}>
              <span style={{ color: '#16a34a' }}>✓</span>
              <span style={{ color: '#d1d5db', flex: 1 }}><strong>{actor.name}</strong></span>
              <button
                onClick={() => setActor(null)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11 }}
              >
                {fr ? 'Changer' : 'Change'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { if (reasonTrimmed) setShowIdentity(true); }}
              disabled={!reasonTrimmed}
              style={{
                width: '100%', padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: reasonTrimmed ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${reasonTrimmed ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: reasonTrimmed ? '#f87171' : '#6b7280',
                cursor: reasonTrimmed ? 'pointer' : 'default',
              }}
            >
              {fr ? 'Vérifier identité du responsable' : 'Verify manager identity'}
            </button>
          )}
        </div>

        {/* Error */}
        {err && (
          <div style={{ marginBottom: 10, fontSize: 11.5, color: '#ef4444', textAlign: 'center' }}>{err}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button
            onClick={handleCancel}
            disabled={loading}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {T_('crdCancelBtn', 'Annuler', 'Cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            style={{
              padding: '8px 24px', borderRadius: 8, border: 'none',
              background: canConfirm ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'rgba(239,68,68,0.2)',
              color: '#fff', fontSize: '0.875rem', fontWeight: 700,
              cursor: canConfirm ? 'pointer' : 'default',
            }}
          >
            {loading ? (fr ? 'En cours...' : 'Working...') : T_('crdConfirmBtn', 'Confirmer la réouverture', 'Confirm reopen')}
          </button>
        </div>

      </div>

      {/* Identity picker overlay */}
      {showIdentity && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1d27', borderRadius: 10, padding: 24, width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12, textAlign: 'center' }}>
              {fr ? 'Vérification du responsable' : 'Manager verification'}
            </div>
            <IdentityPicker
              method={identityMethod}
              requiredRole="manager"
              onVerified={a => { setActor(a); setShowIdentity(false); }}
              onCancel={() => setShowIdentity(false)}
              T={T} t={t} lang={lang}
              cloudUser={cloudUser}
            />
          </div>
        </div>
      )}
    </div>
  );
}
