/**
 * CloseReviewModal - structured day-close review (Sub-Sprint 2E + 4C)
 *
 * Six sections rendered in order:
 *   1. Required checklist status
 *   2. Variance summary (per register, inline reason capture)
 *   3. Evidence status (POS, deposits)
 *   4. Policy blockers (red)
 *   5. Warnings (yellow, override reasons + manager identity when signoffRequired)
 *   6. Final action (confirm disabled while blockers or unresolved variance/override reasons)
 */
import React, { useState, useMemo } from 'react';
import { computeRegisterVariance, VARIANCE_REASON_CODES } from './RegisterCloseCard.jsx';
import IdentityPicker from './IdentityPicker.jsx';
export { canConfirmClose } from '../services/closeGating.js';
import { canConfirmClose } from '../services/closeGating.js';

export default function CloseReviewModal({
  open,
  onClose,
  onConfirm,
  evaluation,
  cashes,
  checklistItems,
  posDataPresent,
  depositsPresent,
  closePolicy,
  T,
  t,
  lang,
  cloudUser,
}) {
  const [localReasons, setLocalReasons] = useState({});
  const [overrideReasons, setOverrideReasons] = useState({});
  const [overrideActor, setOverrideActor] = useState(null);
  const [showOverrideIdentity, setShowOverrideIdentity] = useState(false);

  const fr = lang !== 'en';
  const { blockers = [], warnings = [] } = evaluation || {};
  const threshold = closePolicy?.variance_per_register_cents ?? 100;
  const varianceRule = closePolicy?.variance_register_rule ?? 'require_reason';
  const signoffRequired = !!(closePolicy?.manager_signoff_required);
  const identityMethod = closePolicy?.approver_identity_method || 'typed_name';

  const variances = useMemo(() => (cashes || []).map((c, idx) => {
    const v = computeRegisterVariance(c);
    const cents = v != null ? Math.round(Math.abs(v) * 100) : 0;
    return {
      idx,
      register: idx + 1,
      variance: v,
      cents,
      exceeds: v != null && cents > threshold,
      reasonCode: c.varianceReasonCode,
      reasonText: c.varianceReasonText,
    };
  }), [cashes, threshold]);

  const required = (checklistItems || []).filter(i => i.required);
  const completedReq = required.filter(i => i.completed).length;
  const checklistOk = required.length === 0 || completedReq === required.length;

  const canClose = canConfirmClose({ blockers, variances, varianceRule, localReasons, warnings, signoffRequired, overrideReasons, overrideActor });

  const allOverrideReasonsFilled = signoffRequired && warnings.length > 0
    ? warnings.every((_, i) => overrideReasons[i]?.trim())
    : false;

  function handleConfirm() {
    onConfirm(localReasons, { overrideReasons, overrideActor });
    setLocalReasons({});
    setOverrideReasons({});
    setOverrideActor(null);
  }

  function handleClose() {
    onClose();
    setLocalReasons({});
    setOverrideReasons({});
    setOverrideActor(null);
  }

  if (!open) return null;

  const fmt = v => v == null ? '—' : new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(v);

  const StatusRow = ({ color, icon, children }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color, marginBottom: 3 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );

  const sectionBase = { marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' };
  const secTitle = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 8, color: '#6b7280' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{ background: '#1a1d27', border: '1px solid #374151', borderRadius: 12, padding: '24px 28px', width: 520, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>

        <h3 style={{ margin: '0 0 14px', color: '#f9fafb', fontSize: '1rem', fontWeight: 700 }}>
          {T?.crTitle ?? (fr ? 'Revue de fermeture' : 'Close review')}
        </h3>

        {/* ── Section 1: Checklist ──────────────────────────────────────── */}
        <div style={sectionBase}>
          <div style={secTitle}>{T?.crChecklist ?? (fr ? 'Checklist' : 'Checklist')}</div>
          {required.length === 0
            ? <StatusRow color="#6b7280" icon="○">{fr ? 'Aucun item requis' : 'No required items'}</StatusRow>
            : checklistOk
            ? <StatusRow color="#16a34a" icon="✓">{fr ? `Complète (${completedReq}/${required.length})` : `Complete (${completedReq}/${required.length})`}</StatusRow>
            : <StatusRow color="#dc2626" icon="✗">{fr ? `${required.length - completedReq} item(s) requis non complété(s)` : `${required.length - completedReq} required item(s) incomplete`}</StatusRow>
          }
          {!checklistOk && required.filter(i => !i.completed).map((item, k) => (
            <div key={k} style={{ paddingLeft: 18, fontSize: 11, color: '#f87171', marginTop: 2 }}>
              • {item.label || (fr ? 'Item requis' : 'Required item')}
            </div>
          ))}
        </div>

        {/* ── Section 2: Variance ───────────────────────────────────────── */}
        <div style={sectionBase}>
          <div style={secTitle}>{T?.crVarianceSummary ?? (fr ? 'Écarts par caisse' : 'Variance summary')}</div>
          {variances.length === 0
            ? <StatusRow color="#6b7280" icon="○">{fr ? 'Aucune caisse' : 'No registers'}</StatusRow>
            : variances.map(v => {
              const incomplete = v.variance == null;
              const capturedCode = localReasons[v.idx]?.code || v.reasonCode;
              const capturedEntry = capturedCode ? VARIANCE_REASON_CODES.find(r => r.code === capturedCode) : null;
              const needsReason = v.exceeds && varianceRule !== 'inform';
              return (
                <div key={v.idx} style={{ marginBottom: needsReason && !capturedCode ? 10 : 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: incomplete ? '#f59e0b' : v.exceeds ? (capturedCode ? '#f59e0b' : '#dc2626') : '#16a34a', fontSize: 13 }}>
                      {incomplete ? '⚠' : v.exceeds ? (capturedCode ? '⚠' : '✗') : '✓'}
                    </span>
                    <span style={{ fontSize: 12, color: '#d1d5db', fontWeight: 600 }}>
                      {fr ? 'Caisse' : 'Register'} {v.register}
                    </span>
                    <span style={{ fontFamily: "'Satoshi',-apple-system,sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 12, color: incomplete ? '#f59e0b' : v.exceeds ? '#f87171' : '#4ade80' }}>
                      {incomplete
                        ? <span title={fr ? 'Entrez POS Ventes + Argent final pour compléter le décompte' : 'Enter POS Sales + Final Cash to complete the count'} style={{ cursor: 'help', borderBottom: '1px dashed #f59e0b' }}>{fr ? 'Compte incomplet' : 'Count incomplete'}</span>
                        : v.variance === 0
                        ? (fr ? 'Balancé' : 'Balanced')
                        : `${fmt(Math.abs(v.variance))} ${v.variance > 0 ? (T?.crOver ?? (fr ? 'surplus' : 'over')) : (T?.crShort ?? (fr ? 'manque' : 'short'))}`
                      }
                    </span>
                    {capturedEntry && (
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>
                        ({fr ? capturedEntry.fr : capturedEntry.en})
                      </span>
                    )}
                  </div>
                  {needsReason && !capturedCode && (
                    <div style={{ marginTop: 5, paddingLeft: 20 }}>
                      <select
                        value={localReasons[v.idx]?.code || ''}
                        onChange={e => setLocalReasons(p => ({ ...p, [v.idx]: { ...p[v.idx], code: e.target.value, text: p[v.idx]?.text || '' } }))}
                        style={{ width: '100%', background: t?.inputBg ?? '#111827', border: `1px solid ${t?.inputBorder ?? '#374151'}`, borderRadius: 5, color: t?.text ?? '#f9fafb', fontSize: 11, padding: '4px 6px', outline: 'none', marginBottom: 4 }}
                      >
                        <option value="">{T?.varReasonSelect ?? (fr ? '-- Sélectionner une raison --' : '-- Select a reason --')}</option>
                        {VARIANCE_REASON_CODES.map(r => (
                          <option key={r.code} value={r.code}>{fr ? r.fr : r.en}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder={T?.varReasonNotes ?? (fr ? 'Notes (optionnel)' : 'Notes (optional)')}
                        value={localReasons[v.idx]?.text || ''}
                        onChange={e => setLocalReasons(p => ({ ...p, [v.idx]: { ...p[v.idx], text: e.target.value } }))}
                        style={{ width: '100%', background: t?.inputBg ?? '#111827', border: `1px solid ${t?.inputBorder ?? '#374151'}`, borderRadius: 5, color: t?.text ?? '#f9fafb', fontSize: 11, padding: '4px 6px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>

        {/* ── Section 3: Evidence ───────────────────────────────────────── */}
        <div style={sectionBase}>
          <div style={secTitle}>{T?.crEvidence ?? (fr ? 'Preuves' : 'Evidence')}</div>
          <StatusRow color={posDataPresent ? '#16a34a' : '#6b7280'} icon={posDataPresent ? '✓' : '○'}>
            {fr ? (posDataPresent ? 'Rapport POS importé' : 'Aucun rapport POS importé') : (posDataPresent ? 'POS report imported' : 'No POS report imported')}
          </StatusRow>
          <StatusRow color={depositsPresent ? '#16a34a' : '#6b7280'} icon={depositsPresent ? '✓' : '○'}>
            {fr ? (depositsPresent ? 'Dépôts saisis' : 'Aucun dépôt saisi') : (depositsPresent ? 'Deposits entered' : 'No deposits entered')}
          </StatusRow>
        </div>

        {/* ── Section 4: Blockers ───────────────────────────────────────── */}
        {blockers.length > 0 && (
          <div style={{ ...sectionBase, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <div style={{ ...secTitle, color: '#dc2626' }}>{T?.crBlockers ?? (fr ? 'Blocages' : 'Blockers')}</div>
            {blockers.map((b, i) => (
              <StatusRow key={i} color="#ef4444" icon="✗">
                {fr ? b.message_fr : b.message_en}
              </StatusRow>
            ))}
          </div>
        )}

        {/* ── Section 5: Warnings + override capture ────────────────────── */}
        {warnings.length > 0 && (
          <div style={{ ...sectionBase, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ ...secTitle, color: '#d97706' }}>{T?.crWarnings ?? (fr ? 'Avertissements' : 'Warnings')}</div>
            {warnings.map((w, i) => (
              <div key={i} style={{ marginBottom: signoffRequired ? 10 : 4 }}>
                <StatusRow color="#f59e0b" icon="⚠">
                  {fr ? w.message_fr : w.message_en}
                </StatusRow>
                {signoffRequired && (
                  <div style={{ paddingLeft: 18, marginTop: 4 }}>
                    <input
                      type="text"
                      placeholder={fr ? 'Raison de dérogation (requis)' : 'Override reason (required)'}
                      value={overrideReasons[i] || ''}
                      onChange={e => setOverrideReasons(p => ({ ...p, [i]: e.target.value }))}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: t?.inputBg ?? '#111827',
                        border: `1px solid ${overrideReasons[i]?.trim() ? 'rgba(245,158,11,0.4)' : t?.inputBorder ?? '#374151'}`,
                        borderRadius: 5, color: t?.text ?? '#f9fafb',
                        fontSize: 11, padding: '4px 6px', outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Manager identity step for overrides */}
            {signoffRequired && warnings.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(245,158,11,0.15)' }}>
                {overrideActor ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ color: '#16a34a' }}>✓</span>
                    <span style={{ color: '#d1d5db' }}>
                      {fr ? 'Approuvé par' : 'Approved by'}: <strong>{overrideActor.name}</strong>
                    </span>
                    <button
                      onClick={() => setOverrideActor(null)}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11 }}
                    >
                      {fr ? 'Changer' : 'Change'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { if (allOverrideReasonsFilled) setShowOverrideIdentity(true); }}
                    disabled={!allOverrideReasonsFilled}
                    style={{
                      width: '100%', padding: '6px 12px', borderRadius: 6,
                      background: allOverrideReasonsFilled ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${allOverrideReasonsFilled ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      color: allOverrideReasonsFilled ? '#f59e0b' : '#6b7280',
                      fontSize: 11.5, fontWeight: 600, cursor: allOverrideReasonsFilled ? 'pointer' : 'default',
                    }}
                  >
                    {fr ? 'Vérifier identité du responsable' : 'Verify manager identity'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Identity picker overlay for override ─────────────────────── */}
        {showOverrideIdentity && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1a1d27', borderRadius: 10, padding: 24, width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12, textAlign: 'center' }}>
                {fr ? 'Vérification du responsable' : 'Manager verification'}
              </div>
              <IdentityPicker
                method={identityMethod}
                requiredRole="manager"
                onVerified={actor => { setOverrideActor(actor); setShowOverrideIdentity(false); }}
                onCancel={() => setShowOverrideIdentity(false)}
                T={T} t={t} lang={lang}
                cloudUser={cloudUser}
              />
            </div>
          </div>
        )}

        {/* ── Section 6: Final action ───────────────────────────────────── */}
        {!canClose && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11.5, color: '#f87171' }}>
            {blockers.length > 0
              ? (fr ? '⛔ Fermeture bloquée — résolvez les blocages ci-dessus.' : '⛔ Close blocked — resolve the issues above.')
              : variances.some(v => v.variance == null)
              ? (fr ? '⛔ Fermeture bloquée — complétez le décompte (POS + Argent final requis).' : '⛔ Close blocked — complete the cash count (POS sales + Final Cash required).')
              : signoffRequired && warnings.length > 0 && !allOverrideReasonsFilled
              ? (fr ? '⛔ Fermeture bloquée — saisissez une raison pour chaque avertissement.' : '⛔ Close blocked — enter a reason for each warning.')
              : signoffRequired && warnings.length > 0 && !overrideActor
              ? (fr ? '⛔ Fermeture bloquée — vérifiez l\'identité du responsable.' : '⛔ Close blocked — verify manager identity.')
              : (fr ? '⛔ Fermeture bloquée — sélectionnez une raison pour chaque écart ci-dessus.' : '⛔ Close blocked — select a reason for each variance above.')
            }
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <button
            onClick={handleClose}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {T?.closeDayCancel ?? (fr ? 'Annuler' : 'Cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canClose}
            style={{
              padding: '8px 24px', borderRadius: 8, border: 'none',
              background: canClose ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'rgba(100,116,139,0.25)',
              color: canClose ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: '0.875rem', fontWeight: 700,
              cursor: canClose ? 'pointer' : 'default',
              transition: 'background 0.2s',
            }}
          >
            {T?.crConfirmClose ?? (fr ? 'Confirmer la fermeture' : 'Confirm close')}
          </button>
        </div>

      </div>
    </div>
  );
}
