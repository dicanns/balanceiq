/**
 * POS-SCAN-001  missing orgId returns 400 (not silently skipping plan gate)
 * POS-SCAN-002  free-plan org is blocked regardless of orgId presence
 * POS-SCAN-003  plan gate always runs — cannot be bypassed by omitting orgId
 */
import { describe, it, expect } from 'vitest';

// Simulates the fixed pos-scan guard logic.

function simulatePosScanGuard({ image, imageType, orgId, serverOrgId, plan }) {
  // 1. Required fields
  if (!image || !imageType || !orgId) {
    return { status: 400, error: 'missing_params' };
  }

  // 2. Auth (always checked — simulated as present)

  // 3. Org ownership check (always runs — not conditional on orgId truthy)
  if (!serverOrgId || serverOrgId !== orgId) {
    return { status: 403, error: 'Forbidden' };
  }

  // 4. Plan check (always runs — not conditional on orgId truthy)
  const resolvedPlan = plan || 'free';
  if (resolvedPlan !== 'pro' && resolvedPlan !== 'franchise' && resolvedPlan !== 'network') {
    return { status: 200, error: 'upgrade_required' };
  }

  return { status: 200, ok: true };
}

// ── POS-SCAN-001 ──────────────────────────────────────────────────────────────

describe('POS-SCAN-001: missing orgId returns 400', () => {
  it('returns 400 when orgId is absent', () => {
    const result = simulatePosScanGuard({ image: 'base64data', imageType: 'image/jpeg' });
    expect(result.status).toBe(400);
    expect(result.error).toBe('missing_params');
  });

  it('returns 400 when orgId is empty string', () => {
    const result = simulatePosScanGuard({ image: 'base64data', imageType: 'image/jpeg', orgId: '' });
    expect(result.status).toBe(400);
  });

  it('returns 400 when image is also missing', () => {
    const result = simulatePosScanGuard({ imageType: 'image/jpeg', orgId: 'org-a' });
    expect(result.status).toBe(400);
  });
});

// ── POS-SCAN-002 ──────────────────────────────────────────────────────────────

describe('POS-SCAN-002: free plan is blocked', () => {
  it('returns upgrade_required for free plan', () => {
    const result = simulatePosScanGuard({
      image: 'data', imageType: 'image/jpeg', orgId: 'org-a',
      serverOrgId: 'org-a', plan: 'free',
    });
    expect(result.status).toBe(200);
    expect(result.error).toBe('upgrade_required');
  });

  it('pro plan is allowed', () => {
    const result = simulatePosScanGuard({
      image: 'data', imageType: 'image/jpeg', orgId: 'org-a',
      serverOrgId: 'org-a', plan: 'pro',
    });
    expect(result.ok).toBe(true);
  });

  it('franchise plan is allowed', () => {
    const result = simulatePosScanGuard({
      image: 'data', imageType: 'image/jpeg', orgId: 'org-a',
      serverOrgId: 'org-a', plan: 'franchise',
    });
    expect(result.ok).toBe(true);
  });

  it('network plan is allowed', () => {
    const result = simulatePosScanGuard({
      image: 'data', imageType: 'image/jpeg', orgId: 'org-a',
      serverOrgId: 'org-a', plan: 'network',
    });
    expect(result.ok).toBe(true);
  });
});

// ── POS-SCAN-003 ──────────────────────────────────────────────────────────────

describe('POS-SCAN-003: plan gate cannot be bypassed', () => {
  it('omitting orgId triggers 400 — plan check never reached', () => {
    // Before the fix, omitting orgId skipped the plan check entirely.
    // After the fix, missing orgId is a hard 400 at the top.
    const result = simulatePosScanGuard({
      image: 'data', imageType: 'image/jpeg',
      serverOrgId: 'org-a', plan: 'free',
    });
    expect(result.status).toBe(400);
    expect(result.ok).toBeUndefined();
  });

  it('wrong orgId returns 403 even on pro plan', () => {
    const result = simulatePosScanGuard({
      image: 'data', imageType: 'image/jpeg', orgId: 'org-b',
      serverOrgId: 'org-a', plan: 'pro',
    });
    expect(result.status).toBe(403);
  });
});
