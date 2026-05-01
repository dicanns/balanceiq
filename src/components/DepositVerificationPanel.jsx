import React, { useState } from 'react';

const STALE_DAYS = 3;

function daysBetween(dateKey) {
  const then = new Date(dateKey + 'T00:00:00');
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

export default function DepositVerificationPanel({ pending = [], onMarkVerified, t = {}, T = {}, lang = 'fr' }) {
  const [activeId, setActiveId] = useState(null);
  const [amount, setAmount] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fr = lang !== 'en';
  const fmt = v => new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(v / 100);
  const fmtDate = k => new Date(k + 'T00:00:00').toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

  if (pending.length === 0) return null;

  const inputS = {
    width: '100%', boxSizing: 'border-box',
    background: t.inputBg ?? '#111827',
    border: `1px solid ${t.inputBorder ?? '#374151'}`,
    borderRadius: 6, color: t.text ?? '#f9fafb',
    fontSize: 12, padding: '6px 9px', outline: 'none',
    fontFamily: 'inherit',
  };

  async function handleConfirm(row) {
    setError('');
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || cents <= 0) {
      setError(fr ? 'Montant invalide.' : 'Invalid amount.');
      return;
    }
    setSaving(true);
    try {
      await onMarkVerified({
        id: row.id,
        verified_amount_cents: cents,
        verified_by: verifiedBy.trim() || null,
        notes: notes.trim() || null,
      });
      setActiveId(null);
      setAmount('');
      setVerifiedBy('');
      setNotes('');
    } catch (e) {
      setError(e.message ?? 'Error');
    } finally {
      setSaving(false);
    }
  }

  function openForm(row) {
    setActiveId(row.id);
    setAmount((row.expected_amount_cents / 100).toFixed(2));
    setVerifiedBy('');
    setNotes('');
    setError('');
  }

  return (
    <div style={{
      borderRadius: 8,
      border: '1px solid rgba(245,158,11,0.3)',
      background: 'rgba(245,158,11,0.04)',
      overflow: 'hidden',
      marginTop: 2,
    }}>
      <div style={{
        padding: '9px 12px',
        borderBottom: '1px solid rgba(245,158,11,0.12)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {fr ? 'Depots a verifier' : 'Deposits pending verification'}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#f59e0b',
          background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 10, padding: '1px 7px',
        }}>
          {pending.length}
        </span>
      </div>

      {pending.map(row => {
        const days = daysBetween(row.date_key);
        const stale = days > STALE_DAYS;
        const isOpen = activeId === row.id;

        return (
          <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f9fafb' }}>
                    {fmt(row.expected_amount_cents)}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {fmtDate(row.date_key)}
                  </span>
                  {stale && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, color: '#ef4444',
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: 4, padding: '1px 6px',
                    }}>
                      {fr ? `${days}j sans verification` : `${days}d unverified`}
                    </span>
                  )}
                </div>
              </div>
              {!isOpen && (
                <button
                  onClick={() => openForm(row)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
                    border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)',
                    color: '#f59e0b', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {fr ? 'Marquer verifie' : 'Mark verified'}
                </button>
              )}
            </div>

            {isOpen && (
              <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(245,158,11,0.1)' }}>
                <div style={{ paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>
                      {fr ? 'Montant constate (releve bancaire)' : 'Amount on bank statement'} *
                    </div>
                    <input
                      type="number" min="0" step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      style={{ ...inputS, fontVariantNumeric: 'tabular-nums' }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>
                      {fr ? 'Verifie par (optionnel)' : 'Verified by (optional)'}
                    </div>
                    <input
                      type="text"
                      value={verifiedBy}
                      onChange={e => setVerifiedBy(e.target.value)}
                      placeholder={fr ? 'Nom' : 'Name'}
                      style={inputS}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>
                    {fr ? 'Notes (optionnel)' : 'Notes (optional)'}
                  </div>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={fr ? 'Ex: Correspond au releve du 1er mai' : 'e.g. Matches May 1 statement'}
                    style={inputS}
                  />
                </div>
                {error && (
                  <div style={{ fontSize: 11.5, color: '#f87171', marginBottom: 8, padding: '5px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setActiveId(null); setError(''); }}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}
                  >
                    {fr ? 'Annuler' : 'Cancel'}
                  </button>
                  <button
                    onClick={() => handleConfirm(row)}
                    disabled={saving}
                    style={{
                      padding: '6px 18px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
                      background: saving ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg,#f59e0b,#d97706)',
                      color: '#fff', cursor: saving ? 'default' : 'pointer',
                    }}
                  >
                    {saving ? '...' : (fr ? 'Confirmer' : 'Confirm')}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
