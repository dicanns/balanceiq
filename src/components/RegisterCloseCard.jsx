/**
 * RegisterCloseCard - stateful wrapper around CashBlock for blind close + variance reasons.
 *
 * blindMode:
 *   off             - standard, variance always visible
 *   register_blind  - variance hidden until cashier submits
 *   manager_reveal  - variance hidden until manager reveals
 *
 * varianceRule (when variance exceeds threshold):
 *   inform         - no action required
 *   require_reason - reason picker shown, close proceeds after reason captured
 *   block          - reason picker shown, close is blocked until reason confirmed
 */
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import DenominationCounter, { buildDenominationRows } from './DenominationCounter.jsx';
import SafeDropPanel from './SafeDropPanel.jsx';

export const VARIANCE_REASON_CODES = [
  { code: 'counting_error',        fr: 'Erreur de comptage',          en: 'Counting error' },
  { code: 'wrong_float',           fr: 'Mauvais flottant',            en: 'Wrong float' },
  { code: 'safe_drop_not_entered', fr: 'Depot coffre non saisi',      en: 'Safe drop not entered' },
  { code: 'deposit_not_entered',   fr: 'Depot non saisi',             en: 'Deposit not entered' },
  { code: 'pos_mismatch',          fr: 'Difference avec POS',         en: 'POS mismatch' },
  { code: 'delivery_mismatch',     fr: 'Difference avec livraisons',  en: 'Delivery mismatch' },
  { code: 'refund_void_issue',     fr: 'Remboursement ou annulation', en: 'Refund or void issue' },
  { code: 'cash_paid_out',         fr: 'Sortie cash de caisse',       en: 'Cash paid out from till' },
  { code: 'unknown',               fr: 'Inconnu',                     en: 'Unknown' },
];

export default function RegisterCloseCard({
  CashBlockComponent,
  blindMode = 'off',
  closureId = null,
  varianceThresholdCents = 100,
  varianceRule = 'inform',
  denominationMode = 'total_only',
  closureDate = null,
  registerIndex = 0,
  safeDrops = [],
  onSaveDrops,
  onDeleteDrop,
  roster = [],
  date = null,
  T,
  t,
  cash,
  onChange,
  ...cashBlockProps
}) {
  const [counted, setCounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [reasonCode, setReasonCode] = useState(cash?.varianceReasonCode || '');
  const [reasonText, setReasonText] = useState(cash?.varianceReasonText || '');
  const [reasonConfirmed, setReasonConfirmed] = useState(!!(cash?.varianceReasonCode));

  const denomRequired = denominationMode === 'denominations_required';
  const denomAllowed = denominationMode !== 'total_only';
  const [denomMode, setDenomMode] = useState(denomRequired);
  const denomRowsRef = useRef([]);

  const isBlind = blindMode !== 'off';
  const hideVariance = isBlind && !revealed;
  const showSubmitButton = isBlind && !counted;
  const showRevealButton = isBlind && counted && !revealed;
  const showManagerLabel = blindMode === 'manager_reveal';

  const variance = computeRegisterVariance(cash || {});
  const varianceCents = variance != null ? Math.round(Math.abs(variance) * 100) : 0;
  const thresholdExceeded = variance != null && varianceCents > varianceThresholdCents;
  const showReasonPicker = thresholdExceeded && varianceRule !== 'inform' && !hideVariance && !reasonConfirmed;
  const reasonRequired = varianceRule === 'block';
  const lang = T?.closeBlindSubmit === 'Submit count' ? 'en' : 'fr';
  const fr = lang !== 'en';

  const cashierName = roster.find(r => r.id === cash?.cashierId)?.name ?? null;
  const myDrops = useMemo(() =>
    cashierName
      ? safeDrops.filter(d => d.dropped_by === cashierName)
      : safeDrops,
  [safeDrops, cashierName]);

  // Sync cash.deposits with safe drop total whenever drops change
  const dropSyncRef = useRef(null);
  useEffect(() => {
    if (!onSaveDrops || !onChange || myDrops.length === 0) return;
    const total = myDrops.reduce((s, d) => s + (d.amount_cents ?? 0), 0) / 100;
    if (dropSyncRef.current === total) return;
    dropSyncRef.current = total;
    onChange({ ...cash, deposits: total });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDrops]);

  function handleDenomChange(totalDollars, rows) {
    denomRowsRef.current = rows;
    onChange?.({ ...cash, finalCash: totalDollars });
  }

  const denomMismatch = (() => {
    if (!denomMode || denomRowsRef.current.length === 0) return false;
    const denomTotal = denomRowsRef.current.reduce((s, r) => s + r.total_value_cents, 0) / 100;
    const manual = cash?.finalCash ?? null;
    if (manual == null) return false;
    return Math.abs(denomTotal - manual) > 0.01;
  })();

  const handleSubmitCount = useCallback(() => {
    setCounted(true);
    if (blindMode === 'register_blind') {
      setRevealed(true);
      if (window.api?.closeAssurance?.revealVariance) {
        window.api.closeAssurance.revealVariance(closureId ?? 0, 'cashier').catch(() => {});
      }
    }
  }, [blindMode, closureId]);

  const handleRevealVariance = useCallback(() => {
    setRevealed(true);
    if (window.api?.closeAssurance?.revealVariance) {
      window.api.closeAssurance.revealVariance(closureId ?? 0, 'manager').catch(() => {});
    }
  }, [closureId]);

  async function confirmReason() {
    if (!reasonCode) return;
    onChange?.({ ...cash, varianceReasonCode: reasonCode, varianceReasonText: reasonText });
    if (window.api?.closeAssurance?.closure?.save && closureDate) {
      window.api.closeAssurance.closure.save({
        date_key: closureDate,
        register_key: `register_${registerIndex}`,
        variance_cents: Math.round((variance || 0) * 100),
        variance_reason_code: reasonCode,
        variance_reason_text: reasonText || null,
      }).catch(() => {});
    }
    setReasonConfirmed(true);
  }

  const btnBase = {
    flex: 1, padding: '8px 14px', borderRadius: 7, border: 'none',
    fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  };

  if (!isBlind) {
    return (
      <div>
        <CashBlockComponent {...cashBlockProps} cash={cash} onChange={onChange} roster={roster} />
        {denomAllowed && (
          <DenomToggle
            fr={fr} T={T} t={t}
            denomMode={denomMode} denomRequired={denomRequired}
            setDenomMode={setDenomMode}
            denomMismatch={denomMismatch}
            onDenomChange={handleDenomChange}
            lang={lang}
          />
        )}
        {onSaveDrops && (
          <SafeDropPanel
            drops={myDrops} onSave={onSaveDrops} onDelete={onDeleteDrop} date={date}
            t={t} T={T} lang={lang}
            roster={roster} cashierName={cashierName}
          />
        )}
        {showReasonPicker && (
          <ReasonPicker
            lang={lang} T={T} t={t}
            reasonCode={reasonCode} setReasonCode={setReasonCode}
            reasonText={reasonText} setReasonText={setReasonText}
            onConfirm={confirmReason} required={reasonRequired}
          />
        )}
        {reasonConfirmed && thresholdExceeded && (
          <ReasonSummary lang={lang} t={t} reasonCode={reasonCode} reasonText={reasonText} />
        )}
      </div>
    );
  }

  return (
    <div>
      <CashBlockComponent
        {...cashBlockProps}
        cash={cash}
        onChange={onChange}
        roster={roster}
        hideVariance={hideVariance}
        blindStatusLabel={
          !counted
            ? (T?.closeBlindCounting ?? 'Compte en cours')
            : !revealed
            ? (T?.closeBlindAwaitReveal ?? 'Soumis, en attente de revelation')
            : null
        }
      />
      {denomAllowed && (
        <DenomToggle
          fr={fr} T={T} t={t}
          denomMode={denomMode} denomRequired={denomRequired}
          setDenomMode={setDenomMode}
          denomMismatch={denomMismatch}
          onDenomChange={handleDenomChange}
          lang={lang}
        />
      )}
      {onSaveDrops && (
        <SafeDropPanel
          drops={myDrops} onSave={onSaveDrops} onDelete={onDeleteDrop} date={date}
          t={t} T={T} lang={lang}
          roster={roster} cashierName={cashierName}
        />
      )}
      {showSubmitButton && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleSubmitCount}
            style={{ ...btnBase, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff' }}
          >
            {T?.closeBlindSubmit ?? 'Soumettre le compte'}
          </button>
        </div>
      )}
      {showRevealButton && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleRevealVariance}
            style={{ ...btnBase, border: '1.5px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.07)', color: '#f97316' }}
          >
            {T?.closeBlindReveal ?? "Reveler l'ecart"}
            {showManagerLabel && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
                ({T?.closeBlindManagerOnly ?? 'Manager seulement'})
              </span>
            )}
          </button>
        </div>
      )}
      {showReasonPicker && (
        <ReasonPicker
          lang={lang} T={T} t={t}
          reasonCode={reasonCode} setReasonCode={setReasonCode}
          reasonText={reasonText} setReasonText={setReasonText}
          onConfirm={confirmReason} required={reasonRequired}
        />
      )}
      {reasonConfirmed && thresholdExceeded && (
        <ReasonSummary lang={lang} t={t} reasonCode={reasonCode} reasonText={reasonText} />
      )}
    </div>
  );
}

function DenomToggle({ fr, T, t, denomMode, denomRequired, setDenomMode, denomMismatch, onDenomChange, lang }) {
  const active = denomMode;
  return (
    <div style={{
      marginTop: 10,
      borderRadius: 8,
      border: `1px solid ${active ? 'rgba(20,184,166,0.35)' : 'rgba(255,255,255,0.09)'}`,
      background: active ? 'rgba(20,184,166,0.05)' : 'rgba(255,255,255,0.02)',
      transition: 'border-color 0.2s, background 0.2s',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#2dd4bf' : '#9ca3af', letterSpacing: 0.1 }}>
          {fr ? 'Decompte par denomination' : 'Count by denomination'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {denomRequired
            ? <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 4, padding: '2px 7px' }}>
                {fr ? 'Requis' : 'Required'}
              </span>
            : <button
                onClick={() => setDenomMode(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 11, color: active ? '#2dd4bf' : '#6b7280' }}>
                  {active ? (fr ? 'Actif' : 'On') : (fr ? 'Inactif' : 'Off')}
                </span>
                <span style={{
                  width: 32, height: 18, borderRadius: 9, display: 'inline-flex', alignItems: 'center',
                  background: active ? '#0d9488' : 'rgba(255,255,255,0.12)',
                  transition: 'background 0.2s', position: 'relative', flexShrink: 0,
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%', background: '#fff',
                    position: 'absolute', left: active ? 16 : 2, transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </span>
              </button>
          }
        </div>
      </div>
      {active && (
        <div style={{ padding: '0 12px 12px' }}>
          <DenominationCounter lang={lang} t={t} onChange={onDenomChange} />
          {denomMismatch && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#f59e0b', padding: '6px 10px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>{fr ? 'Le total du decompte differe du montant Argent final saisi.' : 'Denomination total differs from the Final Cash amount entered.'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReasonPicker({ lang, T, t, reasonCode, setReasonCode, reasonText, setReasonText, onConfirm, required }) {
  const fr = lang !== 'en';
  return (
    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.25)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#f97316', marginBottom: 6 }}>
        {T?.varReasonTitle ?? (fr ? 'Ecart depassant le seuil - explication requise' : 'Variance exceeds threshold - explanation required')}
      </div>
      <select
        value={reasonCode}
        onChange={e => setReasonCode(e.target.value)}
        style={{ width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.text, fontSize: 12, padding: '5px 7px', outline: 'none', marginBottom: 6 }}
      >
        <option value="">{T?.varReasonSelect ?? (fr ? '-- Selectionner une raison --' : '-- Select a reason --')}</option>
        {VARIANCE_REASON_CODES.map(r => (
          <option key={r.code} value={r.code}>{fr ? r.fr : r.en}</option>
        ))}
      </select>
      <textarea
        value={reasonText}
        onChange={e => setReasonText(e.target.value)}
        placeholder={T?.varReasonNotes ?? (fr ? 'Notes (optionnel)' : 'Notes (optional)')}
        rows={2}
        style={{ width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 5, color: t.text, fontSize: 11.5, padding: '5px 7px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 6, fontFamily: 'inherit' }}
      />
      <button
        onClick={onConfirm}
        disabled={!reasonCode}
        style={{
          padding: '6px 16px', borderRadius: 6, border: 'none', fontWeight: 700, fontSize: 12, cursor: reasonCode ? 'pointer' : 'default',
          background: reasonCode ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'rgba(249,115,22,0.3)', color: '#fff',
        }}
      >
        {T?.varReasonConfirm ?? (fr ? 'Confirmer la raison' : 'Confirm reason')}
        {required && !reasonCode && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>({fr ? 'requis' : 'required'})</span>}
      </button>
    </div>
  );
}

function ReasonSummary({ lang, t, reasonCode, reasonText }) {
  const fr = lang !== 'en';
  const entry = VARIANCE_REASON_CODES.find(r => r.code === reasonCode);
  const label = entry ? (fr ? entry.fr : entry.en) : reasonCode;
  return (
    <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 11 }}>
      <span style={{ color: '#16a34a', fontWeight: 700 }}>{fr ? 'Raison: ' : 'Reason: '}</span>
      <span style={{ color: t.text }}>{label}</span>
      {reasonText && <span style={{ color: t.textMuted }}> - {reasonText}</span>}
    </div>
  );
}

/**
 * Pure helper: compute variance from a cash entry object.
 * variance = physicalCash - expectedCash
 * physicalCash = finalCash + deposits
 * expectedCash = (posVentes + posTPS + posTVQ - posLivraisons) - interac
 *
 * Returns null when inputs are insufficient for the calculation.
 */
export function computeRegisterVariance(cash) {
  const posVentes = cash.posVentes ?? null;
  if (posVentes === null) return null;
  const posTPS = cash.posTPS ?? 0;
  const posTVQ = cash.posTVQ ?? 0;
  const posLivraisons = cash.posLivraisons ?? 0;
  const interac = cash.interac ?? null;
  if (interac === null) return null;
  const finalCash = cash.finalCash ?? null;
  if (finalCash === null) return null;

  const posT = posVentes + posTPS + posTVQ;
  const expectedCash = posT - posLivraisons - interac;
  const physCash = finalCash + (cash.deposits ?? 0);
  return physCash - expectedCash;
}
