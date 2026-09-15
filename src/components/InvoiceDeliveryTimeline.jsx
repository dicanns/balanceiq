import React from 'react';
import { invoiceEmailHistory } from '../services/emailTracking.js';

// Everything emailed about this invoice: the invoice itself (Sent · Delivered ·
// Viewed) and its payment reminders, newest first.

const UI = {
  en: {
    title: 'Emails',
    empty: 'No emails sent from BalanceIQ yet.',
    emptyHint: 'Emails sent with this invoice\'s Email button, and payment reminders about it, appear here.',
    invoice: 'Invoice',
    reminder: (d) => (d == null ? 'Reminder' : `Reminder (${d} days)`),
    sent: 'Sent',
    delivered: 'Delivered',
    delivery_delayed: 'Delayed, still trying',
    bounced: 'Bounced - check the address',
    complained: 'Marked as spam',
    failed: 'Could not be sent',
    suppressed: 'Blocked by Resend (earlier bounce or spam report)',
    untracked: 'Sent from your email app - not tracked',
    waiting: 'Waiting for the mail server',
    skipped: 'Skipped (a later reminder was sent)',
    no_api: 'Not sent (no Resend key)',
    viewed: 'Viewed',
    times: (n) => `${n} times`,
    notViewed: 'Not viewed yet',
    hint: 'Delivered means the client\'s mail server accepted it; it can still land in spam. Viewed means the client opened the View invoice link.',
  },
  fr: {
    title: 'Courriels',
    empty: 'Aucun courriel envoyé depuis BalanceIQ.',
    emptyHint: 'Les courriels envoyés avec le bouton Courriel de cette facture, et ses rappels de paiement, apparaissent ici.',
    invoice: 'Facture',
    reminder: (d) => (d == null ? 'Rappel' : `Rappel (${d} jours)`),
    sent: 'Envoyée',
    delivered: 'Livrée',
    delivery_delayed: 'Retardée, nouvel essai en cours',
    bounced: 'Refusée - vérifiez l\'adresse',
    complained: 'Signalée comme pourriel',
    failed: 'N\'a pas pu être envoyée',
    suppressed: 'Bloquée par Resend (refus ou signalement antérieur)',
    untracked: 'Envoyée de votre messagerie - non suivie',
    waiting: 'En attente du serveur de messagerie',
    skipped: 'Ignoré (un rappel plus récent a été envoyé)',
    no_api: 'Non envoyé (pas de clé Resend)',
    viewed: 'Consultée',
    times: (n) => `${n} fois`,
    notViewed: 'Pas encore consultée',
    hint: 'Livrée : le serveur de messagerie du client l\'a acceptée; elle peut tout de même aboutir dans les pourriels. Consultée : le client a ouvert le lien Voir la facture.',
  },
};

const TONE = { delivered: '#22c55e', delivery_delayed: '#f59e0b', bounced: '#ef4444', complained: '#ef4444', failed: '#ef4444', suppressed: '#ef4444' };

export default function InvoiceDeliveryTimeline({ log = [], reminders = [], en = false, t = {} }) {
  const L = en ? UI.en : UI.fr;
  const rows = invoiceEmailHistory({ emailLog: log, reminders });
  const when = (iso) => (iso ? new Date(iso).toLocaleString(en ? 'en-CA' : 'fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const chip = (text, color) => <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: 'nowrap' }}>{text}</span>;
  const dot = <span style={{ color: t.textDim || '#475569' }}>·</span>;
  const muted = t.textMuted || '#64748b';
  const sub = t.textSub || '#94a3b8';

  return (
    <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>{L.title}</div>
      {rows.length === 0 && (
        <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5 }}>
          {L.empty}
          <div style={{ fontSize: 10.5, marginTop: 2 }}>{L.emptyHint}</div>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px 8px', padding: '5px 0', borderTop: i ? `1px solid ${t.divider || '#1e2131'}` : 'none' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: r.kind === 'reminder' ? '#f59e0b' : '#38bdf8', textTransform: 'uppercase', letterSpacing: '.03em' }}>
            {r.kind === 'reminder' ? L.reminder(r.reminderDays) : L.invoice}
          </span>
          <span style={{ fontSize: 11.5, color: t.text, fontWeight: 600, marginRight: 4 }}>{r.to}</span>
          {r.kind === 'reminder' && chip(`${L[r.status] || r.status} ${when(r.at)}`, r.status === 'sent' ? sub : r.status === 'failed' ? '#ef4444' : muted)}
          {r.kind === 'invoice' && (r.status === 'untracked'
            ? chip(`${L.untracked} (${when(r.at)})`, muted)
            : (
              <>
                {chip(`${L.sent} ${when(r.at)}`, sub)}
                {dot}
                {r.status === 'sent'
                  ? chip(L.waiting, muted)
                  : chip(`${L[r.status] || r.status}${r.status === 'delivered' ? ` ${when(r.statusAt)}` : ''}`, TONE[r.status] || sub)}
              </>
            ))}
          {r.kind === 'invoice' && r.viewTracked && (
            <>
              {dot}
              {r.viewedAt
                ? chip(`${L.viewed} ${when(r.viewedAt)}${r.viewCount > 1 ? ` (${L.times(r.viewCount)})` : ''}`, '#38bdf8')
                : chip(L.notViewed, muted)}
            </>
          )}
        </div>
      ))}
      {rows.some(r => r.kind === 'invoice' && r.status !== 'untracked') && (
        <div style={{ fontSize: 10.5, color: muted, marginTop: 6, lineHeight: 1.45 }}>{L.hint}</div>
      )}
    </div>
  );
}
