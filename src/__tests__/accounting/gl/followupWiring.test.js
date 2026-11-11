/**
 * FUP-001  payment plans stay hidden behind PAYMENT_PLANS_ENABLED
 * FUP-002  removing a posted deposit reverses its ledger entry first
 * FUP-003  Acomba and Sage exports include credit notes
 * FUP-004  the PIN lock persists failed attempts and doubles the lockout
 * FUP-005  quote acceptance checks the send and makes no attachment promise
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const APP = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const TR = fs.readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

describe('follow-up wiring', () => {
  it('FUP-001 payment plan entry point is gated', () => {
    expect(APP).toMatch(/const PAYMENT_PLANS_ENABLED=false;/);
    expect(APP).toContain('{PAYMENT_PLANS_ENABLED&&!isProforma&&canUse("paymentPlans")');
  });

  it('FUP-002 deposit removal reverses before removing', () => {
    const i = APP.indexOf('const removeDeposit=async');
    expect(i).toBeGreaterThan(0);
    const body = APP.slice(i, i + 700);
    expect(body.indexOf('depositReverse')).toBeGreaterThan(-1);
    expect(body.indexOf('depositReverse')).toBeLessThan(body.indexOf('setAcomptes('));
    expect(body).toContain('facDepositRemoveFailed');
    expect(APP).toContain('onClick={()=>removeDeposit(a)}');
  });

  it('FUP-003 exports carry credit notes', () => {
    expect(APP).toContain('<ComptabiliteExport creditNotes={creditNotes}');
    const ac = APP.slice(APP.indexOf('const buildAcombaRows'), APP.indexOf('const buildSage50Rows'));
    const sg = APP.slice(APP.indexOf('const buildSage50Rows'), APP.indexOf('const doExportExcel'));
    for (const part of [ac, sg]) {
      expect(part).toContain('for(const cn of cnList)');
      expect(part).toContain('cn.numero');
    }
    expect(APP).toContain('!c.openingBalance');
  });

  it('FUP-004 PIN lock persists attempts and doubles the lockout', () => {
    const i = APP.indexOf('function PinLockScreen');
    const body = APP.slice(i, i + 4000);
    expect(body).toContain('failedAttempts');
    expect(body).toContain('lockLevel');
    expect(body).toContain('60*1000*Math.pow(2,');
  });

  it('FUP-005 quote acceptance checks the send result', () => {
    const i = APP.indexOf('const doSendAcceptance');
    const body = APP.slice(i, i + 6500);
    expect(body).toContain('!sent?.success');
    expect(body).not.toMatch(/pdfHtml:html,attachmentName/);
    expect(body).not.toContain('ci-joint');
    expect(body).not.toMatch(/<\/strong> attached\./);
  });

  it('new keys exist in both languages', () => {
    const split = TR.indexOf('export const EN = {');
    for (const k of ['facDepositRemoveFailed', 'hcExpNoData', 'hcGenCreated', 'hcRecTitle']) {
      expect(TR.slice(0, split)).toContain(`  ${k}:`);
      expect(TR.slice(split)).toContain(`  ${k}:`);
    }
  });
});
