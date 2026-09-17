/**
 * HARDEN-001  the window opens nothing but the app; links go to the browser through the allowlist
 * HARDEN-002  production allows no inline script; development keeps it for Fast Refresh
 * HARDEN-003  the main process reports to Sentry in a packaged build, and scrubs
 * HARDEN-004  the scrubber removes emails, keys, tokens and home folders
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'module';
import { csp } from '../../../vite.config.js';

const require = createRequire(import.meta.url);
const { scrubString, scrubEvent } = require('../../services/sentryScrub.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'src/index.jsx'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('HARDEN-001 the window', () => {
  it('denies new windows, refuses navigation away, grants only notifications', () => {
    expect(MAIN).toMatch(/win\.webContents\.setWindowOpenHandler\(\(\{ url \}\) => \{\s*if \(isUrlSafe\(url\)\) shell\.openExternal\(url\);\s*return \{ action: 'deny' \};/);
    expect(MAIN).toMatch(/win\.webContents\.on\('will-navigate'/);
    expect(MAIN).toMatch(/callback\(permission === 'notifications'\)/);
  });
});

describe('HARDEN-002 the policy', () => {
  it('has no inline script in production and no frames or plugins in either', () => {
    const prod = csp('production'), dev = csp('development');
    expect(prod).toMatch(/script-src 'self';/);
    expect(prod).not.toMatch(/script-src 'self' 'unsafe-inline'/);
    expect(dev).toMatch(/script-src 'self' 'unsafe-inline'/);
    for (const p of [prod, dev]) {
      expect(p).toMatch(/object-src 'none'/);
      expect(p).toMatch(/frame-src 'none'/);
      expect(p).toMatch(/connect-src [^;]*https:\/\/\*\.supabase\.co/);
    }
    expect(dev).toMatch(/ws:\/\/localhost:5173/);
    expect(prod).not.toMatch(/localhost/);
    // The page itself carries no inline script: the fetch shim is a file.
    const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
    expect(html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).toEqual([]);
    expect(html).toMatch(/<script src="\.\/fetch-shim\.js"><\/script>/);
    expect(fs.existsSync(path.join(ROOT, 'src/public/fetch-shim.js'))).toBe(true);
  });
});

describe('HARDEN-003 Sentry in the main process', () => {
  it('reads the DSN written at build time and scrubs before sending', () => {
    expect(MAIN).toMatch(/dist', 'sentry\.json'/);
    expect(MAIN).toMatch(/beforeSend: scrubEvent/);
    expect(MAIN).toMatch(/sendDefaultPii: false/);
    expect(INDEX).toMatch(/beforeSend: scrub\.scrubEvent/);
    for (const k of ['build', 'build:mac', 'build:win']) expect(PKG.scripts[k]).toMatch(/node scripts\/write-sentry-dsn\.cjs && electron-builder/);
    expect(fs.existsSync(path.join(ROOT, 'scripts/write-sentry-dsn.cjs'))).toBe(true);
  });
});

describe('HARDEN-004 the scrubber', () => {
  it('replaces what must never leave the machine', () => {
    const s = scrubString('mail anthony@example.test key sk_live_ABCdef123 resend re_abcdefgh_12 path /Users/anthony/Documents jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF-ghi');
    expect(s).not.toMatch(/example\.test|sk_live|re_abcdefgh|\/Users\/anthony|eyJhbGci/);
    expect(s).toMatch(/\[email\]/);
    expect(s).toMatch(/\[secret\]/);
    expect(s).toMatch(/\/Users\/\[user\]\/Documents/);
    const ev = scrubEvent({ user: { email: 'x@y.test' }, request: { cookies: 'a=b', headers: {} , url: 'https://balanceiq.ca' }, message: 'to x@y.test', extra: { path: 'C:\\Users\\bob\\file' } });
    expect(ev.user).toBeUndefined();
    expect(ev.request.cookies).toBeUndefined();
    expect(ev.message).toBe('to [email]');
    expect(ev.extra.path).toBe('C:\\Users\\[user]\\file');
  });
});
