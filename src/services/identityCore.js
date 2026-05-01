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

module.exports = { hashPin, verifyPin, enforceRole, ROLE_RANK };
