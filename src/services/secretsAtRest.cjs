// API keys and POS tokens used to sit in kv_store as plain text, readable by
// any process running as the user. On the way in they are encrypted with the OS
// keychain (Electron's safeStorage, injected here so this can be tested with any
// codec); on the way out they are decrypted, so the renderer never notices. A
// value that cannot be decrypted - a backup restored on another Mac - reads as
// absent rather than as garbage.
const { SECRET_CONFIG_FIELDS, SECRET_KV_KEYS } = require('./secretFields.mjs');

const ENC_PREFIX = 'enc:v1:';

function createSecretStore(keychain) {
  const available = () => { try { return !!keychain.isEncryptionAvailable(); } catch (_) { return false; } };
  const encryptText = (s) => (available() ? ENC_PREFIX + keychain.encryptString(String(s)).toString('base64') : String(s));
  const decryptText = (s) => {
    if (typeof s !== 'string' || !s.startsWith(ENC_PREFIX)) return s;
    try { return keychain.decryptString(Buffer.from(s.slice(ENC_PREFIX.length), 'base64')); } catch (_) { return null; }
  };
  const mode = (key) => (SECRET_KV_KEYS.includes(key) ? 'whole' : key === 'dicann-api-config' ? 'fields' : null);

  function protectValue(key, value) {
    const m = mode(key);
    if (!m || typeof value !== 'string') return value;
    if (m === 'whole') return encryptText(value);
    try {
      const obj = JSON.parse(value);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return value;
      for (const f of SECRET_CONFIG_FIELDS) {
        if (typeof obj[f] === 'string' && obj[f]) obj[f] = { __enc: encryptText(obj[f]) };
      }
      return JSON.stringify(obj);
    } catch (_) { return value; }
  }

  function revealValue(key, stored) {
    const m = mode(key);
    if (!m || typeof stored !== 'string') return stored;
    if (m === 'whole') { const out = decryptText(stored); return out == null ? '{}' : out; }
    try {
      const obj = JSON.parse(stored);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return stored;
      for (const f of SECRET_CONFIG_FIELDS) {
        const v = obj[f];
        if (v && typeof v === 'object' && typeof v.__enc === 'string') {
          const out = decryptText(v.__enc);
          if (out == null) delete obj[f]; else obj[f] = out;
        }
      }
      return JSON.stringify(obj);
    } catch (_) { return stored; }
  }

  // True when a stored value still carries a credential in the clear.
  function needsProtection(key, stored) {
    const m = mode(key);
    if (!m || typeof stored !== 'string' || !available()) return false;
    if (m === 'whole') return !stored.startsWith(ENC_PREFIX);
    try {
      const obj = JSON.parse(stored);
      return !!obj && typeof obj === 'object' && SECRET_CONFIG_FIELDS.some(f => typeof obj[f] === 'string' && obj[f]);
    } catch (_) { return false; }
  }

  return { protectValue, revealValue, needsProtection, available, keys: [...SECRET_KV_KEYS, 'dicann-api-config'] };
}

module.exports = { createSecretStore, ENC_PREFIX };
