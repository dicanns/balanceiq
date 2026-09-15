import React from 'react';
import { emailTimeline } from '../services/emailTracking.js';

// Sent · Delivered · Viewed, for each time the invoice was emailed.

const UI = {
  en: {
    title: 'Delivery',
    sent: 'Sent',
    delivered: 'Delivered',
    delivery_delayed: 'Delayed, still trying',
    bounced: 'Bounced - check the address',
    complained: 'Marked as spam',
    failed: 'Could not be sent',
    suppressed: 'Blocked by Resend (earlier bounce or spam report)',
    untracked: 'Sent from your email app - not tracked',
    waiting: 'Waiting for the mail server',
    viewed: 'Viewed',
    times: (n) => `${n} times`,
    notViewed: 'Not viewed yet',
    hint: 'Delivered means the client\'s mail server accepted it; it can still land in spam. Viewed means the client opened the View invoice link.',
  },
  fr: {
    title: 'Livraison',
    sent: 'Envoyée',
    delivered: 'Livrée',
    delivery_delayed: 'Retardée, nouvel essai en cours',
    bounced: 'Refusée - vérifiez l\'adresse',
    complained: 'Signalée comme pourriel',
    failed: 'N\'a pas pu être envoyée',
    suppressed: 'Bloquée par Resend (refus ou signalement antérieur)',
    untracked: 'Envoyée de votre messagerie - non suivie',
    waiting: 'En attente du serveur de messagerie',
    viewed: 'Consultée',
    times: (n) => `${n} fois`,
    notViewed: 'Pas encore consultée',
    hint: 'Livrée : le serveur de messagerie du client l\'a acceptée; elle peut tout de même aboutir dans les pourriels. Consultée : le client a ouvert le lien Voir la facture.',
  },
};

const TONE = { delivered: '#22c55e', delivery_delayed: '#f59e0b', bounced: '#ef4444', complained: '#ef4444', failed: '#ef4444', suppressed: '#ef4444' };

export default function InvoiceDeliveryTimeline({ log = [], en = false, t = {} }) {
  const rows = emailTimeline({ emailLog: log });
  if (!rows.length) return null;
  const L = en ? UI.en : UI.fr;
  const when = (iso) => (iso ? new Date(iso).toLocaleString(en ? 'en-CA' : 'fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const chip = (text, color) => (
    <span style={{ fontSize: 11, fontWeight: 600, color, whiteSpace: 'nowrap' }}>{text}</span>
  );
  const dot = <span style={{ color: t.textDim || '#475569' }}>·</span>;

  return (
    <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 9, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>{L.title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px 8px', padding: '5px 0', borderTop: i ? `1px solid ${t.divider || '#1e2131'}` : 'none' }}>
          <span style={{ fontSize: 11.5, color: t.text, fontWeight: 600, marginRight: 4 }}>{r.to}</span>
          {r.status === 'untracked'
            ? chip(`${L.untracked} (${when(r.sentAt)})`, t.textMuted || '#64748b')
            : (
              <>
                {chip(`${L.sent} ${when(r.sentAt)}`, t.textSub || '#94a3b8')}
                {dot}
                {r.status === 'sent'
                  ? chip(L.waiting, t.textMuted || '#64748b')
                  : chip(`${L[r.status] || r.status}${r.status === 'delivered' ? ` ${when(r.statusAt)}` : ''}`, TONE[r.status] || (t.textSub || '#94a3b8'))}
              </>
            )}
          {r.viewTracked && (
            <>
              {dot}
              {r.viewedAt
                ? chip(`${L.viewed} ${when(r.viewedAt)}${r.viewCount > 1 ? ` (${L.times(r.viewCount)})` : ''}`, '#38bdf8')
                : chip(L.notViewed, t.textMuted || '#64748b')}
            </>
          )}
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: t.textMuted || '#64748b', marginTop: 6, lineHeight: 1.45 }}>{L.hint}</div>
    </div>
  );
}
