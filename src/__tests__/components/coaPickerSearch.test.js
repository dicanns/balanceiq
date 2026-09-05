/**
 * COA-PICKER-001  matching works on account number and on both language names
 *
 * The GL account selects were plain <select> lists, so finding an account meant
 * scrolling ~60 options. The picker filters as you type; this pins the matching
 * rule so it keeps working in both languages.
 */
import { describe, it, expect } from 'vitest';

// Mirrors the filter inside CoaPicker.
function matchAccounts(accounts, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return accounts;
  return accounts.filter(a =>
    String(a.account_number).toLowerCase().includes(q)
    || (a.name_fr || '').toLowerCase().includes(q)
    || (a.name_en || '').toLowerCase().includes(q)
  );
}

const COA = [
  { id: 1, account_number: '1010', name_fr: 'Encaisse (banque opération)', name_en: 'Cash (operating bank account)' },
  { id: 2, account_number: '1100', name_fr: 'Comptes clients',             name_en: 'Accounts receivable' },
  { id: 3, account_number: '2010', name_fr: 'Comptes fournisseurs',        name_en: 'Accounts payable' },
  { id: 4, account_number: '6110', name_fr: 'Hydro-Québec',                name_en: 'Hydro-Quebec (electricity)' },
  { id: 5, account_number: '6410', name_fr: 'Frais de cartes de crédit',   name_en: 'Merchant credit card fees' },
  { id: 6, account_number: '3200', name_fr: 'Prélèvements du propriétaire', name_en: 'Owner drawings' },
];

describe('COA-PICKER-001 finding an account by typing', () => {
  it('matches on account number', () => {
    expect(matchAccounts(COA, '6110').map(a => a.id)).toEqual([4]);
  });

  it('matches on a partial account number, anywhere in the number', () => {
    // '10' is a substring of 1010, 1100, 2010, 6110 and 6410.
    expect(matchAccounts(COA, '10').map(a => a.account_number))
      .toEqual(['1010', '1100', '2010', '6110', '6410']);
  });

  it('narrows as you type more digits', () => {
    expect(matchAccounts(COA, '110').map(a => a.account_number)).toEqual(['1100', '6110']);
    expect(matchAccounts(COA, '1100').map(a => a.account_number)).toEqual(['1100']);
  });

  it('matches on the English name when the UI is English', () => {
    expect(matchAccounts(COA, 'electricity').map(a => a.id)).toEqual([4]);
  });

  it('matches on the French name too, whatever the UI language', () => {
    expect(matchAccounts(COA, 'hydro').map(a => a.id)).toEqual([4]);
  });

  it('is case-insensitive', () => {
    expect(matchAccounts(COA, 'ACCOUNTS').map(a => a.id)).toEqual([2, 3]);
  });

  it('finds owner drawings by either name', () => {
    expect(matchAccounts(COA, 'drawings').map(a => a.id)).toEqual([6]);
    expect(matchAccounts(COA, 'prélèvements').map(a => a.id)).toEqual([6]);
  });

  it('returns everything for an empty query', () => {
    expect(matchAccounts(COA, '')).toHaveLength(COA.length);
    expect(matchAccounts(COA, '   ')).toHaveLength(COA.length);
  });

  it('returns nothing for a query that matches no account', () => {
    expect(matchAccounts(COA, 'zzzz')).toEqual([]);
  });

  it('ignores surrounding whitespace', () => {
    expect(matchAccounts(COA, '  6410  ').map(a => a.id)).toEqual([5]);
  });
});
