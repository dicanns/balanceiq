import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dueReminders, clientReminderSteps, fillReminderTemplate } from '../../services/invoiceReminders.js';
import { accountStanding } from '../../services/accountStanding.js';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const STEPS = [
  { id: 1, days_after_due: 3 }, { id: 2, days_after_due: 7 }, { id: 3, days_after_due: 14 },
  { id: 4, days_after_due: 30 }, { id: 5, days_after_due: 60 },
];
const TODAY = '2026-06-30';
const balance = (f) => f.balance ?? 100;
const client = (id, extra = {}) => ({ id, entreprise: `Client ${id}`, courriel: `${id}@example.test`, ...extra });
const invoice = (id, due, extra = {}) => ({ id, numero: `F-T${id}`, clientId: 'c1', statut: 'Envoyée', dateEcheance: due, ...extra });

describe('REMIND which reminders are due', () => {
  it('REMIND-001 an invoice 34 days overdue gets the 30-day reminder only, and the earlier ones are skipped', () => {
    const items = dueReminders({ factures: [invoice('a', '2026-05-27')], clients: [client('c1')], steps: STEPS, log: [], today: TODAY, invoiceBalance: balance });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ invoiceId: 'a', daysOverdue: 34, canSend: true });
    expect(items[0].step.id).toBe(4);
    expect(items[0].skippedStepIds).toEqual([1, 2, 3]);
  });

  it('REMIND-002 once the latest reminder is sent, nothing more is due until the next one', () => {
    const log = [{ invoice_id: 'a', step_id: 4, status: 'sent' }];
    expect(dueReminders({ factures: [invoice('a', '2026-05-27')], clients: [client('c1')], steps: STEPS, log, today: TODAY, invoiceBalance: balance })).toEqual([]);
  });

  it('REMIND-003 a failed send does not count as sent', () => {
    const log = [{ invoice_id: 'a', step_id: 4, status: 'failed' }];
    expect(dueReminders({ factures: [invoice('a', '2026-05-27')], clients: [client('c1')], steps: STEPS, log, today: TODAY, invoiceBalance: balance })).toHaveLength(1);
  });

  it('REMIND-004 drafts, paid, credited, cancelled, proforma, not yet overdue and fully paid invoices are left alone', () => {
    const factures = [
      invoice('d', '2026-06-01', { statut: 'Brouillon' }),
      invoice('p', '2026-06-01', { statut: 'Payée' }),
      invoice('cr', '2026-06-01', { statut: 'Créditée' }),
      invoice('x', '2026-06-01', { statut: 'Annulée' }),
      invoice('pf', '2026-06-01', { documentType: 'proforma' }),
      invoice('future', '2026-07-15'),
      invoice('settled', '2026-06-01', { statut: 'Payée partiellement', balance: 0 }),
    ];
    expect(dueReminders({ factures, clients: [client('c1')], steps: STEPS, log: [], today: TODAY, invoiceBalance: balance })).toEqual([]);
  });

  it('REMIND-005 each client gets all, chosen or no reminders', () => {
    expect(clientReminderSteps(client('c1'), STEPS).map(s => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(clientReminderSteps(client('c1', { reminderMode: 'none' }), STEPS)).toEqual([]);
    expect(clientReminderSteps(client('c1', { reminderMode: 'custom', reminderStepIds: [2, 5] }), STEPS).map(s => s.id)).toEqual([2, 5]);

    const chosen = dueReminders({
      factures: [invoice('a', '2026-05-27')], clients: [client('c1', { reminderMode: 'custom', reminderStepIds: [2] })],
      steps: STEPS, log: [], today: TODAY, invoiceBalance: balance,
    });
    expect(chosen[0].step.id).toBe(2);
    expect(chosen[0].skippedStepIds).toEqual([]);
    expect(dueReminders({ factures: [invoice('a', '2026-05-27')], clients: [client('c1', { reminderMode: 'none' })], steps: STEPS, log: [], today: TODAY, invoiceBalance: balance })).toEqual([]);
  });

  it('REMIND-006 a client with no email is shown but cannot be sent to', () => {
    const items = dueReminders({ factures: [invoice('a', '2026-06-20')], clients: [client('c1', { courriel: '' })], steps: STEPS, log: [], today: TODAY, invoiceBalance: balance });
    expect(items[0]).toMatchObject({ canSend: false, email: '' });
  });

  it('REMIND-007 template tags are filled', () => {
    expect(fillReminderTemplate('{client_name}: {invoice_number} / {numero}, {amount_due}, {days_overdue}d, {company_name}{payment_link}', {
      clientName: 'Test Co', invoiceNumber: 'F-T1', amountDue: '$12.34', daysOverdue: 9, companyName: 'Seller Inc',
    })).toBe('Test Co: F-T1 / F-T1, $12.34, 9d, Seller Inc');
  });
});

describe('STANDING where a client stands', () => {
  const totalOf = (d) => d.total;
  const factures = [
    { id: 'i1', clientId: 'c1', statut: 'Envoyée', total: 200, dateEcheance: '2026-06-25', paiements: [] },
    { id: 'i2', clientId: 'c1', statut: 'Payée partiellement', total: 300, dateEcheance: '2026-05-10', paiements: [{ montant: 100 }, { montant: 50, fromCredit: true, reference: 'NC-1' }] },
    { id: 'i3', clientId: 'c1', statut: 'Brouillon', total: 400, acomptes: [{ montant: 120 }] },
    { id: 'i4', clientId: 'c1', statut: 'Payée', total: 90, paiements: [{ montant: 90 }] },
    { id: 'o1', clientId: 'c2', statut: 'Envoyée', total: 999, dateEcheance: '2026-06-01', paiements: [] },
  ];
  const creditNotes = [
    { numero: 'NC-1', clientId: 'c1', statut: 'Émise', total: 80 },
    { numero: 'NC-2', clientId: 'c1', statut: 'Annulée', total: 500 },
    { numero: 'NC-3', clientId: 'c2', statut: 'Émise', total: 40 },
  ];

  it('STANDING-001 outstanding by age, available credit, balance owed and deposits held', () => {
    const st = accountStanding({ clientId: 'c1', factures, creditNotes, asOf: TODAY, totalOf });
    expect(st.aging).toEqual({ current: 0, d30: 200, d60: 150, d90: 0 });
    expect(st.outstanding).toBe(350);
    expect(st.creditsAvailable).toBe(30);
    expect(st.credits).toEqual([{ numero: 'NC-1', remaining: 30 }]);
    expect(st.balanceOwed).toBe(320);
    expect(st.depositsHeld).toBe(120);
  });

  it('STANDING-002 credit larger than what is owed leaves nothing owed, never a negative balance', () => {
    const st = accountStanding({
      clientId: 'c9',
      factures: [{ id: 'z', clientId: 'c9', statut: 'Envoyée', total: 20, dateEcheance: TODAY, paiements: [] }],
      creditNotes: [{ numero: 'NC-9', clientId: 'c9', statut: 'Émise', total: 75 }],
      asOf: TODAY, totalOf,
    });
    expect(st).toMatchObject({ outstanding: 20, creditsAvailable: 75, balanceOwed: 0 });
  });
});

describe('REMINDWIRE the screens use the rules', () => {
  const APP = read('src/App.jsx');
  const TAB = read('src/components/RemindersTab.jsx');

  it('REMINDWIRE-001 finding reminders never sends; sending checks the result and records skipped steps', () => {
    const findBlock = TAB.slice(TAB.indexOf('const findDue = async'), TAB.indexOf('const send = async'));
    expect(findBlock).not.toMatch(/sendResend/);
    expect(TAB).toMatch(/if \(r\?\.success\)/);
    expect(TAB).toMatch(/status: 'skipped'/);
    expect(APP).not.toMatch(/function RappelsTab\(/);
    expect(APP).toMatch(/<RemindersTab /);
    expect(APP).toMatch(/<ClientReminderPicker /);
  });

  it('REMINDWIRE-002 the statement can be emailed and no longer counts applied credit notes twice', () => {
    const viewer = APP.slice(APP.indexOf('function EtatDeCompteViewer('), APP.indexOf('\n// ── AGING REPORT ──'));
    expect(viewer).toMatch(/openStatementEmail/);
    expect(viewer).toMatch(/<EmailComposeModal /);
    const builder = APP.slice(APP.indexOf('function buildEtatDeCompteHTML('), APP.indexOf('\nfunction EtatDeCompteViewer('));
    expect(builder).toMatch(/if\(p\.fromCredit\)continue;/);
    expect(builder).toMatch(/accountStanding\(/);
  });

  it('REMINDWIRE-003 bulk statements attach the PDF data, and documents without a logo show the company name', () => {
    expect(APP).toMatch(/const pdfRes=await window\.api\.pdf\.toPDF\(facHtml\);\n\s*const b64=pdfRes\?\.data;/);
    expect(APP).not.toMatch(/whiteLabelName:"BIQ"/);
    expect(APP.match(/\(companyInfo\?\.nom\|\|"BalanceIQ"\)/g)).toHaveLength(5);
  });
});
