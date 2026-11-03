'use strict';
const crypto = require('crypto');

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

const ROLE_RANK = { cashier: 0, manager: 1, owner: 2 };

function hashPin(pin) {
  if (!/^\d{4}$/.test(String(pin))) throw new Error('pin_format');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
  return { hash, salt };
}

function verifyPin(pin, storedHash, salt) {
  if (!/^\d{4}$/.test(String(pin))) return false;
  try {
    const computed = crypto.scryptSync(String(pin), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function enforceRole(actorRole, requiredRole) {
  return (ROLE_RANK[actorRole] ?? -1) >= (ROLE_RANK[requiredRole] ?? 0);
}

// Verified-actor tokens. An approval that says "verified by PIN" or "signed-in
// user" has to have been: the verify step issues a short-lived token for the
// actor it checked, and a later transition or approval claiming one of those
// methods must present it. The actor recorded is the one the token names, never
// the fields the screen sent. A typed name is self-declared by policy and needs
// no token.
const VERIFIED_METHODS = ['pin', 'cloud_user'];
function createActorRegistry({ ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
  const tokens = new Map();
  function issue(actor) {
    for (const [k, v] of tokens) if (v.expires < now()) tokens.delete(k);
    const token = crypto.randomBytes(16).toString('hex');
    tokens.set(token, { actor: { ...actor }, expires: now() + ttlMs });
    return token;
  }
  // Returns the opts to trust, or throws 'identity_not_verified'.
  function trust(opts) {
    const o = { ...(opts || {}) };
    const entry = o.actor_token ? tokens.get(String(o.actor_token)) : null;
    if (entry && entry.expires >= now()) {
      o.actor_name = entry.actor.name;
      o.actor_role = entry.actor.role ?? null;
      o.approval_method = entry.actor.identity_method;
    } else if (VERIFIED_METHODS.includes(String(o.approval_method || ''))) {
      throw new Error('identity_not_verified');
    }
    delete o.actor_token;
    return o;
  }
  return { issue, trust };
}

module.exports = { hashPin, verifyPin, enforceRole, ROLE_RANK, createActorRegistry, VERIFIED_METHODS };
