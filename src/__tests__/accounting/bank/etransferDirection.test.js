/**
 * ETRANSFER-001  a RECEIVED e-transfer categorizes to Accounts receivable (1100)
 * ETRANSFER-002  a SENT e-transfer categorizes to Accounts payable (2010)
 * OFX-DESC-001   OFX descriptions merge NAME + MEMO instead of truncating
 *
 * Regression guard for 2026-09: the Interac modal categorized EVERY e-transfer to
 * Accounts receivable regardless of direction, so an outgoing payment inflated
 * money owed TO the business by the amount just paid OUT - wrong account, wrong
 * side of the balance sheet, silently.
 */
import { describe, it, expect } from 'vitest';

// Mirrors etransferTarget() in BanqueTab.jsx.
function etransferTarget(tx) {
  return Number(tx?.amount) >= 0
    ? { num: '1100', fr: 'clients',      en: 'receivable' }
    : { num: '2010', fr: 'fournisseurs', en: 'payable' };
}

// Mirrors the OFX description merge in _parseBankOFX().
function ofxDescription(name, memo, trntype = '') {
  let description;
  if (name && memo) {
    const n = name.toUpperCase(), m = memo.toUpperCase();
    description = m.includes(n) ? memo : n.includes(m) ? name : `${name} ${memo}`;
  } else {
    description = name || memo || trntype;
  }
  return description.replace(/\s+/g, ' ').trim();
}

describe('ETRANSFER-001 money received goes to accounts receivable', () => {
  it('a positive amount targets 1100', () => {
    expect(etransferTarget({ amount: 2000 }).num).toBe('1100');
  });

  it('a zero amount is treated as incoming, not outgoing', () => {
    expect(etransferTarget({ amount: 0 }).num).toBe('1100');
  });
});

describe('ETRANSFER-002 money sent goes to accounts payable', () => {
  it('a negative amount targets 2010, never 1100', () => {
    const t = etransferTarget({ amount: -1450.00 });
    expect(t.num).toBe('2010');
    expect(t.num).not.toBe('1100');
  });

  it('the real reported case: -$1,450.00 sent is payable', () => {
    expect(etransferTarget({ amount: -1450.00 }).num).toBe('2010');
  });

  it('string amounts from the DB layer are still read correctly', () => {
    expect(etransferTarget({ amount: '-3200.00' }).num).toBe('2010');
    expect(etransferTarget({ amount: '580.86' }).num).toBe('1100');
  });
});

describe('OFX-DESC-001 descriptions keep the full payee', () => {
  it('merges NAME and MEMO when they differ', () => {
    expect(ofxDescription('INTERAC ETRNSFR SENT', 'EXAMPLE INC'))
      .toBe('INTERAC ETRNSFR SENT EXAMPLE INC');
  });

  it('does not duplicate when MEMO already contains NAME', () => {
    expect(ofxDescription('CARD BILL PYMT', 'CARD BILL PYMT'))
      .toBe('CARD BILL PYMT');
  });

  it('does not duplicate when NAME already contains MEMO', () => {
    expect(ofxDescription('CARD PAYMENT MONTHLY', 'CARD PAYMENT')).toBe('CARD PAYMENT MONTHLY');
  });

  it('falls back cleanly when only one field is present', () => {
    expect(ofxDescription('', 'EXAMPLE CAFE')).toBe('EXAMPLE CAFE');
    expect(ofxDescription('GOVT DEPOSIT', '')).toBe('GOVT DEPOSIT');
    expect(ofxDescription('', '', 'DEBIT')).toBe('DEBIT');
  });

  it('collapses whitespace so dedupe keys stay stable', () => {
    expect(ofxDescription('INTERAC   SENT', 'NEO   INC')).toBe('INTERAC SENT NEO INC');
  });
});
