// ── PAYMENT REMINDERS ────────────────────────────────────────────────────────
// Which reminder emails are due, decided in one place.
//
// Rules, each learned the hard way:
// - An invoice gets its most recent due reminder only. An invoice that is 34 days
//   overdue when reminders are first checked gets the 30-day reminder, not the
//   3-, 7-, 14- and 30-day reminders one after another. The earlier ones it passed
//   are recorded as skipped so they are never sent late.
// - Nothing is due on a draft, a paid, credited or cancelled invoice, a proforma,
//   or an invoice with nothing left to pay.
// - Each client can take all reminders, a chosen few, or none.
//
// Pure functions: the screen fetches reminders and history, this decides.

import { daysBetween } from './todayWorklist.js';

export const REMINDER_MODES = ['all', 'custom', 'none'];

// The reminders that apply to one client, in day order.
export function clientReminderSteps(client, steps) {
  const sorted = [...(steps || [])].sort((a, b) => a.days_after_due - b.days_after_due);
  const mode = client?.reminderMode || 'all';
  if (mode === 'none') return [];
  if (mode === 'custom') {
    const ids = new Set((client?.reminderStepIds || []).map(Number));
    return sorted.filter(s => ids.has(Number(s.id)));
  }
  return sorted;
}

const CLOSED = ['Brouillon', 'Payée', 'Créditée', 'Annulée', 'Void'];
// A reminder recorded as sent or skipped is never due again for that invoice.
const DONE = ['sent', 'skipped'];

/**
 * invoiceBalance(invoice, client) -> amount still owed.
 * Returns [{ invoiceId, invoiceNumber, clientId, clientName, email, canSend, step,
 *            skippedStepIds, daysOverdue, amountDue }], most overdue first.
 */
export function dueReminders({ factures = [], clients = [], steps = [], log = [], today, invoiceBalance }) {
  const done = new Set((log || []).filter(l => DONE.includes(l.status)).map(l => `${l.invoice_id}::${l.step_id}`));
  const byId = new Map((clients || []).map(c => [c.id, c]));
  const items = [];

  for (const f of factures || []) {
    if (!f || !f.dateEcheance || !f.clientId || CLOSED.includes(f.statut) || f.documentType === 'proforma') continue;
    const daysOverdue = daysBetween(f.dateEcheance, today);
    if (daysOverdue <= 0) continue;
    const client = byId.get(f.clientId);
    const amountDue = typeof invoiceBalance === 'function' ? invoiceBalance(f, client) : 0;
    if (!(amountDue > 0.005)) continue;

    const eligible = clientReminderSteps(client, steps).filter(s => daysOverdue >= s.days_after_due);
    if (!eligible.length) continue;
    const latest = eligible[eligible.length - 1];
    if (done.has(`${f.id}::${latest.id}`)) continue;

    items.push({
      invoiceId: f.id,
      invoiceNumber: f.numero || '',
      clientId: f.clientId,
      clientName: client?.entreprise || client?.contact || '',
      email: client?.courriel || '',
      canSend: !!client?.courriel,
      step: latest,
      skippedStepIds: eligible.slice(0, -1).filter(s => !done.has(`${f.id}::${s.id}`)).map(s => s.id),
      daysOverdue,
      amountDue: Math.round(amountDue * 100) / 100,
    });
  }
  return items.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export const REMINDER_VARIABLES = ['{client_name}', '{invoice_number}', '{amount_due}', '{days_overdue}', '{company_name}'];

export function fillReminderTemplate(text, vars = {}) {
  return String(text || '')
    .replace(/\{client_name\}/g, vars.clientName || '')
    .replace(/\{invoice_number\}|\{numero\}/g, vars.invoiceNumber || '')
    .replace(/\{amount_due\}/g, vars.amountDue || '')
    .replace(/\{days_overdue\}/g, vars.daysOverdue == null ? '' : String(vars.daysOverdue))
    .replace(/\{company_name\}/g, vars.companyName || '')
    .replace(/\{payment_link\}/g, vars.paymentLink || '');
}

// Used when a reminder has no subject or message of its own.
export const DEFAULT_REMINDER_TEXT = {
  fr: {
    subject: 'Rappel : facture {invoice_number} en retard',
    body: 'Bonjour {client_name},\n\nNotre facture {invoice_number} est en retard de {days_overdue} jours. Le solde dû est de {amount_due}.\n\nSi le paiement a déjà été fait, veuillez ne pas tenir compte de ce message.\n\nMerci,\n{company_name}',
  },
  en: {
    subject: 'Reminder: invoice {invoice_number} is overdue',
    body: 'Hello {client_name},\n\nOur invoice {invoice_number} is {days_overdue} days overdue. The balance due is {amount_due}.\n\nIf you have already paid, please disregard this message.\n\nThank you,\n{company_name}',
  },
};
