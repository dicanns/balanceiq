import React, { useState } from 'react';

export default function IdentityPicker({
  method = 'typed_name',
  requiredRole = null,
  onVerified,
  onCancel,
  T = {},
  t = {},
  lang = 'fr',
  cloudUser = null,
}) {
  const fr = lang !== 'en';
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputS = {
    width: '100%', boxSizing: 'border-box',
    background: t.inputBg ?? '#111827',
    border: `1px solid ${t.inputBorder ?? '#374151'}`,
    borderRadius: 6, color: t.text ?? '#f9fafb',
    fontSize: 13, padding: '8px 10px', outline: 'none',
    fontFamily: 'inherit',
  };

  const errorMsg = {
    name_required: fr ? 'Nom requis.' : 'Name required.',
    pin_format:    fr ? 'Le NIP doit etre 4 chiffres.' : 'PIN must be 4 digits.',
    invalid_pin:   fr ? 'NIP invalide.' : 'Invalid PIN.',
    not_signed_in: fr ? 'Non connecte.' : 'Not signed in.',
    role_insufficient: fr ? 'Role insuffisant (gerant requis).' : 'Insufficient role (manager required).',
    unknown_method: fr ? 'Methode inconnue.' : 'Unknown method.',
  };

  async function handleVerify() {
    setError('');
    setLoading(true);
    try {
      const opts = { method, requiredRole };
      if (method === 'typed_name') opts.name = name;
      else if (method === 'pin') opts.pin = pin;
      else if (method === 'cloud_user') opts.cloudUser = cloudUser;

      const result = await window.api.closeAssurance.identity.verify(opts);
      if (!result.ok) {
        setError(errorMsg[result.error] || result.error);
        return;
      }
      onVerified(result.actor);
    } catch (e) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  const containerS = {
    borderRadius: 8,
    border: '1px solid rgba(249,115,22,0.25)',
    background: 'rgba(249,115,22,0.04)',
    padding: '14px 16px',
  };

  const title = T.idVerifyIdentity ?? (fr ? 'Verification d\'identite' : 'Identity verification');

  return (
    <div style={containerS}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 10 }}>{title}</div>

      {method === 'typed_name' && (
        <div>
          <div style={{ fontSize: 11, color: t.textMuted ?? '#9ca3af', marginBottom: 4 }}>
            {T.idEnterName ?? (fr ? 'Votre nom' : 'Your name')}
          </div>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            placeholder={fr ? 'Nom complet' : 'Full name'}
            style={inputS}
          />
        </div>
      )}

      {method === 'pin' && (
        <div>
          <div style={{ fontSize: 11, color: t.textMuted ?? '#9ca3af', marginBottom: 4 }}>
            {T.idEnterPIN ?? (fr ? 'NIP (4 chiffres)' : 'PIN (4 digits)')}
          </div>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            placeholder="••••"
            style={{ ...inputS, letterSpacing: 6, fontSize: 18, textAlign: 'center' }}
          />
        </div>
      )}

      {method === 'cloud_user' && (
        <div>
          {cloudUser?.email ? (
            <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 8 }}>
              {T.idSignedInAs ?? (fr ? 'Connecte en tant que' : 'Signed in as')}: <strong>{cloudUser.email}</strong>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
              {T.idCloudNotSignedIn ?? (fr ? 'Non connecte. Veuillez vous connecter d\'abord.' : 'Not signed in. Please sign in first.')}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#f87171', padding: '5px 8px', borderRadius: 5, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}
          >
            {T.sdCancel ?? (fr ? 'Annuler' : 'Cancel')}
          </button>
        )}
        {(method !== 'cloud_user' || cloudUser?.email) && (
          <button
            onClick={handleVerify}
            disabled={loading || (method === 'pin' && pin.length < 4) || (method === 'typed_name' && !name.trim())}
            style={{
              padding: '6px 18px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
              background: loading ? 'rgba(249,115,22,0.3)' : 'linear-gradient(135deg,#f97316,#ea580c)',
              color: '#fff', cursor: loading ? 'default' : 'pointer',
              opacity: (method === 'pin' && pin.length < 4) || (method === 'typed_name' && !name.trim()) ? 0.5 : 1,
            }}
          >
            {loading ? '...' : (T.idVerify ?? (fr ? 'Verifier' : 'Verify'))}
          </button>
        )}
      </div>
    </div>
  );
}
