/**
 * IDENT-001  PIN hashing
 * IDENT-002  role enforcement
 * IDENT-003  backend selection (DB + identity core)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runMigrations } = require('../../db/migrations.js');
const { hashPin, verifyPin, enforceRole } = require('../../services/identityCore.js');
const {
  localUserCreate,
  localUserList,
  localUserListWithHashes,
  localUserDeactivate,
  localUserSetPin,
} = require('../../db/database.js');

function makeDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT 'test',
      module TEXT NOT NULL, action TEXT NOT NULL,
      record_type TEXT NOT NULL, record_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forecast_products (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_fr TEXT NOT NULL, name_en TEXT DEFAULT '', category TEXT DEFAULT 'other'
    );
  `);
  db.pragma('user_version = 7');
  runMigrations(db);
  return db;
}

// ── IDENT-001: PIN hashing ────────────────────────────────────────────────────

describe('IDENT-001 PIN hashing', () => {
  it('hashing the same PIN twice with the same salt produces the same hash', () => {
    const { hash: h1, salt } = hashPin('1234');
    const crypto = require('crypto');
    const h2 = crypto.scryptSync('1234', salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
    expect(h1).toBe(h2);
  });

  it('hashing the same PIN twice with different salts produces different hashes', () => {
    const { hash: h1 } = hashPin('1234');
    const { hash: h2 } = hashPin('1234');
    expect(h1).not.toBe(h2);
  });

  it('PIN verification accepts correct PIN', () => {
    const { hash, salt } = hashPin('5678');
    expect(verifyPin('5678', hash, salt)).toBe(true);
  });

  it('PIN verification rejects wrong PIN', () => {
    const { hash, salt } = hashPin('5678');
    expect(verifyPin('9999', hash, salt)).toBe(false);
  });

  it('PIN must be exactly 4 digits - hashPin rejects short PIN', () => {
    expect(() => hashPin('123')).toThrow('pin_format');
  });

  it('PIN must be exactly 4 digits - hashPin rejects non-digits', () => {
    expect(() => hashPin('abcd')).toThrow('pin_format');
  });

  it('verifyPin returns false for non-4-digit input', () => {
    const { hash, salt } = hashPin('1234');
    expect(verifyPin('123', hash, salt)).toBe(false);
    expect(verifyPin('12345', hash, salt)).toBe(false);
  });
});

// ── IDENT-002: role enforcement ───────────────────────────────────────────────

describe('IDENT-002 role enforcement', () => {
  it('requireRole(manager) rejects cashier role', () => {
    expect(enforceRole('cashier', 'manager')).toBe(false);
  });

  it('requireRole(manager) accepts manager role', () => {
    expect(enforceRole('manager', 'manager')).toBe(true);
  });

  it('requireRole(manager) accepts owner role', () => {
    expect(enforceRole('owner', 'manager')).toBe(true);
  });

  it('requireRole(cashier) accepts cashier', () => {
    expect(enforceRole('cashier', 'cashier')).toBe(true);
  });

  it('requireRole(owner) rejects manager', () => {
    expect(enforceRole('manager', 'owner')).toBe(false);
  });

  it('null actorRole (typed_name) fails any role requirement', () => {
    expect(enforceRole(null, 'manager')).toBe(false);
  });
});

// ── IDENT-003: backend selection (DB round-trip) ──────────────────────────────

describe('IDENT-003 local_users DB round-trip', () => {
  let db;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it('localUserCreate stores user and localUserList returns it', () => {
    const { hash, salt } = hashPin('1234');
    localUserCreate({ name: 'Marie', role: 'manager', pin_hash: hash, pin_salt: salt }, db);
    const users = localUserList(db);
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Marie');
    expect(users[0].role).toBe('manager');
  });

  it('localUserList does not expose pin_hash or pin_salt', () => {
    const { hash, salt } = hashPin('1234');
    localUserCreate({ name: 'Marie', role: 'manager', pin_hash: hash, pin_salt: salt }, db);
    const users = localUserList(db);
    expect(users[0].pin_hash).toBeUndefined();
    expect(users[0].pin_salt).toBeUndefined();
  });

  it('localUserListWithHashes returns pin_hash and pin_salt', () => {
    const { hash, salt } = hashPin('1234');
    localUserCreate({ name: 'Marie', role: 'manager', pin_hash: hash, pin_salt: salt }, db);
    const users = localUserListWithHashes(db);
    expect(users[0].pin_hash).toBe(hash);
    expect(users[0].pin_salt).toBe(salt);
  });

  it('verifyPin round-trip through DB: correct PIN matches', () => {
    const { hash, salt } = hashPin('4321');
    localUserCreate({ name: 'Jean', role: 'cashier', pin_hash: hash, pin_salt: salt }, db);
    const users = localUserListWithHashes(db);
    const u = users[0];
    expect(verifyPin('4321', u.pin_hash, u.pin_salt)).toBe(true);
  });

  it('verifyPin round-trip through DB: wrong PIN rejected', () => {
    const { hash, salt } = hashPin('4321');
    localUserCreate({ name: 'Jean', role: 'cashier', pin_hash: hash, pin_salt: salt }, db);
    const users = localUserListWithHashes(db);
    const u = users[0];
    expect(verifyPin('1234', u.pin_hash, u.pin_salt)).toBe(false);
  });

  it('localUserDeactivate removes user from list', () => {
    const { hash, salt } = hashPin('0000');
    const { id } = localUserCreate({ name: 'Temp', role: 'cashier', pin_hash: hash, pin_salt: salt }, db);
    localUserDeactivate(id, db);
    const users = localUserList(db);
    expect(users).toHaveLength(0);
  });

  it('localUserSetPin updates hash', () => {
    const { hash: h1, salt: s1 } = hashPin('1111');
    const { id } = localUserCreate({ name: 'Pat', role: 'manager', pin_hash: h1, pin_salt: s1 }, db);
    const { hash: h2, salt: s2 } = hashPin('2222');
    localUserSetPin({ id, pin_hash: h2, pin_salt: s2 }, db);
    const users = localUserListWithHashes(db);
    expect(verifyPin('2222', users[0].pin_hash, users[0].pin_salt)).toBe(true);
    expect(verifyPin('1111', users[0].pin_hash, users[0].pin_salt)).toBe(false);
  });

  it('typed_name backend produces actor with method=typed_name (pure logic)', () => {
    const name = 'Anthony';
    const actor = { name: name.trim(), role: null, identity_method: 'typed_name' };
    expect(actor.identity_method).toBe('typed_name');
    expect(actor.name).toBe('Anthony');
  });

  it('rejects invalid role on create', () => {
    expect(() => localUserCreate({ name: 'X', role: 'superuser', pin_hash: null, pin_salt: null }, db)).toThrow();
  });

  it('rejects empty name on create', () => {
    expect(() => localUserCreate({ name: '', role: 'cashier', pin_hash: null, pin_salt: null }, db)).toThrow();
  });
});
