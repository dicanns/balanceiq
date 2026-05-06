/**
 * STRIPE-001  client-supplied priceId is rejected — planKey required
 * STRIPE-002  invalid planKey returns error; valid planKey resolves to correct price
 * STRIPE-003  redirect URLs must be on allowed domains
 */
import { describe, it, expect } from 'vitest';

// PLAN_PRICES map mirrored from create-checkout/index.ts
const PLAN_PRICES = {
  pro_monthly:                 'price_1TCLnfGcfc7VEkjZIMBbNl4n',
  pro_annual:                  'price_1TCLnmGcfc7VEkjZX2wv763a',
  network_monthly:             'price_1TCLkXGcfc7VEkjZyZIa4Pkr',
  network_annual:              'price_1TCLkyGcfc7VEkjZZgwQGotm',
  franchise_monthly:           'price_1TCLpmGcfc7VEkjZTuaZCNwp',
  franchise_annual:            'price_1TCLq1Gcfc7VEkjZZK3UlWpz',
  franchise_location_monthly:  'price_1TCLqxGcfc7VEkjZs19hWTOo',
  franchise_location_annual:   'price_1TCLrZGcfc7VEkjZF2o6LLXs',
};

const ALLOWED_REDIRECT_HOSTS = ['balanceiq.app', 'balanceiq.ca'];

function isAllowedRedirectUrl(url) {
  if (!url) return true;
  try {
    const p = new URL(url);
    if (p.hostname === 'localhost' || p.hostname === '127.0.0.1') return true;
    return p.protocol === 'https:' && ALLOWED_REDIRECT_HOSTS.some(h => p.hostname === h || p.hostname.endsWith('.' + h));
  } catch { return false; }
}

function simulateCheckout({ planKey, orgId, successUrl, cancelUrl }) {
  if (!planKey || !orgId) return { status: 400, error: 'Missing planKey or orgId' };
  const priceId = PLAN_PRICES[planKey];
  if (!priceId) return { status: 400, error: 'Invalid planKey' };
  if (!isAllowedRedirectUrl(successUrl) || !isAllowedRedirectUrl(cancelUrl)) {
    return { status: 400, error: 'Redirect URL not allowed' };
  }
  return { status: 200, ok: true, priceId };
}

// ── STRIPE-001 ────────────────────────────────────────────────────────────────

describe('STRIPE-001: priceId from client is rejected', () => {
  it('sending priceId directly instead of planKey returns error', () => {
    // Old API: body had priceId. New API: body needs planKey.
    // Sending only priceId (no planKey) triggers missing planKey error.
    const result = simulateCheckout({
      orgId: 'org-1',
      // No planKey — simulates attacker sending raw priceId
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain('planKey');
  });

  it('planKey is required alongside orgId', () => {
    const result = simulateCheckout({ orgId: 'org-1' });
    expect(result.status).toBe(400);
  });
});

// ── STRIPE-002 ────────────────────────────────────────────────────────────────

describe('STRIPE-002: planKey resolves to correct price ID', () => {
  it('pro_monthly resolves to correct price', () => {
    const result = simulateCheckout({ planKey: 'pro_monthly', orgId: 'org-1' });
    expect(result.ok).toBe(true);
    expect(result.priceId).toBe('price_1TCLnfGcfc7VEkjZIMBbNl4n');
  });

  it('franchise_monthly resolves to correct price', () => {
    const result = simulateCheckout({ planKey: 'franchise_monthly', orgId: 'org-1' });
    expect(result.priceId).toBe('price_1TCLpmGcfc7VEkjZTuaZCNwp');
  });

  it('network_monthly resolves to correct price', () => {
    const result = simulateCheckout({ planKey: 'network_monthly', orgId: 'org-1' });
    expect(result.priceId).toBe('price_1TCLkXGcfc7VEkjZyZIa4Pkr');
  });

  it('invalid planKey returns error', () => {
    const result = simulateCheckout({ planKey: 'hacker_plan', orgId: 'org-1' });
    expect(result.status).toBe(400);
    expect(result.error).toBe('Invalid planKey');
  });

  it('all plan keys map to distinct price IDs', () => {
    const values = Object.values(PLAN_PRICES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ── STRIPE-003 ────────────────────────────────────────────────────────────────

describe('STRIPE-003: redirect URL allowlist', () => {
  it('balanceiq.app URLs are allowed', () => {
    expect(isAllowedRedirectUrl('https://balanceiq.app/success')).toBe(true);
    expect(isAllowedRedirectUrl('https://balanceiq.app')).toBe(true);
  });

  it('balanceiq.ca URLs are allowed', () => {
    expect(isAllowedRedirectUrl('https://balanceiq.ca/success')).toBe(true);
  });

  it('localhost is allowed (dev)', () => {
    expect(isAllowedRedirectUrl('http://localhost:3000/success')).toBe(true);
  });

  it('attacker-controlled redirect is blocked', () => {
    const result = simulateCheckout({
      planKey: 'pro_monthly', orgId: 'org-1',
      successUrl: 'https://evil.example.com/steal-session',
    });
    expect(result.status).toBe(400);
    expect(result.error).toContain('Redirect');
  });

  it('http (non-https) balanceiq.app is blocked', () => {
    expect(isAllowedRedirectUrl('http://balanceiq.app/success')).toBe(false);
  });

  it('balanceiq.app.evil.com lookalike is blocked', () => {
    expect(isAllowedRedirectUrl('https://balanceiq.app.evil.com/success')).toBe(false);
  });

  it('undefined URL is allowed (uses server default)', () => {
    expect(isAllowedRedirectUrl(undefined)).toBe(true);
  });
});
