/**
 * SECRET-001  credentials never leave the machine
 * SECRET-002  restoring a backup does not wipe the ones already here
 *
 * dicann-api-config holds live credentials: a Stripe secret key, a Resend API key
 * and a PAD webhook secret. The whole object was pushed to Supabase on every save
 * and written verbatim into every daily backup file, so a working Stripe secret
 * key sat in plaintext in both. The keys are needed on this machine to send mail
 * and charge cards, and nowhere else.
 *
 * Both boundaries now strip the same list. The restore path merges rather than
 * overwrites, because a backup written after this change carries no credentials
 * and a plain overwrite would log the operator out of Stripe and Resend.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  SECRET_CONFIG_FIELDS, stripApiConfigSecrets, mergeApiConfigSecrets,
} = require('../../db/database.js');

const CONFIG = {
  orgId: 'org_test',
  reportEmail: 'books@example.test',
  resendFrom: 'noreply@example.test',
  plan: 'pro',
  stripeSecretKey: 'sk_live_EXAMPLEONLY000000000000',
  resendKey: 're_EXAMPLEONLY000000000000',
  padWebhookSecret: 'whsec_EXAMPLEONLY000000000000',
};

describe('SECRET-001 credentials never leave the machine', () => {
  it('names every credential field', () => {
    expect(SECRET_CONFIG_FIELDS).toEqual(
      expect.arrayContaining(['stripeSecretKey', 'resendKey', 'padWebhookSecret'])
    );
  });

  it('strips them from an object', () => {
    const out = stripApiConfigSecrets(CONFIG);
    for (const f of SECRET_CONFIG_FIELDS) expect(out[f]).toBeUndefined();
  });

  it('keeps everything that is not a credential', () => {
    const out = stripApiConfigSecrets(CONFIG);
    expect(out).toEqual({
      orgId: 'org_test',
      reportEmail: 'books@example.test',
      resendFrom: 'noreply@example.test',
      plan: 'pro',
    });
  });

  it('strips them from the serialized form the sync queue carries', () => {
    const out = stripApiConfigSecrets(JSON.stringify(CONFIG));
    expect(typeof out).toBe('string');
    for (const f of SECRET_CONFIG_FIELDS) expect(out).not.toContain(f);
    expect(out).not.toContain('sk_live_');
    expect(out).not.toContain('whsec_');
    expect(JSON.parse(out).orgId).toBe('org_test');
  });

  it('does not mutate the caller\'s config - this machine still needs the keys', () => {
    const live = { ...CONFIG };
    stripApiConfigSecrets(live);
    expect(live.stripeSecretKey).toBe(CONFIG.stripeSecretKey);
  });

  it('survives anything that is not a config object', () => {
    for (const junk of [null, undefined, '', 'not json', 42, []]) {
      expect(() => stripApiConfigSecrets(junk)).not.toThrow();
    }
    expect(stripApiConfigSecrets('not json')).toBe('not json');
  });

  it('a config with no credentials in it is unchanged', () => {
    const plain = { orgId: 'org_test', plan: 'free' };
    expect(stripApiConfigSecrets(plain)).toEqual(plain);
  });
});

describe('SECRET-002 restoring does not wipe the credentials already here', () => {
  const STRIPPED = stripApiConfigSecrets(CONFIG);

  it('the keys on this machine survive a restore', () => {
    const merged = mergeApiConfigSecrets(STRIPPED, CONFIG);
    expect(merged.stripeSecretKey).toBe(CONFIG.stripeSecretKey);
    expect(merged.resendKey).toBe(CONFIG.resendKey);
    expect(merged.padWebhookSecret).toBe(CONFIG.padWebhookSecret);
  });

  it('everything else comes from the backup', () => {
    const fromBackup = { ...STRIPPED, reportEmail: 'newbooks@example.test', plan: 'franchise' };
    const merged = mergeApiConfigSecrets(fromBackup, CONFIG);
    expect(merged.reportEmail).toBe('newbooks@example.test');
    expect(merged.plan).toBe('franchise');
  });

  it('restoring onto a machine with no credentials yields none', () => {
    const merged = mergeApiConfigSecrets(STRIPPED, {});
    for (const f of SECRET_CONFIG_FIELDS) expect(merged[f]).toBeUndefined();
  });

  it('an old backup that still contains credentials cannot reintroduce them', () => {
    // Backups written before this change carry the keys. Restoring one must not
    // put them back into a config that the operator has since rotated.
    const rotated = { ...CONFIG, stripeSecretKey: 'sk_live_ROTATED0000000000000' };
    const merged = mergeApiConfigSecrets(CONFIG, rotated);
    expect(merged.stripeSecretKey).toBe('sk_live_ROTATED0000000000000');
  });

  it('the merge output is safe to write back to storage', () => {
    const merged = mergeApiConfigSecrets(STRIPPED, CONFIG);
    expect(() => JSON.stringify(merged)).not.toThrow();
    expect(JSON.parse(JSON.stringify(merged)).orgId).toBe('org_test');
  });
});

describe('SECRET-003 the boundaries actually call the stripper', () => {
  const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'main.js'), 'utf8');

  it('the daily backup strips before writing', () => {
    expect(main).toMatch(/apiConfig:\s*stripApiConfigSecrets\(/);
  });

  it('the sync queue strips before queueing', () => {
    const push = main.slice(main.indexOf("ipcMain.handle('syncQueue:push'"));
    expect(push.slice(0, 300)).toContain('stripApiConfigSecrets');
  });

  it('the restore path merges rather than overwrites', () => {
    expect(main).toContain('mergeApiConfigSecrets(legacy.apiConfig');
  });
});
