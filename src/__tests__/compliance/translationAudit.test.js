/**
 * TRANSLATION-AUDIT-001  Accountant-friendly terminology in FR + EN
 *
 * Verifies that accounting-facing labels use formal accountant vocabulary,
 * not operator shorthand. No behavior change — vocabulary only.
 */
import { describe, it, expect } from 'vitest';
import { FR, EN } from '../../i18n/translations.js';

describe('TRANSLATION-AUDIT-001 AR aging — Comptes clients / Accounts Receivable', () => {
  it('FR aging title is Comptes clients (not Âge des comptes)', () => {
    expect(FR.agingTitle).toBe('Comptes clients');
  });

  it('EN aging title is Accounts Receivable', () => {
    expect(EN.agingTitle).toBe('Accounts Receivable');
  });
});

describe('TRANSLATION-AUDIT-001 P&L revenue — Revenus / Revenue', () => {
  it('FR P&L revenue label is Revenus (not Ventes)', () => {
    expect(FR.plRevenue).toBe('Revenus');
  });

  it('EN P&L revenue label is Revenue (not Sales)', () => {
    expect(EN.plRevenue).toBe('Revenue');
  });
});

describe('TRANSLATION-AUDIT-001 GL account mapping — accountant labels', () => {
  it('FR GL revenue uses Revenus (not Ventes)', () => {
    expect(FR.cfgGLRevenue).toMatch(/[Rr]evenus/);
    expect(FR.cfgGLRevenue).not.toMatch(/^Ventes/);
  });

  it('EN GL revenue uses Revenue', () => {
    expect(EN.cfgGLRevenue).toMatch(/Revenue/);
  });

  it('FR GL AR uses Comptes clients', () => {
    expect(FR.cfgGLAR).toContain('Comptes clients');
  });

  it('EN GL AR uses Accounts Receivable', () => {
    expect(EN.cfgGLAR).toContain('Accounts Receivable');
  });
});

describe('TRANSLATION-AUDIT-001 CRA / ARC — full agency name', () => {
  it('FR tax-exempt no-doc warning uses ARC not bare CRA', () => {
    expect(FR.taxExemptNoDoc).toContain('ARC');
    expect(FR.taxExemptNoDoc).toContain('Agence du revenu du Canada');
  });

  it('EN tax-exempt no-doc warning uses Canada Revenue Agency', () => {
    expect(EN.taxExemptNoDoc).toContain('Canada Revenue Agency');
    expect(EN.taxExemptNoDoc).toContain('CRA');
  });
});

describe('TRANSLATION-AUDIT-001 fiscal year — exercice / Fiscal year', () => {
  it('FR fiscal year start uses exercice (not année fiscale)', () => {
    expect(FR.yearEndFiscalStart).toMatch(/exercice/i);
  });

  it('FR fiscal year end uses exercice (not année fiscale)', () => {
    expect(FR.yearEndFiscalEnd).toMatch(/exercice/i);
  });

  it('EN fiscal year labels use Fiscal year', () => {
    expect(EN.yearEndFiscalStart).toMatch(/fiscal year/i);
    expect(EN.yearEndFiscalEnd).toMatch(/fiscal year/i);
  });
});

describe('TRANSLATION-AUDIT-001 GST / TPS terminology', () => {
  it('FR invoice TPS label uses TPS', () => {
    expect(FR.facTPS).toContain('TPS');
  });

  it('EN invoice GST label uses GST', () => {
    expect(EN.facTPS).toContain('GST');
  });

  it('FR invoice TVQ label uses TVQ', () => {
    expect(FR.facTVQ).toContain('TVQ');
  });

  it('EN invoice QST label uses QST', () => {
    expect(EN.facTVQ).toContain('QST');
  });
});
