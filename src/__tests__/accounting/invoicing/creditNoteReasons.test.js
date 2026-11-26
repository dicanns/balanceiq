/**
 * CNREASON-001  a remittance deduction is recognised in either language
 * CNREASON-002  other reasons, and reasons the operator typed, are not deductions
 * CNREASON-003  a reason reads in the language asked for, whichever one saved it
 * CNREASON-004  the screen posts through the helper, never by comparing the text
 * CNREASON-005  a deduction saved from the English screen reaches account 4100
 *
 * The reason field offers the labels of the screen's language and the credit
 * note keeps what was picked. Comparing that text to the French wording meant a
 * chain deduction saved in English was booked to Sales instead of Sales returns
 * and allowances.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  REMITTANCE_DEDUCTION_REASON, OTHER_REASON, CREDIT_NOTE_REASONS, CREDIT_NOTE_REASON_EN,
  canonicalCreditNoteReason, creditNoteReasonLabel, isRemittanceDeductionReason,
} from '../../../utils/creditNoteReasons.mjs';
import { planRevenue, SALES_RETURNS_ACCOUNT } from '../../../utils/revenueSplit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(path.join(here, '../../../App.jsx'), 'utf8');

describe('CNREASON-001 remittance deduction in either language', () => {
  it('recognises the French and the English wording', () => {
    expect(isRemittanceDeductionReason(REMITTANCE_DEDUCTION_REASON)).toBe(true);
    expect(isRemittanceDeductionReason(CREDIT_NOTE_REASON_EN[REMITTANCE_DEDUCTION_REASON])).toBe(true);
  });
  it('ignores case and spaces around the text', () => {
    expect(isRemittanceDeductionReason('  remittance deduction (CHAIN) ')).toBe(true);
    expect(isRemittanceDeductionReason(' déduction sur remise (chaîne)')).toBe(true);
  });
});

describe('CNREASON-002 everything else is not a deduction', () => {
  it('other built-in reasons, in both languages', () => {
    for (const fr of CREDIT_NOTE_REASONS.filter(r => r !== REMITTANCE_DEDUCTION_REASON)) {
      expect(isRemittanceDeductionReason(fr)).toBe(false);
      expect(isRemittanceDeductionReason(CREDIT_NOTE_REASON_EN[fr])).toBe(false);
    }
  });
  it('typed reasons and empty values', () => {
    for (const v of ['Metro access', 'remittance', '', null, undefined]) expect(isRemittanceDeductionReason(v)).toBe(false);
  });
});

describe('CNREASON-003 labels', () => {
  it('every built-in reason has an English label', () => {
    for (const fr of CREDIT_NOTE_REASONS) expect(CREDIT_NOTE_REASON_EN[fr]).toBeTruthy();
  });
  it('reads in the language asked for, whichever language saved it', () => {
    expect(creditNoteReasonLabel('Price adjustment', false)).toBe('Ajustement de prix');
    expect(creditNoteReasonLabel('Ajustement de prix', true)).toBe('Price adjustment');
    expect(creditNoteReasonLabel('Other', false)).toBe(OTHER_REASON);
  });
  it('leaves a typed reason as it is', () => {
    expect(canonicalCreditNoteReason('Metro access')).toBe('Metro access');
    expect(creditNoteReasonLabel('Metro access', true)).toBe('Metro access');
  });
});

describe('CNREASON-004 the screen uses the helper', () => {
  it('posts a credit note with the deduction flag from the helper', () => {
    expect(appSource.match(/deduction:isRemittanceDeductionReason\(form\.raison\)/g)).toHaveLength(2);
    expect(appSource).not.toMatch(/raison===REMITTANCE_DEDUCTION_REASON/);
    expect(appSource).not.toMatch(/raison==="Autre"/);
  });
});

describe('CNREASON-005 the ledger account', () => {
  const accounts = [
    { id: 1, account_number: '4000', type: 'revenue' },
    { id: 4, account_number: SALES_RETURNS_ACCOUNT, type: 'revenue' },
  ];
  const lignes = [{ id: 'a', produitId: '', description: 'Unsaleables', quantite: 1, prixUnitaire: 50, remise: 0 }];
  it('books a deduction saved in English to Sales returns and allowances', () => {
    const doc = { lignes, deduction: isRemittanceDeductionReason('Remittance deduction (chain)') };
    expect(planRevenue(doc, 5000, { accounts })).toEqual([{ account_id: 4, cents: 5000 }]);
  });
  it('keeps any other credit in the sales account', () => {
    const doc = { lignes, deduction: isRemittanceDeductionReason('Price adjustment') };
    expect(planRevenue(doc, 5000, { accounts })).toEqual([{ account_id: 1, cents: 5000 }]);
  });
});
