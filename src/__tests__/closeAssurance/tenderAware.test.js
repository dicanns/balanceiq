/**
 * TENDER-001  simple mode preservation
 * TENDER-002  advanced mode math
 * TENDER-003  integer cents safety
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeRegisterVariance, computeAdvancedRegisterVariance } = require('../../services/registerVariance.js');

// Base cash object that satisfies all required fields (deposits=0 for clean comparison)
const baseCash = {
  posVentes: 1000,   // $1000 POS sales
  posTPS:    50,     // $50 TPS
  posTVQ:    99.75,  // $99.75 TVQ
  posLivraisons: 100, // $100 delivery (excluded from cash)
  interac:   600,    // $600 card payments
  finalCash: 449.75, // $449.75 physical cash
  deposits:  0,
};
// expectedCash simple = (1000 + 50 + 99.75 - 100) - 600 = 449.75
// physCash = 449.75 + 0 = 449.75
// variance_simple = 449.75 - 449.75 = 0.00

// ── TENDER-001: simple mode preservation ─────────────────────────────────────

describe('TENDER-001 simple mode preservation', () => {
  it('simple mode returns zero variance for balanced drawer', () => {
    expect(computeRegisterVariance(baseCash)).toBeCloseTo(0, 5);
  });

  it('simple mode returns correct shortage', () => {
    const cash = { ...baseCash, finalCash: 400 };
    // physCash = 400, expectedCash = 449.75, variance = -49.75
    expect(computeRegisterVariance(cash)).toBeCloseTo(-49.75, 5);
  });

  it('simple mode returns correct surplus', () => {
    const cash = { ...baseCash, finalCash: 500 };
    // variance = 500 - 449.75 = 50.25
    expect(computeRegisterVariance(cash)).toBeCloseTo(50.25, 5);
  });

  it('simple mode returns null when posVentes missing', () => {
    const { posVentes: _, ...incomplete } = baseCash;
    expect(computeRegisterVariance(incomplete)).toBeNull();
  });

  it('simple mode returns null when interac missing', () => {
    const { interac: _, ...incomplete } = baseCash;
    expect(computeRegisterVariance(incomplete)).toBeNull();
  });

  it('simple mode returns null when finalCash missing', () => {
    const { finalCash: _, ...incomplete } = baseCash;
    expect(computeRegisterVariance(incomplete)).toBeNull();
  });

  it('advanced mode with all zero advanced fields equals simple mode (deposits=0)', () => {
    const simple = computeRegisterVariance(baseCash);
    const advanced = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    expect(advanced).toBeCloseTo(simple, 5);
  });
});

// ── TENDER-002: advanced mode math ───────────────────────────────────────────

describe('TENDER-002 advanced mode math', () => {
  it('expected_cash_in_drawer formula computes correctly with all fields populated', () => {
    // Setup: balanced base (variance=0 in simple) then add advanced fields
    // openingFloat=20, paidIns=50, paidOuts=30, safeDrops=40, cashTips=10, tillIn=15, tillOut=5
    // expected = 449.75 + 20 + 50 - 30 - 40 - 10 - 5 + 15 = 449.75 (still balanced)
    const adv = {
      paid_ins_cents:           5000,  // $50
      paid_outs_cents:          3000,  // $30
      cash_tips_paid_cents:     1000,  // $10
      till_transfers_in_cents:  1500,  // $15
      till_transfers_out_cents:  500,  // $5
    };
    const result = computeAdvancedRegisterVariance(baseCash, adv, 4000, 2000);
    // expected_sales_cents = (1000+50+99.75-100-600)*100 = 44975
    // expected_drawer = 2000 + 44975 + 5000 - 3000 - 4000 - 1000 - 500 + 1500 = 44975
    // physCash = 449.75*100 = 44975
    // variance = 0
    expect(result).toBeCloseTo(0, 5);
  });

  it('paid_ins increases expected cash in drawer', () => {
    const baseline = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withPaidIns = computeAdvancedRegisterVariance(baseCash, { paid_ins_cents: 1000 }, 0, 0);
    // expected went up by $10, physCash unchanged -> variance drops by $10
    expect(withPaidIns).toBeCloseTo(baseline - 10, 5);
  });

  it('paid_outs decreases expected cash in drawer', () => {
    const baseline = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withPaidOuts = computeAdvancedRegisterVariance(baseCash, { paid_outs_cents: 500 }, 0, 0);
    // expected went down by $5, physCash unchanged -> variance rises by $5
    expect(withPaidOuts).toBeCloseTo(baseline + 5, 5);
  });

  it('safe_drops decrease expected cash in drawer', () => {
    const baseline = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withDrops = computeAdvancedRegisterVariance(baseCash, {}, 2000, 0);
    // expected went down by $20, physCash unchanged -> variance rises by $20
    expect(withDrops).toBeCloseTo(baseline + 20, 5);
  });

  it('cash_tips_paid decrease expected cash in drawer', () => {
    const baseline = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withTips = computeAdvancedRegisterVariance(baseCash, { cash_tips_paid_cents: 750 }, 0, 0);
    // expected went down by $7.50 -> variance rises by $7.50
    expect(withTips).toBeCloseTo(baseline + 7.5, 5);
  });

  it('till_transfers_in increase expected cash in drawer', () => {
    const baseline = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withIn = computeAdvancedRegisterVariance(baseCash, { till_transfers_in_cents: 3000 }, 0, 0);
    // expected went up by $30 -> variance drops by $30
    expect(withIn).toBeCloseTo(baseline - 30, 5);
  });

  it('till_transfers_out decrease expected cash in drawer', () => {
    const baseline = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withOut = computeAdvancedRegisterVariance(baseCash, { till_transfers_out_cents: 2000 }, 0, 0);
    // expected went down by $20 -> variance rises by $20
    expect(withOut).toBeCloseTo(baseline + 20, 5);
  });

  it('all zero advanced fields equals simple mode result (deposits=0)', () => {
    const simple = computeRegisterVariance(baseCash);
    const adv = computeAdvancedRegisterVariance(baseCash, {
      paid_ins_cents: 0, paid_outs_cents: 0, cash_tips_paid_cents: 0,
      till_transfers_in_cents: 0, till_transfers_out_cents: 0,
      gift_card_redemptions_cents: 0, house_account_sales_cents: 0,
    }, 0, 0);
    expect(adv).toBeCloseTo(simple, 5);
  });

  it('opening float shifts expected without affecting physCash', () => {
    const noFloat  = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withFloat = computeAdvancedRegisterVariance(baseCash, {}, 0, 5000); // $50 opening float
    // expected went up by $50 -> variance drops by $50
    expect(withFloat).toBeCloseTo(noFloat - 50, 5);
  });

  it('gift_card_redemptions_cents and house_account_sales_cents do NOT affect variance', () => {
    const baseline = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const withInfo = computeAdvancedRegisterVariance(baseCash, {
      gift_card_redemptions_cents: 5000,
      house_account_sales_cents:  3000,
    }, 0, 0);
    expect(withInfo).toBeCloseTo(baseline, 5);
  });
});

// ── TENDER-003: integer cents safety ─────────────────────────────────────────

describe('TENDER-003 integer cents safety', () => {
  it('all advanced math is in integer cents - no float drift on $0.01 variance', () => {
    // POS: $1.00, interac: $0.00, finalCash: $1.01 -> expected = $1.00, variance = +$0.01
    const cash = { posVentes: 1, posTPS: 0, posTVQ: 0, posLivraisons: 0, interac: 0, finalCash: 1.01, deposits: 0 };
    const result = computeAdvancedRegisterVariance(cash, {}, 0, 0);
    expect(result).toBeCloseTo(0.01, 5);
  });

  it('large amounts ($100k+) compute exactly with advanced fields', () => {
    const bigCash = {
      posVentes: 100000,
      posTPS: 5000,
      posTVQ: 9975,
      posLivraisons: 5000,
      interac: 75000,
      finalCash: 35975 - 500, // balanced minus $500 to create a known variance
      deposits: 0,
    };
    const adv = { paid_ins_cents: 50000 }; // $500 paid-in exactly covers the shortage
    const result = computeAdvancedRegisterVariance(bigCash, adv, 0, 0);
    expect(result).toBeCloseTo(0, 5);
  });

  it('advanced returns null when base inputs are missing', () => {
    const { posVentes: _, ...incomplete } = baseCash;
    expect(computeAdvancedRegisterVariance(incomplete, {}, 0, 0)).toBeNull();
  });

  it('advanced cents fields default to 0 when not provided', () => {
    const result1 = computeAdvancedRegisterVariance(baseCash, {}, 0, 0);
    const result2 = computeAdvancedRegisterVariance(baseCash, undefined, 0, 0);
    expect(result1).toBeCloseTo(result2, 5);
  });
});
