import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BILLING_ROLES, canManageBilling,
  DEFAULT_MAX_CHARGE_CENTS, maxChargeCents,
  LIVE_CHARGE_STATUSES, checkChargeRequest,
  chargeIdempotencyKey, locationItemIdempotencyKey, isUniqueViolation,
} from '../../../supabase/functions/_shared/billingRules.ts';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MIGRATION = 'supabase/migrations/20260914000002_billing_authorization.sql';

const validBody = { org_id: 'org-test', mandate_id: 'mandate-test', invoice_id: 'inv-test', amount_cents: 12345 };

describe('BILLAUTH roles', () => {
  it('BILLAUTH-001 owner and admin may manage billing', () => {
    expect(BILLING_ROLES).toEqual(['owner', 'admin']);
    expect(canManageBilling('owner')).toBe(true);
    expect(canManageBilling('admin')).toBe(true);
    expect(canManageBilling(' Owner ')).toBe(true);
  });

  it('BILLAUTH-002 every other role, and no role, is refused', () => {
    for (const role of ['manager', 'member', 'cashier', '', null, undefined]) {
      expect(canManageBilling(role)).toBe(false);
    }
  });
});

describe('BILLAUTH charge requests', () => {
  it('BILLAUTH-003 a complete request within the ceiling passes', () => {
    expect(checkChargeRequest(validBody, DEFAULT_MAX_CHARGE_CENTS)).toEqual({ ok: true });
  });

  it('BILLAUTH-004 an invoice is required, so every charge can be tied to one', () => {
    const { invoice_id, ...noInvoice } = validBody;
    expect(checkChargeRequest(noInvoice, DEFAULT_MAX_CHARGE_CENTS)).toMatchObject({ ok: false, error: 'missing_params' });
    expect(checkChargeRequest(null, DEFAULT_MAX_CHARGE_CENTS)).toMatchObject({ ok: false, error: 'missing_params' });
  });

  it('BILLAUTH-005 amounts must be positive whole cents', () => {
    for (const amount_cents of [0, -500, 12.5, '12345', Number.NaN]) {
      expect(checkChargeRequest({ ...validBody, amount_cents }, DEFAULT_MAX_CHARGE_CENTS))
        .toMatchObject({ ok: false, error: 'invalid_amount' });
    }
  });

  it('BILLAUTH-006 amounts over the ceiling are refused', () => {
    expect(checkChargeRequest({ ...validBody, amount_cents: 70000 }, 60000))
      .toMatchObject({ ok: false, error: 'amount_over_limit', status: 422 });
    expect(checkChargeRequest({ ...validBody, amount_cents: 60000 }, 60000)).toEqual({ ok: true });
  });

  it('BILLAUTH-007 the ceiling reads a valid override and ignores junk', () => {
    expect(maxChargeCents('250000')).toBe(250000);
    for (const junk of [undefined, null, '', 'abc', '-5', '0', '12.5']) {
      expect(maxChargeCents(junk)).toBe(DEFAULT_MAX_CHARGE_CENTS);
    }
  });
});

describe('BILLAUTH duplicate protection', () => {
  it('BILLAUTH-008 idempotency keys are stable per attempt and distinct by kind', () => {
    expect(chargeIdempotencyKey('abc')).toBe(chargeIdempotencyKey('abc'));
    expect(chargeIdempotencyKey('abc')).not.toBe(chargeIdempotencyKey('abd'));
    expect(chargeIdempotencyKey('abc')).not.toBe(locationItemIdempotencyKey('abc'));
  });

  it('BILLAUTH-009 only a Postgres unique violation counts as a duplicate', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('BILLAUTH-010 the one-live-charge index uses exactly the live statuses', () => {
    const m = read(MIGRATION).match(/pad_charges_one_live_per_invoice[\s\S]*?WHERE status IN \(([^)]*)\)/);
    expect(m).not.toBeNull();
    const indexed = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(indexed).toEqual(LIVE_CHARGE_STATUSES);
    expect(LIVE_CHARGE_STATUSES).not.toContain('failed');
  });

  it('BILLAUTH-011 billing and revoke functions are closed to app users', () => {
    const sql = read(MIGRATION);
    for (const fn of ['claim_location_billing', 'revoke_franchise_location']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`));
    }
    expect(sql).toMatch(/REVOKE ALL ON public\.franchise_location_billing FROM anon, authenticated/);
  });
});

describe('BILLAUTH edge functions use the shared rules', () => {
  const fns = ['charge-pad-mandate', 'create-invitation', 'revoke-invitation'];

  it.each(fns)('BILLAUTH-012 %s refuses callers without a billing role', (fn) => {
    const src = read(`supabase/functions/${fn}/index.ts`);
    expect(src).toMatch(/from '\.\.\/_shared\/billingRules\.ts'/);
    expect(src).toMatch(/canManageBilling\(/);
  });

  it('BILLAUTH-013 charges are recorded before Stripe and sent with an idempotency key', () => {
    const src = read('supabase/functions/charge-pad-mandate/index.ts');
    const insertAt = src.indexOf(".from('pad_charges')");
    const stripeAt = src.indexOf('paymentIntents.create');
    expect(insertAt).toBeGreaterThan(-1);
    expect(stripeAt).toBeGreaterThan(insertAt);
    expect(src).toMatch(/idempotencyKey:\s*chargeIdempotencyKey\(/);
    expect(src).toMatch(/requireOrgMember\(/);
  });

  it('BILLAUTH-014 a location billing claim is taken before its Stripe item is created', () => {
    const src = read('supabase/functions/create-invitation/index.ts');
    const claimAt = src.indexOf("rpc('claim_location_billing'");
    const stripeAt = src.indexOf('subscriptionItems.create');
    expect(claimAt).toBeGreaterThan(-1);
    expect(stripeAt).toBeGreaterThan(claimAt);
    expect(src).toMatch(/idempotencyKey:\s*locationItemIdempotencyKey\(/);
  });

  it('BILLAUTH-015 revoking removes access before touching billing', () => {
    const src = read('supabase/functions/revoke-invitation/index.ts');
    const rpcAt = src.indexOf("rpc('revoke_franchise_location'");
    const stripeAt = src.indexOf('subscriptionItems.del');
    expect(rpcAt).toBeGreaterThan(-1);
    expect(stripeAt).toBeGreaterThan(rpcAt);
  });
});
