/**
 * CONN-001  access keys: shown once, only the hash is kept
 * CONN-002  a key opens one company, and only while it is switched on
 * CONN-003  stored settings are made safe whatever the file holds
 * CONN-004  permission levels include the ones below them
 */
import { describe, it, expect } from 'vitest';
import {
  KEY_PREFIX, DEFAULT_PORT, LEVEL_READ, LEVEL_ASK, LEVEL_ACT,
  newAccessKey, hashKey, keyMatches, normalizeConfig, companyAccess, withCompany, issueKey, companyForKey, anyEnabled, levelAllows,
} from '../../connector/access.mjs';

describe('CONN-001 access keys', () => {
  it('are long, random and carry the BalanceIQ prefix', () => {
    const a = newAccessKey();
    const b = newAccessKey();
    expect(a.key.startsWith(KEY_PREFIX)).toBe(true);
    expect(a.key.length).toBeGreaterThanOrEqual(40);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('match only their own hash', () => {
    const a = newAccessKey();
    expect(keyMatches(a.key, a.hash)).toBe(true);
    expect(keyMatches(a.key + 'x', a.hash)).toBe(false);
    expect(keyMatches(newAccessKey().key, a.hash)).toBe(false);
    expect(keyMatches('', a.hash)).toBe(false);
    expect(keyMatches(undefined, a.hash)).toBe(false);
    expect(keyMatches(a.key, null)).toBe(false);
    expect(keyMatches(a.hash, a.hash)).toBe(false);
  });

  it('are never written to the settings', () => {
    const { key, config } = issueKey({}, 'co1', new Date('2026-11-14T12:00:00Z'));
    expect(JSON.stringify(config)).not.toContain(key);
    expect(config.companies.co1).toEqual({ enabled: true, keyHash: hashKey(key), level: LEVEL_READ, keyCreatedAt: '2026-11-14T12:00:00.000Z', relay: false });
  });
});

describe('CONN-002 one key, one company', () => {
  const a = issueKey({}, 'co1');
  const b = issueKey(a.config, 'co2');

  it('finds the company a key belongs to', () => {
    expect(companyForKey(b.config, a.key)).toBe('co1');
    expect(companyForKey(b.config, b.key)).toBe('co2');
    expect(companyForKey(b.config, newAccessKey().key)).toBeNull();
  });

  it('opens nothing once the company is switched off', () => {
    const off = withCompany(b.config, 'co1', { enabled: false });
    expect(companyForKey(off, a.key)).toBeNull();
    expect(companyForKey(off, b.key)).toBe('co2');
    expect(anyEnabled(off)).toBe(true);
    expect(anyEnabled(withCompany(off, 'co2', { enabled: false }))).toBe(false);
  });

  it('a new key replaces the old one', () => {
    const again = issueKey(b.config, 'co1');
    expect(companyForKey(again.config, a.key)).toBeNull();
    expect(companyForKey(again.config, again.key)).toBe('co1');
  });
});

describe('CONN-003 stored settings', () => {
  it('default to off, read only, on the standard port', () => {
    expect(normalizeConfig(null)).toEqual({ port: DEFAULT_PORT, companies: {} });
    expect(companyAccess({}, 'co1')).toEqual({ enabled: false, keyHash: null, level: LEVEL_READ, keyCreatedAt: null, relay: false });
    expect(anyEnabled(undefined)).toBe(false);
  });

  it('cannot be on without a key, and ignore a bad level or port', () => {
    const cfg = normalizeConfig({ port: 80, companies: { co1: { enabled: true, level: 'root' }, co2: 'x', co3: { enabled: true, keyHash: 'abc' } } });
    expect(cfg.port).toBe(DEFAULT_PORT);
    expect(cfg.companies.co1).toEqual({ enabled: false, keyHash: null, level: LEVEL_READ, keyCreatedAt: null, relay: false });
    expect(cfg.companies.co2).toBeUndefined();
    expect(cfg.companies.co3.enabled).toBe(false);
  });

  it('keep a chosen port and level', () => {
    const cfg = withCompany({ port: 50123 }, 'co1', { level: LEVEL_ASK });
    expect(cfg.port).toBe(50123);
    expect(cfg.companies.co1.level).toBe(LEVEL_ASK);
  });
});

describe('CONN-004 permission levels', () => {
  it('each level allows what the lower ones allow', () => {
    expect(levelAllows(LEVEL_READ, LEVEL_READ)).toBe(true);
    expect(levelAllows(LEVEL_READ, LEVEL_ASK)).toBe(false);
    expect(levelAllows(LEVEL_ASK, LEVEL_READ)).toBe(true);
    expect(levelAllows(LEVEL_ASK, LEVEL_ACT)).toBe(false);
    expect(levelAllows(LEVEL_ACT, LEVEL_ASK)).toBe(true);
    expect(levelAllows('root', LEVEL_READ)).toBe(false);
    expect(levelAllows(LEVEL_ACT, 'root')).toBe(false);
  });
});
