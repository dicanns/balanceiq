import React, { useState, useEffect } from 'react';

const ROLES = ['cashier', 'manager', 'owner'];

function roleLabel(role, fr) {
  if (role === 'cashier') return fr ? 'Caissier' : 'Cashier';
  if (role === 'manager') return fr ? 'Gerant' : 'Manager';
  if (role === 'owner')   return fr ? 'Proprietaire' : 'Owner';
  return role;
}

export default function LocalUsersManager({ T = {}, t = {}, lang = 'fr' }) {
  const fr = lang !== 'en';
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'cashier', pin: '', pin2: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [setPinFor, setSetPinFor] = useState(null);
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      const rows = await window.api.closeAssurance.identity.userList();
      setUsers(rows || []);
    } catch { setUsers([]); }
  }

  async function handleCreate() {
    setError('');
    if (!form.name.trim()) { setError(T.idNameRequired ?? (fr ? 'Nom requis.' : 'Name required.')); return; }
    if (!/^\d{4}$/.test(form.pin)) { setError(T.idPINFormat ?? (fr ? 'NIP doit etre 4 chiffres.' : 'PIN must be 4 digits.')); return; }
    if (form.pin !== form.pin2) { setError(fr ? 'Les NIPs ne correspondent pas.' : 'PINs do not match.'); return; }
    setSaving(true);
    try {
      await window.api.closeAssurance.identity.userCreate({ name: form.name.trim(), role: form.role, pin: form.pin });
      await loadUsers();
      setShowForm(false);
      setForm({ name: '', role: 'cashier', pin: '', pin2: '' });
    } catch (e) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id) {
    setDeactivating(id);
    try {
      await window.api.closeAssurance.identity.userDeactivate(id);
      await loadUsers();
    } catch { } finally {
      setDeactivating(null);
    }
  }

  async function handleSetPin(id) {
    setPinError('');
    if (!/^\d{4}$/.test(newPin)) { setPinError(T.idPINFormat ?? (fr ? 'NIP doit etre 4 chiffres.' : 'PIN must be 4 digits.')); return; }
    if (newPin !== newPin2) { setPinError(fr ? 'Les NIPs ne correspondent pas.' : 'PINs do not match.'); return; }
    setPinSaving(true);
    try {
      await window.api.closeAssurance.identity.userSetPin({ id, pin: newPin });
      setSetPinFor(null);
      setNewPin(''); setNewPin2('');
    } catch (e) {
      setPinError(e.message || 'Error');
    } finally {
      setPinSaving(false);
    }
  }

  const inputS = {
    width: '100%', boxSizing: 'border-box',
    background: t.inputBg ?? '#111827',
    border: `1px solid ${t.inputBorder ?? '#374151'}`,
    borderRadius: 6, color: t.text ?? '#f9fafb',
    fontSize: 12, padding: '6px 9px', outline: 'none', fontFamily: 'inherit',
  };
  const selS = { ...inputS, cursor: 'pointer' };

  return (
    <div style={{ marginTop: 10, borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: t.text ?? '#f9fafb' }}>
          {T.idLocalUsers ?? (fr ? 'Utilisateurs locaux (NIP)' : 'Local users (PIN)')}
        </span>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError(''); }}
            style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.07)', color: '#f97316', cursor: 'pointer' }}
          >
            + {T.idAddUser ?? (fr ? 'Ajouter' : 'Add')}
          </button>
        )}
      </div>

      {users.length === 0 && !showForm && (
        <div style={{ fontSize: 11.5, color: '#6b7280' }}>{T.idNoUsers ?? (fr ? 'Aucun utilisateur local.' : 'No local users.')}</div>
      )}

      {users.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.text ?? '#f9fafb' }}>{u.name}</span>
            <span style={{ marginLeft: 8, fontSize: 10.5, color: '#9ca3af', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 6px' }}>
              {roleLabel(u.role, fr)}
            </span>
          </div>
          {setPinFor === u.id ? (
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="••••" style={{ ...inputS, width: 60, textAlign: 'center', letterSpacing: 4 }} />
                <input type="password" inputMode="numeric" maxLength={4} value={newPin2} onChange={e => setNewPin2(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="••••" style={{ ...inputS, width: 60, textAlign: 'center', letterSpacing: 4 }} />
                <button onClick={() => handleSetPin(u.id)} disabled={pinSaving} style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {pinSaving ? '...' : (fr ? 'OK' : 'OK')}
                </button>
                <button onClick={() => { setSetPinFor(null); setNewPin(''); setNewPin2(''); setPinError(''); }} style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}>
                  x
                </button>
              </div>
              {pinError && <div style={{ fontSize: 10.5, color: '#f87171' }}>{pinError}</div>}
            </div>
          ) : (
            <>
              <button onClick={() => { setSetPinFor(u.id); setNewPin(''); setNewPin2(''); setPinError(''); }}
                style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.07)', color: '#818cf8', cursor: 'pointer' }}>
                {T.idSetPIN ?? (fr ? 'NIP' : 'PIN')}
              </button>
              <button onClick={() => handleDeactivate(u.id)} disabled={deactivating === u.id}
                style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', color: '#ef4444', cursor: 'pointer', opacity: deactivating === u.id ? 0.5 : 1 }}>
                {deactivating === u.id ? '...' : (T.idDeactivate ?? (fr ? 'Desactiver' : 'Deactivate'))}
              </button>
            </>
          )}
        </div>
      ))}

      {showForm && (
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.idUserName ?? (fr ? 'Nom' : 'Name')} *</div>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus placeholder={fr ? 'Prenom Nom' : 'First Last'} style={inputS} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.idUserRole ?? (fr ? 'Role' : 'Role')}</div>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={selS}>
                {ROLES.map(r => <option key={r} value={r}>{roleLabel(r, fr)}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{T.idUserPIN ?? (fr ? 'NIP (4 chiffres)' : 'PIN (4 digits)')} *</div>
              <input type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g,'').slice(0,4) }))} placeholder="••••" style={{ ...inputS, letterSpacing: 6, textAlign: 'center', fontSize: 16 }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{fr ? 'Confirmer NIP' : 'Confirm PIN'} *</div>
              <input type="password" inputMode="numeric" maxLength={4} value={form.pin2} onChange={e => setForm(f => ({ ...f, pin2: e.target.value.replace(/\D/g,'').slice(0,4) }))} placeholder="••••" style={{ ...inputS, letterSpacing: 6, textAlign: 'center', fontSize: 16 }} />
            </div>
          </div>
          {error && <div style={{ fontSize: 11, color: '#f87171', marginBottom: 6, padding: '4px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setForm({ name: '', role: 'cashier', pin: '', pin2: '' }); setError(''); }}
              style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}>
              {fr ? 'Annuler' : 'Cancel'}
            </button>
            <button onClick={handleCreate} disabled={saving}
              style={{ padding: '5px 14px', borderRadius: 5, border: 'none', background: saving ? 'rgba(249,115,22,0.3)' : 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? '...' : (T.idAddUser ?? (fr ? 'Ajouter' : 'Add'))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
