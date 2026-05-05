/**
 * COMPLIANCE-SHELL-001  Canada Compliance Workspace tab shell
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PLAN_FEATURES, canUse, setPlan, _resetSessionPrompts } = require('../../config/features.js');

describe('COMPLIANCE-SHELL-001 feature flag', () => {
  beforeEach(() => {
    setPlan('free');
    _resetSessionPrompts();
  });

  it('canadaCompliance is false for free plan', () => {
    setPlan('free');
    expect(canUse('canadaCompliance')).toBe(false);
  });

  it('canadaCompliance is true for pro plan', () => {
    setPlan('pro');
    expect(canUse('canadaCompliance')).toBe(true);
  });

  it('canadaCompliance is true for network plan', () => {
    setPlan('network');
    expect(canUse('canadaCompliance')).toBe(true);
  });

  it('canadaCompliance is true for franchise plan', () => {
    setPlan('franchise');
    expect(canUse('canadaCompliance')).toBe(true);
  });

  it('PLAN_FEATURES defines canadaCompliance on all 4 plans', () => {
    for (const plan of ['free', 'pro', 'network', 'franchise']) {
      expect(Object.prototype.hasOwnProperty.call(PLAN_FEATURES[plan], 'canadaCompliance')).toBe(true);
    }
  });
});

describe('COMPLIANCE-SHELL-001 sub-sections', () => {
  it('COMPLIANCE_SUBTABS has exactly 4 entries', async () => {
    const mod = await import('../../components/ComplianceTab.jsx');
    expect(mod.COMPLIANCE_SUBTABS).toHaveLength(4);
  });

  it('sub-tab ids are filings, periods, documents, accountant', async () => {
    const mod = await import('../../components/ComplianceTab.jsx');
    const ids = mod.COMPLIANCE_SUBTABS.map(s => s.id);
    expect(ids).toEqual(['filings', 'periods', 'documents', 'accountant']);
  });

  it('each sub-tab has id, labelFr, labelEn', async () => {
    const mod = await import('../../components/ComplianceTab.jsx');
    for (const s of mod.COMPLIANCE_SUBTABS) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.labelFr).toBe('string');
      expect(typeof s.labelEn).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.labelFr.length).toBeGreaterThan(0);
      expect(s.labelEn.length).toBeGreaterThan(0);
    }
  });
});
