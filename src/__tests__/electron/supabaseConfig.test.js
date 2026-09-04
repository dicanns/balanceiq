/**
 * SUPACFG-001  main process resolves a Supabase URL without env vars (packaged build)
 * SUPACFG-002  env var still wins for local dev, and is trimmed
 * SUPACFG-003  main.js contains no bare process.env.VITE_SUPABASE_URL reads
 * SUPACFG-004  the anon key is not hardcoded into main.js
 *
 * Regression guard for the bug found 2026-09: Vite inlines VITE_* only into the
 * RENDERER bundle, and dotenv loads only when the app is unpackaged. So in every
 * packaged build process.env.VITE_SUPABASE_URL was empty, and the main process
 * threw 'supabase_not_configured' on sign-in and 'no_supabase' for PAD and quote
 * acceptance - i.e. cloud sync and direct debit were dead in shipped builds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const mainSrc = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../main.js'),
  'utf8'
);

// Mirrors getSupabaseUrl() in main.js.
const DEFAULT_SUPABASE_URL = 'https://etiwnesxjypdwhxqnqqq.supabase.co';
function getSupabaseUrl(env = {}) {
  return (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
}

describe('SUPACFG-001 packaged build resolves a Supabase URL', () => {
  it('returns the project URL when no env var is set', () => {
    expect(getSupabaseUrl({})).toBe(DEFAULT_SUPABASE_URL);
  });

  it('the resolved URL is a valid https URL with a usable host', () => {
    const u = new URL(getSupabaseUrl({}));
    expect(u.protocol).toBe('https:');
    expect(u.host).toBe('etiwnesxjypdwhxqnqqq.supabase.co');
  });

  it('never returns empty, which is what triggered supabase_not_configured', () => {
    expect(getSupabaseUrl({})).not.toBe('');
    expect(getSupabaseUrl({ VITE_SUPABASE_URL: '' })).not.toBe('');
  });
});

describe('SUPACFG-002 dev env var still wins', () => {
  it('uses the env var when present', () => {
    expect(getSupabaseUrl({ VITE_SUPABASE_URL: 'https://local.example.co' }))
      .toBe('https://local.example.co');
  });

  it('trims a trailing newline (past cause of net.fetch header failures)', () => {
    expect(getSupabaseUrl({ VITE_SUPABASE_URL: 'https://local.example.co\n' }))
      .toBe('https://local.example.co');
  });
});

describe('SUPACFG-003 main.js reads the URL through the helper', () => {
  it('declares DEFAULT_SUPABASE_URL and getSupabaseUrl()', () => {
    expect(mainSrc).toContain('DEFAULT_SUPABASE_URL');
    expect(mainSrc).toContain('function getSupabaseUrl(');
  });

  it('has no bare process.env.VITE_SUPABASE_URL fallback left', () => {
    // The helper itself is the single permitted reader.
    const bare = mainSrc.match(/process\.env\.VITE_SUPABASE_URL\s*\|\|\s*''/g) || [];
    expect(bare).toHaveLength(0);
  });
});

describe('SUPACFG-004 no credentials baked into main.js', () => {
  it('does not hardcode a JWT anon key', () => {
    expect(mainSrc).not.toMatch(/eyJhbGciOi[A-Za-z0-9_-]{10,}/);
  });

  it('resolves the anon key through a helper the renderer populates', () => {
    expect(mainSrc).toContain('function getSupabaseAnonKey(');
    expect(mainSrc).toContain('supabase:setAnonKey');
  });
});
