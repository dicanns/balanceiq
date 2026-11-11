/**
 * FUP-001  isOverdue: one definition
 * FUP-002  walkCashDays: carry walks days with register cash but no entry
 * FUP-003  csvCell: formula guard, tabs and newlines
 * FUP-004  source wiring for order deposits, overpayment, statement, numbering,
 *          cash void, interest, recurring auto-send, CSV, royalty email, doc language
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isOverdue } from '../../utils/invoiceStatus.mjs';
import { walkCashDays } from '../../utils/cashCarry.mjs';
import { csvCell, csvRow } from '../../utils/csvCell.mjs';

const APP = fs.readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');

describe('FUP-001 isOverdue', () => {
  const today = '2026-11-10';
  it('open and late is overdue, part-paid late too', () => {
    expect(isOverdue({ statut: 'Envoyée', dateEcheance: '2026-11-01' }, today)).toBe(true);
    expect(isOverdue({ statut: 'Payée partiellement', dateEcheance: '2026-11-09' }, today)).toBe(true);
  });
  it('not overdue when closed, draft, pro forma, undated or due today', () => {
    for (const statut of ['Payée', 'Créditée', 'Annulée', 'Radiée', 'Brouillon'])
      expect(isOverdue({ statut, dateEcheance: '2026-01-01' }, today)).toBe(false);
    expect(isOverdue({ statut: 'Envoyée', documentType: 'proforma', dateEcheance: '2026-01-01' }, today)).toBe(false);
    expect(isOverdue({ statut: 'Envoyée' }, today)).toBe(false);
    expect(isOverdue({ statut: 'Envoyée', dateEcheance: today }, today)).toBe(false);
  });
});

describe('FUP-002 walkCashDays', () => {
  const locations = [{ id: 'a' }];
  it('carries through a day with register cash but no Encaisse entry', () => {
    const enc = { '2026-11-01': { openingOverride: 100 }, '2026-11-03': {} };
    const live = { '2026-11-02': { cashes: [{ finalCash: 250, float: 100 }] } };
    const w = walkCashDays(enc, live, { locations });
    expect(w['2026-11-02'].closing).toBe(250);
    expect(w['2026-11-03'].opening).toBe(250);
  });
  it('respects upTo and extraDates', () => {
    const w = walkCashDays({ '2026-11-01': { openingOverride: 5 } }, {}, { locations, upTo: '2026-11-02', extraDates: ['2026-11-02', '2026-11-09'] });
    expect(Object.keys(w)).toEqual(['2026-11-01', '2026-11-02']);
    expect(w['2026-11-02'].closing).toBe(5);
  });
});

describe('FUP-003 csvCell', () => {
  it('guards formulas, keeps numbers, flattens whitespace', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvCell('@cmd')).toBe(`"'@cmd"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('-x')).toBe(`"'-x"`);
    expect(csvCell(-12.5)).toBe('"-12.5"');
    expect(csvCell('a\tb\nc')).toBe('"a b c"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
    expect(csvRow(['a', 1])).toBe('"a","1"');
  });
});

describe('FUP-004 wiring', () => {
  it('order deposits post and carry to the invoice', () => {
    expect(APP).toMatch(/postOrderDeposits\(id,numero,acomptes\)/);
    expect(APP).toMatch(/sourceType==="commande"&&\(source\.acomptes\|\|\[\]\)\.length\?\{acomptes:source\.acomptes\.map/);
  });
  it('overpayment is confirmed, not silently trimmed', () => {
    expect(APP).toMatch(/window\.confirm\(`\$\{T\.facOverpayConfirm\}/);
  });
  it('statement has a balance forward line', () => {
    expect(APP).toMatch(/L\.balanceForward/);
  });
  it('generated invoices use generateDocNum and register', () => {
    expect(APP).not.toMatch(/fmtDocNum\(docNums\?\.prefix\|\|"BIQ"/);
    expect(APP).not.toMatch(/numero:fmtDocNum\(docNums\.prefix,"F"/);
  });
  it('cash payment void removes its Encaisse row', () => {
    expect(APP).toMatch(/e\.fromFacturation&&e\.id===p\.id/);
  });
  it('one cash-carry function, one overdue definition, one csv helper', () => {
    expect((APP.match(/walkCashDays\(/g) || []).length).toBe(3);
    expect(APP).not.toMatch(/prevClosing=closing/);
    expect(APP).not.toMatch(/\["Envoyée","Payée partiellement"\]\.includes\(doc\.statut\)&&doc\.dateEcheance/);
    expect(APP).not.toMatch(/\.replace\(\/"\/g,'""'\)\}"`\)\.join/);
  });
  it('interest settings reload from the stored value and compound is gone', () => {
    expect(APP).toMatch(/typeof s==='string'\?s:s\?\.value/);
    expect(APP).not.toMatch(/cfg\.method==="compound"/);
  });
  it('recurring auto-send is behind a constant', () => {
    expect(APP).toMatch(/const RECURRING_AUTO_SEND_ENABLED=false/);
    expect(APP).toMatch(/RECURRING_AUTO_SEND_ENABLED&&rec\.autoEnvoyer/);
  });
  it('royalty reminders read courriel', () => {
    expect(APP).not.toMatch(/client\?\.email\|\|''/);
    expect(APP).not.toMatch(/inv\.client\?\.email\|\|''/);
  });
  it('quote, order, credit note and receipt follow the customer language', () => {
    for (const fn of ['buildSoumissionHTML', 'buildCommandeHTML', 'buildReceiptHTML', 'buildNoteDeCreditHTML']) {
      const a = APP.indexOf('function ' + fn + '(');
      const body = APP.slice(a, APP.indexOf('\n}\n', a));
      expect(body).toMatch(/DOC_LABELS\[docLang\]/);
    }
  });
});
