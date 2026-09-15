import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  normalizeEmailEvent, newEmailLogEntry, needsStatusCheck, needsViewCheck,
  applyDeliveryUpdates, emailTimeline, emailWorklistItems, PROBLEM_STATUSES,
} from '../../services/emailTracking.js';
import { companyAccess, COMPANY_GRACE_DAYS } from '../../services/companyAccess.js';

const require = createRequire(import.meta.url);
const companies = require('../../../companies.js');
const DAY = 86400000;
const NOW = Date.parse('2026-06-15T12:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

describe('DELIVERY email statuses', () => {
  it('DELIVERY-001 Resend events map onto what the invoice shows', () => {
    expect(normalizeEmailEvent('delivered')).toBe('delivered');
    expect(normalizeEmailEvent('email.bounced')).toBe('bounced');
    expect(normalizeEmailEvent('opened')).toBe('delivered');
    expect(normalizeEmailEvent('queued')).toBe('sent');
    expect(normalizeEmailEvent('delivery_delayed')).toBe('delivery_delayed');
    expect(normalizeEmailEvent('something_new')).toBeNull();
    expect(normalizeEmailEvent(null)).toBeNull();
  });

  it('DELIVERY-002 an email sent from the mail app is recorded but not tracked', () => {
    expect(newEmailLogEntry({ to: 'a@example.test', emailId: 're_1', viewToken: 'ab'.repeat(20), now: iso(0) }))
      .toMatchObject({ id: 're_1', status: 'sent', viewToken: 'ab'.repeat(20) });
    expect(newEmailLogEntry({ to: 'a@example.test', direct: false, now: iso(0) }))
      .toMatchObject({ id: null, status: 'untracked' });
  });

  it('DELIVERY-003 checks stop once the answer is final or the email is old', () => {
    expect(needsStatusCheck({ id: 'x', sentAt: iso(DAY), status: 'sent' }, NOW)).toBe(true);
    expect(needsStatusCheck({ id: 'x', sentAt: iso(DAY), status: 'delivered' }, NOW)).toBe(true);
    expect(needsStatusCheck({ id: 'x', sentAt: iso(5 * DAY), status: 'delivered' }, NOW)).toBe(false);
    for (const s of PROBLEM_STATUSES) expect(needsStatusCheck({ id: 'x', sentAt: iso(DAY), status: s }, NOW)).toBe(false);
    expect(needsStatusCheck({ id: 'x', sentAt: iso(40 * DAY), status: 'sent' }, NOW)).toBe(false);
    expect(needsStatusCheck({ id: null, sentAt: iso(DAY), status: 'untracked' }, NOW)).toBe(false);
    expect(needsViewCheck({ viewToken: 't', sentAt: iso(DAY) }, NOW)).toBe(true);
    expect(needsViewCheck({ viewToken: 't', sentAt: iso(DAY), viewedAt: iso(0) }, NOW)).toBe(false);
  });

  it('DELIVERY-004 updates land on the right email and never step backwards', () => {
    const list = [
      { id: 'inv-1', emailLog: [{ id: 're_a', sentAt: iso(DAY), status: 'delivered', viewToken: 'tok1' }] },
      { id: 'inv-2', emailLog: [{ id: 're_b', sentAt: iso(DAY), status: 'sent' }] },
      { id: 'inv-3' },
    ];
    const r = applyDeliveryUpdates(list, {
      statusUpdates: [{ invoiceId: 'inv-1', id: 're_a', lastEvent: 'sent' }, { invoiceId: 'inv-2', id: 're_b', lastEvent: 'bounced' }],
      views: { tok1: { first_viewed_at: iso(3600000), last_viewed_at: iso(60000), view_count: 2 } },
      now: iso(0),
    });
    expect(r.changed).toBe(true);
    expect(r.list[0].emailLog[0]).toMatchObject({ status: 'delivered', viewCount: 2 });
    expect(r.list[1].emailLog[0].status).toBe('bounced');
    expect(r.list[2]).toBe(list[2]);
    expect(applyDeliveryUpdates(r.list, {}).changed).toBe(false);
  });

  it('DELIVERY-005 the timeline lists the newest email first', () => {
    const rows = emailTimeline({ emailLog: [{ to: 'first@x.test', sentAt: iso(2 * DAY) }, { to: 'second@x.test', sentAt: iso(DAY), viewToken: 't' }] });
    expect(rows.map(r => r.to)).toEqual(['second@x.test', 'first@x.test']);
    expect(rows[0].viewTracked).toBe(true);
  });

  it('DELIVERY-006 Today flags a bounce and an unpaid invoice nobody has opened in a week', () => {
    const items = emailWorklistItems([
      { id: 'b', numero: 'F-TEST-1', statut: 'Envoyée', emailLog: [{ to: 'wrong@x.test', sentAt: iso(DAY), status: 'bounced', statusAt: iso(DAY) }] },
      { id: 'u', numero: 'F-TEST-2', statut: 'Envoyée', emailLog: [{ to: 'c@x.test', sentAt: iso(9 * DAY), status: 'delivered', viewToken: 't' }] },
      { id: 'v', numero: 'F-TEST-3', statut: 'Envoyée', emailLog: [{ to: 'c@x.test', sentAt: iso(9 * DAY), status: 'delivered', viewToken: 't', viewedAt: iso(8 * DAY) }] },
      { id: 'p', numero: 'F-TEST-4', statut: 'Payée', emailLog: [{ to: 'c@x.test', sentAt: iso(9 * DAY), status: 'delivered', viewToken: 't' }] },
      { id: 'n', numero: 'F-TEST-5', statut: 'Envoyée', emailLog: [{ to: 'c@x.test', sentAt: iso(2 * DAY), status: 'delivered', viewToken: 't' }] },
    ], { now: NOW, lang: 'en' });
    expect(items.map(i => [i.id, i.tone])).toEqual([['email-b-bounced', 'alert'], ['email-unviewed-u', 'warn']]);
    expect(items[0].target).toEqual({ kind: 'invoice', invoiceId: 'b' });
    expect(items[1].title).toMatch(/9 days ago/);
  });
});

describe('COMPANY registry', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-companies-'));
  afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

  it('COMPANY-001 with no registry, the existing data is the primary company, untouched', () => {
    const c = companies.activeCompany(base);
    expect(c).toMatchObject({ id: 'main', primary: true });
    expect(companies.dataDirFor(base, c)).toBe(base);
    expect(companies.partitionFor(c)).toBeNull();
    expect(companies.vaultDirFor('/vault', c)).toBe('/vault');
  });

  it('COMPANY-002 an added company gets its own data folder, vault folder and storage partition', () => {
    const c = companies.createCompany(base, '  Test Holdings  ');
    expect(c).toMatchObject({ name: 'Test Holdings', primary: false });
    const dir = companies.dataDirFor(base, c);
    expect(dir).toBe(path.join(base, 'companies', c.id));
    expect(fs.existsSync(dir)).toBe(true);
    expect(companies.partitionFor(c)).toBe(`persist:company-${c.id}`);
    expect(companies.vaultDirFor('/vault', c)).toBe(path.join('/vault', 'Companies', c.id));
    expect(companies.activeCompany(base).id).toBe('main');
  });

  it('COMPANY-003 names are required and unique, ignoring case', () => {
    expect(() => companies.createCompany(base, '   ')).toThrow('name_required');
    expect(() => companies.createCompany(base, 'test holdings')).toThrow('name_taken');
  });

  it('COMPANY-004 switching and renaming persist', () => {
    const second = companies.load(base).companies.find(c => !c.primary);
    companies.setActive(base, second.id);
    expect(companies.activeCompany(base).id).toBe(second.id);
    companies.renameCompany(base, 'main', 'Main Test Co');
    expect(companies.load(base).companies.find(c => c.primary).name).toBe('Main Test Co');
    expect(() => companies.setActive(base, 'nope')).toThrow('not_found');
    companies.setActive(base, 'main');
  });

  it('COMPANY-005 one cloud organization cannot serve two companies', () => {
    const second = companies.load(base).companies.find(c => !c.primary);
    expect(companies.bindOrg(base, 'main', 'org-1')).toEqual({ ok: true });
    expect(companies.bindOrg(base, second.id, 'org-1')).toMatchObject({ ok: false, error: 'org_in_use', conflictPrimary: true });
    expect(companies.bindOrg(base, second.id, 'org-2')).toEqual({ ok: true });
    expect(companies.bindOrg(base, 'main', null)).toEqual({ ok: true });
    expect(companies.bindOrg(base, second.id, 'org-1')).toEqual({ ok: true });
  });

  it('COMPANY-006 an unreadable registry falls back to the primary company', () => {
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'biq-companies-bad-'));
    fs.writeFileSync(path.join(bad, companies.REGISTRY_FILE), '{not json');
    expect(companies.activeCompany(bad)).toMatchObject({ id: 'main', primary: true });
    fs.rmSync(bad, { recursive: true, force: true });
  });
});

describe('COMPANY access', () => {
  it('COMPANY-007 the primary company is always open', () => {
    expect(companyAccess({ isPrimary: true, plan: 'free' }).state).toBe('open');
  });

  it('COMPANY-008 an additional company needs its own signed-in paid plan', () => {
    expect(companyAccess({ isPrimary: false, signedIn: true, plan: 'pro', now: NOW }).state).toBe('open');
    expect(companyAccess({ isPrimary: false, signedIn: true, plan: 'free', now: NOW }).state).toBe('needs_plan');
    expect(companyAccess({ isPrimary: false, signedIn: false, plan: 'pro', now: NOW }).state).toBe('needs_plan');
  });

  it('COMPANY-009 a recently confirmed plan keeps working offline for the grace period', () => {
    expect(companyAccess({ isPrimary: false, verifiedPaidAt: iso(3 * DAY), now: NOW })).toMatchObject({ state: 'grace', daysLeft: COMPANY_GRACE_DAYS - 3 });
    expect(companyAccess({ isPrimary: false, verifiedPaidAt: iso((COMPANY_GRACE_DAYS + 1) * DAY), now: NOW }).state).toBe('needs_plan');
  });

  it('COMPANY-010 while the cloud check is still running, nothing is decided yet', () => {
    expect(companyAccess({ isPrimary: false, cloudChecked: false, now: NOW }).state).toBe('checking');
  });
});
