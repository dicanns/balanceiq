/**
 * SECRET-001  credentials are encrypted on the way in and plain on the way out
 * SECRET-002  a value the keychain cannot open reads as absent, never as garbage
 * SECRET-003  a backup carries no credential; a restore keeps the ones this machine has
 * SECRET-004  cloud sync never sends a credential
 * SECRET-005  the update link is pinned to this repository; POS OAuth says when it cannot run
 *
 * API keys and POS tokens sat in kv_store as plain text, went into backup files
 * whole, and the API configuration - Stripe secret key included - was pushed to
 * cloud sync for paid plans.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { buildAccountingDb } from '../accounting/helpers/testSchema.js';
import { withoutSecrets } from '../../services/cloudSync.js';

const require = createRequire(import.meta.url);
const { createSecretStore, ENC_PREFIX } = require('../../services/secretsAtRest.cjs');
const { getAllTablesForBackup, restoreAllTablesFromBackup } = require('../../db/database.js');
const ROOT = path.resolve(__dirname, '../../..');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');

// A stand-in keychain: reversible, so the tests can read what was stored.
const fake = (ok = true) => ({
  isEncryptionAvailable: () => ok,
  encryptString: (s) => Buffer.from(Buffer.from(s, 'utf8').map(b => b ^ 0x5a)),
  decryptString: (buf) => Buffer.from(Buffer.from(buf).map(b => b ^ 0x5a)).toString('utf8'),
});

describe('SECRET-001 in and out', () => {
  it('encrypts the API config fields and the POS credentials whole', () => {
    const store = createSecretStore(fake());
    const cfg = JSON.stringify({ resendKey: 're_test_key', reportEmail: 'ops@example.test', stripeSecretKey: 'sk_test_1' });
    const stored = store.protectValue('dicann-api-config', cfg);
    expect(stored).not.toMatch(/re_test_key|sk_test_1/);
    expect(JSON.parse(stored).reportEmail).toBe('ops@example.test');
    expect(JSON.parse(stored).resendKey.__enc.startsWith(ENC_PREFIX)).toBe(true);
    expect(JSON.parse(store.revealValue('dicann-api-config', stored))).toEqual(JSON.parse(cfg));

    const pos = JSON.stringify({ square: { accessToken: 'tok' } });
    const storedPos = store.protectValue('pos-credentials', pos);
    expect(storedPos.startsWith(ENC_PREFIX)).toBe(true);
    expect(store.revealValue('pos-credentials', storedPos)).toBe(pos);
    expect(store.needsProtection('dicann-api-config', cfg)).toBe(true);
    expect(store.needsProtection('dicann-api-config', stored)).toBe(false);
    expect(store.protectValue('dicann-fac-clients', '[]')).toBe('[]');
  });

  it('stores plain when no keychain is available, and says so', () => {
    const store = createSecretStore(fake(false));
    expect(store.available()).toBe(false);
    expect(store.protectValue('pos-credentials', '{"a":1}')).toBe('{"a":1}');
    expect(store.needsProtection('pos-credentials', '{"a":1}')).toBe(false);
  });
});

describe('SECRET-002 unreadable values', () => {
  it('read as absent', () => {
    const store = createSecretStore({ ...fake(), decryptString: () => { throw new Error('other machine'); } });
    expect(store.revealValue('pos-credentials', ENC_PREFIX + 'zzzz')).toBe('{}');
    const cfg = JSON.stringify({ resendKey: { __enc: ENC_PREFIX + 'zzzz' }, reportEmail: 'x@y.test' });
    expect(JSON.parse(store.revealValue('dicann-api-config', cfg))).toEqual({ reportEmail: 'x@y.test' });
  });
});

describe('SECRET-003 backups', () => {
  let db;
  beforeEach(() => { db = buildAccountingDb(); });
  afterEach(() => { db?.close(); db = null; });
  it('carry no credential, and a restore keeps the ones already here', () => {
    db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('dicann-api-config', ?)`)
      .run(JSON.stringify({ resendKey: 'here', reportEmail: 'ops@example.test' }));
    db.prepare(`INSERT OR REPLACE INTO kv_store (key, value) VALUES ('pos-credentials', '{"tok":1}')`).run();
    const { sqlite, schemaVersion } = getAllTablesForBackup(db);
    expect(sqlite.kv_store.map(r => r.key)).not.toContain('pos-credentials');
    const cfgRow = sqlite.kv_store.find(r => r.key === 'dicann-api-config');
    expect(JSON.parse(cfgRow.value)).toEqual({ reportEmail: 'ops@example.test' });

    db.prepare(`UPDATE kv_store SET value=? WHERE key='dicann-api-config'`).run(JSON.stringify({ resendKey: 'mine', reportEmail: 'old@example.test' }));
    restoreAllTablesFromBackup({ schemaVersion, sqlite: { kv_store: sqlite.kv_store } }, schemaVersion, db);
    const after = JSON.parse(db.prepare(`SELECT value FROM kv_store WHERE key='dicann-api-config'`).get().value);
    expect(after).toEqual({ reportEmail: 'ops@example.test', resendKey: 'mine' });
    expect(db.prepare(`SELECT value FROM kv_store WHERE key='pos-credentials'`).get().value).toBe('{"tok":1}');
  });
});

describe('SECRET-004 cloud sync', () => {
  it('pushes the configuration without its secrets and refuses credential keys', () => {
    expect(withoutSecrets('pos-credentials', '{"tok":1}')).toBeNull();
    expect(JSON.parse(withoutSecrets('dicann-api-config', { resendKey: 'x', stripeSecretKey: 'y', padWebhookSecret: 'z', plan: 'pro' }))).toEqual({ plan: 'pro' });
    expect(withoutSecrets('dicann-fac-clients', '[]')).toBe('[]');
  });
});

describe('SECRET-005 main-process wiring', () => {
  it('pins the update link, routes storage through the secret store, refuses POS OAuth without a secret', () => {
    expect(MAIN).toMatch(/github\\\.com\\\/dicanns\\\/balanceiq\\\/releases\\\//);
    expect(MAIN).toMatch(/ipcMain\.handle\('storage:get', \(event, key\) => \{\s*return secretGet\(key\);/);
    expect(MAIN).toMatch(/ipcMain\.handle\('storage:set', \(event, key, value\) => \{\s*return secretSet\(key, value\);/);
    expect(MAIN).not.toMatch(/storageGet\('pos-credentials'\)/);
    expect(MAIN).toMatch(/return \{ started: false, error: 'pos_oauth_unavailable' \};/);
  });
});
