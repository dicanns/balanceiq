// ── TODAY: WHAT NEEDS YOU ────────────────────────────────────────────────────
// Phase 5 of the navigation rebuild. The app already knew what was unfinished -
// lines nobody had categorized, invoices past due, a return coming up, cash that
// no longer matched the bank - and surfaced none of it until someone went looking.
// That gap is most of why the app needed a video tutorial.
//
// Pure functions only, so every rule here is testable without a window or a
// database. The shell fetches; this decides what is worth saying.

import { calcInvoiceOutstanding } from '../utils/calculations.js';
import { generateTaxPeriods } from './onboarding.js';

const CLOSED_STATUSES = ['Brouillon', 'Payée', 'Créditée', 'Annulée'];

const toUTC = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
export const daysBetween = (fromIso, toIso) => Math.round((toUTC(toIso) - toUTC(fromIso)) / 86400000);

const lastDayOfMonth = (year, month) => {
  // month may overflow past 12; Date.UTC normalises it.
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
};

const money = (amount, lang) => (Number(amount) || 0).toLocaleString(
  lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' });

// ── Overdue invoices ─────────────────────────────────────────────────────────
// Outstanding is the shared definition, so a tax override or an exempt customer
// counts here exactly as it does on the invoice and in the AR subledger.
export function overdueInvoices(factures, clients, today) {
  const byId = new Map((clients || []).map(c => [c.id, c]));
  return (factures || [])
    .filter(f => f && !CLOSED_STATUSES.includes(f.statut) && f.documentType !== 'proforma')
    .filter(f => f.dateEcheance && String(f.dateEcheance).slice(0, 10) < today)
    .map(f => {
      const c = byId.get(f.clientId);
      const exempt = c?.taxExempt
        ? { exemptFromTps: c.exemptFromTps !== false, exemptFromTvq: c.exemptFromTvq !== false }
        : null;
      return {
        id: f.id,
        numero: f.numero || '',
        client: c?.entreprise || c?.contact || '',
        daysOverdue: daysBetween(f.dateEcheance, today),
        amount: calcInvoiceOutstanding(f, exempt),
      };
    })
    .filter(x => x.amount > 0.005)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// ── Next GST/QST filing ──────────────────────────────────────────────────────
// A monthly or quarterly return is due one month after the period ends; an annual
// one three months after the fiscal year ends. Returns null when the business has
// no registration on file, because a deadline invented from a guessed frequency
// is worse than no deadline at all.
export function filingDueDate(periodEnd, frequency) {
  const [y, m] = String(periodEnd).split('-').map(Number);
  return lastDayOfMonth(y, m + (frequency === 'annual' ? 3 : 1));
}

const LOOKBACK_DAYS = 120;   // older than this is history, not a to-do
const UPCOMING_DAYS = 14;    // a period this close to ending is worth a heads-up

export function nextFilingDeadline(registration, taxPeriods, today) {
  if (!registration || !registration.filing_frequency) return null;
  const frequency = registration.filing_frequency;
  const fyEndMonth = Number(registration.fiscal_year_end_month) || 12;
  const year = Number(String(today).slice(0, 4));

  const filedEnds = new Set((taxPeriods || [])
    .filter(p => p.status === 'filed' || p.status === 'paid')
    .map(p => String(p.period_end).slice(0, 10)));

  const seen = new Set();
  const periods = [year - 1, year, year + 1]
    .flatMap(fy => generateTaxPeriods({ fiscalYearEndMonth: fyEndMonth, filingFrequency: frequency, fiscalYear: fy }))
    .filter(p => (seen.has(p.periodEnd) ? false : seen.add(p.periodEnd)))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  const shape = (p, upcoming) => {
    const dueDate = filingDueDate(p.periodEnd, frequency);
    return {
      periodStart: p.periodStart, periodEnd: p.periodEnd, label: p.periodLabel,
      dueDate, daysLeft: daysBetween(today, dueDate), upcoming,
    };
  };

  const due = periods.find(p =>
    p.periodEnd <= today &&
    daysBetween(p.periodEnd, today) <= LOOKBACK_DAYS &&
    !filedEnds.has(p.periodEnd));
  if (due) return shape(due, false);

  const next = periods.find(p => p.periodEnd > today && !filedEnds.has(p.periodEnd));
  if (next && daysBetween(today, next.periodEnd) <= UPCOMING_DAYS) return shape(next, true);
  return null;
}

// ── Cash against the bank ────────────────────────────────────────────────────
// The same comparison as the Control accounts check, account by account.
export function cashVarianceCents(trialRows, subledgerRows) {
  const bank = {};
  for (const b of subledgerRows || []) bank[b.accountNumber] = (bank[b.accountNumber] || 0) + (b.cents || 0);
  const gl = {};
  for (const r of trialRows || []) gl[r.account_number] = r.balance_cents || 0;
  const accounts = Object.keys(bank).map(n => ({ accountNumber: n, cents: (gl[n] || 0) - bank[n] }))
    .filter(a => a.cents !== 0);
  return { cents: accounts.reduce((s, a) => s + a.cents, 0), accounts };
}

// ── The list ─────────────────────────────────────────────────────────────────
const BLOCKER_TARGETS = {
  unreconciled_statements: { kind: 'section', section: 'bank',  tab: 'comptes' },
  no_opening_balance:      { kind: 'section', section: 'bank',  tab: 'comptes' },
  overdue_ap:              { kind: 'section', section: 'bank',  tab: 'fournisseurs' },
  draft_entries:           { kind: 'section', section: 'books', tab: 'grandlivre' },
};
const TONE_RANK = { alert: 0, warn: 1, info: 2 };

export function buildWorklist({
  needsCategorizing = 0, overdue = [], blockers = [], registration = null,
  deadline = null, variance = null, lang = 'fr',
} = {}) {
  const en = lang === 'en';
  const items = [];

  for (const inv of overdue.slice(0, 5)) {
    items.push({
      id: `overdue-${inv.id}`, tone: 'alert',
      title: en
        ? `${inv.numero} is ${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} overdue`
        : `${inv.numero} est en retard de ${inv.daysOverdue} jour${inv.daysOverdue === 1 ? '' : 's'}`,
      detail: `${inv.client ? inv.client + ' · ' : ''}${money(inv.amount, lang)} ${en ? 'outstanding' : 'à recevoir'}`,
      cta: en ? 'Open invoice' : 'Ouvrir la facture',
      target: { kind: 'invoice', invoiceId: inv.id },
    });
  }
  if (overdue.length > 5) {
    const rest = overdue.length - 5;
    items.push({
      id: 'overdue-more', tone: 'alert',
      title: en ? `${rest} more overdue invoice${rest === 1 ? '' : 's'}` : `${rest} autre${rest === 1 ? '' : 's'} facture${rest === 1 ? '' : 's'} en retard`,
      detail: en ? 'Oldest first in Sales' : 'Les plus anciennes en premier dans Ventes',
      cta: en ? 'Open Sales' : 'Ouvrir Ventes',
      target: { kind: 'tab', tab: 'facturation' },
    });
  }

  if (deadline && !deadline.upcoming) {
    const late = deadline.daysLeft < 0;
    items.push({
      id: `filing-${deadline.periodEnd}`, tone: late ? 'alert' : 'warn',
      title: late
        ? (en ? `GST/QST return overdue by ${-deadline.daysLeft} days` : `Déclaration TPS/TVQ en retard de ${-deadline.daysLeft} jours`)
        : (en ? `GST/QST return due in ${deadline.daysLeft} days` : `Déclaration TPS/TVQ due dans ${deadline.daysLeft} jours`),
      detail: en
        ? `Period ${deadline.periodStart} to ${deadline.periodEnd}, due ${deadline.dueDate}. If you already filed it, mark it as filed.`
        : `Période du ${deadline.periodStart} au ${deadline.periodEnd}, due le ${deadline.dueDate}. Si c'est déjà produit, marquez-la produite.`,
      cta: en ? 'Open GST/QST' : 'Ouvrir TPS/TVQ',
      target: { kind: 'section', section: 'taxes', tab: 'taxperiod' },
    });
  }

  if (needsCategorizing > 0) {
    items.push({
      id: 'bank-categorize', tone: 'warn',
      title: en
        ? `${needsCategorizing} bank line${needsCategorizing === 1 ? '' : 's'} to categorize`
        : `${needsCategorizing} ligne${needsCategorizing === 1 ? '' : 's'} bancaire${needsCategorizing === 1 ? '' : 's'} à catégoriser`,
      detail: en ? 'Until they are, they are missing from your books and your tax return.' : 'Tant qu\'elles ne le sont pas, elles manquent aux livres et à la déclaration.',
      cta: en ? 'Open Bank' : 'Ouvrir Banque',
      target: { kind: 'section', section: 'bank', tab: 'comptes' },
    });
  }

  if (variance && variance.cents !== 0) {
    items.push({
      id: 'cash-variance', tone: 'warn',
      title: en
        ? `Cash is off from the bank by ${money(Math.abs(variance.cents) / 100, lang)}`
        : `L'encaisse diffère de la banque de ${money(Math.abs(variance.cents) / 100, lang)}`,
      detail: en ? 'General ledger, then Control accounts, shows which account.' : 'Grand livre, puis Comptes de contrôle, indique quel compte.',
      cta: en ? 'Open Books' : 'Ouvrir Livres',
      target: { kind: 'section', section: 'books', tab: 'grandlivre' },
    });
  }

  for (const b of blockers || []) {
    const target = BLOCKER_TARGETS[b.type];
    if (!target) continue;
    items.push({
      id: `blocker-${b.type}`, tone: b.type === 'overdue_ap' ? 'alert' : 'warn',
      title: en ? (b.label_en || b.label_fr) : (b.label_fr || b.label_en),
      detail: '',
      cta: en ? 'Open' : 'Ouvrir',
      target,
    });
  }

  if (!registration) {
    items.push({
      id: 'tax-registration', tone: 'info',
      title: en ? 'Set up your GST/QST registration' : 'Configurez votre inscription TPS/TVQ',
      detail: en
        ? 'Taxes, then GST/QST, then Registration. With your filing frequency on file, this list will tell you when each return is due.'
        : 'Taxes, puis TPS/TVQ, puis Enregistrement. Avec votre fréquence de déclaration, cette liste indiquera chaque échéance.',
      cta: en ? 'Open GST/QST' : 'Ouvrir TPS/TVQ',
      target: { kind: 'section', section: 'taxes', tab: 'taxperiod' },
    });
  } else if (deadline && deadline.upcoming) {
    items.push({
      id: `filing-upcoming-${deadline.periodEnd}`, tone: 'info',
      title: en
        ? `Current GST/QST period ends ${deadline.periodEnd}`
        : `La période TPS/TVQ en cours se termine le ${deadline.periodEnd}`,
      detail: en ? `The return will be due ${deadline.dueDate}.` : `La déclaration sera due le ${deadline.dueDate}.`,
      cta: en ? 'Open GST/QST' : 'Ouvrir TPS/TVQ',
      target: { kind: 'section', section: 'taxes', tab: 'taxperiod' },
    });
  }

  return items
    .map((it, i) => ({ ...it, _i: i }))
    .sort((a, b) => (TONE_RANK[a.tone] - TONE_RANK[b.tone]) || (a._i - b._i))
    .map(({ _i, ...it }) => it);
}

export function worklistCounts({ needsCategorizing = 0, overdue = [], items = [] } = {}) {
  return {
    sales: overdue.length,
    bank: needsCategorizing,
    // Setup nudges are not work waiting on you, so they do not count.
    today: items.filter(i => i.tone !== 'info').length,
  };
}
