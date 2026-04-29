/**
 * RegisterCloseCard — stateful wrapper around the per-register close card (CashBlock).
 *
 * Manages blind close mode state:
 *   off             - standard behavior, variance always visible
 *   register_blind  - variance hidden while counting; shown after cashier submits
 *   manager_reveal  - variance hidden even after submit; only manager can reveal
 *
 * CashBlock is imported from App.jsx via the prop `CashBlockComponent` so this
 * file avoids a circular dependency. The parent (App.jsx) passes it in.
 */
import React, { useState, useCallback } from 'react';

export default function RegisterCloseCard({
  CashBlockComponent,
  blindMode = 'off',
  closureId = null,
  T,
  t,
  ...cashBlockProps
}) {
  const [counted, setCounted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isBlind = blindMode !== 'off';
  const hideVariance = isBlind && !revealed;
  const showSubmitButton = isBlind && !counted;
  const showRevealButton = isBlind && counted && !revealed;
  const showManagerLabel = blindMode === 'manager_reveal';

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

  if (!isBlind) {
    return <CashBlockComponent {...cashBlockProps} />;
  }

  return (
    <div>
      <CashBlockComponent
        {...cashBlockProps}
        hideVariance={hideVariance}
        blindStatusLabel={
          !counted
            ? (T?.closeBlindCounting ?? 'Compte en cours')
            : !revealed
            ? (T?.closeBlindAwaitReveal ?? 'Soumis, en attente de révélation')
            : null
        }
      />
      {showSubmitButton && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleSubmitCount}
            style={{
              flex: 1,
              padding: '8px 14px',
              borderRadius: 7,
              border: 'none',
              background: 'linear-gradient(135deg,#f97316,#ea580c)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {T?.closeBlindSubmit ?? 'Soumettre le compte'}
          </button>
        </div>
      )}
      {showRevealButton && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleRevealVariance}
            style={{
              flex: 1,
              padding: '8px 14px',
              borderRadius: 7,
              border: '1.5px solid rgba(249,115,22,0.4)',
              background: 'rgba(249,115,22,0.07)',
              color: '#f97316',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {T?.closeBlindReveal ?? 'Révéler l\'écart'}
            {showManagerLabel && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
                ({T?.closeBlindManagerOnly ?? 'Manager seulement'})
              </span>
            )}
          </button>
        </div>
      )}
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
