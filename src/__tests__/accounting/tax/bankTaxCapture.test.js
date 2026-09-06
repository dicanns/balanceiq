/**
 * TAXCAP-001  captured tax splits out of the expense into the ITC/ITR accounts
 * TAXCAP-002  the entry still balances to the amount that left the bank
 * TAXCAP-003  guards against nonsense tax values
 *
 * Bridge phase 4. Input tax credits previously came only from hand-entered
 * monthly P&L bills, so an expense paid from the bank and categorized in the
 * Banque tab reached the ledger but claimed no GST/QST. Capturing the tax on
 * the bank line records the expense net and makes the tax claimable.
 */
import { describe, it, expect } from 'vitest';

const TPS_RATE = 0.05, TVQ_RATE = 0.09975;

// Mirrors the split in _postBankTransactionEntry().
function splitTax({ amount, tpsPaid = 0, tvqPaid = 0, hasGstAcc = true, hasQstAcc = true }) {
  const cents = Math.round(Math.abs(amount) * 100);
  let tps = hasGstAcc ? Math.round(tpsPaid * 100) : 0;
  let tvq = hasQstAcc ? Math.round(tvqPaid * 100) : 0;
  if (tps + tvq >= cents) { tps = 0; tvq = 0; }
  return { cents, tps, tvq, net: cents - tps - tvq };
}

// Mirrors the Calculate button: back the tax out of a tax-included total.
function autoFill(gross) {
  const net = Math.abs(gross) / (1 + TPS_RATE + TVQ_RATE);
  return { tps: +(net * TPS_RATE).toFixed(2), tvq: +(net * TVQ_RATE).toFixed(2) };
}

describe('TAXCAP-001 tax splits out of the expense', () => {
  it('a $1,149.75 bill records $1,000 expense and $149.75 of credits', () => {
    const r = splitTax({ amount: -1149.75, tpsPaid: 50, tvqPaid: 99.75 });
    expect(r.net).toBe(100000);
    expect(r.tps).toBe(5000);
    expect(r.tvq).toBe(9975);
  });

  it('no tax captured leaves the whole amount as expense', () => {
    const r = splitTax({ amount: -2500 });
    expect(r.net).toBe(250000);
    expect(r.tps).toBe(0);
    expect(r.tvq).toBe(0);
  });

  it('GST only is supported (out-of-province supplier)', () => {
    const r = splitTax({ amount: -1050, tpsPaid: 50 });
    expect(r.net).toBe(100000);
    expect(r.tps).toBe(5000);
    expect(r.tvq).toBe(0);
  });

  it('tax is ignored when the credit accounts are missing', () => {
    const r = splitTax({ amount: -1149.75, tpsPaid: 50, tvqPaid: 99.75, hasGstAcc: false, hasQstAcc: false });
    expect(r.net).toBe(114975);
    expect(r.tps).toBe(0);
  });
});

describe('TAXCAP-002 the entry balances', () => {
  it('net plus tax always equals what left the bank', () => {
    for (const [amt, tps, tvq] of [[-1149.75, 50, 99.75], [-575, 25, 49.88], [-99.99, 4.35, 8.67]]) {
      const r = splitTax({ amount: amt, tpsPaid: tps, tvqPaid: tvq });
      expect(r.net + r.tps + r.tvq).toBe(r.cents);
    }
  });

  it('an inflow splits the same way', () => {
    const r = splitTax({ amount: 1149.75, tpsPaid: 50, tvqPaid: 99.75 });
    expect(r.net + r.tps + r.tvq).toBe(r.cents);
  });
});

describe('TAXCAP-003 nonsense values cannot corrupt the entry', () => {
  it('tax equal to the whole amount is rejected', () => {
    const r = splitTax({ amount: -100, tpsPaid: 100 });
    expect(r.tps).toBe(0);
    expect(r.net).toBe(10000);
  });

  it('tax exceeding the amount is rejected rather than making the expense negative', () => {
    const r = splitTax({ amount: -100, tpsPaid: 90, tvqPaid: 90 });
    expect(r.net).toBe(10000);
    expect(r.net).toBeGreaterThan(0);
  });
});

describe('TAXCAP-004 the Calculate helper', () => {
  it('backs Quebec tax out of a tax-included total', () => {
    expect(autoFill(1149.75)).toEqual({ tps: 50, tvq: 99.75 });
  });

  it('round-trips: net + computed tax returns the original', () => {
    const { tps, tvq } = autoFill(1149.75);
    expect(+(1149.75 - tps - tvq).toFixed(2)).toBe(1000);
  });

  it('works on a negative (outgoing) amount', () => {
    expect(autoFill(-1149.75)).toEqual({ tps: 50, tvq: 99.75 });
  });
});
