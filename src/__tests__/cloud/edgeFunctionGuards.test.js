// Source-level checks for the cloud review fixes (B11 to B19). The functions run
// on Deno, so these read the sources and the shared rules.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { padEnabled, isPadPlan, monthStartIso } from '../../../supabase/functions/_shared/billingRules.ts';

const fn = (n) => fs.readFileSync(path.join(__dirname, '../../../supabase/functions', n, 'index.ts'), 'utf8');
const mig = (n) => fs.readFileSync(path.join(__dirname, '../../../supabase/migrations', n), 'utf8');

describe('GUARD accept-quote', () => {
  const s = fn('accept-quote');
  it('GUARD-001 a GET never records anything: it serves the confirmation page', () => {
    const get = s.slice(s.indexOf("req.method === 'GET' || req.method === 'HEAD'"));
    expect(get.indexOf('buildAcceptancePage')).toBeGreaterThan(-1);
    expect(get.indexOf('buildAcceptancePage')).toBeLessThan(get.indexOf("status: 'accepted'"));
    expect(s).not.toMatch(/req\.method === 'GET' \|\| req\.method === 'POST'/);
  });
  it('GUARD-002 decline limits first and emails only the call that changed the row', () => {
    const d = s.slice(s.indexOf("action === 'decline'"), s.indexOf("action === 'revoke'"));
    expect(d.indexOf('checkRateLimit')).toBeLessThan(d.indexOf('.update('));
    expect(d.indexOf('.update(')).toBeLessThan(d.indexOf('api.resend.com'));
    expect(d).toMatch(/\.eq\('status', 'pending'\)[\s\S]*\.select\(/);
    expect(d).toMatch(/escHtml\(/);
  });
  it('GUARD-003 revoke needs the operator login and the token org', () => {
    const r = s.slice(s.indexOf("action === 'revoke'"), s.indexOf("if (!token) return htmlResp"));
    expect(r).toContain('requireOrgMember(req, String(tokRow.org_id))');
    expect(r).toMatch(/\.eq\('org_id'/);
  });
  it('GUARD-004 the public check view has no IP, user agent or operator email', () => {
    const c = s.slice(s.indexOf("action === 'check'"), s.indexOf("action === 'decline'"));
    const publicLine = c.split('\n').find((l) => l.includes('isOperator') === false && l.includes('status: record.status'));
    expect(publicLine).toBeTruthy();
    expect(publicLine).not.toMatch(/ip|user_agent|operator_email|signature/i);
    expect(c).not.toContain('operator_email');
  });
  it('GUARD-005 the notification address comes from the login, not the request', () => {
    expect(s).toContain('member.user?.email');
    expect(s).not.toMatch(/operator_email \|\| null/);
  });
  it('GUARD-006 page values are escaped or JSON encoded', () => {
    expect(s).toContain('${escHtml(row.quote_number');
    expect(s).toContain('const TOKEN = ${jsStr(');
    expect(s).toContain("rawLang === 'en' ? 'en' : 'fr'");
  });
});

describe('GUARD pad-webhook', () => {
  const s = fn('pad-webhook');
  it('GUARD-010 verifies before any field is trusted, and scopes every write to the org', () => {
    expect(s.indexOf('await verify(')).toBeLessThan(s.indexOf('pad_webhook_events'));
    expect(s).not.toContain('extractOrgId');
    for (const t of ['pad_mandates', 'pad_charges']) {
      const updates = s.split(`.from('${t}')`).slice(1);
      for (const u of updates) {
        // the one exception is cancelling by Stripe's own mandate id, allowed only for platform-signed events
        if (u.slice(0, 400).includes("'stripe_mandate_id', mandate.id")) continue;
        expect(u.slice(0, 600)).toMatch(/org_id|orgId/);
      }
    }
    expect(s).toContain("mandate.status === 'inactive' && scope === 'platform'");
    {
    }
    expect(s).not.toMatch(/detail: String/);
  });
});

describe('GUARD pre-authorized debit switch', () => {
  it('GUARD-020 off unless PAD_ENABLED is exactly "true"', () => {
    expect(padEnabled('true')).toBe(true);
    for (const v of [undefined, '', 'TRUE', '1', 'yes', 'false', ' true']) expect(padEnabled(v)).toBe(false);
    for (const n of ['create-pad-mandate', 'charge-pad-mandate']) {
      const s = fn(n);
      expect(s).toContain("error: 'pad_disabled'");
      expect(s.indexOf('pad_disabled')).toBeLessThan(s.indexOf('requireOrgMember(req'));
      expect(s).toContain('isPadPlan');
      expect(s).toMatch(/monthly_cap_reached/);
    }
  });
  it('GUARD-021 paid plans only', () => {
    expect(isPadPlan('pro')).toBe(true);
    expect(isPadPlan('franchise')).toBe(true);
    expect(isPadPlan('free')).toBe(false);
    expect(isPadPlan(null)).toBe(false);
    expect(monthStartIso(new Date('2026-11-15T10:00:00Z'))).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('GUARD AI spend', () => {
  it('GUARD-030 body size is capped before auth in every AI function', () => {
    for (const n of ['ocr-invoice', 'ai-intelligence', 'pos-scan']) {
      const s = fn(n);
      expect(s).toContain('readCappedJson(req');
      expect(s.indexOf('readCappedJson(req')).toBeLessThan(s.indexOf('getUser('));
    }
  });
  it('GUARD-031 POS scan has a monthly quota reserved before the model call', () => {
    const s = fn('pos-scan');
    expect(s).toContain("p_table: 'pos_scan_usage'");
    expect(s.indexOf('increment_usage_if_under_limit')).toBeLessThan(s.indexOf('api.anthropic.com'));
  });
  it('GUARD-032 counters are read-only to members and the usage_events insert is not open', () => {
    const m = mig('20261110000002_usage_counters_readonly.sql');
    expect(m).toMatch(/DROP POLICY IF EXISTS "ai_usage_org_own"/);
    expect(m).toMatch(/REVOKE ALL ON public\.ocr_usage, public\.ai_usage, public\.pos_scan_usage FROM anon, authenticated/);
    expect(m).toMatch(/GRANT SELECT ON public\.ocr_usage/);
    expect(m).not.toMatch(/GRANT (INSERT|UPDATE|ALL)[^;]*usage/);
    expect(m).toMatch(/usage_events_insert[\s\S]*TO authenticated[\s\S]*WITH CHECK \(org_id = /);
    expect(m).toMatch(/GRANT EXECUTE ON FUNCTION public\.increment_usage_if_under_limit[^;]*TO service_role/);
  });
});

describe('GUARD billing', () => {
  const s = fn('create-checkout');
  it('GUARD-040 accepts a plan key or an allowlisted price id, never the location price', () => {
    expect(s).toContain('ALLOWED_PRICE_IDS.has(');
    expect(s).not.toContain('franchise_location');
    expect(s).not.toContain('price_1TCLqxGcfc7VEkjZs19hWTOo');
    expect(s).not.toContain('price_1TCLrZGcfc7VEkjZF2o6LLXs');
  });
  it('GUARD-041 the trial is skipped when the customer ever had a subscription', () => {
    expect(s).toContain("status: 'all'");
    expect(s).toMatch(/hadSubscription \? \{\} : \{ trial_period_days/);
  });
  it('GUARD-042 a location price alone grants no plan', () => {
    const w = fn('stripe-webhook');
    expect(w).toContain('LOCATION_PRICES');
    expect(w).not.toContain('items.data[0]');
  });
});

describe('GUARD invitations and errors', () => {
  it('GUARD-050 invite codes use crypto and accepting is attempt limited', () => {
    expect(fn('create-invitation')).toContain('crypto.getRandomValues');
    expect(fn('create-invitation')).not.toContain('Math.random');
    const a = fn('accept-invitation');
    expect(a.indexOf('invitation_attempts')).toBeLessThan(a.indexOf('await req.json()'));
    expect(a).toContain('too_many_attempts');
  });
  it('GUARD-051 no function returns raw error text to callers', () => {
    for (const d of fs.readdirSync(path.join(__dirname, '../../../supabase/functions'))) {
      if (d.startsWith('_')) continue;
      const s = fn(d);
      expect(s, d).not.toMatch(/error: (err|e|\w+Err)\.message/);
      expect(s, d).not.toMatch(/(detail|message): (String\((err|e)\)|(err|e)\?\.message)/);
      expect(s, d).not.toMatch(/Webhook Error: \$\{/);
    }
  });
  it('GUARD-052 internal emails escape interpolated text', () => {
    expect(fn('payment-alert')).toContain('escHtml(org.name');
    expect(fn('weekly-digest')).toContain('escHtml(p)');
    expect(fn('pad-followup')).toContain('escHtml(name)');
  });
});
