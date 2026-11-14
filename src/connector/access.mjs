// Who may use the AI connector, and how far.
//
// The connector is off until the owner turns it on for a company. Turning it on
// creates an access key that is shown once; only its SHA-256 is kept, in a file
// beside the app's data on this computer (never in the books, never synced).
// A key belongs to one company: a request carrying it is answered only while
// that company is the one open in BalanceIQ.

import crypto from 'node:crypto';

export const KEY_PREFIX = 'biq_';
export const DEFAULT_PORT = 47821;

// What the AI may do. Each level includes the one before it.
export const LEVEL_READ = 'read'; // read the books, change nothing
export const LEVEL_ASK = 'ask';   // propose changes; each one is confirmed in BalanceIQ
export const LEVEL_ACT = 'act';   // make changes without asking (human-only actions stay closed)
export const LEVELS = [LEVEL_READ, LEVEL_ASK, LEVEL_ACT];

export function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || ''), 'utf8').digest('hex');
}

/** A new access key and the hash to keep. The key itself is never stored. */
export function newAccessKey() {
  const key = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { key, hash: hashKey(key) };
}

export function keyMatches(key, hash) {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX) || typeof hash !== 'string' || hash.length !== 64) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const validPort = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;

/** The stored settings, made safe to use whatever the file held. */
export function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const companies = {};
  for (const [id, c] of Object.entries(src.companies && typeof src.companies === 'object' ? src.companies : {})) {
    if (!c || typeof c !== 'object') continue;
    const keyHash = typeof c.keyHash === 'string' && /^[0-9a-f]{64}$/.test(c.keyHash) ? c.keyHash : null;
    companies[id] = {
      enabled: c.enabled === true && !!keyHash,
      keyHash,
      level: LEVELS.includes(c.level) ? c.level : LEVEL_READ,
      keyCreatedAt: typeof c.keyCreatedAt === 'string' ? c.keyCreatedAt : null,
    };
  }
  return { port: validPort(src.port) ? src.port : DEFAULT_PORT, companies };
}

export function companyAccess(config, companyId) {
  return normalizeConfig(config).companies[companyId] || { enabled: false, keyHash: null, level: LEVEL_READ, keyCreatedAt: null };
}

/** The settings with one company's entry changed. */
export function withCompany(config, companyId, patch) {
  const cfg = normalizeConfig(config);
  return normalizeConfig({ ...cfg, companies: { ...cfg.companies, [companyId]: { ...companyAccess(cfg, companyId), ...patch } } });
}

/** Turn the connector on for a company with a fresh key. Returns the key to show once. */
export function issueKey(config, companyId, now = new Date()) {
  const { key, hash } = newAccessKey();
  return { key, config: withCompany(config, companyId, { enabled: true, keyHash: hash, keyCreatedAt: now.toISOString() }) };
}

/** The company a key opens, or null. A company that is switched off opens for no key. */
export function companyForKey(config, key) {
  const cfg = normalizeConfig(config);
  let found = null;
  for (const [id, c] of Object.entries(cfg.companies)) {
    if (c.enabled && keyMatches(key, c.keyHash)) found = id;
  }
  return found;
}

export function anyEnabled(config) {
  return Object.values(normalizeConfig(config).companies).some((c) => c.enabled);
}

export const levelAllows = (level, needed) => LEVELS.indexOf(level) >= LEVELS.indexOf(needed) && LEVELS.includes(needed);
