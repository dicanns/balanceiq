/**
 * Feature Flag Enforcement Tests
 * Verifies canUse() correctly gates every paid feature per plan.
 * Uses setPlan() to switch plans at runtime — tests the full matrix.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setPlan, getActivePlan, canUse, shouldShowUpgradePrompt,
  _resetSessionPrompts, PLAN_FEATURES,
} from '../config/features.js';

// Always restore 'free' after each test
afterEach(() => {
  setPlan('free');
  _resetSessionPrompts();
});

// ────────────────────────────────────────────────────────────────────────────
describe('Plan switching', () => {
  it('starts on free plan', () => {
    expect(getActivePlan()).toBe('free');
  });

  it('switches to pro', () => {
    setPlan('pro');
    expect(getActivePlan()).toBe('pro');
  });

  it('switches to franchise', () => {
    setPlan('franchise');
    expect(getActivePlan()).toBe('franchise');
  });

  it('switches to network', () => {
    setPlan('network');
    expect(getActivePlan()).toBe('network');
  });

  it('ignores unknown plan names', () => {
    setPlan('enterprise');
    expect(getActivePlan()).toBe('free'); // unchanged
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Free plan — core features always on', () => {
  const FREE_FEATURES = [
    'clientDatabase', 'categoriesProducts', 'invoiceFlow', 'creditNotes',
    'singlePaymentRecord', 'basicAging', 'pdfPrint', 'mailtoEmail',
    'singleCsvExport', 'previsionsModule',
  ];
  FREE_FEATURES.forEach((f) => {
    it(`canUse('${f}') → true on free`, () => {
      expect(canUse(f)).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Free plan — paid features locked', () => {
  const PRO_FEATURES = [
    'bulkEncaissement', 'autoApplyPayments', 'detailedAging', 'bulkEmailStatements',
    'recurringInvoices', 'directEmailSend', 'excelExport', 'depositTracking',
    'customTemplates', 'cloudBackup', 'posIntegration', 'ocrScanning', 'aiAnalysis',
    'yearEndPackage',
  ];
  PRO_FEATURES.forEach((f) => {
    it(`canUse('${f}') → false on free`, () => {
      expect(canUse(f)).toBe(false);
    });
  });

  const FRANCHISE_FEATURES = [
    'franchiseDocs', 'royaltyAutoCalc', 'autoGenerateRoyaltyInvoices',
    'multiLocationReconciliation', 'franchiseeScorecards', 'consolidatedAging', 'whiteLabel',
  ];
  FRANCHISE_FEATURES.forEach((f) => {
    it(`canUse('${f}') → false on free`, () => {
      expect(canUse(f)).toBe(false);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Pro plan — all Pro features unlocked', () => {
  beforeEach(() => setPlan('pro'));

  const PRO_FEATURES = [
    'bulkEncaissement', 'autoApplyPayments', 'detailedAging', 'bulkEmailStatements',
    'recurringInvoices', 'directEmailSend', 'excelExport', 'depositTracking',
    'customTemplates', 'cloudBackup', 'posIntegration', 'ocrScanning', 'aiAnalysis',
    'yearEndPackage',
  ];
  PRO_FEATURES.forEach((f) => {
    it(`canUse('${f}') → true on pro`, () => {
      expect(canUse(f)).toBe(true);
    });
  });

  it('franchise-only features still locked on pro', () => {
    expect(canUse('royaltyAutoCalc')).toBe(false);
    expect(canUse('autoGenerateRoyaltyInvoices')).toBe(false);
    expect(canUse('whiteLabel')).toBe(false);
    expect(canUse('franchiseDocs')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Franchise plan — all features unlocked', () => {
  beforeEach(() => setPlan('franchise'));

  const ALL_FEATURES = Object.keys(PLAN_FEATURES.franchise);
  ALL_FEATURES.forEach((f) => {
    it(`canUse('${f}') → true on franchise`, () => {
      expect(canUse(f)).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Network plan — Pro features + cloud sync, no franchise features', () => {
  beforeEach(() => setPlan('network'));

  it('cloud backup enabled', () => {
    expect(canUse('cloudBackup')).toBe(true);
  });

  it('POS integration enabled', () => {
    expect(canUse('posIntegration')).toBe(true);
  });

  it('franchise-only features locked on network', () => {
    expect(canUse('royaltyAutoCalc')).toBe(false);
    expect(canUse('whiteLabel')).toBe(false);
    expect(canUse('autoGenerateRoyaltyInvoices')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Unknown feature name', () => {
  it('returns false for unknown feature on any plan', () => {
    ['free', 'pro', 'network', 'franchise'].forEach((plan) => {
      setPlan(plan);
      expect(canUse('nonexistentFeature')).toBe(false);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('Upgrade prompt logic', () => {
  it('shows prompt first time feature is locked', () => {
    expect(canUse('aiAnalysis')).toBe(false);
    expect(shouldShowUpgradePrompt('aiAnalysis')).toBe(true);
  });

  it('does NOT show prompt again for same feature same session', () => {
    shouldShowUpgradePrompt('aiAnalysis'); // first call
    expect(shouldShowUpgradePrompt('aiAnalysis')).toBe(false); // second call
  });

  it('resets after _resetSessionPrompts', () => {
    shouldShowUpgradePrompt('aiAnalysis');
    _resetSessionPrompts();
    expect(shouldShowUpgradePrompt('aiAnalysis')).toBe(true); // shows again
  });

  it('does NOT show prompt for features the plan can use', () => {
    expect(canUse('invoiceFlow')).toBe(true);
    expect(shouldShowUpgradePrompt('invoiceFlow')).toBe(false);
  });

  it('does NOT show prompt on franchise plan for franchise features', () => {
    setPlan('franchise');
    expect(shouldShowUpgradePrompt('royaltyAutoCalc')).toBe(false);
    expect(shouldShowUpgradePrompt('whiteLabel')).toBe(false);
  });

  it('shows prompt for franchise features on pro plan', () => {
    setPlan('pro');
    expect(shouldShowUpgradePrompt('royaltyAutoCalc')).toBe(true);
  });
});
