/**
 * NO-FR-LEAK-001  the DB layer throws no French prose (codes only)
 * NO-FR-LEAK-002  every thrown ERR_* code is translatable in FR and EN
 * NO-FR-LEAK-003  no component renders an unconditional French account name
 * NO-FR-LEAK-004  no hardcoded French Suspense fallback in App.jsx
 *
 * Standing project rule: every component ships complete FR + EN strings. Errors
 * cross the IPC boundary as strings, so anything thrown from src/db must be a
 * stable code that the renderer translates - otherwise an English user gets
 * French, which is how this was found (a duplicate statement import).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const dbSrc      = read('src/db/database.js');
const appSrc     = read('src/App.jsx');
const bankSrc    = read('src/components/BanqueTab.jsx');
const ledgerSrc  = read('src/components/GrandLivreTab.jsx');

const ACCENTS = /[éèêëàâçôöûùîï]/i;

describe('NO-FR-LEAK-001 database.js throws codes, not French', () => {
  it('has no accented string in any throw new Error(...)', () => {
    const offenders = dbSrc
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /throw new Error\(['"`]/.test(line) && ACCENTS.test(line));
    expect(offenders.map(o => `${o.n}: ${o.line}`)).toEqual([]);
  });

  it('still throws a healthy number of coded errors', () => {
    const codes = dbSrc.match(/throw new Error\('ERR_[A-Z_]+'\)/g) || [];
    expect(codes.length).toBeGreaterThanOrEqual(20);
  });
});

describe('NO-FR-LEAK-002 every thrown code has FR + EN text', () => {
  const thrown = [...new Set(
    (dbSrc.match(/throw new Error\('(ERR_[A-Z_]+)'\)/g) || [])
      .map(m => m.match(/ERR_[A-Z_]+/)[0])
  )];
  const translated = bankSrc + ledgerSrc;

  it('found codes to check', () => expect(thrown.length).toBeGreaterThan(0));

  it.each(thrown)('%s is translated twice (fr + en)', (code) => {
    const hits = translated.split(code).length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
  });
});

describe('NO-FR-LEAK-003 account names respect the selected language', () => {
  const componentsDir = join(root, 'src/components');
  const files = readdirSync(componentsDir).filter(f => f.endsWith('.jsx'));

  it.each(files)('%s has no unconditional name_fr render', (file) => {
    const src = readFileSync(join(componentsDir, file), 'utf8');
    // A bare {x.name_fr} render ignores the language. Form bindings
    // (value={form.name_fr}) are legitimate - that field IS the French name.
    const leaks = (src.match(/\{\s*[a-zA-Z_$][\w$]*\.(coa_)?name_fr\s*\}/g) || [])
      .filter((m) => {
        const at = src.indexOf(m);
        return !/value=$/.test(src.slice(Math.max(0, at - 6), at));
      });
    expect(leaks).toEqual([]);
  });
});

describe('NO-FR-LEAK-004 App.jsx loading text is localized', () => {
  it('has no hardcoded French Suspense fallback', () => {
    expect(appSrc).not.toContain('>Chargement...</div>');
  });
});
