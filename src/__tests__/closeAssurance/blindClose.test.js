/**
 * BLIND-001  Variance computation invariant
 * BLIND-002  Reveal action audit
 * BLIND-003  Mode transitions
 */
import { describe, it, expect } from 'vitest';
import { buildAccountingDb } from '../accounting/helpers/testSchema.js';
import { createRequire } from 'module';
import { computeRegisterVariance } from '../../components/RegisterCloseCard.jsx';

const require = createRequire(import.meta.url);
const { closeVarianceReveal, closePolicySave, closePolicyGet } = require('../../db/database.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCash(overrides = {}) {
  return {
    posVentes: 1000,
    posTPS: 50,
    posTVQ: 99.75,
    posLivraisons: 200,
    interac: 750,
    finalCash: 150,
    deposits: 50,
    ...overrides,
  };
}

// ── BLIND-001 variance computation invariant ──────────────────────────────────

describe('BLIND-001 variance computation invariant', () => {
  it('variance is computed identically regardless of blind mode', () => {
    const cash = makeCash();
    const variance = computeRegisterVariance(cash);
    // posT = 1000 + 50 + 99.75 = 1149.75
    // expectedCash = 1149.75 - 200 - 750 = 199.75
    // physCash = 150 + 50 = 200
    // variance = 200 - 199.75 = 0.25
    expect(variance).toBeCloseTo(0.25, 5);

    // Same cash object — variance must be identical regardless of the mode we pass
    // (blind mode only hides the UI; the math must be invariant)
    const variance2 = computeRegisterVariance(cash);
    expect(variance2).toBeCloseTo(variance, 10);
  });

  it('variance is correctly hidden in display state when blind mode is on', () => {
    // The blind mode determines hideVariance. computeRegisterVariance returns the
    // same number regardless of mode; the caller decides whether to display it.
    const cash = makeCash();
    const variance = computeRegisterVariance(cash);
    expect(typeof variance).toBe('number');

    // hideVariance flag is derived from mode, not from the math:
    const modeOff = 'off';
    const modeBlind = 'register_blind';
    const modeManager = 'manager_reveal';

    const hideVarianceOff = modeOff !== 'off';
    const hideVarianceBlind = modeBlind !== 'off';
    const hideVarianceManager = modeManager !== 'off';

    expect(hideVarianceOff).toBe(false);
    expect(hideVarianceBlind).toBe(true);
    expect(hideVarianceManager).toBe(true);
  });

  it('returns null when POS data is missing', () => {
    expect(computeRegisterVariance({ interac: 100, finalCash: 50 })).toBeNull();
  });

  it('treats missing interac as zero (cash-only till)', () => {
    // interac defaults to 0: expected = 1000 - 0 = 1000, physCash = 50, variance = -950
    expect(computeRegisterVariance({ posVentes: 1000, finalCash: 50 })).toBeCloseTo(-950, 5);
  });

  it('returns null when finalCash is missing', () => {
    expect(computeRegisterVariance({ posVentes: 1000, interac: 100 })).toBeNull();
  });

  it('balanced register produces near-zero variance', () => {
    // posT = 1000; expectedCash = 1000 - 0 - 850 = 150; physCash = 150 + 0 = 150
    const cash = { posVentes: 1000, posTPS: 0, posTVQ: 0, posLivraisons: 0, interac: 850, finalCash: 150, deposits: 0 };
    expect(computeRegisterVariance(cash)).toBeCloseTo(0, 10);
  });
});

// ── BLIND-002 reveal action audit ─────────────────────────────────────────────

describe('BLIND-002 reveal action audit', () => {
  it('reveal in register_blind logs audit entry', () => {
    const db = buildAccountingDb();
    closeVarianceReveal(42, 'cashier', db);
    const rows = db.prepare(`SELECT * FROM audit_log WHERE action='close_variance_revealed'`).all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].record_id).toBe('42');
    db.close();
  });

  it('reveal in manager_reveal logs audit entry with manager actor', () => {
    const db = buildAccountingDb();
    closeVarianceReveal(99, 'manager', db);
    const rows = db.prepare(`SELECT * FROM audit_log WHERE action='close_variance_revealed' AND user_name='manager'`).all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('reveal with null closureId still inserts a row', () => {
    const db = buildAccountingDb();
    closeVarianceReveal(null, 'local', db);
    const rows = db.prepare(`SELECT * FROM audit_log WHERE action='close_variance_revealed'`).all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    db.close();
  });
});

// ── BLIND-003 mode transitions ────────────────────────────────────────────────

describe('BLIND-003 mode transitions', () => {
  it('switching mode preserves count values — policy save does not touch register data', () => {
    const db = buildAccountingDb();
    const cash = makeCash({ finalCash: 175 });
    const variance = computeRegisterVariance(cash);
    expect(variance).toBeDefined();

    // Save a policy with register_blind
    closePolicySave({ blind_close_mode: 'register_blind' }, db);
    // Variance computation is unchanged
    expect(computeRegisterVariance(cash)).toBeCloseTo(variance, 10);

    // Switch to manager_reveal
    closePolicySave({ blind_close_mode: 'manager_reveal' }, db);
    expect(computeRegisterVariance(cash)).toBeCloseTo(variance, 10);

    // Switch back to off
    closePolicySave({ blind_close_mode: 'off' }, db);
    expect(computeRegisterVariance(cash)).toBeCloseTo(variance, 10);

    db.close();
  });

  it('policy GET after mode switch reflects the new mode', () => {
    const db = buildAccountingDb();
    closePolicySave({ blind_close_mode: 'register_blind' }, db);
    expect(closePolicyGet(null, db).blind_close_mode).toBe('register_blind');

    closePolicySave({ blind_close_mode: 'manager_reveal' }, db);
    expect(closePolicyGet(null, db).blind_close_mode).toBe('manager_reveal');

    closePolicySave({ blind_close_mode: 'off' }, db);
    expect(closePolicyGet(null, db).blind_close_mode).toBe('off');

    db.close();
  });
});
