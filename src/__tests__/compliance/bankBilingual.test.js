/**
 * BANK-I18N-001  bank errors cross IPC as stable codes, not French prose
 * BANK-I18N-002  bank queries return both name_fr and name_en
 * BANK-I18N-003  BanqueTab renders no hardcoded French account name
 *
 * Regression guard for 2026-09: importing the same statement twice surfaced
 * "Ce releve semble deja importe" to an English user, and every chart-of-accounts
 * dropdown showed French names regardless of language - the queries never even
 * selected name_en, so the one bilingual fallback in the file silently never fired.
 * Violates the standing project rule that every component ships complete FR + EN.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const dbSrc  = readFileSync(resolve(here, '../../db/database.js'), 'utf8');
const tabSrc = readFileSync(resolve(here, '../../components/BanqueTab.jsx'), 'utf8');

const CODES = [
  'ERR_STATEMENT_DUPLICATE',
  'ERR_BANK_ACCOUNT_NOT_FOUND',
  'ERR_NO_TRANSACTIONS',
  'ERR_STATEMENT_NOT_FOUND',
  'ERR_STATEMENT_ALREADY_RECONCILED',
  'ERR_RECONCILE_VARIANCE',
];

describe('BANK-I18N-001 bank errors are codes, not localized prose', () => {
  it.each(CODES)('database.js emits %s', (code) => {
    expect(dbSrc).toContain(code);
  });

  it.each(CODES)('BanqueTab can translate %s in both languages', (code) => {
    // Once for the fr block, once for the en block.
    const hits = tabSrc.split(code).length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('no French bank error prose is thrown from the DB layer any more', () => {
    for (const phrase of [
      'Ce relevé semble déjà importé',
      'Compte bancaire introuvable',
      'Aucune transaction trouvée',
      'Relevé déjà réconcilié',
    ]) {
      expect(dbSrc).not.toContain(phrase);
    }
  });

  it('raw main-process messages are not shown to the user unfiltered', () => {
    expect(tabSrc).not.toContain('alert(e.message)');
    expect(tabSrc).toContain('tErr(');
  });
});

describe('BANK-I18N-002 queries expose both languages', () => {
  it('every coa_name_fr alias is paired with coa_name_en', () => {
    const fr = (dbSrc.match(/AS coa_name_fr/g) || []).length;
    const en = (dbSrc.match(/AS coa_name_en/g) || []).length;
    expect(fr).toBeGreaterThan(0);
    expect(en).toBe(fr);
  });
});

describe('BANK-I18N-003 no hardcoded French account names in the UI', () => {
  it('renders account names through the language-aware helper', () => {
    expect(tabSrc).toContain('const coaName =');
  });

  it('has no bare .name_fr / .coa_name_fr render left', () => {
    expect(tabSrc).not.toMatch(/\{\s*[a-zA-Z]+\.coa_name_fr\s*\}/);
    expect(tabSrc).not.toMatch(/\{\s*[a-zA-Z]+\.name_fr\s*\}/);
  });
});
