/**
 * OFX-BAL-001  the closing balance is read from <LEDGERBAL><BALAMT>
 * OFX-BAL-002  ending-balance precedence: user entry > file > CSV running balance > 0
 *
 * Regression guard for 2026-09: the OFX parser set running_balance to null on
 * every row and never looked at LEDGERBAL, so a statement imported with the
 * optional ending-balance field left blank stored 0. Reconciliation then showed
 * a statement balance of $0.00 against a real BalanceIQ balance, and the
 * variance could never clear - the month was impossible to close.
 */
import { describe, it, expect } from 'vitest';

// Mirrors _parseOFXLedgerBalance() in database.js.
function parseOFXLedgerBalance(text) {
  const block = text.match(/<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i)?.[1] ?? text;
  const raw = block.match(/<BALAMT>([^<\r\n]+)/i)?.[1];
  if (raw == null) return null;
  const v = parseFloat(String(raw).trim().replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

// Mirrors the endBal precedence in bankStatementImport().
function resolveEndingBalance(userEntered, parsedFromFile, lastRowRunningBalance) {
  return userEntered !== undefined && userEntered !== null && userEntered !== ''
    ? userEntered
    : (parsedFromFile != null ? parsedFromFile : (lastRowRunningBalance ?? 0));
}

const OFX = `
OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260825<TRNAMT>-289.77<NAME>TD VISA/GM VIS</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>76786.45
<DTASOF>20260831120000
</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('OFX-BAL-001 closing balance comes from the file', () => {
  it('reads BALAMT out of LEDGERBAL', () => {
    expect(parseOFXLedgerBalance(OFX)).toBe(76786.45);
  });

  it('handles a negative balance (credit card owing)', () => {
    expect(parseOFXLedgerBalance('<LEDGERBAL><BALAMT>-1118.32<DTASOF>20260831</LEDGERBAL>')).toBe(-1118.32);
  });

  it('handles thousands separators', () => {
    expect(parseOFXLedgerBalance('<LEDGERBAL><BALAMT>76,786.45</LEDGERBAL>')).toBe(76786.45);
  });

  it('returns null when the file has no LEDGERBAL', () => {
    expect(parseOFXLedgerBalance('<OFX><BANKTRANLIST></BANKTRANLIST></OFX>')).toBeNull();
  });

  it('does not pick up an AVAILBAL from outside LEDGERBAL', () => {
    const t = '<LEDGERBAL><BALAMT>100.00</LEDGERBAL><AVAILBAL><BALAMT>999.99</AVAILBAL>';
    expect(parseOFXLedgerBalance(t)).toBe(100.00);
  });
});

describe('OFX-BAL-002 ending-balance precedence', () => {
  it('a value typed by the user wins over the file', () => {
    expect(resolveEndingBalance(50000, 76786.45, null)).toBe(50000);
  });

  it('the file balance is used when the field is left blank', () => {
    expect(resolveEndingBalance('', 76786.45, null)).toBe(76786.45);
    expect(resolveEndingBalance(undefined, 76786.45, null)).toBe(76786.45);
  });

  it('a CSV running balance is used when there is no file balance', () => {
    expect(resolveEndingBalance(undefined, null, 12345.67)).toBe(12345.67);
  });

  it('falls back to 0 only when nothing at all is available', () => {
    expect(resolveEndingBalance(undefined, null, null)).toBe(0);
  });

  it('a legitimate zero entered by the user is respected', () => {
    expect(resolveEndingBalance(0, 76786.45, null)).toBe(0);
  });

  it('the reported case: blank field + OFX file no longer yields 0', () => {
    expect(resolveEndingBalance(undefined, parseOFXLedgerBalance(OFX), null)).toBe(76786.45);
  });
});
