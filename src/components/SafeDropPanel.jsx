import React, { useState } from 'react';

const BLANK = { amount: '', bagReference: '', droppedBy: '', witnessedBy: '', notes: '' };

export default function SafeDropPanel({ drops = [], onSave, date, t = {}, T = {}, lang = 'fr' }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fr = lang !== 'en';

  const fmt = v => new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(v / 100);
  const fmtTime = iso => new Date(iso).toLocaleTimeString(fr ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' });

  const totalCents = drops.reduce((s, d) => s + (d.amount_cents ?? 0), 0);

  const inputS = {
    width: '100%', boxSizing: 'border-box',
    background: t.inputBg ?? '#111827',
    border: `1px solid ${t.inputBorder ?? '#374151'}`,
    borderRadius: 6, color: t.text ?? '#f9fafb',
    fontSize: 12, padding: '6px 9px', outline: 'none',
    fontFamily: 'inherit',
  };

  async function handleSave() {
    setError('');
    const amountCents = Math.round(parseFloat(form.amount) * 100);
    if (!amountCents || amountCents <= 0) {
      setError(T.sdErrAmount ?? (fr ? 'Le montant doit etre superieur a zero.' : 'Amount must be greater than zero.'));
      return;
    }
    if (!form.droppedBy.trim()) {
      setError(T.sdErrDroppedBy ?? (fr ? 'Le nom de la personne est requis.' : 'Name of person is required.'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        date_key: date,
        amount_cents: amountCents,
        bag_reference: form.bagReference.trim() || null,
        dropped_by: form.droppedBy.trim(),
        witnessed_by: form.witnessedBy.trim() || null,
        notes: form.notes.trim() || null,
      });
      setForm(BLANK);
      setShowForm(false);
    } catch (e) {
      setError(e.message ?? 'Error');
    } finally {
      setSaving(false);
    }
  }

  const sectionStyle = {
    marginTop: 10, borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.09)',
    background: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  };

  const headerStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '9px 12px',
    borderBottom: drops.length > 0 || showForm ? '1px solid rgba(255,255,255,0.06)' : 'none',
  };

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>
          {T.sdTitle ?? (fr ? 'Depots coffre' : 'Safe drops')}
          {drops.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(totalCents)}
            </span>
          )}
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
              border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.07)',
              color: '#f97316', cursor: 'pointer',
            }}
          >
            + {T.sdAdd ?? (fr ? 'Ajouter un depot' : 'Add safe drop')}
          </button>
        )}
      </div>

      {/* Drop list */}
      {drops.length > 0 && (
        <div style={{ padding: '8px 12px 0' }}>
          {drops.map((d, i) => (
            <div key={d.id ?? i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0',
              borderBottom: i < drops.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>
              <div style={{ flexShrink: 0, marginTop: 2, width: 28, height: 28, borderRadius: 6, background: 'rgba(249,115,22,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                🏦
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(d.amount_cents)}
                  </span>
                  {d.bag_reference && (
                    <span style={{ fontSize: 10, color: '#9ca3af', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 6px' }}>
                      {d.bag_reference}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>
                    {fmtTime(d.event_timestamp)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {d.dropped_by}
                  {d.witnessed_by && <span style={{ color: '#6b7280' }}> · {fr ? 'Temoin' : 'Witness'}: {d.witnessed_by}</span>}
                  {d.notes && <span style={{ color: '#6b7280', fontStyle: 'italic' }}> · {d.notes}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {drops.length === 0 && !showForm && (
        <div style={{ padding: '8px 12px 10px', fontSize: 11.5, color: '#6b7280' }}>
          {T.sdNoDrops ?? (fr ? 'Aucun depot enregistre' : 'No drops recorded')}
        </div>
      )}

      {/* Chain-of-custody strip */}
      {drops.length > 0 && (
        <div style={{ padding: '8px 12px 10px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6b7280', marginRight: 4 }}>
            {T.sdChainTitle ?? (fr ? 'Trace de garde' : 'Chain of custody')}
          </span>
          <ChainNode label={T.sdChainDrawer ?? (fr ? 'Caisse' : 'Drawer')} icon="🗄" active />
          <ChainArrow />
          <ChainNode
            label={`${T.sdChainSafe ?? (fr ? 'Coffre' : 'Safe')} (${drops.length}x · ${fmt(totalCents)})`}
            icon="🔒" active
          />
          <ChainArrow />
          <ChainNode label={T.sdChainDeposit ?? (fr ? 'Depot banque' : 'Bank deposit')} icon="🏛" pending />
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div style={{ padding: '10px 12px 12px', borderTop: drops.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.sdAmount ?? (fr ? 'Montant' : 'Amount')} *</div>
              <input
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                style={{ ...inputS, fontVariantNumeric: 'tabular-nums' }}
                autoFocus
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.sdBagRef ?? (fr ? 'Reference sac/enveloppe' : 'Bag / envelope reference')}</div>
              <input
                type="text"
                value={form.bagReference}
                onChange={e => setForm(f => ({ ...f, bagReference: e.target.value }))}
                placeholder="BAG-001"
                style={inputS}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.sdDroppedBy ?? (fr ? 'Remis par' : 'Dropped by')} *</div>
              <input
                type="text"
                value={form.droppedBy}
                onChange={e => setForm(f => ({ ...f, droppedBy: e.target.value }))}
                placeholder={fr ? 'Nom de l\'employe' : 'Employee name'}
                style={inputS}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.sdWitnessedBy ?? (fr ? 'Temoin (optionnel)' : 'Witnessed by (optional)')}</div>
              <input
                type="text"
                value={form.witnessedBy}
                onChange={e => setForm(f => ({ ...f, witnessedBy: e.target.value }))}
                placeholder={fr ? 'Nom du temoin' : 'Witness name'}
                style={inputS}
              />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.sdNotes ?? (fr ? 'Notes (optionnel)' : 'Notes (optional)')}</div>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={fr ? 'Ex: Depot apres-midi' : 'e.g. Afternoon drop'}
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
              onClick={() => { setShowForm(false); setForm(BLANK); setError(''); }}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}
            >
              {T.sdCancel ?? (fr ? 'Annuler' : 'Cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '6px 18px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
                background: saving ? 'rgba(249,115,22,0.3)' : 'linear-gradient(135deg,#f97316,#ea580c)',
                color: '#fff', cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? '…' : (T.sdSave ?? (fr ? 'Enregistrer le depot' : 'Save drop'))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChainNode({ label, icon, active, pending }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
      background: active ? 'rgba(34,197,94,0.08)' : pending ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}`,
      color: active ? '#4ade80' : '#6b7280',
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function ChainArrow() {
  return <span style={{ color: '#374151', fontSize: 12, flexShrink: 0 }}>→</span>;
}
