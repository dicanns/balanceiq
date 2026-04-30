/**
 * MODAL-001  canConfirmClose - blocker gating
 * MODAL-002  canConfirmClose - variance reason gating
 */
import { describe, it, expect } from 'vitest';
import { canConfirmClose } from '../../components/CloseReviewModal.jsx';

const noVariance = { idx: 0, register: 1, variance: 0, cents: 0, exceeds: false, reasonCode: null };
const varOver    = { idx: 0, register: 1, variance: 5, cents: 500, exceeds: true,  reasonCode: null };
const varOverReasoned = { ...varOver, reasonCode: 'counting_error' };
const varOver2   = { idx: 1, register: 2, variance: 3, cents: 300, exceeds: true,  reasonCode: null };

// ── MODAL-001: blocker gating ─────────────────────────────────────────────────

describe('MODAL-001 canConfirmClose - blocker gating', () => {
  it('returns true with no blockers, no variance issues', () => {
    expect(canConfirmClose({ blockers: [], variances: [noVariance], varianceRule: 'require_reason', localReasons: {} })).toBe(true);
  });

  it('returns false when at least one blocker is present', () => {
    const blockers = [{ rule: 'checklist', message_fr: '', message_en: '' }];
    expect(canConfirmClose({ blockers, variances: [], varianceRule: 'inform', localReasons: {} })).toBe(false);
  });

  it('returns false with multiple blockers', () => {
    const blockers = [
      { rule: 'checklist', message_fr: '', message_en: '' },
      { rule: 'store_variance', message_fr: '', message_en: '' },
    ];
    expect(canConfirmClose({ blockers, variances: [], varianceRule: 'inform', localReasons: {} })).toBe(false);
  });

  it('returns true when blockers list is empty even if warnings would exist', () => {
    expect(canConfirmClose({ blockers: [], variances: [noVariance], varianceRule: 'inform', localReasons: {} })).toBe(true);
  });
});

// ── MODAL-002: variance reason gating ────────────────────────────────────────

describe('MODAL-002 canConfirmClose - variance reason gating', () => {
  it('returns true with inform rule regardless of unresolved variance', () => {
    expect(canConfirmClose({ blockers: [], variances: [varOver], varianceRule: 'inform', localReasons: {} })).toBe(true);
  });

  it('returns false when register exceeds threshold and no reason, rule=require_reason', () => {
    expect(canConfirmClose({ blockers: [], variances: [varOver], varianceRule: 'require_reason', localReasons: {} })).toBe(false);
  });

  it('returns false when register exceeds threshold and no reason, rule=block', () => {
    expect(canConfirmClose({ blockers: [], variances: [varOver], varianceRule: 'block', localReasons: {} })).toBe(false);
  });

  it('returns true when reason captured in cash object (reasonCode set)', () => {
    expect(canConfirmClose({ blockers: [], variances: [varOverReasoned], varianceRule: 'require_reason', localReasons: {} })).toBe(true);
  });

  it('returns true when reason captured in localReasons (modal inline capture)', () => {
    const localReasons = { 0: { code: 'pos_mismatch', text: '' } };
    expect(canConfirmClose({ blockers: [], variances: [varOver], varianceRule: 'require_reason', localReasons })).toBe(true);
  });

  it('multiple registers - one missing reason blocks close', () => {
    const variances = [varOverReasoned, varOver2]; // reg 0 has reason, reg 1 does not
    expect(canConfirmClose({ blockers: [], variances, varianceRule: 'require_reason', localReasons: {} })).toBe(false);
  });

  it('multiple registers - all reasons captured via localReasons enables close', () => {
    const variances = [varOver, varOver2];
    const localReasons = {
      0: { code: 'counting_error', text: '' },
      1: { code: 'wrong_float', text: '' },
    };
    expect(canConfirmClose({ blockers: [], variances, varianceRule: 'require_reason', localReasons })).toBe(true);
  });

  it('registers within threshold do not require reasons', () => {
    const withinThreshold = { idx: 0, register: 1, variance: 0.5, cents: 50, exceeds: false, reasonCode: null };
    expect(canConfirmClose({ blockers: [], variances: [withinThreshold], varianceRule: 'block', localReasons: {} })).toBe(true);
  });

  it('blocker takes precedence over resolved variance', () => {
    const blockers = [{ rule: 'checklist', message_fr: '', message_en: '' }];
    const localReasons = { 0: { code: 'counting_error', text: '' } };
    expect(canConfirmClose({ blockers, variances: [varOver], varianceRule: 'require_reason', localReasons })).toBe(false);
  });
});
