// ── INVOICE DELIVERY ─────────────────────────────────────────────────────────
// "Did they get it?" is answered in two parts, each as far as it can honestly go.
//
// Delivered: every invoice emailed through Resend comes back with an id, and
// Resend can say later what became of that email - accepted by the client's mail
// server, bounced, delayed, reported as spam. That is reliable. It cannot say the
// email reached the inbox rather than a spam folder; nothing can.
//
// Viewed: the email carries a View invoice link. The page behind it records the
// first time it is opened, and only from the page's own script after the invoice
// has been shown, so link scanners that pre-fetch URLs do not count as a view.
// Opening a link is a deliberate act, which makes this the best proof there is.
//
// Open tracking (a hidden image) is deliberately not used: Apple Mail loads it for
// everyone and many companies block it, so it is wrong in both directions.
//
// Pure functions; the shell does the network calls.

const DAY = 86400000;

// Resend's last_event, without the "email." prefix used by its webhooks.
const RANK = { untracked: -1, sent: 0, delivery_delayed: 1, delivered: 2, bounced: 3, complained: 3, failed: 3, suppressed: 3 };
export const PROBLEM_STATUSES = ['bounced', 'complained', 'failed', 'suppressed'];

export function normalizeEmailEvent(event) {
  const e = String(event || '').replace(/^email\./, '').toLowerCase();
  if (e === 'opened' || e === 'clicked' || e === 'delivered') return 'delivered';
  if (e === 'queued' || e === 'scheduled' || e === 'sent') return 'sent';
  return Object.prototype.hasOwnProperty.call(RANK, e) && e !== 'untracked' ? e : null;
}

export function newEmailLogEntry({ to, emailId = null, viewToken = null, direct = true, now = new Date().toISOString() } = {}) {
  return {
    id: emailId || null,
    to: String(to || ''),
    sentAt: now,
    status: direct && emailId ? 'sent' : 'untracked',
    statusAt: now,
    ...(viewToken ? { viewToken } : {}),
  };
}

const age = (entry, now) => now - Date.parse(entry?.sentAt || '');

// Ask Resend again until the answer is final. A delivered email is rechecked for a
// few days because a spam report can follow delivery; after a month, stop asking.
export function needsStatusCheck(entry, now = Date.now()) {
  if (!entry?.id || !entry.sentAt || entry.status === 'untracked') return false;
  const a = age(entry, now);
  if (!(a >= 0) || a > 30 * DAY) return false;
  if (PROBLEM_STATUSES.includes(entry.status)) return false;
  if (entry.status === 'delivered') return a <= 3 * DAY;
  return true;
}

export function needsViewCheck(entry, now = Date.now()) {
  if (!entry?.viewToken || entry.viewedAt) return false;
  const a = age(entry, now);
  return a >= 0 && a <= 180 * DAY;
}

/**
 * Applies what Resend and the view-link service reported. Returns
 * { list, changed }; list is the original array when nothing changed.
 * statusUpdates: [{ invoiceId, id, lastEvent }]; views: { [token]: { first_viewed_at, last_viewed_at, view_count } }
 */
export function applyDeliveryUpdates(list, { statusUpdates = [], views = {}, now = new Date().toISOString() } = {}) {
  const events = new Map(statusUpdates.map(u => [`${u.invoiceId}::${u.id}`, u.lastEvent]));
  let changed = false;
  const next = (list || []).map(f => {
    if (!f?.emailLog?.length) return f;
    let touched = false;
    const log = f.emailLog.map(e => {
      let n = e;
      const ev = e.id ? events.get(`${f.id}::${e.id}`) : undefined;
      const status = ev ? normalizeEmailEvent(ev) : null;
      if (status && status !== e.status && (RANK[status] ?? -1) >= (RANK[e.status] ?? -1)) {
        n = { ...n, status, statusAt: now };
      }
      const v = e.viewToken ? views[e.viewToken] : null;
      if (v?.first_viewed_at && (v.first_viewed_at !== e.viewedAt || (v.view_count || 0) !== (e.viewCount || 0))) {
        n = { ...n, viewedAt: v.first_viewed_at, lastViewedAt: v.last_viewed_at || v.first_viewed_at, viewCount: v.view_count || 1 };
      }
      if (n !== e) touched = true;
      return n;
    });
    if (!touched) return f;
    changed = true;
    return { ...f, emailLog: log };
  });
  return { list: changed ? next : list, changed };
}

// Newest first, one row per email sent.
export function emailTimeline(invoice) {
  return [...(invoice?.emailLog || [])].reverse().map(e => ({
    to: e.to,
    sentAt: e.sentAt,
    status: e.status,
    statusAt: e.statusAt,
    viewTracked: !!e.viewToken,
    viewedAt: e.viewedAt || null,
    viewCount: e.viewCount || 0,
  }));
}

const CLOSED = ['Brouillon', 'Payée', 'Créditée', 'Annulée'];
const PROBLEM_LABEL = {
  bounced:    { en: 'bounced',                 fr: 'refusée par la messagerie' },
  complained: { en: 'was marked as spam',      fr: 'a été signalée comme pourriel' },
  failed:     { en: 'could not be sent',       fr: 'n\'a pas pu être envoyée' },
  suppressed: { en: 'was blocked by Resend',   fr: 'a été bloquée par Resend' },
};

/**
 * Things on the Today list: an invoice email that bounced, failed or was marked
 * as spam, and an unpaid invoice whose view link has sat unopened for a week.
 */
export function emailWorklistItems(factures, { now = Date.now(), lang = 'fr' } = {}) {
  const en = lang === 'en';
  const items = [];
  for (const f of factures || []) {
    const log = f?.emailLog || [];
    if (!log.length || f.statut === 'Annulée' || f.documentType === 'proforma') continue;
    const last = log[log.length - 1];
    const lastAt = Date.parse(last.statusAt || last.sentAt || '');

    if (PROBLEM_STATUSES.includes(last.status) && now - lastAt <= 30 * DAY) {
      const label = PROBLEM_LABEL[last.status];
      items.push({
        id: `email-${f.id}-${last.status}`,
        tone: 'alert',
        title: en ? `Invoice ${f.numero} ${label.en}` : `La facture ${f.numero} ${label.fr}`,
        detail: last.status === 'bounced'
          ? (en ? `${last.to} - check the address and send it again.` : `${last.to} - vérifiez l'adresse et renvoyez-la.`)
          : last.to,
        cta: en ? 'Open invoice' : 'Ouvrir la facture',
        target: { kind: 'invoice', invoiceId: f.id },
      });
      continue;
    }

    if (CLOSED.includes(f.statut)) continue;
    const tracked = log.filter(e => e.viewToken);
    if (!tracked.length || tracked.some(e => e.viewedAt)) continue;
    const days = Math.floor((now - Date.parse(tracked[0].sentAt || '')) / DAY);
    if (days >= 7 && days <= 45) {
      items.push({
        id: `email-unviewed-${f.id}`,
        tone: 'warn',
        title: en ? `Invoice ${f.numero} sent ${days} days ago, not viewed yet` : `Facture ${f.numero} envoyée il y a ${days} jours, pas encore consultée`,
        detail: en ? `${tracked[0].to} - a call or a resend may help.` : `${tracked[0].to} - un appel ou un renvoi peut aider.`,
        cta: en ? 'Open invoice' : 'Ouvrir la facture',
        target: { kind: 'invoice', invoiceId: f.id },
      });
    }
  }
  return items;
}

// SQLite stores reminder times as "YYYY-MM-DD HH:MM:SS" in UTC.
const sqliteUtc = (v) => (v && !/[TZ]/.test(v) ? `${String(v).replace(' ', 'T')}Z` : v || null);

/**
 * Everything emailed about one invoice, newest first: the invoice itself (with
 * delivery and view status) and its payment reminders.
 * reminders: rows from reminder_log (status, sent_at, sent_to, days_after_due).
 */
export function invoiceEmailHistory({ emailLog = [], reminders = [] } = {}) {
  const rows = [
    ...(emailLog || []).map(e => ({
      kind: 'invoice', to: e.to, at: e.sentAt, status: e.status, statusAt: e.statusAt,
      viewTracked: !!e.viewToken, viewedAt: e.viewedAt || null, viewCount: e.viewCount || 0,
    })),
    ...(reminders || []).map(r => ({
      kind: 'reminder', to: r.sent_to || '', at: sqliteUtc(r.sent_at), status: r.status, reminderDays: r.days_after_due ?? null,
    })),
  ];
  return rows.sort((a, b) => (Date.parse(b.at || '') || 0) - (Date.parse(a.at || '') || 0));
}

/**
 * The small email mark in the invoice list: null when nothing was emailed,
 * otherwise { count, problem } - problem when an invoice email bounced, failed or
 * was marked as spam, or a reminder failed to send.
 */
export function emailBadge(invoice, reminderCount = 0, reminderFailed = false) {
  const log = invoice?.emailLog || [];
  const count = log.length + (reminderCount || 0);
  if (!count) return null;
  return { count, problem: !!reminderFailed || log.some(e => PROBLEM_STATUSES.includes(e.status)) };
}
