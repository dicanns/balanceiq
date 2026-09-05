/**
 * ETRANSFER-PRE-001  an existing categorization wins over the direction default
 * ETRANSFER-PRE-002  the direction default only applies to an uncategorized row
 * ETRANSFER-PRE-003  the follow-up hint is shown only for AR/AP postings
 *
 * Regression guard for 2026-09: the Interac modal always applied a fixed
 * account chosen purely from the amount sign. A transfer already correctly
 * categorized to 6010 Wages was offered "Categorize to Accounts Payable (2010)",
 * so confirming it replaced a right answer with a wrong one. Not every outgoing
 * e-transfer is a supplier payment - payroll, owner draws and contractors are
 * all outgoing too.
 */
import { describe, it, expect } from 'vitest';

const etransferTarget = (tx) => (Number(tx?.amount) >= 0
  ? { num: '1100', fr: 'clients', en: 'receivable' }
  : { num: '2010', fr: 'fournisseurs', en: 'payable' });

const COA = [
  { id: 11, account_number: '1100', name_en: 'Accounts receivable' },
  { id: 20, account_number: '2010', name_en: 'Accounts payable' },
  { id: 60, account_number: '6010', name_en: 'Wages and benefits (administration)' },
  { id: 32, account_number: '3200', name_en: 'Owner drawings' },
];
const findCoa = (t) => COA.find(a => a.account_number === t.num);

// Mirrors the pre-selection effect in BanqueTab.
function preselect(tx) {
  if (!tx) return '';
  if (tx.coa_account_id) return String(tx.coa_account_id);
  const fallback = findCoa(etransferTarget(tx));
  return fallback?.id ? String(fallback.id) : '';
}

// Mirrors the conditional hint.
const showsHint = (coaId) => {
  const num = COA.find(a => String(a.id) === String(coaId))?.account_number;
  return num === '1100' || num === '2010';
};

describe('ETRANSFER-PRE-001 an existing category is respected', () => {
  it('the reported case: -$5,478.16 already on 6010 stays on 6010', () => {
    expect(preselect({ amount: -5478.16, coa_account_id: 60 })).toBe('60');
  });

  it('does not fall back to payable just because the amount is negative', () => {
    expect(preselect({ amount: -5478.16, coa_account_id: 60 })).not.toBe('20');
  });

  it('an owner draw keeps its equity account', () => {
    expect(preselect({ amount: -3000, coa_account_id: 32 })).toBe('32');
  });

  it('an incoming transfer already on a non-AR account keeps it', () => {
    expect(preselect({ amount: 2000, coa_account_id: 60 })).toBe('60');
  });
});

describe('ETRANSFER-PRE-002 direction default for uncategorized rows', () => {
  it('an uncategorized incoming transfer defaults to receivable', () => {
    expect(preselect({ amount: 2000 })).toBe('11');
  });

  it('an uncategorized outgoing transfer defaults to payable', () => {
    expect(preselect({ amount: -2299.5 })).toBe('20');
  });

  it('no transaction means no selection', () => {
    expect(preselect(null)).toBe('');
  });
});

describe('ETRANSFER-PRE-003 the follow-up hint is scoped', () => {
  it('shows for receivable and payable', () => {
    expect(showsHint(11)).toBe(true);
    expect(showsHint(20)).toBe(true);
  });

  it('is hidden for wages - there is no supplier bill to record against', () => {
    expect(showsHint(60)).toBe(false);
  });

  it('is hidden for owner drawings', () => {
    expect(showsHint(32)).toBe(false);
  });
});
