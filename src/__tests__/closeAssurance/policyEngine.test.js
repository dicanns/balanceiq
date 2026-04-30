/**
 * POLICY-001  Per-register variance threshold
 * POLICY-002  Store-wide variance blocker
 * POLICY-003  Exception rule modes (inform / require_reason / block)
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { evaluateCloseAssurance } = require('../../db/database.js');

const DEFAULTS = {
  blind_close_mode: 'off',
  variance_per_register_cents: 100,
  variance_store_cents: 200,
  missing_required_checklist_rule: 'inform',
  missing_pos_evidence_rule: 'inform',
  missing_delivery_reconciliation_rule: 'inform',
  manager_signoff_required: 0,
  approver_identity_method: 'typed_name',
  denomination_mode: 'total_only',
  shift_mode_enabled: 0,
  shift_signoff_required: 0,
};

// ── POLICY-001 per-register variance threshold ────────────────────────────────

describe('POLICY-001 per-register variance threshold', () => {
  it('no exceptions when variance is within threshold', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 50 }],
      policy: DEFAULTS,
    });
    expect(result.warnings).toHaveLength(0);
    expect(result.blockers).toHaveLength(0);
  });

  it('warning when single register exceeds per-register threshold', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 150 }],
      policy: { ...DEFAULTS, variance_per_register_cents: 100 },
    });
    expect(result.warnings.some(w => w.code === 'VAR_REGISTER_EXCEEDED')).toBe(true);
  });

  it('negative variance (short) also triggers warning when absolute value exceeds threshold', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: -200 }],
      policy: { ...DEFAULTS, variance_per_register_cents: 100 },
    });
    expect(result.warnings.some(w => w.code === 'VAR_REGISTER_EXCEEDED')).toBe(true);
  });

  it('multiple registers each within threshold produce no register warnings', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 80 }, { variance_cents: -90 }],
      policy: DEFAULTS,
    });
    expect(result.warnings.filter(w => w.code === 'VAR_REGISTER_EXCEEDED')).toHaveLength(0);
  });

  it('warning payload includes variance and threshold values', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 300 }],
      policy: { ...DEFAULTS, variance_per_register_cents: 100 },
    });
    const w = result.warnings.find(w => w.code === 'VAR_REGISTER_EXCEEDED');
    expect(w.payload.variance_cents).toBe(300);
    expect(w.payload.threshold_cents).toBe(100);
  });
});

// ── POLICY-002 store-wide variance blocker ────────────────────────────────────

describe('POLICY-002 store-wide variance blocker', () => {
  it('no blocker when store total is within threshold', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 80 }, { variance_cents: 70 }],
      policy: { ...DEFAULTS, variance_store_cents: 200 },
    });
    expect(result.blockers.filter(b => b.code === 'VAR_STORE_EXCEEDED')).toHaveLength(0);
  });

  it('blocker when store total exceeds threshold', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 150 }, { variance_cents: 100 }],
      policy: { ...DEFAULTS, variance_store_cents: 200 },
    });
    expect(result.blockers.some(b => b.code === 'VAR_STORE_EXCEEDED')).toBe(true);
  });

  it('store total uses signed sum (offsetting registers may not trigger blocker)', () => {
    // +150 and -100 = net +50, well under 200 threshold
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 150 }, { variance_cents: -100 }],
      policy: { ...DEFAULTS, variance_store_cents: 200 },
    });
    expect(result.blockers.filter(b => b.code === 'VAR_STORE_EXCEEDED')).toHaveLength(0);
  });

  it('blocker payload includes store_variance_cents and threshold_cents', () => {
    const result = evaluateCloseAssurance({
      closures: [{ variance_cents: 250 }],
      policy: { ...DEFAULTS, variance_store_cents: 200 },
    });
    const b = result.blockers.find(b => b.code === 'VAR_STORE_EXCEEDED');
    expect(b.payload.store_variance_cents).toBe(250);
    expect(b.payload.threshold_cents).toBe(200);
  });

  it('no blocker when there are no closures', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, variance_store_cents: 0 },
    });
    expect(result.blockers.filter(b => b.code === 'VAR_STORE_EXCEEDED')).toHaveLength(0);
  });
});

// ── POLICY-003 exception rule modes ──────────────────────────────────────────

describe('POLICY-003 exception rule modes', () => {
  const missingChecklist = [{ required: true, completed: false }];

  it('inform mode: missing required checklist item goes to info (not warning/blocker)', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, missing_required_checklist_rule: 'inform' },
      checklistItems: missingChecklist,
    });
    expect(result.info.some(i => i.code === 'CHECKLIST_MISSING')).toBe(true);
    expect(result.warnings.some(w => w.code === 'CHECKLIST_MISSING')).toBe(false);
    expect(result.blockers.some(b => b.code === 'CHECKLIST_MISSING')).toBe(false);
  });

  it('require_reason mode: missing checklist item goes to warnings', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, missing_required_checklist_rule: 'require_reason' },
      checklistItems: missingChecklist,
    });
    expect(result.warnings.some(w => w.code === 'CHECKLIST_MISSING')).toBe(true);
    expect(result.blockers.some(b => b.code === 'CHECKLIST_MISSING')).toBe(false);
  });

  it('block mode: missing checklist item goes to blockers', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, missing_required_checklist_rule: 'block' },
      checklistItems: missingChecklist,
    });
    expect(result.blockers.some(b => b.code === 'CHECKLIST_MISSING')).toBe(true);
  });

  it('inform mode: missing POS data goes to info', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, missing_pos_evidence_rule: 'inform' },
      posDataPresent: false,
    });
    expect(result.info.some(i => i.code === 'POS_MISSING')).toBe(true);
  });

  it('block mode: missing POS data goes to blockers', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, missing_pos_evidence_rule: 'block' },
      posDataPresent: false,
    });
    expect(result.blockers.some(b => b.code === 'POS_MISSING')).toBe(true);
  });

  it('completed checklist items do not trigger any exception', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, missing_required_checklist_rule: 'block' },
      checklistItems: [{ required: true, completed: true }],
    });
    expect(result.blockers.filter(b => b.code === 'CHECKLIST_MISSING')).toHaveLength(0);
  });

  it('no exception when POS data is present', () => {
    const result = evaluateCloseAssurance({
      closures: [],
      policy: { ...DEFAULTS, missing_pos_evidence_rule: 'block' },
      posDataPresent: true,
    });
    expect(result.blockers.filter(b => b.code === 'POS_MISSING')).toHaveLength(0);
  });
});
