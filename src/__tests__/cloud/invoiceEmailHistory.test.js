import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { invoiceEmailHistory, emailBadge } from '../../services/emailTracking.js';

const ROOT = path.resolve(__dirname, '../../..');
const APP = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

describe('EMAILHIST one list of everything emailed about an invoice', () => {
  it('EMAILHIST-001 invoice emails and reminders merge newest first', () => {
    const rows = invoiceEmailHistory({
      emailLog: [{ to: 'a@x.test', sentAt: '2026-03-01T15:00:00.000Z', status: 'delivered', viewToken: 't', viewedAt: '2026-03-02T10:00:00.000Z', viewCount: 1 }],
      reminders: [
        { sent_to: 'a@x.test', sent_at: '2026-03-10 14:00:00', status: 'sent', days_after_due: 7 },
        { sent_to: 'a@x.test', sent_at: '2026-03-05 09:00:00', status: 'skipped', days_after_due: 3 },
      ],
    });
    expect(rows.map(r => [r.kind, r.status])).toEqual([['reminder', 'sent'], ['reminder', 'skipped'], ['invoice', 'delivered']]);
    expect(rows[0]).toMatchObject({ at: '2026-03-10T14:00:00Z', reminderDays: 7 });
    expect(rows[2]).toMatchObject({ viewTracked: true, viewCount: 1 });
  });

  it('EMAILHIST-002 nothing emailed gives an empty list', () => {
    expect(invoiceEmailHistory({})).toEqual([]);
  });
});

describe('EMAILHIST the invoice list mark', () => {
  it('EMAILHIST-003 no mark when nothing was emailed; red when something went wrong', () => {
    expect(emailBadge({})).toBeNull();
    expect(emailBadge({ emailLog: [{ status: 'delivered' }] })).toEqual({ count: 1, problem: false });
    expect(emailBadge({ emailLog: [{ status: 'delivered' }, { status: 'bounced' }] }, 2)).toEqual({ count: 4, problem: true });
    expect(emailBadge({}, 1, true)).toEqual({ count: 1, problem: true });
  });
});

describe('POWEREDBY client documents credit BalanceIQ', () => {
  it('POWEREDBY-001 every client document uses the shared footer line, in the client\'s language', () => {
    expect(APP).not.toMatch(/whiteLabelEnabled\?`<div style="margin-top:6px;font-size:9px;color:#bbb">Propulsé par BalanceIQ<\/div>`/);
    expect(APP.match(/const biqCredit=poweredByHtml\(tpl,/g)).toHaveLength(5);
    expect(APP).toMatch(/function poweredByHtml\(tpl,lang\)/);
    expect(APP).toMatch(/showPoweredBy:true/);
  });

  it('POWEREDBY-002 the invoice shows its email history whenever it has been sent', () => {
    expect(APP).toMatch(/window\.api\.reminders\.log\.list\(\{invoiceId:savedId,limit:50\}\)/);
    expect(APP).toMatch(/<InvoiceDeliveryTimeline log=\{log\} reminders=\{reminderLog\}/);
  });
});

describe('EMAILHIST list wiring', () => {
  it('EMAILHIST-004 the invoice list marks emailed invoices from their emails and reminders', () => {
    const dash = APP.slice(APP.indexOf('function FacturationDashboard('), APP.indexOf('\nfunction ', APP.indexOf('function FacturationDashboard(') + 10));
    expect(dash).toMatch(/window\.api\.reminders\.log\.list\(\{limit:5000\}\)/);
    expect(dash).toMatch(/emailBadge\(doc,rs\?\.count\|\|0,!!rs\?\.failed\)/);
  });
});
